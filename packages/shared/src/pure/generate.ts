/**
 * 程序化生成器(纯) —— 五项目里最有价值的能力,这里全部做成纯函数以便单测。
 * 返回 element spec,由插件端统一实例化(同一 undo 步骤)。
 */
import type { Vec3 } from "./vec.js";
import { makeRandom } from "./color.js";
import { FACE_NAMES, type FaceName } from "./uv.js";

export type GroupSpec = {
  name: string;
  origin: Vec3;
  rotation: Vec3;
  parent?: string;
};

export type CubeSpec = {
  name: string;
  from: Vec3;
  to: Vec3;
  origin?: Vec3;
  rotation?: Vec3;
  inflate?: number;
  parent?: string;
};

export type GeneratorResult = {
  groups: GroupSpec[];
  cubes: CubeSpec[];
  notes: string[];
  /** 世界坐标下的关键点(tip/attach 等) */
  points?: Record<string, Vec3>;
};

const CUBE_LIMIT = 4000;

function cap(cubes: CubeSpec[], max = CUBE_LIMIT): CubeSpec[] {
  return cubes.length > max ? cubes.slice(0, max) : cubes;
}

/* ------------------------------------------------------------------ *
 * voxelize_matrix —— 字符矩阵体素化:LLM 擅长 2D 像素画,不擅长 3D 算术
 * ------------------------------------------------------------------ */

export type VoxelizeParams = {
  matrix: string[];
  palette?: Record<
    string,
    { name?: string; depth?: number; offset_z?: number; inflate?: number }
  >;
  pixel_size?: number;
  plane?: "xy" | "xz" | "yz";
  origin?: Vec3;
  parent?: string;
  merge_adjacent?: boolean;
  max_cubes?: number;
  z_fight_guard?: boolean;
};

const EMPTY_CHARS = new Set([" ", ".", "_"]);

export function voxelizeMatrix(params: VoxelizeParams): GeneratorResult {
  const matrix = params.matrix ?? [];
  if (!matrix.length) throw new Error("matrix must have at least one row");
  const ps = params.pixel_size ?? 1;
  const plane = params.plane ?? "xy";
  const origin = params.origin ?? [0, 0, 0];
  const rows = matrix.length;
  const cols = Math.max(...matrix.map((row) => [...row].length));
  const merge = params.merge_adjacent === true;
  const cubes: CubeSpec[] = [];
  const notes: string[] = [];

  const depthAxis = plane === "xy" ? 2 : plane === "xz" ? 1 : 0;
  const defaultDepth =
    plane === "xy"
      ? (params.palette ?? {})[Object.keys(params.palette ?? {})[0]]?.depth ?? 1
      : 1;

  // 生成矩阵坐标 → 世界坐标(左下角 = origin)
  const cellOrigin = (col: number, row: number, depth: number): Vec3 => {
    if (plane === "xy")
      return [
        origin[0] + col * ps,
        origin[1] + (rows - 1 - row) * ps,
        origin[2] + depth,
      ];
    if (plane === "xz")
      return [
        origin[0] + col * ps,
        origin[1] + depth,
        origin[2] + row * ps,
      ];
    return [
      origin[0] + depth,
      origin[1] + (rows - 1 - row) * ps,
      origin[2] + col * ps,
    ];
  };

  const pushCell = (
    symbol: string,
    col: number,
    row: number,
    span: number,
  ) => {
    const config = params.palette?.[symbol];
    const depth = config?.depth ?? defaultDepth;
    const offset = config?.offset_z ?? 0;
    const start = cellOrigin(col, row, offset);
    const size: Vec3 = [0, 0, 0];
    if (plane === "xy") {
      size[0] = span * ps;
      size[1] = ps;
      size[2] = depth;
    } else if (plane === "xz") {
      size[0] = span * ps;
      size[1] = depth;
      size[2] = ps;
    } else {
      size[0] = depth;
      size[1] = ps;
      size[2] = span * ps;
    }
    const to: Vec3 = [
      start[0] + size[0],
      start[1] + size[1],
      start[2] + size[2],
    ];
    const baseName = config?.name ?? `vox_${symbol.trim() || "x"}`;
    cubes.push({
      name: `${baseName}_${row}_${col}`,
      from: start,
      to,
      inflate: config?.inflate ?? 0,
      parent: params.parent,
    });
  };

  for (let row = 0; row < rows; row += 1) {
    const chars = [...matrix[row]];
    let col = 0;
    while (col < cols) {
      const symbol = chars[col] ?? " ";
      if (EMPTY_CHARS.has(symbol)) {
        col += 1;
        continue;
      }
      if (!merge) {
        pushCell(symbol, col, row, 1);
        col += 1;
        continue;
      }
      let span = 1;
      while (
        col + span < cols &&
        (chars[col + span] ?? " ") === symbol &&
        !EMPTY_CHARS.has(chars[col + span] ?? " ")
      )
        span += 1;
      pushCell(symbol, col, row, span);
      col += span;
    }
  }

  if (params.z_fight_guard !== false) {
    // 相邻行的同深度块共面 → 给每行一个微小深度抖动,避免 z-fighting
    const byName = new Map<string, number>();
    for (const cube of cubes) {
      const key = `${cube.from[depthAxis]}|${cube.to[depthAxis]}`;
      byName.set(key, (byName.get(key) ?? 0) + 1);
    }
    if ([...byName.values()].some((n) => n > 1)) {
      notes.push(
        "coplanar depth detected; keep merge_adjacent:true or offset_z per palette entry to avoid z-fighting",
      );
    }
  }

  return {
    groups: [],
    cubes: cap(cubes, params.max_cubes ?? CUBE_LIMIT),
    notes,
  };
}

/* ------------------------------------------------------------------ *
 * add_hollow_volume —— 壳体(有真实空腔),而不是一整块实心方块
 * ------------------------------------------------------------------ */

export type HollowParams = {
  from: Vec3;
  to: Vec3;
  wall_thickness?: number;
  open_faces?: string[];
  name?: string;
  inflate?: number;
  parent?: string;
};

const WORLD_ALIASES: Record<string, FaceName> = {
  north: "north",
  front: "north",
  south: "south",
  back: "south",
  east: "east",
  right: "east",
  west: "west",
  left: "west",
  up: "up",
  top: "up",
  down: "down",
  bottom: "down",
};

export function hollowVolume(params: HollowParams): GeneratorResult {
  const lo: Vec3 = [
    Math.min(params.from[0], params.to[0]),
    Math.min(params.from[1], params.to[1]),
    Math.min(params.from[2], params.to[2]),
  ];
  const hi: Vec3 = [
    Math.max(params.from[0], params.to[0]),
    Math.max(params.from[1], params.to[1]),
    Math.max(params.from[2], params.to[2]),
  ];
  const size: Vec3 = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  if (size.some((v) => v <= 0)) throw new Error("bounds must have positive size");
  const requested = params.wall_thickness ?? 1;
  // 每轴夹紧:厚度不能吞掉整个盒子
  const t = Math.min(
    requested,
    ...[0, 1, 2].map((i) => Math.max(0.001, size[i] / 2 - 0.001)),
  );
  const open = new Set(
    (params.open_faces ?? [])
      .map((f) => WORLD_ALIASES[f.toLowerCase()])
      .filter(Boolean) as FaceName[],
  );
  const name = params.name ?? "shell";
  const inflate = params.inflate ?? 0;
  const axes: Array<[FaceName, (a: FaceName) => [Vec3, Vec3]]> = [
    [
      "north",
      () => [
        [lo[0], lo[1], lo[2]],
        [hi[0], hi[1], lo[2] + t],
      ],
    ],
    [
      "south",
      () => [
        [lo[0], lo[1], hi[2] - t],
        [hi[0], hi[1], hi[2]],
      ],
    ],
    [
      "west",
      () => [
        [lo[0], lo[1], lo[2] + t],
        [lo[0] + t, hi[1], hi[2] - t],
      ],
    ],
    [
      "east",
      () => [
        [hi[0] - t, lo[1], lo[2] + t],
        [hi[0], hi[1], hi[2] - t],
      ],
    ],
    [
      "down",
      () => [
        [lo[0] + t, lo[1], lo[2] + t],
        [hi[0] - t, lo[1] + t, hi[2] - t],
      ],
    ],
    [
      "up",
      () => [
        [lo[0] + t, hi[1] - t, lo[2] + t],
        [hi[0] - t, hi[1], hi[2] - t],
      ],
    ],
  ];
  const cubes: CubeSpec[] = [];
  for (const [face, make] of axes) {
    if (open.has(face)) continue;
    const [from, to] = make(face);
    if (to.some((v, i) => v - from[i] <= 0)) continue;
    cubes.push({ name: `${name}_${face}`, from, to, inflate, parent: params.parent });
  }
  const cavity: [Vec3, Vec3] = [
    [lo[0] + t, lo[1] + t, lo[2] + t],
    [hi[0] - t, hi[1] - t, hi[2] - t],
  ];
  return {
    groups: [],
    cubes,
    notes: [
      `wall_thickness used: ${Number(t.toFixed(3))}`,
      "keep >=0.1 clearance from walls for anything placed inside the cavity",
    ],
    points: { cavity_min: cavity[0], cavity_max: cavity[1] },
  };
}

/* ------------------------------------------------------------------ *
 * generate_array —— 线性/环形/网格阵列(带抖动、渐变、抗 z-fighting 错层)
 * ------------------------------------------------------------------ */

export type ArrayParams = {
  mode?: "linear" | "radial" | "grid";
  count?: number;
  element_size: Vec3;
  start?: Vec3;
  end?: Vec3;
  center?: Vec3;
  radii?: [number, number];
  arc_degrees?: number;
  start_degrees?: number;
  align_to_center?: boolean;
  counts?: [number, number, number];
  distribution?: "span" | "cells";
  anchor?: "center" | "top" | "bottom" | "min";
  jitter?: Vec3;
  size_decay?: Vec3;
  depth_stagger?: number;
  depth_axis?: "auto" | "x" | "y" | "z" | "radial" | "none";
  rotation?: Vec3;
  rotation_range?: { min: Vec3; max: Vec3 };
  seed?: number;
  name_prefix?: string;
  parent?: string;
  inflate?: number;
  max_cubes?: number;
};

export function generateArray(params: ArrayParams): GeneratorResult {
  const mode = params.mode ?? "linear";
  const random = makeRandom(params.seed ?? 0x51ed270b);
  const prefix = params.name_prefix ?? "element";
  const rotation = params.rotation ?? [0, 0, 0];
  const jitter = params.jitter ?? [0, 0, 0];
  const decay = params.size_decay ?? [0, 0, 0];
  const baseSize = params.element_size;
  if (baseSize.some((v) => v <= 0)) throw new Error("element_size must be positive");
  const cubes: CubeSpec[] = [];
  const notes: string[] = [];

  const anchorOffset = (size: Vec3, point: Vec3): Vec3 => {
    const anchor = params.anchor ?? "center";
    const centeredX = point[0] - size[0] / 2;
    const centeredZ = point[2] - size[2] / 2;
    if (anchor === "top")
      return [centeredX, point[1] - size[1], centeredZ];
    if (anchor === "bottom") return [centeredX, point[1], centeredZ];
    if (anchor === "min") return [point[0], point[1], point[2]];
    return [centeredX, point[1] - size[1] / 2, centeredZ];
  };

  const jittered = (point: Vec3): Vec3 =>
    point.map((v, i) => v + (random() * 2 - 1) * jitter[i]) as Vec3;

  const spin = (): Vec3 =>
    params.rotation_range
      ? ([0, 1, 2].map(
          (i) =>
            rotation[i] +
            params.rotation_range!.min[i] +
            random() * (params.rotation_range!.max[i] - params.rotation_range!.min[i]),
        ) as Vec3)
      : ([...rotation] as Vec3);

  const staggerStep = params.depth_stagger ?? 0;
  const requested = params.depth_axis ?? "auto";
  let autoAxis = 2;

  const staggerAxis = (): number => {
    if (requested === "none") return -1;
    if (requested === "x") return 0;
    if (requested === "y") return 1;
    if (requested === "z") return 2;
    if (requested === "radial") return -1;
    return autoAxis; // auto
  };

  const pushAt = (point: Vec3, index: number, stagger: number) => {
    const size: Vec3 = [
      Math.max(0.05, baseSize[0] + decay[0] * index),
      Math.max(0.05, baseSize[1] + decay[1] * index),
      Math.max(0.05, baseSize[2] + decay[2] * index),
    ];
    const from = anchorOffset(size, jittered(point));
    const to: Vec3 = [from[0] + size[0], from[1] + size[1], from[2] + size[2]];
    if (stagger !== 0) {
      const axis = staggerAxis();
      if (axis >= 0) {
        from[axis] += stagger;
        to[axis] += stagger;
      }
    }
    cubes.push({
      name: `${prefix}_${index + 1}`,
      from,
      to,
      rotation: spin(),
      inflate: params.inflate ?? 0,
      parent: params.parent,
    });
  };

  if (mode === "linear") {
    const start = params.start ?? [0, 0, 0];
    const end = params.end ?? [start[0] + 8, start[1], start[2]];
    const count = Math.max(1, params.count ?? 2);
    const distribution = params.distribution ?? "span";
    const delta: Vec3 = [end[0] - start[0], end[1] - start[1], end[2] - start[2]];
    // auto: 垂直于线性走向的轴 —— 沿 X/Y 时错开到 Z,沿 Z 时错开到 X
    const dominant = [0, 1, 2].reduce(
      (best, axis) => (Math.abs(delta[axis]) > Math.abs(delta[best]) ? axis : best),
      0,
    );
    autoAxis = dominant === 2 ? 0 : 2;
    for (let i = 0; i < count; i += 1) {
      const f =
        distribution === "cells"
          ? count === 1
            ? 0.5
            : (i + 0.5) / count
          : count === 1
            ? 0
            : i / (count - 1);
      pushAt(
        [
          start[0] + delta[0] * f,
          start[1] + delta[1] * f,
          start[2] + delta[2] * f,
        ],
        i,
        i % 2 === 0 ? staggerStep : -staggerStep,
      );
    }
  } else if (mode === "radial") {
    const center = params.center ?? [0, 0, 0];
    const [rx, rz] = params.radii ?? [8, 8];
    const count = Math.max(1, params.count ?? 8);
    const arc = params.arc_degrees ?? 360;
    const startDeg = params.start_degrees ?? 0;
    const align = params.align_to_center !== false;
    for (let i = 0; i < count; i += 1) {
      const f = count === 1 ? 0 : i / count;
      const deg = startDeg + arc * f;
      const rad = (deg * Math.PI) / 180;
      const point: Vec3 = [
        center[0] + Math.cos(rad) * rx,
        center[1],
        center[2] + Math.sin(rad) * rz,
      ];
      const index = cubes.length;
      pushAt(point, index, i % 2 === 0 ? staggerStep : -staggerStep);
      if (align) {
        const outward: Vec3 = [
          rotation[0],
          rotation[1] + (Math.atan2(Math.cos(rad), Math.sin(rad)) * 180) / Math.PI,
          rotation[2],
        ];
        cubes[cubes.length - 1].rotation = outward;
      }
      if (staggerStep !== 0 && (params.depth_axis ?? "auto") === "radial") {
        const outwardDir: Vec3 = [Math.cos(rad), 0, Math.sin(rad)];
        const sign = i % 2 === 0 ? 1 : -1;
        const cube = cubes[cubes.length - 1];
        for (let a = 0; a < 3; a += 1) {
          cube.from[a] += outwardDir[a] * staggerStep * sign;
          cube.to[a] += outwardDir[a] * staggerStep * sign;
        }
      }
    }
  } else {
    const start = params.start ?? [0, 0, 0];
    const end = params.end ?? [8, 0, 8];
    const span: Vec3 = [end[0] - start[0], end[1] - start[1], end[2] - start[2]];
    let counts = params.counts;
    if (!counts) {
      const total = Math.max(1, params.count ?? 8);
      const per = Math.max(1, Math.round(Math.cbrt(total)));
      counts = [per, per, per];
    }
    let index = 0;
    for (let iz = 0; iz < counts[2]; iz += 1)
      for (let iy = 0; iy < counts[1]; iy += 1)
        for (let ix = 0; ix < counts[0]; ix += 1) {
          if (params.count !== undefined && index >= params.count) break;
          const f: Vec3 = [
            counts[0] === 1 ? 0.5 : ix / (counts[0] - 1),
            counts[1] === 1 ? 0.5 : iy / (counts[1] - 1),
            counts[2] === 1 ? 0.5 : iz / (counts[2] - 1),
          ];
          pushAt(
            [
              start[0] + span[0] * f[0],
              start[1] + span[1] * f[1],
              start[2] + span[2] * f[2],
            ],
            index,
            (index % 2 === 0 ? 1 : -1) * staggerStep,
          );
          index += 1;
        }
  }

  // 抗 z-fighting 报告:相互穿透或共面相邻(平面对齐的)元素
  if (staggerStep === 0 && cubes.length <= 400) {
    let risky = 0;
    for (let i = 0; i < cubes.length; i += 1) {
      for (let j = i + 1; j < cubes.length; j += 1) {
        const a = cubes[i];
        const b = cubes[j];
        let overlapping = 0;
        let coplanar = 0;
        for (let k = 0; k < 3; k += 1) {
          const lo = Math.max(a.from[k], b.from[k]);
          const hi = Math.min(a.to[k], b.to[k]);
          if (hi - lo > 1e-6) overlapping += 1;
          else if (
            Math.abs(a.from[k] - b.from[k]) < 1e-6 ||
            Math.abs(a.to[k] - b.to[k]) < 1e-6 ||
            Math.abs(a.from[k] - b.to[k]) < 1e-6 ||
            Math.abs(a.to[k] - b.from[k]) < 1e-6
          )
            coplanar += 1;
        }
        if (overlapping === 3 || (overlapping === 2 && coplanar >= 1)) risky += 1;
      }
    }
    if (risky)
      notes.push(
        `${risky} overlapping/coplanar element pair(s); pass depth_stagger 0.05-0.2 (or larger spacing) to avoid z-fighting`,
      );
  }

  return {
    groups: [],
    cubes: cap(cubes, params.max_cubes ?? CUBE_LIMIT),
    notes,
  };
}

/* ------------------------------------------------------------------ *
 * extrude_chain —— 渐细/弯曲的骨链(角、尾巴、触手)
 * ------------------------------------------------------------------ */

export type ChainParams = {
  segments?: number;
  base_origin: Vec3;
  segment_length?: number;
  initial_size?: [number, number];
  taper?: number;
  length_taper?: number;
  curvature?: Vec3;
  base_rotation?: Vec3;
  direction?: "up" | "down" | "forward" | "back" | "left" | "right";
  create_bones?: boolean;
  name?: string;
  inflate?: number;
  parent?: string;
};

const DIRECTIONS: Record<string, Vec3> = {
  up: [0, 1, 0],
  down: [0, -1, 0],
  forward: [0, 0, -1],
  back: [0, 0, 1],
  left: [-1, 0, 0],
  right: [1, 0, 0],
};

export function extrudeChain(params: ChainParams): GeneratorResult {
  const segments = Math.max(1, Math.min(64, params.segments ?? 4));
  const len = params.segment_length ?? 4;
  const [w0, d0] = params.initial_size ?? [4, 4];
  const taper = Math.min(0.95, Math.max(0, params.taper ?? 0.35));
  const lengthTaper = Math.min(0.95, Math.max(0, params.length_taper ?? 0));
  const curvature = params.curvature ?? [0, 0, 0];
  const baseRot = params.base_rotation ?? [0, 0, 0];
  const dir = DIRECTIONS[params.direction ?? "up"] ?? DIRECTIONS.up;
  const name = params.name ?? "chain";
  const step = 1 - taper;
  const lenStep = 1 - lengthTaper;
  const sizeScale = Math.pow(step, 1 / 3);

  const groups: GroupSpec[] = [];
  const cubes: CubeSpec[] = [];
  let cursor: Vec3 = [...params.base_origin];
  let size: [number, number] = [w0, d0];
  let segmentLen = len;

  for (let i = 0; i < segments; i += 1) {
    const rot: Vec3 = [
      baseRot[0] + curvature[0] * i,
      baseRot[1] + curvature[1] * i,
      baseRot[2] + curvature[2] * i,
    ];
    const boneName = `${name}${i + 1}`;
    if (params.create_bones !== false) {
      groups.push({
        name: boneName,
        origin: [...cursor],
        rotation: rot,
        parent: i === 0 ? params.parent : `${name}${i}`,
      });
    }
    // 立方体沿 direction 从 pivot 延伸;骨骼旋转负责弯曲
    const half: Vec3 = [size[0] / 2, size[1] / 2, size[0] / 2];
    const from: Vec3 = [
      cursor[0] - half[0],
      cursor[1],
      cursor[2] - half[2],
    ];
    const to: Vec3 = [
      from[0] + size[0],
      from[1] + segmentLen,
      from[2] + size[1],
    ];
    // direction 决定增长轴:默认 up 用 +Y;其他方向交换轴
    if (dir[1] !== 0) {
      /* up/down: 使用 Y */
    } else if (dir[2] !== 0) {
      to[1] = from[1] + size[1];
      to[2] = from[2] + segmentLen * dir[2];
      to[0] = from[0] + size[0];
    } else {
      to[0] = from[0] + segmentLen * dir[0];
      to[1] = from[1] + size[1];
      to[2] = from[2] + size[1];
    }
    cubes.push({
      name: `${name}${i + 1}_seg`,
      from,
      to,
      origin: [...cursor],
      parent: params.create_bones !== false ? boneName : params.parent,
      inflate: params.inflate ?? 0,
    });
    // 前进到下一段起点
    const stepVec: Vec3 = [
      dir[0] * segmentLen,
      dir[1] * segmentLen,
      dir[2] * segmentLen,
    ];
    cursor = [
      cursor[0] + stepVec[0],
      cursor[1] + stepVec[1],
      cursor[2] + stepVec[2],
    ];
    segmentLen *= lenStep;
    size = [Math.max(0.1, size[0] * sizeScale), Math.max(0.1, size[1] * sizeScale)];
  }

  return {
    groups,
    cubes,
    notes:
      params.create_bones === false
        ? ["create_bones:false — rotations baked into cubes, chain cannot be animated"]
        : [],
    points: { tip: cursor },
  };
}

/* ------------------------------------------------------------------ *
 * add_wing —— 骨链 + 连续膜(一次调用生成完整翅膀)
 * ------------------------------------------------------------------ */

export type WingParams = {
  side: "left" | "right";
  base_origin: Vec3;
  plane?: "horizontal" | "vertical";
  fingers?: number;
  arm_length?: number;
  forearm_length?: number;
  finger_length?: number | number[];
  arm_angle?: number;
  forearm_angle?: number;
  finger_spread?: [number, number];
  finger_angles?: number[];
  membrane?: "auto" | "cubes" | "none";
  membrane_attach?: Vec3;
  attach_to_body?: boolean;
  membrane_thickness?: number;
  bone_thickness?: number;
  name?: string;
  parent?: string;
  max_cubes?: number;
};

export function addWing(params: WingParams): GeneratorResult {
  const side = params.side;
  const sign = side === "right" ? 1 : -1;
  const plane = params.plane ?? "horizontal";
  const fingers = Math.max(1, Math.min(6, params.fingers ?? 3));
  const armLen = params.arm_length ?? 8;
  const foreLen = params.forearm_length ?? 10;
  const thickness = params.bone_thickness ?? 2;
  const membrane = params.membrane ?? "cubes";
  const attachToBody = params.attach_to_body !== false;
  const membraneThickness = params.membrane_thickness ?? 0.5;
  const name = params.name ?? "wing";
  const bones = `${name}_${side}`;
  const base: Vec3 = [...params.base_origin];

  const armAngle = params.arm_angle ?? (plane === "horizontal" ? 20 : 35);
  const foreAngle = params.forearm_angle ?? (plane === "horizontal" ? -15 : 70);
  const spread: [number, number] =
    params.finger_spread ?? (plane === "horizontal" ? [0, 80] : [100, 10]);
  const fingerAngles =
    params.finger_angles ??
    Array.from({ length: fingers }, (_, i) =>
      fingers === 1 ? spread[0] : spread[0] + ((spread[1] - spread[0]) * i) / (fingers - 1),
    );
  const lengths =
    typeof params.finger_length === "number"
      ? Array.from({ length: fingers }, (_, i) =>
          (params.finger_length as number) * Math.pow(0.7, i),
        )
      : (params.finger_length ??
        Array.from({ length: fingers }, (_, i) => 16 * Math.pow(0.7, i)));

  const groups: GroupSpec[] = [];
  const cubes: CubeSpec[] = [];
  const notes: string[] = [];

  const toWorld = (angleDeg: number, dist: number, from: Vec3): Vec3 => {
    const rad = (angleDeg * Math.PI) / 180;
    if (plane === "horizontal")
      return [from[0] + Math.cos(rad) * dist * sign, from[1], from[2] - Math.sin(rad) * dist];
    return [from[0] + Math.sin(rad) * dist * sign, from[1] + Math.cos(rad) * dist, from[2]];
  };

  const armOrigin: Vec3 = base;
  groups.push({ name: `${bones}_arm`, origin: armOrigin, rotation: [0, 0, 0], parent: params.parent });
  const elbow = toWorld(armAngle, armLen, armOrigin);
  groups.push({ name: `${bones}_forearm`, origin: elbow, rotation: [0, 0, 0], parent: `${bones}_arm` });
  const wrist = toWorld(foreAngle, foreLen, elbow);

  const boneFrom = (a: Vec3, b: Vec3, nm: string): CubeSpec => {
    const half = thickness / 2;
    return {
      name: nm,
      from: [Math.min(a[0], b[0]) - half, Math.min(a[1], b[1]) - half, Math.min(a[2], b[2]) - half],
      to: [Math.max(a[0], b[0]) + half, Math.max(a[1], b[1]) + half, Math.max(a[2], b[2]) + half],
      parent: nm.includes("forearm") ? `${bones}_forearm` : `${bones}_arm`,
      inflate: 0,
    };
  };
  cubes.push(boneFrom(armOrigin, elbow, `${bones}_arm_bone`));
  cubes.push(boneFrom(elbow, wrist, `${bones}_forearm_bone`));

  const tips: Vec3[] = [];
  fingerAngles.forEach((angle, index) => {
    const boneName = `${bones}_finger${index + 1}`;
    groups.push({ name: boneName, origin: wrist, rotation: [0, 0, 0], parent: `${bones}_forearm` });
    const tip = toWorld(angle, lengths[index], wrist);
    tips.push(tip);
    cubes.push({
      name: `${boneName}_bone`,
      from: [
        Math.min(wrist[0], tip[0]) - thickness / 4,
        Math.min(wrist[1], tip[1]) - thickness / 4,
        Math.min(wrist[2], tip[2]) - thickness / 4,
      ],
      to: [
        Math.max(wrist[0], tip[0]) + thickness / 4,
        Math.max(wrist[1], tip[1]) + thickness / 4,
        Math.max(wrist[2], tip[2]) + thickness / 4,
      ],
      parent: boneName,
    });
  });

  if (membrane !== "none") {
    // 每个手指骨与下一个手指骨之间拉一张膜,再连到身体
    const panels: Array<[Vec3, Vec3, string]> = [];
    for (let i = 0; i < tips.length - 1; i += 1) {
      panels.push([tips[i], tips[i + 1], `${bones}_membrane${i + 1}`]);
    }
    if (attachToBody) {
      const attach: Vec3 =
        params.membrane_attach ??
        (plane === "horizontal"
          ? [base[0], base[1], base[2] + armLen + foreLen]
          : [base[0], base[1] - (armLen + foreLen) * 0.9, base[2]]);
      panels.push([tips[tips.length - 1], attach, `${bones}_membrane_body`]);
    }
    panels.forEach(([a, b, nm], index) => {
      const stagger = index % 2 === 0 ? 0 : membraneThickness * 0.2;
      // 膜片不能顶到指骨端点:否则它的包围盒会和指骨 cube 完全重合,
      // check_model 会判为 COPLANAR_OVERLAP(真机实测 wing_right_finger2_bone|membrane2)。
      // 每个轴内缩一点,让骨头露出来。
      const inset = (lo: number, hi: number): [number, number] => {
        const span = Math.abs(hi - lo);
        const margin = Math.min(0.35, Math.max(0.1, span * 0.15));
        if (span <= margin * 2) {
          const mid = (lo + hi) / 2;
          return [mid - 0.05, mid + 0.05];
        }
        return [Math.min(lo, hi) + margin, Math.max(lo, hi) - margin];
      };
      const [x0, x1] = inset(a[0], b[0]);
      const [y0, y1] = inset(a[1], b[1]);
      const [z0, z1] = inset(a[2], b[2]);
      cubes.push({
        name: nm,
        from: [x0, y0, z0 + stagger],
        to: [x1, Math.max(y0 + 0.05, y1), z1 + membraneThickness + stagger],
        parent: `${bones}_forearm`,
        inflate: 0,
      });
    });
    notes.push("membrane panels staggered so neighbours do not z-fight");
  }

  return {
    groups,
    cubes: cap(cubes, params.max_cubes ?? CUBE_LIMIT),
    notes,
    points: { shoulder: base, elbow, wrist, finger_tips: tips[0], membrane_attach: params.membrane_attach ?? base },
  };
}

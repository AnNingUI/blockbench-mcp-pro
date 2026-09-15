/** UV 逻辑(纯) —— 面空间映射 / 布局检查 / shelf 打包 / UV 模式判定 */
import type { Vec3 } from "./vec.js";

export const FACE_NAMES = [
  "north",
  "south",
  "east",
  "west",
  "up",
  "down",
] as const;
export type FaceName = (typeof FACE_NAMES)[number];

export type UvMode = "box" | "face";

/** 纹理像素尺寸(整数,至少 1) */
export function cubeExtent(from: Vec3, to: Vec3): {
  w: number;
  h: number;
  d: number;
} {
  return {
    w: Math.max(1, Math.ceil(Math.abs(to[0] - from[0]))),
    h: Math.max(1, Math.ceil(Math.abs(to[1] - from[1]))),
    d: Math.max(1, Math.ceil(Math.abs(to[2] - from[2]))),
  };
}

/** 该面的贴图展开尺寸 (w,h) */
export function faceFootprint(
  extent: { w: number; h: number; d: number },
  face: FaceName,
): [number, number] {
  if (face === "up" || face === "down") return [extent.w, extent.d];
  if (face === "east" || face === "west") return [extent.d, extent.h];
  return [extent.w, extent.h];
}

export type FaceSpace = {
  width: number;
  height: number;
  uv: [number, number, number, number];
  rotation: 0 | 90 | 180 | 270;
};

/** 由面的 uv 矩形 + rotation 得到"面局部像素空间" */
export function resolveFaceSpace(
  uv: number[] | undefined,
  rotationRaw: number | undefined,
): FaceSpace {
  const safe = (
    uv && uv.length >= 4 ? uv.slice(0, 4) : [0, 0, 1, 1]
  ) as [number, number, number, number];
  const rotation = ([0, 90, 180, 270].includes(rotationRaw ?? 0)
    ? rotationRaw
    : 0) as FaceSpace["rotation"];
  const atlasW = Math.max(1, Math.round(Math.abs(safe[2] - safe[0])));
  const atlasH = Math.max(1, Math.round(Math.abs(safe[3] - safe[1])));
  const quarterTurn = rotation === 90 || rotation === 270;
  return {
    width: quarterTurn ? atlasH : atlasW,
    height: quarterTurn ? atlasW : atlasH,
    uv: safe,
    rotation,
  };
}

function rotateLocal(
  u: number,
  v: number,
  rotation: FaceSpace["rotation"],
): [number, number] {
  if (rotation === 90) return [1 - v, u];
  if (rotation === 180) return [1 - u, 1 - v];
  if (rotation === 270) return [v, 1 - u];
  return [u, v];
}

/** 面局部像素中心 → 图集像素坐标 (含 rotation 与 UV 翻转方向) */
export function faceLocalToAtlas(
  space: FaceSpace,
  x: number,
  y: number,
): [number, number] {
  const [u, v] = rotateLocal(
    (x + 0.5) / space.width,
    (y + 0.5) / space.height,
    space.rotation,
  );
  return [
    Math.floor(space.uv[0] + (space.uv[2] - space.uv[0]) * u),
    Math.floor(space.uv[1] + (space.uv[3] - space.uv[1]) * v),
  ];
}

/** 面局部像素角 → 图集坐标(浮点,用于覆盖区计算) */
export function faceLocalCornerToAtlas(
  space: FaceSpace,
  x: number,
  y: number,
): [number, number] {
  const [u, v] = rotateLocal(x / space.width, y / space.height, space.rotation);
  return [
    space.uv[0] + (space.uv[2] - space.uv[0]) * u,
    space.uv[1] + (space.uv[3] - space.uv[1]) * v,
  ];
}

export type UvIsland = {
  cube: string;
  cube_uuid: string;
  face: FaceName;
  uv: [number, number, number, number];
  bounds: [number, number, number, number];
  pixel_size: [number, number];
  expected_size: [number, number];
  density: [number, number];
  flip_x: boolean;
  flip_y: boolean;
  rotation: number;
  texture: string | null;
  out_of_bounds: boolean;
};

export type UvCubeInput = {
  uuid: string;
  name: string;
  from: Vec3;
  to: Vec3;
  faces: Record<string, { uv?: number[]; rotation?: number; texture?: unknown } | undefined>;
};

function textureRef(value: unknown): string | null {
  if (value === null || value === undefined || value === false) return null;
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object") {
    const rec = value as { uuid?: unknown; name?: unknown };
    if (typeof rec.uuid === "string") return rec.uuid;
    if (typeof rec.name === "string") return rec.name;
    return "assigned";
  }
  return "assigned";
}

export function collectUvIslands(
  cubes: UvCubeInput[],
  textureWidth: number,
  textureHeight: number,
): UvIsland[] {
  const islands: UvIsland[] = [];
  for (const cube of cubes) {
    const extent = cubeExtent(cube.from, cube.to);
    for (const faceName of FACE_NAMES) {
      const face = cube.faces?.[faceName];
      if (!face?.uv || face.uv.length < 4) continue;
      const uv = face.uv.slice(0, 4) as [number, number, number, number];
      const bounds: [number, number, number, number] = [
        Math.min(uv[0], uv[2]),
        Math.min(uv[1], uv[3]),
        Math.max(uv[0], uv[2]),
        Math.max(uv[1], uv[3]),
      ];
      const pixelSize: [number, number] = [
        bounds[2] - bounds[0],
        bounds[3] - bounds[1],
      ];
      const expected = faceFootprint(extent, faceName);
      islands.push({
        cube: cube.name,
        cube_uuid: cube.uuid,
        face: faceName,
        uv,
        bounds,
        pixel_size: pixelSize,
        expected_size: expected,
        density: [
          pixelSize[0] / Math.max(1, expected[0]),
          pixelSize[1] / Math.max(1, expected[1]),
        ],
        flip_x: uv[2] < uv[0],
        flip_y: uv[3] < uv[1],
        rotation: typeof face.rotation === "number" ? face.rotation : 0,
        texture: textureRef(face.texture),
        out_of_bounds:
          bounds[0] < 0 ||
          bounds[1] < 0 ||
          bounds[2] > textureWidth ||
          bounds[3] > textureHeight,
      });
    }
  }
  return islands;
}

function islandsIntersect(a: UvIsland, b: UvIsland): boolean {
  return (
    Math.min(a.bounds[2], b.bounds[2]) - Math.max(a.bounds[0], b.bounds[0]) > 0 &&
    Math.min(a.bounds[3], b.bounds[3]) - Math.max(a.bounds[1], b.bounds[1]) > 0
  );
}

export function findUvOverlaps(
  islands: UvIsland[],
  allowed: Array<{ a: string; b: string }> = [],
): Array<{ a: string; b: string; intentional: boolean }> {
  const allowedSet = new Set(allowed.map((pair) => [pair.a, pair.b].sort().join("|")));
  const out: Array<{ a: string; b: string; intentional: boolean }> = [];
  for (let i = 0; i < islands.length; i += 1) {
    for (let j = i + 1; j < islands.length; j += 1) {
      if (!islandsIntersect(islands[i], islands[j])) continue;
      const a = `${islands[i].cube}.${islands[i].face}`;
      const b = `${islands[j].cube}.${islands[j].face}`;
      out.push({ a, b, intentional: allowedSet.has([a, b].sort().join("|")) });
    }
  }
  return out;
}

export type PackInput = {
  uuid: string;
  name: string;
  from: Vec3;
  to: Vec3;
};

export type PackPlan =
  | {
      mode: "box";
      items: Array<{ uuid: string; name: string; uv_offset: [number, number] }>;
      used: [number, number];
    }
  | {
      mode: "face";
      items: Array<{
        uuid: string;
        name: string;
        faces: Array<{ face: FaceName; uv: [number, number, number, number] }>;
      }>;
      used: [number, number];
    };

type Shelf = { x: number; y: number; rowH: number; maxX: number; maxY: number };

function shelfPlace(
  shelf: Shelf,
  w: number,
  h: number,
  texW: number,
  pad: number,
): [number, number] {
  if (shelf.x + w + pad > texW && shelf.x > 0) {
    shelf.x = 0;
    shelf.y += shelf.rowH + pad;
    shelf.rowH = 0;
  }
  const x = shelf.x;
  const y = shelf.y;
  shelf.x += w + pad;
  shelf.rowH = Math.max(shelf.rowH, h);
  shelf.maxX = Math.max(shelf.maxX, shelf.x);
  shelf.maxY = Math.max(shelf.maxY, shelf.y + shelf.rowH);
  return [x, y];
}

/** shelf 打包 UV,返回纯计划(调用方负责写入 Blockbench 并处理 undo) */
export function planUvPack(
  cubes: PackInput[],
  opts: {
    mode: UvMode;
    texW: number;
    padding?: number;
    startY?: number;
  },
): PackPlan {
  const pad = opts.padding ?? 1;
  const shelf: Shelf = {
    x: 0,
    y: opts.startY ?? 0,
    rowH: 0,
    maxX: 0,
    maxY: opts.startY ?? 0,
  };
  if (opts.mode === "box") {
    const items = cubes
      .map((cube) => {
        const e = cubeExtent(cube.from, cube.to);
        return { cube, fw: 2 * (e.w + e.d), fh: e.h + e.d };
      })
      .sort((a, b) => b.fh - a.fh || b.fw - a.fw);
    const placed: Array<{ uuid: string; name: string; uv_offset: [number, number] }> = [];
    for (const it of items) {
      const [x, y] = shelfPlace(shelf, it.fw, it.fh, opts.texW, pad);
      placed.push({ uuid: it.cube.uuid, name: it.cube.name, uv_offset: [x, y] });
    }
    return { mode: "box", items: placed, used: [shelf.maxX, shelf.maxY] };
  }
  type FaceItem = { cube: PackInput; face: FaceName; fw: number; fh: number };
  const items: FaceItem[] = [];
  for (const cube of cubes) {
    const e = cubeExtent(cube.from, cube.to);
    for (const face of FACE_NAMES) {
      const [fw, fh] = faceFootprint(e, face);
      items.push({ cube, face, fw, fh });
    }
  }
  items.sort((a, b) => b.fh - a.fh || b.fw - a.fw);
  type FaceEntry = {
    uuid: string;
    name: string;
    faces: Array<{ face: FaceName; uv: [number, number, number, number] }>;
  };
  const byCube = new Map<string, FaceEntry>();
  for (const it of items) {
    const [x, y] = shelfPlace(shelf, it.fw, it.fh, opts.texW, pad);
    let entry = byCube.get(it.cube.uuid);
    if (!entry) {
      entry = { uuid: it.cube.uuid, name: it.cube.name, faces: [] };
      byCube.set(it.cube.uuid, entry);
    }
    const uv: [number, number, number, number] = [x, y, x + it.fw, y + it.fh];
    entry.faces.push({ face: it.face, uv });
  }
  return {
    mode: "face",
    items: [...byCube.values()],
    used: [shelf.maxX, shelf.maxY],
  };
}

export function nextPowerOfTwo(value: number): number {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

/** 从项目/格式/cube 线索判定 UV 模式 */
export function resolveUvModeFromHints(hints: {
  explicit?: UvMode | "auto" | null;
  projectBoxUv?: boolean | null;
  formatBoxUv?: boolean | null;
  formatId?: string | null;
  cubeBoxFlags?: boolean[];
}): UvMode {
  if (hints.explicit === "box" || hints.explicit === "face") return hints.explicit;
  if (hints.formatId === "java_block") return "face";
  if (hints.formatId === "geckolib_model") return "box";
  if (typeof hints.projectBoxUv === "boolean") return hints.projectBoxUv ? "box" : "face";
  if (typeof hints.formatBoxUv === "boolean") return hints.formatBoxUv ? "box" : "face";
  const flags = hints.cubeBoxFlags ?? [];
  if (flags.length) return flags.filter(Boolean).length * 2 >= flags.length ? "box" : "face";
  return "box";
}

/** 质量门(纯) —— check_model / audit_complexity / check_sides / measure_model / 参考轮廓对比 */
import type { Bounds3, Vec3 } from "./vec.js";
import {
  boundsCenter,
  boundsIntersect,
  boundsIntersectionVolume,
  boundsOfPoints,
  boundsSize,
  boundsVolume,
  boxCorners,
  dist,
  geometricVolume,
  rotatePoint,
} from "./vec.js";
import { FACE_NAMES, type UvIsland } from "./uv.js";

export type ElementSnapshot = {
  uuid: string;
  name: string;
  type: "group" | "cube";
  parent: string | null;
  origin: Vec3;
  rotation: Vec3;
  from?: Vec3;
  to?: Vec3;
  inflate?: number;
  visibility?: boolean;
  /** 面 → 是否有贴图 */
  untexturedFaces?: string[];
  faceUvOutOfBounds?: number;
};

export type Finding = {
  severity: "error" | "warn" | "info";
  code: string;
  element?: string;
  message: string;
};

const PARENT_OF = new Map<string, string | null>();

function parentChain(
  element: ElementSnapshot,
  byUuid: Map<string, ElementSnapshot>,
): ElementSnapshot[] {
  const out: ElementSnapshot[] = [];
  let parent = element.parent ? byUuid.get(element.parent) : undefined;
  let guard = 0;
  while (parent && guard < 64) {
    out.push(parent);
    parent = parent.parent ? byUuid.get(parent.parent) : undefined;
    guard += 1;
  }
  return out;
}

/** 立方体世界包围盒(考虑自身与父级旋转/inflate) */
export function worldBounds(
  element: ElementSnapshot,
  byUuid: Map<string, ElementSnapshot>,
): Bounds3 {
  if (!element.from || !element.to) {
    const p = element.origin;
    return { min: [...p] as Vec3, max: [...p] as Vec3 };
  }
  const corners = boxCorners(element.from, element.to, element.inflate ?? 0).map(
    (point) => {
      let next = rotatePoint(point, element.origin, element.rotation);
      for (const group of parentChain(element, byUuid)) {
        next = rotatePoint(next, group.origin, group.rotation);
      }
      return next;
    },
  );
  return boundsOfPoints(corners);
}

export function measureModel(
  elements: ElementSnapshot[],
  refs?: string[],
): {
  bounds: { min: Vec3; max: Vec3; size: Vec3; center: Vec3 };
  cubes: number;
  total_volume: number;
  elements: Array<Record<string, unknown>>;
} {
  const byUuid = new Map(elements.map((e) => [e.uuid, e]));
  const byName = new Map(elements.map((e) => [e.name, e]));
  const selected = refs?.length
    ? (refs.map((ref) => byUuid.get(ref) ?? byName.get(ref)).filter(Boolean) as ElementSnapshot[])
    : elements.filter((e) => e.type === "cube");

  const descendants = (root: ElementSnapshot): ElementSnapshot[] => {
    if (root.type === "cube") return [root];
    const out: ElementSnapshot[] = [];
    const visit = (node: ElementSnapshot) => {
      for (const child of elements) {
        if (child.parent === node.uuid) {
          if (child.type === "cube") out.push(child);
          else visit(child);
        }
      }
    };
    visit(root);
    return out;
  };

  const rows = selected.map((element) => {
    const cubes = descendants(element);
    const boxes = cubes.map((cube) => worldBounds(cube, byUuid));
    const min = boxes.length
      ? ([0, 1, 2].map((i) => Math.min(...boxes.map((b) => b.min[i]))) as Vec3)
      : element.origin;
    const max = boxes.length
      ? ([0, 1, 2].map((i) => Math.max(...boxes.map((b) => b.max[i]))) as Vec3)
      : element.origin;
    return {
      ref: element.uuid,
      name: element.name,
      type: element.type,
      cubes: cubes.length,
      min,
      max,
      size: min.map((v, i) => max[i] - v),
      center: min.map((v, i) => (v + max[i]) / 2),
      volume: cubes.reduce(
        (sum, cube) =>
          sum + geometricVolume(cube.from!, cube.to!, cube.inflate ?? 0),
        0,
      ),
    };
  });

  const boxes = rows.filter((row) => row.cubes > 0);
  const min = [0, 1, 2].map((i) =>
    boxes.length ? Math.min(...boxes.map((row) => (row.min as number[])[i])) : 0,
  ) as Vec3;
  const max = [0, 1, 2].map((i) =>
    boxes.length ? Math.max(...boxes.map((row) => (row.max as number[])[i])) : 0,
  ) as Vec3;
  const unique = new Set(selected.flatMap((el) => descendants(el).map((c) => c.uuid)));
  return {
    bounds: {
      min,
      max,
      size: min.map((v, i) => max[i] - v) as Vec3,
      center: min.map((v, i) => (v + max[i]) / 2) as Vec3,
    },
    cubes: unique.size,
    total_volume: elements
      .filter((e) => unique.has(e.uuid))
      .reduce(
        (sum, cube) => sum + geometricVolume(cube.from!, cube.to!, cube.inflate ?? 0),
        0,
      ),
    elements: rows,
  };
}

export function checkModel(
  elements: ElementSnapshot[],
  opts: {
    textureWidth: number;
    textureHeight: number;
    uvIslands?: UvIsland[];
    allowOverlaps?: Array<{ a: string; b: string }>;
  },
): { findings: Finding[]; summary: { cubes: number; groups: number; errors: number; warns: number } } {
  const findings: Finding[] = [];
  const byUuid = new Map(elements.map((e) => [e.uuid, e]));
  const cubes = elements.filter((e) => e.type === "cube");
  const groups = elements.filter((e) => e.type === "group");

  for (const group of groups) {
    if (!elements.some((e) => e.parent === group.uuid)) {
      findings.push({
        severity: "error",
        code: "EMPTY_GROUP",
        element: group.name,
        message: `Group "${group.name}" has no children — delete it or add geometry.`,
      });
    }
  }
  if (!cubes.length) {
    findings.push({ severity: "error", code: "NO_CUBES", message: "Project has no cubes." });
  }

  const boxes = cubes.map((cube) => ({ cube, box: worldBounds(cube, byUuid) }));
  for (const { cube, box } of boxes) {
    const volume = geometricVolume(cube.from!, cube.to!, cube.inflate ?? 0);
    if (volume <= 0)
      findings.push({
        severity: "error",
        code: "ZERO_VOLUME",
        element: cube.name,
        message: `Cube "${cube.name}" has zero volume.`,
      });
    const size = boundsSize(box);
    // 阈值 0.5:在 16px/格的尺度下 1 单位 ≈ 1 像素,0.9 厚的肩带/扣子/眼睛是有意的细节。
    // (真机上马里奥的 strap/button/eye 全被原来的 <1 规则误报)
    if (size.some((s) => s > 0 && s < 0.5))
      findings.push({
        severity: "warn",
        code: "SLIVER",
        element: cube.name,
        message: `Cube "${cube.name}" is thinner than half a unit — often reads as noise.`,
      });
    if (cube.untexturedFaces?.length)
      findings.push({
        severity: "warn",
        code: "UNTEXTURED_FACE",
        element: cube.name,
        message: `Cube "${cube.name}" has ${cube.untexturedFaces.length} untextured face(s): ${cube.untexturedFaces.join(", ")}.`,
      });
    if (cube.faceUvOutOfBounds)
      findings.push({
        severity: "error",
        code: "UV_OUT_OF_BOUNDS",
        element: cube.name,
        message: `Cube "${cube.name}" has ${cube.faceUvOutOfBounds} face UV(s) outside ${opts.textureWidth}×${opts.textureHeight}.`,
      });

  }

  // Pivot 检查:拿"父组名下所有立方体的联合包围盒"比,而不是单个立方体。
  // 道具(蘑菇)的 pivot 在底部是正确的,用单块对角线比会误报。
  {
    const unionByGroup = new Map<string, Bounds3>();
    for (const { cube, box } of boxes) {
      let parent = cube.parent ? byUuid.get(cube.parent) : undefined;
      let guard = 0;
      while (parent && parent.type === "group" && guard < 64) {
        const current = unionByGroup.get(parent.uuid);
        unionByGroup.set(
          parent.uuid,
          current
            ? {
                min: [0, 1, 2].map((i) => Math.min(current.min[i], box.min[i])) as Vec3,
                max: [0, 1, 2].map((i) => Math.max(current.max[i], box.max[i])) as Vec3,
              }
            : box,
        );
        parent = parent.parent ? byUuid.get(parent.parent) : undefined;
        guard += 1;
      }
    }
    for (const { cube, box } of boxes) {
      if (!cube.parent) continue;
      const parent = byUuid.get(cube.parent);
      if (!parent || parent.type !== "group") continue;
      const union = unionByGroup.get(parent.uuid);
      if (!union) continue;
      const d = dist(boundsCenter(box), parent.origin);
      const diag = dist(union.min, union.max);
      // 只有"pivot 明显跑出整组几何之外"才算问题(2.5 倍联合对角线)
      if (diag > 0 && d > diag * 2.5)
        findings.push({
          severity: "warn",
          code: "BAD_PIVOT",
          element: cube.name,
          message: `Cube "${cube.name}" is far outside its bone's geometry — the pivot is not on the joint.`,
        });
    }
  }

  // 严重重叠 / 共面 (z-fighting)
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      if (!boundsIntersect(a.box, b.box)) continue;
      const inter = boundsIntersectionVolume(a.box, b.box);
      const smaller = Math.min(boundsVolume(a.box), boundsVolume(b.box));
      const ratio = smaller > 0 ? inter / smaller : 0;
      if (ratio > 0.97) {
        findings.push({
          severity: "error",
          code: "COPLANAR_OVERLAP",
          element: `${a.cube.name}|${b.cube.name}`,
          message: `Cubes "${a.cube.name}" and "${b.cube.name}" occupy the same volume — nudge one by >=0.1 to stop z-fighting.`,
        });
      } else if (ratio > 0.35) {
        findings.push({
          severity: "info",
          code: "OVERLAP",
          element: `${a.cube.name}|${b.cube.name}`,
          message: `Cubes "${a.cube.name}" and "${b.cube.name}" overlap significantly.`,
        });
      }
    }
  }

  if (opts.uvIslands) {
    const allowed = new Set(
      (opts.allowOverlaps ?? []).map((p) => [p.a, p.b].sort().join("|")),
    );
    const bad = opts.uvIslands.filter((island) => island.out_of_bounds).length;
    if (bad)
      findings.push({
        severity: "error",
        code: "UV_ISLAND_OUT_OF_BOUNDS",
        message: `${bad} UV island(s) lie outside the atlas.`,
      });
    const seen = new Set<string>();
    let unintended = 0;
    for (let i = 0; i < opts.uvIslands.length; i += 1) {
      for (let j = i + 1; j < opts.uvIslands.length; j += 1) {
        const a = opts.uvIslands[i];
        const b = opts.uvIslands[j];
        if (
          Math.min(a.bounds[2], b.bounds[2]) - Math.max(a.bounds[0], b.bounds[0]) <= 0 ||
          Math.min(a.bounds[3], b.bounds[3]) - Math.max(a.bounds[1], b.bounds[1]) <= 0
        )
          continue;
        const key = [`${a.cube}.${a.face}`, `${b.cube}.${b.face}`].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        if (!allowed.has(key)) unintended += 1;
      }
    }
    if (unintended)
      findings.push({
        severity: "warn",
        code: "UV_OVERLAP",
        message: `${unintended} unintended overlapping UV face pair(s) — run get_uv_layout before painting.`,
      });
  }

  const errors = findings.filter((f) => f.severity === "error").length;
  const warns = findings.filter((f) => f.severity === "warn").length;
  return {
    findings,
    summary: { cubes: cubes.length, groups: groups.length, errors, warns },
  };
}

/* ------------------------------------------------------------------ */

export type ComplexityTarget = "auto" | "prop" | "character" | "creature" | "hero";

const BUDGETS: Record<Exclude<ComplexityTarget, "auto">, [number, number]> = {
  prop: [30, 80],
  character: [80, 180],
  creature: [80, 180],
  hero: [120, 300],
};

export function auditComplexity(
  elements: ElementSnapshot[],
  opts: {
    target?: ComplexityTarget;
    min_cubes?: number;
    monolith_share?: number;
    min_overlays?: number;
    flat_face_area?: number;
  } = {},
): {
  verdict: "too_primitive" | "acceptable" | "high_detail";
  ready_for_texturing: boolean;
  cubes: number;
  metrics: Record<string, unknown>;
  issues: string[];
} {
  const cubes = elements.filter((e) => e.type === "cube");
  const byUuid = new Map(elements.map((e) => [e.uuid, e]));
  const hasRig = elements.some((e) => e.type === "group");
  const target: Exclude<ComplexityTarget, "auto"> =
    opts.target && opts.target !== "auto"
      ? opts.target
      : hasRig
        ? "character"
        : "prop";
  const [minimum, detailed] = BUDGETS[target];
  const minRequired = opts.min_cubes ?? minimum;
  const monolithShare = opts.monolith_share ?? 0.3;
  const minOverlays = opts.min_overlays ?? 4;
  const flatFaceArea = opts.flat_face_area ?? 48;

  const boxes = cubes.map((cube) => ({ cube, box: worldBounds(cube, byUuid) }));
  const totalVolume = boxes.reduce((sum, b) => sum + boundsVolume(b.box), 0);
  const issues: string[] = [];

  let monolithic = 0;
  for (const { cube, box } of boxes) {
    const share = totalVolume > 0 ? boundsVolume(box) / totalVolume : 0;
    if (share <= monolithShare) continue;
    const overlays = boxes.filter(
      (other) =>
        other.cube.uuid !== cube.uuid &&
        boundsIntersect(other.box, box) &&
        boundsVolume(other.box) < boundsVolume(box) * 0.5,
    ).length;
    if (overlays < minOverlays) {
      monolithic += 1;
      issues.push(
        `"${cube.name}" holds ${(share * 100).toFixed(0)}% of the volume with ${overlays} layered detail piece(s) — split it or layer geometry on it.`,
      );
    }
  }

  const overlapping = boxes.filter((a) =>
    boxes.some((b) => b !== a && boundsIntersect(a.box, b.box)),
  ).length;
  const micro = cubes.filter((cube) => {
    const size = boundsSize(worldBounds(cube, byUuid));
    return size.every((s) => s <= 2);
  }).length;
  const rotated = cubes.filter((cube) => cube.rotation.some((v) => Math.abs(v) > 1e-6)).length;
  const depth = (() => {
    let max = 0;
    for (const group of elements.filter((e) => e.type === "group")) {
      let d = 1;
      let parent = group.parent ? byUuid.get(group.parent) : undefined;
      while (parent && d < 64) {
        d += 1;
        parent = parent.parent ? byUuid.get(parent.parent) : undefined;
      }
      max = Math.max(max, d);
    }
    return max;
  })();
  const bareSlabs = boxes.filter(({ cube }) => {
    const size = boundsSize(worldBounds(cube, byUuid));
    return (
      Math.max(...size) >= 8 &&
      !boxes.some(
        (other) =>
          other.cube.uuid !== cube.uuid &&
          boundsIntersect(other.box, worldBounds(cube, byUuid)),
      )
    );
  }).length;
  if (bareSlabs)
    issues.push(`${bareSlabs} large cube(s) have nothing layered on them (bare slabs).`);
  if (monolithic)
    issues.push(`${monolithic} monolithic box(es) — the classic "one cube per torso" tell.`);

  const cubeCount = cubes.length;
  const verdict =
    cubeCount < minRequired
      ? "too_primitive"
      : cubeCount >= detailed
        ? "high_detail"
        : "acceptable";
  if (verdict === "too_primitive")
    issues.push(
      `Only ${cubeCount} cube(s); the ${target} budget starts at ${minRequired}. Use add_hollow_volume / generate_array / extrude_chain / voxelize_matrix to add real detail.`,
    );

  return {
    verdict,
    ready_for_texturing: verdict !== "too_primitive" && !monolithic,
    cubes: cubeCount,
    metrics: {
      target,
      budget: [minimum, detailed],
      monolithic_boxes: monolithic,
      micro_pct: Math.round((micro / Math.max(1, cubeCount)) * 100),
      overlapping_pct: Math.round((overlapping / Math.max(1, cubeCount)) * 100),
      rotated_pct: Math.round((rotated / Math.max(1, cubeCount)) * 100),
      bone_depth: depth,
      bare_slabs: bareSlabs,
    },
    issues,
  };
}

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */

export type SymmetrySide = {
  name: string;
  min: Vec3;
  max: Vec3;
  origin: Vec3;
};

/** 校验一对左右元素的坐标是否关于镜像面准确对称(纯) */
export function auditSymmetry(
  pairs: Array<{ left: SymmetrySide; right: SymmetrySide }>,
  opts: { axis?: "x" | "y" | "z"; pivot?: number; tolerance?: number } = {},
): {
  axis: string;
  pivot: number;
  pairs: Array<Record<string, unknown>>;
  summary: { passed: number; failed: number };
} {
  const axis = opts.axis ?? "x";
  const ai = axis === "x" ? 0 : axis === "y" ? 1 : 2;
  const pivot = opts.pivot ?? 0;
  const tolerance = opts.tolerance ?? 0.001;
  const rows = pairs.map((pair) => {
    const expectMin = [...pair.left.min] as Vec3;
    const expectMax = [...pair.left.max] as Vec3;
    const expectOrigin = [...pair.left.origin] as Vec3;
    expectMin[ai] = pivot * 2 - pair.left.max[ai];
    expectMax[ai] = pivot * 2 - pair.left.min[ai];
    expectOrigin[ai] = pivot * 2 - pair.left.origin[ai];
    const errors: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      errors.push(
        Math.abs(expectMin[i] - pair.right.min[i]),
        Math.abs(expectMax[i] - pair.right.max[i]),
        Math.abs(expectOrigin[i] - pair.right.origin[i]),
      );
    }
    const maxError = Math.max(...errors);
    return {
      left: pair.left.name,
      right: pair.right.name,
      max_error: Number(maxError.toFixed(6)),
      passed: maxError <= tolerance,
      expected: { min: expectMin, max: expectMax, origin: expectOrigin },
      actual: { min: pair.right.min, max: pair.right.max, origin: pair.right.origin },
    };
  });
  return {
    axis,
    pivot,
    pairs: rows,
    summary: {
      passed: rows.filter((row) => row.passed).length,
      failed: rows.filter((row) => !row.passed).length,
    },
  };
}

const SIDE_TOKENS = new Set(["left", "right", "l", "r"]);

export function nameSide(name: string): "left" | "right" | null {
  const tokens = name.toLowerCase().split(/[_\-. ]+/);
  if (tokens.includes("left") || tokens.includes("l")) return "left";
  if (tokens.includes("right") || tokens.includes("r")) return "right";
  if (/right/i.test(name)) return "right";
  if (/left/i.test(name)) return "left";
  return null;
}

function baseName(name: string): string {
  return name
    .toLowerCase()
    .split(/[_\-. ]+/)
    .filter((token) => !SIDE_TOKENS.has(token))
    .join("");
}

export function checkSides(elements: ElementSnapshot[]): {
  findings: Finding[];
  summary: { checked: number; mismatched: number; unpaired: number };
} {
  const findings: Finding[] = [];
  const byUuid = new Map(elements.map((e) => [e.uuid, e]));
  const limbish = elements.filter(
    (e) => e.type === "group" && nameSide(e.name) !== null,
  );
  let mismatched = 0;
  let unpaired = 0;

  for (const element of limbish) {
    const declared = nameSide(element.name);
    if (!declared) continue;
    // 模型面朝 -Z,所以模型自身的右是 +X
    const actual =
      element.origin[0] > 0.001
        ? "right"
        : element.origin[0] < -0.001
          ? "left"
          : null;
    if (actual && actual !== declared) {
      mismatched += 1;
      findings.push({
        severity: "error",
        code: "SIDE_MISMATCH",
        element: element.name,
        message: `"${element.name}" is named ${declared} but sits at x=${element.origin[0]} (the model's ${actual}); the model faces -Z so its own right is +X.`,
      });
    }
    const counterpart = limbish.find(
      (other) =>
        other.uuid !== element.uuid &&
        nameSide(other.name) === (declared === "left" ? "right" : "left") &&
        baseName(other.name) === baseName(element.name),
    );
    if (!counterpart) {
      unpaired += 1;
      findings.push({
        severity: "warn",
        code: "SIDE_UNPAIRED",
        element: element.name,
        message: `"${element.name}" has no mirrored counterpart — mirror_elements or create_limb mirror:"x".`,
      });
    }
  }
  for (const element of elements) {
    if (element.parent && !byUuid.has(element.parent))
      findings.push({
        severity: "error",
        code: "ORPHAN_PARENT",
        element: element.name,
        message: `"${element.name}" references missing parent ${element.parent}.`,
      });
  }
  return {
    findings,
    summary: { checked: limbish.length, mismatched, unpaired },
  };
}

export function checkRig(elements: ElementSnapshot[]): {
  findings: Finding[];
  summary: { bones: number; limbs: number; ready: boolean };
} {
  const groups = elements.filter((e) => e.type === "group");
  const findings: Finding[] = [];
  const byUuid = new Map(elements.map((e) => [e.uuid, e]));
  const lower = (name: string) => name.toLowerCase();
  const limbs = ["arm", "leg", "wing", "hand", "foot"].filter((part) =>
    groups.some((g) => lower(g.name).includes(part)),
  );

  for (const group of groups) {
    // 关键:肢体需要 3 段骨骼(上/中/末)才能弯肘弯膝
    const segments = groups.filter((g) => {
      if (g.uuid === group.uuid) return false;
      let parent = g.parent ? byUuid.get(g.parent) : undefined;
      let guard = 0;
      while (parent && guard < 16) {
        if (parent.uuid === group.uuid) return true;
        parent = parent.parent ? byUuid.get(parent.parent) : undefined;
        guard += 1;
      }
      return false;
    }).length;
    const name = lower(group.name);
    const isLimbRoot = ["arm", "leg", "wing"].some((p) => name.includes(p));
    if (isLimbRoot && segments < 2)
      findings.push({
        severity: "warn",
        code: "TWO_BONE_LIMB",
        element: group.name,
        message: `"${group.name}" has ${segments + 1} segment(s); use 3 bones per limb so elbows/knees can bend.`,
      });
  }

  const looseCubes = elements.filter((e) => e.type === "cube" && !e.parent).length;
  if (looseCubes)
    findings.push({
      severity: "error",
      code: "LOOSE_CUBES",
      message: `${looseCubes} cube(s) are not parented to a bone — animated formats cannot drive them.`,
    });

  const originIssues = elements.filter((element) => {
    if (element.type === "group") {
      // 关节 pivot 必须落在几何附近,否则旋转像陀螺
      const children = elements.filter((e) => e.parent === element.uuid);
      if (!children.length) return false;
      const near = children.some((child) => {
        if (!child.from || !child.to) return true;
        const box = { min: child.from, max: child.to } as Bounds3;
        return (
          dist(boundsCenter(box), element.origin) <=
          dist(box.min, box.max) * 1.5 + 1
        );
      });
      return !near;
    }
    return false;
  });
  for (const element of originIssues)
    findings.push({
      severity: "warn",
      code: "ORIGIN_FAR_FROM_JOINT",
      element: element.name,
      message: `Bone "${element.name}" pivot is far from its geometry — put it on the real joint.`,
    });

  return {
    findings,
    summary: {
      bones: groups.length,
      limbs: limbs.length,
      ready: !findings.some((f) => f.severity === "error"),
    },
  };
}

/* ------------------------------------------------------------------ */

export type Silhouette = {
  width: number;
  height: number;
  /** alpha > threshold 的像素 */
  mask: Uint8Array;
};

/** 从 RGBA 像素构造轮廓掩码(纯) */
export function silhouetteFromRgba(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold = 8,
  luminanceThreshold = 245,
): Silhouette {
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const alpha = data[i * 4 + 3];
    const luminance =
      data[i * 4] * 0.2126 + data[i * 4 + 1] * 0.7152 + data[i * 4 + 2] * 0.0722;
    mask[i] = alpha > alphaThreshold && luminance < luminanceThreshold ? 1 : 0;
  }
  return { width, height, mask };
}

export function silhouetteBounds(s: Silhouette): [number, number, number, number] {
  let minX = s.width;
  let minY = s.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < s.height; y += 1)
    for (let x = 0; x < s.width; x += 1) {
      if (!s.mask[y * s.width + x]) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  return maxX < 0 ? [0, 0, 0, 0] : [minX, minY, maxX + 1, maxY + 1];
}

/**
 * 轮廓 IoU 对比 —— 把"像不像参考图"变成可测量的数字。
 * 两侧都裁剪到各自轮廓包围盒并归一化,消除取景差异。
 */
export function compareSilhouettes(
  model: Silhouette,
  reference: Silhouette,
  gridSize = 64,
): {
  match_percent: number;
  aspect_delta_pct: number;
  ref_only_pct: number;
  model_only_pct: number;
  verdict: string;
  advice: string[];
  grid_size: number;
  /** 归一化后的掩码(0/1),便于生成对比图 */
  model_mask: Uint8Array;
  reference_mask: Uint8Array;
} {
  const normalize = (s: Silhouette): Uint8Array => {
    const [minX, minY, maxX, maxY] = silhouetteBounds(s);
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    const out = new Uint8Array(gridSize * gridSize);
    for (let gy = 0; gy < gridSize; gy += 1) {
      for (let gx = 0; gx < gridSize; gx += 1) {
        const sx = Math.min(s.width - 1, minX + Math.floor((gx / gridSize) * w));
        const sy = Math.min(s.height - 1, minY + Math.floor((gy / gridSize) * h));
        out[gy * gridSize + gx] = s.mask[sy * s.width + sx] ?? 0;
      }
    }
    return out;
  };
  const a = normalize(model);
  const b = normalize(reference);
  let inter = 0;
  let union = 0;
  let refOnly = 0;
  let modelOnly = 0;
  for (let i = 0; i < a.length; i += 1) {
    const inA = a[i] === 1;
    const inB = b[i] === 1;
    if (inA && inB) inter += 1;
    if (inA || inB) union += 1;
    if (!inA && inB) refOnly += 1;
    if (inA && !inB) modelOnly += 1;
  }
  const match = union ? (inter / union) * 100 : 0;
  const boundsOf = (s: Silhouette) => {
    const [minX, minY, maxX, maxY] = silhouetteBounds(s);
    return { w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
  };
  const mb = boundsOf(model);
  const rb = boundsOf(reference);
  const aspectDelta = ((mb.w / mb.h - rb.w / rb.h) / (rb.w / rb.h)) * 100;
  const refArea = Math.max(1, refOnly + inter);
  const modelArea = Math.max(1, modelOnly + inter);
  const advice: string[] = [];
  if (match < 85) {
    if (refOnly / refArea > 0.25)
      advice.push("Add mass where the reference has silhouette your model lacks.");
    if (modelOnly / modelArea > 0.25)
      advice.push("Trim mass that sticks out beyond the reference.");
    if (Math.abs(aspectDelta) > 15)
      advice.push(
        aspectDelta > 0
          ? `Model is too wide relative to its height (${aspectDelta.toFixed(0)}%); narrow it or add height.`
          : `Model is too narrow/tall (${aspectDelta.toFixed(0)}%); widen it or reduce height.`,
      );
    if (!advice.length) advice.push("Match the overall proportions more closely, then re-measure.");
  }
  const verdict =
    match >= 90 ? "excellent" : match >= 85 ? "good" : match >= 70 ? "close" : match >= 50 ? "off" : "poor";
  return {
    match_percent: Number(match.toFixed(1)),
    aspect_delta_pct: Number(aspectDelta.toFixed(1)),
    ref_only_pct: Number(((refOnly / refArea) * 100).toFixed(1)),
    model_only_pct: Number(((modelOnly / modelArea) * 100).toFixed(1)),
    verdict,
    advice,
    grid_size: gridSize,
    model_mask: a,
    reference_mask: b,
  };
}

/** FNV-1a 32 位哈希 —— 纹理 revision token(乐观并发) */
export function revisionFromPixels(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): string {
  let hash = 0x811c9dc5;
  for (const value of data) {
    hash ^= value;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  for (const value of [width & 255, width >>> 8, height & 255, height >>> 8]) {
    hash ^= value;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, "0")}`;
}

/** 逐面纹理质量检查(纯,输入已取出的面像素) */
export function auditFacePixels(
  grid: Array<Array<[number, number, number, number]>>,
  opts: { paletteLimit?: number; minBaseRatio?: number; glass?: boolean } = {},
): Finding[] {
  const findings: Finding[] = [];
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const pixels = width * height;
  if (!pixels) return findings;
  const counts = new Map<string, number>();
  let transparent = 0;
  let opaque = 0;
  let edgeAlpha = 0;
  let edgeCount = 0;
  let centerAlpha = 0;
  let centerCount = 0;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const rgba = grid[y][x];
      const key = rgba.join(",");
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (rgba[3] === 0) transparent += 1;
      if (rgba[3] >= 230) opaque += 1;
      const isEdge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      if (isEdge) {
        edgeAlpha += rgba[3];
        edgeCount += 1;
      } else {
        centerAlpha += rgba[3];
        centerCount += 1;
      }
    }
  const dominant = Math.max(...counts.values());
  const baseRatio = dominant / pixels;
  if (transparent === pixels)
    findings.push({
      severity: "error",
      code: "EMPTY_FACE_TEXTURE",
      message: "Face is fully transparent and will not be visible.",
    });
  if (counts.size > (opts.paletteLimit ?? 8))
    findings.push({
      severity: "warn",
      code: "PALETTE_EXCESS",
      message: `${counts.size} exact RGBA colors exceed palette_limit ${opts.paletteLimit ?? 8}.`,
    });
  if (baseRatio < (opts.minBaseRatio ?? 0.6))
    findings.push({
      severity: "warn",
      code: "WEAK_BASE_COLOR",
      message: `Dominant color covers only ${(baseRatio * 100).toFixed(1)}%; material may read as noisy.`,
    });
  if (counts.size === 1 && transparent !== pixels)
    findings.push({
      severity: "info",
      code: "FLAT_FACE",
      message: "Face is a uniform fill; verify that flat material is intentional.",
    });
  if (opts.glass) {
    if (edgeAlpha / Math.max(1, edgeCount) <= centerAlpha / Math.max(1, centerCount))
      findings.push({
        severity: "warn",
        code: "GLASS_EDGE_WEAK",
        message: "Glass edges are not more opaque than the center; the hollow form may disappear.",
      });
    if (opaque / pixels > 0.35)
      findings.push({
        severity: "warn",
        code: "GLASS_TOO_OPAQUE",
        message: `${((opaque / pixels) * 100).toFixed(1)}% of texels are near-opaque.`,
      });
  }
  return findings;
}

export { FACE_NAMES };

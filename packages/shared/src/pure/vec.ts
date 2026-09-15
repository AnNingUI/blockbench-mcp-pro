/** 纯向量/AABB 数学 —— 与 Blockbench 解耦,可在 node 中单元测试 */
export type Vec3 = [number, number, number];
export type Vec2 = [number, number];
export type Bounds3 = { min: Vec3; max: Vec3 };

const RAD = Math.PI / 180;

/** 按 Blockbench 的欧拉序 (X→Y→Z) 绕 pivot 旋转一个点,单位:度 */
export function rotatePoint(point: Vec3, pivot: Vec3, rotation: Vec3): Vec3 {
  let [x, y, z] = [
    point[0] - pivot[0],
    point[1] - pivot[1],
    point[2] - pivot[2],
  ];
  for (let axis = 0; axis < 3; axis += 1) {
    const degrees = rotation[axis] ?? 0;
    if (degrees === 0) continue;
    const r = degrees * RAD;
    const c = Math.cos(r);
    const s = Math.sin(r);
    if (axis === 0) [y, z] = [y * c - z * s, y * s + z * c];
    else if (axis === 1) [x, z] = [x * c + z * s, -x * s + z * c];
    else [x, y] = [x * c - y * s, x * s + y * c];
  }
  return [x + pivot[0], y + pivot[1], z + pivot[2]];
}

/** 组合两个欧拉旋转 (current 后再施加 delta),返回等价的欧拉角 */
export function composeRotation(current: Vec3, delta: Vec3): Vec3 {
  const columns = ([[1, 0, 0], [0, 1, 0], [0, 0, 1]] as Vec3[]).map((axis) =>
    rotatePoint(rotatePoint(axis, [0, 0, 0], current), [0, 0, 0], delta),
  );
  const pitch = Math.asin(Math.max(-1, Math.min(1, -columns[0][2])));
  const regular = Math.abs(Math.cos(pitch)) > 1e-8;
  return [
    regular
      ? (Math.atan2(columns[1][2], columns[2][2]) * 180) / Math.PI
      : 0,
    (pitch * 180) / Math.PI,
    (regular
      ? Math.atan2(columns[0][1], columns[0][0])
      : Math.atan2(-columns[1][0], columns[1][1])) * (180 / Math.PI),
  ];
}

export function boundsOfPoints(points: Vec3[]): Bounds3 {
  if (!points.length) return { min: [0, 0, 0], max: [0, 0, 0] };
  return {
    min: [0, 1, 2].map((i) => Math.min(...points.map((p) => p[i]))) as Vec3,
    max: [0, 1, 2].map((i) => Math.max(...points.map((p) => p[i]))) as Vec3,
  };
}

export function boundsSize(b: Bounds3): Vec3 {
  return [0, 1, 2].map((i) => b.max[i] - b.min[i]) as Vec3;
}

export function boundsCenter(b: Bounds3): Vec3 {
  return [0, 1, 2].map((i) => (b.min[i] + b.max[i]) / 2) as Vec3;
}

export function boundsVolume(b: Bounds3): number {
  return [0, 1, 2].reduce((v, i) => v * Math.max(0, b.max[i] - b.min[i]), 1);
}

export function boundsIntersect(a: Bounds3, b: Bounds3): boolean {
  return [0, 1, 2].every((i) => a.max[i] > b.min[i] && b.max[i] > a.min[i]);
}

export function boundsIntersectionVolume(a: Bounds3, b: Bounds3): number {
  let volume = 1;
  for (let i = 0; i < 3; i += 1) {
    volume *= Math.max(0, Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i]));
  }
  return volume;
}

export function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** 8 个角点 (含 inflate) */
export function boxCorners(
  from: Vec3,
  to: Vec3,
  inflate = 0,
): Vec3[] {
  const lo = from.map((v, i) => Math.min(v, to[i]) - inflate) as Vec3;
  const hi = from.map((v, i) => Math.max(v, to[i]) + inflate) as Vec3;
  const out: Vec3[] = [];
  for (const x of [lo[0], hi[0]])
    for (const y of [lo[1], hi[1]])
      for (const z of [lo[2], hi[2]]) out.push([x, y, z]);
  return out;
}

export function geometricVolume(from: Vec3, to: Vec3, inflate = 0): number {
  return [0, 1, 2].reduce(
    (v, i) =>
      v * Math.max(0, Math.abs(to[i] - from[i]) + inflate * 2),
    1,
  );
}

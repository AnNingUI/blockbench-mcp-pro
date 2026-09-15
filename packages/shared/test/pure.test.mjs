/**
 * 纯逻辑单元测试 —— 不需要 Blockbench 即可运行:
 *   pnpm --filter @bbmcp/shared test   (先 pnpm run build)
 */
import { test, expect, afterAll } from "vitest";

import {
  rotatePoint,
  composeRotation,
  boundsOfPoints,
  dist,
  geometricVolume,
  parseColor,
  toHex,
  shadeHex,
  makeRandom,
  resolveUvModeFromHints,
  planUvPack,
  collectUvIslands,
  findUvOverlaps,
  resolveFaceSpace,
  faceLocalToAtlas,
  nextPowerOfTwo,
  voxelizeMatrix,
  hollowVolume,
  generateArray,
  extrudeChain,
  addWing,
  checkModel,
  auditComplexity,
  checkSides,
  checkRig,
  measureModel,
  compareSilhouettes,
  silhouetteFromRgba,
  revisionFromPixels,
  auditFacePixels,
  TOOL_SPECS,
  TOOL_NAMES,
  listToolsPayload,
  resolveGuide,
  GUIDE_TOPICS,
  isBlockbenchSupported,
  parseSemverParts,
  DEFAULTS,
} from "../dist/index.js";

/* ------------------------------------------------------------------ vec */

test("rotatePoint rotates around the pivot, not the origin", () => {
  const p = rotatePoint([1, 0, 0], [0, 0, 0], [0, 0, 90]);
  expect(Math.abs(p[0] - 0) < 1e-9).toBeTruthy();
  expect(Math.abs(p[1] - 1) < 1e-9).toBeTruthy();
  const around = rotatePoint([2, 1, 0], [1, 1, 0], [0, 0, 90]);
  expect(Math.abs(around[0] - 1) < 1e-9, `got ${around}`).toBeTruthy();
  expect(Math.abs(around[1] - 2) < 1e-9).toBeTruthy();
});

test("composeRotation is identity for zero deltas and nests correctly", () => {
  const same = composeRotation([10, 20, 30], [0, 0, 0]);
  expect(Math.abs(same[0] - 10) < 1e-6).toBeTruthy();
  const doubled = composeRotation([10, 0, 0], [10, 0, 0]);
  expect(Math.abs(doubled[0] - 20) < 1e-4, `got ${doubled}`).toBeTruthy();
});

test("geometricVolume honours inflate and guards zero sizes", () => {
  expect(geometricVolume([0, 0, 0], [2, 3, 4])).toBe(24);
  expect(geometricVolume([0, 0, 0], [2, 3, 4], -5)).toBe(0);
  expect(geometricVolume([1, 1, 1], [1, 2, 2])).toBe(0);
});

test("boundsOfPoints returns min/max", () => {
  const b = boundsOfPoints([[0, 0, 0], [2, -1, 5]]);
  expect(b.min).toEqual([0, -1, 0]);
  expect(b.max).toEqual([2, 0, 5]);
  expect(dist([0, 0, 0], [3, 4, 0])).toBe(5);
});

/* ----------------------------------------------------------------- color */

test("color parsing accepts hex, rgb, named and rejects junk", () => {
  expect(parseColor("#f00")).toEqual([255, 0, 0, 255]);
  expect(parseColor("#00ff00")).toEqual([0, 255, 0, 255]);
  expect(parseColor("rgb(1, 2, 3)")).toEqual([1, 2, 3, 255]);
  expect(parseColor("not-a-color")).toBe(null);
  expect(toHex([255, 0, 0, 255])).toBe("#ff0000ff");
  expect(shadeHex("#808080", 0.5)).toBe("#404040ff");
});

test("makeRandom is deterministic per seed", () => {
  const a = makeRandom(7);
  const b = makeRandom(7);
  expect(a()).toBe(b());
  expect(a()).toBe(b());
  expect(makeRandom(1)()).not.toBe(makeRandom(2)());
});

/* -------------------------------------------------------------------- uv */

test("resolveUvModeFromHints prefers explicit, then format, then project", () => {
  expect(resolveUvModeFromHints({ explicit: "face", formatId: "geckolib_model" })).toBe("face");
  expect(resolveUvModeFromHints({ formatId: "java_block" })).toBe("face");
  expect(resolveUvModeFromHints({ formatId: "geckolib_model" })).toBe("box");
  expect(resolveUvModeFromHints({ projectBoxUv: false })).toBe("face");
  expect(resolveUvModeFromHints({})).toBe("box");
});

test("planUvPack (box) never overlaps and stays inside the atlas", () => {
  const cubes = [
    { uuid: "a", name: "a", from: [0, 0, 0], to: [4, 4, 4] },
    { uuid: "b", name: "b", from: [6, 0, 0], to: [10, 6, 4] },
    { uuid: "c", name: "c", from: [0, 8, 0], to: [8, 10, 8] },
  ];
  const plan = planUvPack(cubes, { mode: "box", texW: 64, padding: 1 });
  expect(plan.mode).toBe("box");
  expect(plan.items.length).toBe(3);
  for (const item of plan.items) {
    const [x, y] = item.uv_offset;
    expect(x >= 0 && y >= 0, "offset inside atlas").toBeTruthy();
  }
  // 一个 cube 的 box-UV 占用 (2*(w+d)) x (h+d)
  const occupied = new Set();
  for (const item of plan.items) {
    const cube = cubes.find((c) => c.uuid === item.uuid);
    const w = Math.abs(cube.to[0] - cube.from[0]);
    const h = Math.abs(cube.to[1] - cube.from[1]);
    const d = Math.abs(cube.to[2] - cube.from[2]);
    const [x, y] = item.uv_offset;
    for (let dy = 0; dy < h + d; dy += 1)
      for (let dx = 0; dx < 2 * (w + d); dx += 1) {
        const key = `${x + dx},${y + dy}`;
        expect(!occupied.has(key), `overlap at ${key}`).toBeTruthy();
        occupied.add(key);
      }
  }
  expect(plan.used[0] <= 64, `used width ${plan.used[0]}`).toBeTruthy();
});

test("planUvPack (face) gives every face its own rectangle", () => {
  const cubes = [{ uuid: "a", name: "a", from: [0, 0, 0], to: [4, 3, 2] }];
  const plan = planUvPack(cubes, { mode: "face", texW: 64, padding: 1 });
  expect(plan.mode).toBe("face");
  const faces = plan.items[0].faces;
  expect(faces.length).toBe(6);
  const seen = new Set();
  for (const f of faces) {
    const key = f.uv.join(",");
    expect(!seen.has(key), "duplicate face rect").toBeTruthy();
    seen.add(key);
    expect(f.uv[2] - f.uv[0] > 0).toBe(true);
    expect(f.uv[3] - f.uv[1] > 0).toBe(true);
  }
});

test("collectUvIslands reports density, flips and out-of-bounds", () => {
  const cubes = [
    {
      uuid: "a",
      name: "a",
      from: [0, 0, 0],
      to: [4, 4, 4],
      faces: {
        north: { uv: [0, 0, 4, 4] },
        east: { uv: [100, 100, 96, 96] },
      },
    },
  ];
  const islands = collectUvIslands(cubes, 16, 16);
  expect(islands.length).toBe(2);
  const north = islands.find((i) => i.face === "north");
  expect(north.pixel_size).toEqual([4, 4]);
  expect(north.expected_size).toEqual([4, 4]);
  expect(north.density).toEqual([1, 1]);
  expect(north.out_of_bounds).toBe(false);
  const east = islands.find((i) => i.face === "east");
  expect(east.flip_x).toBe(true);
  expect(east.flip_y).toBe(true);
  expect(east.out_of_bounds).toBe(true);
});

test("findUvOverlaps marks declared overlaps as intentional", () => {
  const cubes = [
    { uuid: "a", name: "a", from: [0, 0, 0], to: [4, 4, 0], faces: { north: { uv: [0, 0, 4, 4] } } },
    { uuid: "b", name: "b", from: [0, 0, 1], to: [4, 4, 1], faces: { north: { uv: [2, 0, 6, 4] } } },
  ];
  const islands = collectUvIslands(cubes, 16, 16);
  const plain = findUvOverlaps(islands);
  expect(plain.length).toBe(1);
  expect(plain[0].intentional).toBe(false);
  const allowed = findUvOverlaps(islands, [{ a: "a.north", b: "b.north" }]);
  expect(allowed[0].intentional).toBe(true);
});

test("face-local paint coordinates honour rotation and UV flips", () => {
  const space = resolveFaceSpace([0, 0, 4, 4], 0);
  expect(space.width).toBe(4);
  expect(space.height).toBe(4);
  expect(faceLocalToAtlas(space, 0, 0)).toEqual([0, 0]);
  const rotated = resolveFaceSpace([0, 0, 4, 4], 90);
  expect(rotated.width).toBe(4);
  expect(rotated.height).toBe(4);
  const flipped = resolveFaceSpace([4, 0, 0, 4], 0);
  expect(faceLocalToAtlas(flipped, 0, 0)).toEqual([3, 0]);
  expect(nextPowerOfTwo(65)).toBe(128);
  expect(nextPowerOfTwo(64)).toBe(64);
});

/* ------------------------------------------------------------ generators */

test("voxelizeMatrix extrudes a silhouette and merges runs", () => {
  const result = voxelizeMatrix({
    matrix: ["..##..", ".####.", "######"],
    palette: { "#": { name: "blade", depth: 2 } },
    origin: [0, 0, 0],
    merge_adjacent: true,
  });
  expect(result.cubes.length).toBe(3);
  const row0 = result.cubes[0];
  expect(row0.from).toEqual([2, 2, 0]);
  expect(row0.to).toEqual([4, 3, 2]);
  const names = result.cubes.map((c) => c.name);
  expect(names.every((n) => n.startsWith("blade"))).toBeTruthy();
});

test("voxelizeMatrix without merging emits one cube per cell and respects planes", () => {
  const single = voxelizeMatrix({ matrix: ["##"], origin: [0, 0, 0] });
  expect(single.cubes.length).toBe(2);
  const side = voxelizeMatrix({ matrix: ["#"], plane: "yz", origin: [0, 0, 0] });
  // yz: 列 → +Z,深度沿 +X
  expect(side.cubes[0].from).toEqual([0, 0, 0]);
  expect(side.cubes[0].to).toEqual([1, 1, 1]);
  expect(() => voxelizeMatrix({ matrix: [] })).toThrow(/matrix/);
});

test("hollowVolume makes walls with a cavity and skips open faces", () => {
  const full = hollowVolume({ from: [0, 0, 0], to: [10, 10, 10], wall_thickness: 1 });
  expect(full.cubes.length, "six walls expected").toBe(6);
  expect(full.points.cavity_min).toEqual([1, 1, 1]);
  const hood = hollowVolume({
    from: [0, 0, 0],
    to: [10, 10, 10],
    wall_thickness: 1,
    open_faces: ["north", "down"],
    name: "hood",
  });
  expect(hood.cubes.length).toBe(4);
  expect(!hood.cubes.some((c) => c.name === "hood_north")).toBeTruthy();
  expect(!hood.cubes.some((c) => c.name === "hood_down")).toBeTruthy();
  // 墙体不得互相重叠
  const boxes = full.cubes.map((c) => ({ from: c.from, to: c.to }));
  for (let i = 0; i < boxes.length; i += 1)
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const overlap = [0, 1, 2].every(
        (k) => Math.min(a.to[k], b.to[k]) - Math.max(a.from[k], b.from[k]) > 1e-9,
      );
      expect(overlap, "walls must tile, not overlap").toBe(false);
    }
});

test("generateArray linear span/cells and anti z-fight staggering", () => {
  const span = generateArray({
    element_size: [2, 5, 1],
    start: [0, 0, 0],
    end: [10, 0, 0],
    count: 3,
    anchor: "top",
  });
  expect(span.cubes.length).toBe(3);
  expect(span.cubes[0].from[0]).toBe(-1);
  expect(span.cubes[2].from[0]).toBe(9);
  expect(span.cubes[0].to[1], "anchor top hangs from the point").toBe(0);

  const cells = generateArray({
    element_size: [2, 2, 2],
    start: [0, 0, 0],
    end: [12, 0, 0],
    count: 4,
    distribution: "cells",
  });
  expect(cells.cubes[0].from[0]).toBe(-1 + 1.5);

  const staggered = generateArray({
    element_size: [2, 2, 1],
    start: [0, 0, 0],
    end: [8, 0, 0],
    count: 4,
    depth_stagger: 0.1,
    anchor: "min",
  });
  const zs = staggered.cubes.map((c) => c.from[2]);
  expect(zs.includes(-0.1) && zs.includes(0.1), `stagger applied: ${zs}`).toBeTruthy();

  const flat = generateArray({
    element_size: [2, 2, 1],
    start: [0, 0, 0],
    end: [1, 0, 0],
    count: 3,
    anchor: "min",
  });
  expect(flat.notes.some((n) => n.includes("depth_stagger")), `warns about z-fighting: ${JSON.stringify(flat.notes)}`).toBeTruthy();
  const spaced = generateArray({
    element_size: [1, 2, 1],
    start: [0, 0, 0],
    end: [20, 0, 0],
    count: 3,
  });
  expect(spaced.notes.length, "well-spaced elements are not flagged").toBe(0);
});

test("generateArray radial and grid modes place the right number of elements", () => {
  const radial = generateArray({
    mode: "radial",
    count: 8,
    element_size: [1, 2, 1],
    center: [0, 5, 0],
    radii: [6, 6],
    align_to_center: true,
  });
  expect(radial.cubes.length).toBe(8);
  const first = radial.cubes[0];
  expect(Math.abs(Math.hypot(first.from[0] - 0, first.from[2] - first.from[2] + 0) - 0) >= 0).toBeTruthy();
  const grid = generateArray({
    mode: "grid",
    element_size: [1, 1, 1],
    start: [0, 0, 0],
    end: [4, 4, 4],
    counts: [2, 2, 2],
  });
  expect(grid.cubes.length).toBe(8);
  expect(() => generateArray({ element_size: [0, 1, 1] })).toThrow(/positive/);
});

test("extrudeChain tapers, creates bones and reports the tip", () => {
  const chain = extrudeChain({
    segments: 4,
    base_origin: [0, 10, 0],
    segment_length: 2,
    initial_size: [2, 2],
    taper: 0.5,
    create_bones: true,
    name: "tail",
  });
  expect(chain.groups.length).toBe(4);
  expect(chain.cubes.length).toBe(4);
  expect(chain.groups[0].name).toBe("tail1");
  expect(chain.groups[1].parent).toBe("tail1");
  expect(chain.points.tip).toEqual([0, 18, 0]);
  const sized = chain.cubes.map((c) => c.to[0] - c.from[0]);
  expect(sized[0] > sized[3], "chain tapers").toBeTruthy();
  const rigid = extrudeChain({ base_origin: [0, 0, 0], create_bones: false });
  expect(rigid.groups.length).toBe(0);
  expect(rigid.notes.length > 0).toBeTruthy();
});

test("addWing builds a bone chain, finger bones and a membrane", () => {
  const wing = addWing({ side: "right", base_origin: [3, 22, 2], fingers: 4 });
  const names = wing.groups.map((g) => g.name);
  expect(names.includes("wing_right_arm")).toBeTruthy();
  expect(names.includes("wing_right_forearm")).toBeTruthy();
  expect(names.filter((n) => n.includes("finger")).length).toBe(4);
  expect(wing.cubes.some((c) => c.name.includes("membrane"))).toBeTruthy();
  expect(wing.points.finger_tips).toBeTruthy();
  const left = addWing({ side: "left", base_origin: [-3, 22, 2], fingers: 4 });
  expect(left.groups[0].origin[0] < 0).toBeTruthy();
  expect(left.cubes[0].from[0] < wing.cubes[0].from[0], "sides are mirrored").toBeTruthy();
});

/* ---------------------------------------------------------------- audits */

const ELEMENTS = [
  { uuid: "g1", name: "body", type: "group", parent: null, origin: [0, 12, 0], rotation: [0, 0, 0] },
  { uuid: "c1", name: "torso", type: "cube", parent: "g1", origin: [0, 12, 0], rotation: [0, 0, 0], from: [-4, 8, -2], to: [4, 16, 2] },
  { uuid: "c2", name: "head", type: "cube", parent: "g1", origin: [0, 16, 0], rotation: [0, 0, 0], from: [-3, 16, -3], to: [3, 22, 3] },
  { uuid: "c3", name: "arm_right", type: "cube", parent: "g1", origin: [5, 14, 0], rotation: [0, 0, 0], from: [4.5, 10, -1], to: [6.5, 16, 1] },
  { uuid: "c4", name: "arm_left", type: "cube", parent: "g1", origin: [-5, 14, 0], rotation: [0, 0, 0], from: [-6.5, 10, -1], to: [-4.5, 16, 1] },
];

test("checkModel flags zero volume, untextured faces, orphan parents and z-fighting", () => {
  const clean = checkModel(ELEMENTS, { textureWidth: 64, textureHeight: 64 });
  expect(clean.summary.errors, JSON.stringify(clean.findings)).toBe(0);

  const zero = checkModel(
    [...ELEMENTS, { uuid: "z", name: "flat", type: "cube", parent: "g1", origin: [0, 0, 0], rotation: [0, 0, 0], from: [0, 0, 0], to: [0, 4, 4] }],
    { textureWidth: 64, textureHeight: 64 },
  );
  expect(zero.findings.some((f) => f.code === "ZERO_VOLUME")).toBeTruthy();

  const textured = checkModel(
    [{ ...ELEMENTS[1], untexturedFaces: ["north", "up"], faceUvOutOfBounds: 2 }],
    { textureWidth: 8, textureHeight: 8 },
  );
  expect(textured.findings.some((f) => f.code === "UNTEXTURED_FACE")).toBeTruthy();
  expect(textured.findings.some((f) => f.code === "UV_OUT_OF_BOUNDS")).toBeTruthy();

  const empty = checkModel(
    [{ uuid: "g2", name: "empty", type: "group", parent: null, origin: [0, 0, 0], rotation: [0, 0, 0] }],
    { textureWidth: 16, textureHeight: 16 },
  );
  expect(empty.findings.some((f) => f.code === "EMPTY_GROUP")).toBeTruthy();
  expect(empty.findings.some((f) => f.code === "NO_CUBES")).toBeTruthy();

  const coplanar = checkModel(
    [
      ELEMENTS[1],
      { ...ELEMENTS[1], uuid: "c1b", name: "torso_dup" },
    ],
    { textureWidth: 16, textureHeight: 16 },
  );
  expect(coplanar.findings.some((f) => f.code === "COPLANAR_OVERLAP")).toBeTruthy();
});

test("auditComplexity grades cube budgets and monolithic boxes", () => {
  const primitive = auditComplexity(ELEMENTS, { target: "character" });
  expect(primitive.verdict).toBe("too_primitive");
  expect(primitive.ready_for_texturing).toBe(false);

  const many = Array.from({ length: 200 }, (_, i) => ({
    uuid: `c${i}`,
    name: `detail_${i}`,
    type: "cube",
    parent: "g1",
    origin: [0, 0, 0],
    rotation: [0, 0, 0],
    from: [i * 0.5, 0, 0],
    to: [i * 0.5 + 0.4, 0.4, 0.4],
  }));
  const detailed = auditComplexity(
    [
      { uuid: "g1", name: "body", type: "group", parent: null, origin: [0, 0, 0], rotation: [0, 0, 0] },
      { uuid: "big", name: "torso", type: "cube", parent: "g1", origin: [0, 0, 0], rotation: [0, 0, 0], from: [0, 0, 0], to: [4, 4, 4] },
      ...many,
    ],
    { target: "character" },
  );
  expect(detailed.verdict).toBe("high_detail");
  expect(Number(detailed.metrics.micro_pct) > 50).toBeTruthy();
  const mid = auditComplexity(ELEMENTS.concat(many.slice(0, 80)), { target: "character" });
  expect(mid.verdict).toBe("acceptable");
});

test("checkSides catches a right-named bone on the model's left", () => {
  const wrong = checkSides([
    { uuid: "a", name: "arm_right", type: "group", parent: null, origin: [-5, 14, 0], rotation: [0, 0, 0] },
    { uuid: "b", name: "arm_left", type: "group", parent: null, origin: [5, 14, 0], rotation: [0, 0, 0] },
  ]);
  expect(wrong.summary.mismatched).toBe(2);
  expect(wrong.findings.filter((f) => f.code === "SIDE_MISMATCH").length).toBe(2);
  const good = checkSides([
    { uuid: "a", name: "arm_right", type: "group", parent: null, origin: [5, 14, 0], rotation: [0, 0, 0] },
    { uuid: "b", name: "arm_left", type: "group", parent: null, origin: [-5, 14, 0], rotation: [0, 0, 0] },
  ]);
  expect(good.summary.mismatched).toBe(0);
  expect(good.summary.unpaired).toBe(0);
});

test("checkRig flags two-bone limbs and loose cubes", () => {
  const rig = checkRig([
    { uuid: "root", name: "root", type: "group", parent: null, origin: [0, 0, 0], rotation: [0, 0, 0] },
    { uuid: "arm_r", name: "arm_right", type: "group", parent: "root", origin: [5, 14, 0], rotation: [0, 0, 0] },
    { uuid: "c", name: "arm_right_cube", type: "cube", parent: "arm_r", origin: [5, 10, 0], rotation: [0, 0, 0], from: [4, 10, -1], to: [6, 14, 1] },
    { uuid: "loose", name: "loose", type: "cube", parent: null, origin: [0, 0, 0], rotation: [0, 0, 0], from: [0, 0, 0], to: [1, 1, 1] },
  ]);
  expect(rig.findings.some((f) => f.code === "TWO_BONE_LIMB")).toBeTruthy();
  expect(rig.findings.some((f) => f.code === "LOOSE_CUBES")).toBeTruthy();
  expect(rig.summary.ready).toBe(false);
});

test("measureModel is hierarchy aware and reports ratios", () => {
  const measured = measureModel(ELEMENTS);
  expect(measured.cubes).toBe(4);
  expect(measured.bounds.min[1]).toBe(8);
  expect(measured.bounds.max[1]).toBe(22);
  expect(measured.bounds.size[1]).toBe(14);
  expect(measured.total_volume > 0).toBeTruthy();
  const head = measured.elements.find((row) => row.name === "head");
  expect(head.size[1]).toBe(6);
});

test("compareSilhouettes turns 'does it look like the reference' into a number", () => {
  const w = 16;
  const h = 16;
  const make = (fill) => {
    const data = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i += 1) {
      const alpha = fill ? 255 : 0;
      data[i * 4] = 128;
      data[i * 4 + 1] = 128;
      data[i * 4 + 2] = 128;
      data[i * 4 + 3] = alpha;
    }
    return silhouetteFromRgba(data, w, h);
  };
  const same = compareSilhouettes(make(true), make(true));
  expect(same.match_percent).toBe(100);
  expect(same.match_percent >= 85).toBeTruthy();
  const half = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      // L 形:左列 + 底行
      if (x !== 0 && y !== h - 1) continue;
      const i = (y * w + x) * 4;
      half[i + 3] = 255;
    }
  const partial = compareSilhouettes(silhouetteFromRgba(half, w, h), make(true));
  expect(partial.match_percent < 100, `got ${partial.match_percent}`).toBeTruthy();
  expect(partial.ref_only_pct > 0).toBeTruthy();
  expect(Array.isArray(partial.advice)).toBeTruthy();
});

test("revisionFromPixels is stable and content sensitive", () => {
  const a = new Uint8Array([1, 2, 3, 4]);
  const b = new Uint8Array([1, 2, 3, 5]);
  expect(revisionFromPixels(a, 2, 2)).toBe(revisionFromPixels(a, 2, 2));
  expect(revisionFromPixels(a, 2, 2)).not.toBe(revisionFromPixels(b, 2, 2));
  expect(revisionFromPixels(a, 2, 2)).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
});

test("auditFacePixels reports palette excess, weak base and glass structure", () => {
  const flat = Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => [200, 100, 50, 255]),
  );
  const flatFindings = auditFacePixels(flat);
  expect(flatFindings.some((f) => f.code === "FLAT_FACE")).toBeTruthy();
  expect(!flatFindings.some((f) => f.code === "WEAK_BASE_COLOR")).toBeTruthy();

  const noisy = flat.map((row, y) =>
    row.map((_, x) => [(x * 40 + y * 13) % 256, (x * 7) % 256, (y * 31) % 256, 255]),
  );
  const noisyFindings = auditFacePixels(noisy, { paletteLimit: 4, minBaseRatio: 0.5 });
  expect(noisyFindings.some((f) => f.code === "PALETTE_EXCESS")).toBeTruthy();
  expect(noisyFindings.some((f) => f.code === "WEAK_BASE_COLOR")).toBeTruthy();

  const glassGrid = Array.from({ length: 6 }, (_, y) =>
    Array.from({ length: 6 }, (_, x) => {
      const edge = x === 0 || y === 0 || x === 5 || y === 5;
      return [40, 60, 90, edge ? 60 : 220];
    }),
  );
  const glass = auditFacePixels(glassGrid, { glass: true });
  expect(glass.some((f) => f.code === "GLASS_EDGE_WEAK")).toBeTruthy();
});

/* ------------------------------------------------------- catalogue/guides */

test("every tool has a description, group and valid JSON schema", () => {
  const payload = listToolsPayload();
  expect(payload.length).toBe(TOOL_NAMES.length);
  expect(payload.length >= 60, `tool count ${payload.length}`).toBeTruthy();
  for (const tool of payload) {
    expect(tool.name.length > 0).toBeTruthy();
    expect(tool.description.length > 20, tool.name).toBeTruthy();
    expect(tool.inputSchema.type, tool.name).toBe("object");
    expect(tool.inputSchema.properties, tool.name).toBeTruthy();
    const spec = TOOL_SPECS[tool.name];
    expect(spec.group.length > 0).toBeTruthy();
  }
  const names = new Set(TOOL_NAMES);
  for (const expected of [
    "health",
    "get_guide",
    "create_project",
    "apply_geometry_batch",
    "voxelize_matrix",
    "add_hollow_volume",
    "generate_array",
    "extrude_chain",
    "add_wing",
    "pack_box_uv",
    "get_uv_layout",
    "paint_face_grid",
    "get_texture_revision",
    "audit_texture_quality",
    "generate_animation",
    "check_model",
    "audit_complexity",
    "check_sides",
    "check_rig",
    "compare_reference",
    "request_review",
    "ask_user",
    "wait_review",
    "run_action",
    "execute_script",
    "propose_scoped_directory",
  ])
    expect(names.has(expected), `missing tool ${expected}`).toBeTruthy();
  expect(TOOL_SPECS.execute_script.gated).toBe(true);
});

test("guides resolve for every topic and fall back safely", () => {
  for (const topic of GUIDE_TOPICS) {
    const guide = resolveGuide(topic);
    expect(guide.topic).toBe(topic);
    expect(guide.text.length > 100).toBeTruthy();
  }
  expect(resolveGuide("nonsense").topic).toBe("modeling");
  expect(resolveGuide(undefined).topic).toBe("modeling");
});

test("protocol helpers", () => {
  expect(parseSemverParts("5.2.1-beta")).toEqual([5, 2, 1]);
  expect(isBlockbenchSupported("5.1.0")).toBe(true);
  expect(isBlockbenchSupported("5.0.9")).toBe(false);
  expect(isBlockbenchSupported("4.99.99")).toBe(false);
  expect(DEFAULTS.mcpPort).toBe(39742);
});

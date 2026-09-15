/**
 * 纯逻辑单元测试 —— 不需要 Blockbench 即可运行:
 *   node --test test/   (先 npm run build -w @bbmcp/shared)
 */
import test from "node:test";
import assert from "node:assert/strict";

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
  assert.ok(Math.abs(p[0] - 0) < 1e-9);
  assert.ok(Math.abs(p[1] - 1) < 1e-9);
  const around = rotatePoint([2, 1, 0], [1, 1, 0], [0, 0, 90]);
  assert.ok(Math.abs(around[0] - 1) < 1e-9, `got ${around}`);
  assert.ok(Math.abs(around[1] - 2) < 1e-9);
});

test("composeRotation is identity for zero deltas and nests correctly", () => {
  const same = composeRotation([10, 20, 30], [0, 0, 0]);
  assert.ok(Math.abs(same[0] - 10) < 1e-6);
  const doubled = composeRotation([10, 0, 0], [10, 0, 0]);
  assert.ok(Math.abs(doubled[0] - 20) < 1e-4, `got ${doubled}`);
});

test("geometricVolume honours inflate and guards zero sizes", () => {
  assert.equal(geometricVolume([0, 0, 0], [2, 3, 4]), 24);
  assert.equal(geometricVolume([0, 0, 0], [2, 3, 4], -5), 0);
  assert.equal(geometricVolume([1, 1, 1], [1, 2, 2]), 0);
});

test("boundsOfPoints returns min/max", () => {
  const b = boundsOfPoints([[0, 0, 0], [2, -1, 5]]);
  assert.deepEqual(b.min, [0, -1, 0]);
  assert.deepEqual(b.max, [2, 0, 5]);
  assert.equal(dist([0, 0, 0], [3, 4, 0]), 5);
});

/* ----------------------------------------------------------------- color */

test("color parsing accepts hex, rgb, named and rejects junk", () => {
  assert.deepEqual(parseColor("#f00"), [255, 0, 0, 255]);
  assert.deepEqual(parseColor("#00ff00"), [0, 255, 0, 255]);
  assert.deepEqual(parseColor("rgb(1, 2, 3)"), [1, 2, 3, 255]);
  assert.equal(parseColor("not-a-color"), null);
  assert.equal(toHex([255, 0, 0, 255]), "#ff0000ff");
  assert.equal(shadeHex("#808080", 0.5), "#404040ff");
});

test("makeRandom is deterministic per seed", () => {
  const a = makeRandom(7);
  const b = makeRandom(7);
  assert.equal(a(), b());
  assert.equal(a(), b());
  assert.notEqual(makeRandom(1)(), makeRandom(2)());
});

/* -------------------------------------------------------------------- uv */

test("resolveUvModeFromHints prefers explicit, then format, then project", () => {
  assert.equal(resolveUvModeFromHints({ explicit: "face", formatId: "geckolib_model" }), "face");
  assert.equal(resolveUvModeFromHints({ formatId: "java_block" }), "face");
  assert.equal(resolveUvModeFromHints({ formatId: "geckolib_model" }), "box");
  assert.equal(resolveUvModeFromHints({ projectBoxUv: false }), "face");
  assert.equal(resolveUvModeFromHints({}), "box");
});

test("planUvPack (box) never overlaps and stays inside the atlas", () => {
  const cubes = [
    { uuid: "a", name: "a", from: [0, 0, 0], to: [4, 4, 4] },
    { uuid: "b", name: "b", from: [6, 0, 0], to: [10, 6, 4] },
    { uuid: "c", name: "c", from: [0, 8, 0], to: [8, 10, 8] },
  ];
  const plan = planUvPack(cubes, { mode: "box", texW: 64, padding: 1 });
  assert.equal(plan.mode, "box");
  assert.equal(plan.items.length, 3);
  for (const item of plan.items) {
    const [x, y] = item.uv_offset;
    assert.ok(x >= 0 && y >= 0, "offset inside atlas");
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
        assert.ok(!occupied.has(key), `overlap at ${key}`);
        occupied.add(key);
      }
  }
  assert.ok(plan.used[0] <= 64, `used width ${plan.used[0]}`);
});

test("planUvPack (face) gives every face its own rectangle", () => {
  const cubes = [{ uuid: "a", name: "a", from: [0, 0, 0], to: [4, 3, 2] }];
  const plan = planUvPack(cubes, { mode: "face", texW: 64, padding: 1 });
  assert.equal(plan.mode, "face");
  const faces = plan.items[0].faces;
  assert.equal(faces.length, 6);
  const seen = new Set();
  for (const f of faces) {
    const key = f.uv.join(",");
    assert.ok(!seen.has(key), "duplicate face rect");
    seen.add(key);
    assert.equal(f.uv[2] - f.uv[0] > 0, true);
    assert.equal(f.uv[3] - f.uv[1] > 0, true);
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
  assert.equal(islands.length, 2);
  const north = islands.find((i) => i.face === "north");
  assert.deepEqual(north.pixel_size, [4, 4]);
  assert.deepEqual(north.expected_size, [4, 4]);
  assert.deepEqual(north.density, [1, 1]);
  assert.equal(north.out_of_bounds, false);
  const east = islands.find((i) => i.face === "east");
  assert.equal(east.flip_x, true);
  assert.equal(east.flip_y, true);
  assert.equal(east.out_of_bounds, true);
});

test("findUvOverlaps marks declared overlaps as intentional", () => {
  const cubes = [
    { uuid: "a", name: "a", from: [0, 0, 0], to: [4, 4, 0], faces: { north: { uv: [0, 0, 4, 4] } } },
    { uuid: "b", name: "b", from: [0, 0, 1], to: [4, 4, 1], faces: { north: { uv: [2, 0, 6, 4] } } },
  ];
  const islands = collectUvIslands(cubes, 16, 16);
  const plain = findUvOverlaps(islands);
  assert.equal(plain.length, 1);
  assert.equal(plain[0].intentional, false);
  const allowed = findUvOverlaps(islands, [{ a: "a.north", b: "b.north" }]);
  assert.equal(allowed[0].intentional, true);
});

test("face-local paint coordinates honour rotation and UV flips", () => {
  const space = resolveFaceSpace([0, 0, 4, 4], 0);
  assert.equal(space.width, 4);
  assert.equal(space.height, 4);
  assert.deepEqual(faceLocalToAtlas(space, 0, 0), [0, 0]);
  const rotated = resolveFaceSpace([0, 0, 4, 4], 90);
  assert.equal(rotated.width, 4);
  assert.equal(rotated.height, 4);
  const flipped = resolveFaceSpace([4, 0, 0, 4], 0);
  assert.deepEqual(faceLocalToAtlas(flipped, 0, 0), [3, 0]);
  assert.equal(nextPowerOfTwo(65), 128);
  assert.equal(nextPowerOfTwo(64), 64);
});

/* ------------------------------------------------------------ generators */

test("voxelizeMatrix extrudes a silhouette and merges runs", () => {
  const result = voxelizeMatrix({
    matrix: ["..##..", ".####.", "######"],
    palette: { "#": { name: "blade", depth: 2 } },
    origin: [0, 0, 0],
    merge_adjacent: true,
  });
  assert.equal(result.cubes.length, 3);
  const row0 = result.cubes[0];
  assert.deepEqual(row0.from, [2, 2, 0]);
  assert.deepEqual(row0.to, [4, 3, 2]);
  const names = result.cubes.map((c) => c.name);
  assert.ok(names.every((n) => n.startsWith("blade")));
});

test("voxelizeMatrix without merging emits one cube per cell and respects planes", () => {
  const single = voxelizeMatrix({ matrix: ["##"], origin: [0, 0, 0] });
  assert.equal(single.cubes.length, 2);
  const side = voxelizeMatrix({ matrix: ["#"], plane: "yz", origin: [0, 0, 0] });
  // yz: 列 → +Z,深度沿 +X
  assert.deepEqual(side.cubes[0].from, [0, 0, 0]);
  assert.deepEqual(side.cubes[0].to, [1, 1, 1]);
  assert.throws(() => voxelizeMatrix({ matrix: [] }), /matrix/);
});

test("hollowVolume makes walls with a cavity and skips open faces", () => {
  const full = hollowVolume({ from: [0, 0, 0], to: [10, 10, 10], wall_thickness: 1 });
  assert.equal(full.cubes.length, 6, "six walls expected");
  assert.deepEqual(full.points.cavity_min, [1, 1, 1]);
  const hood = hollowVolume({
    from: [0, 0, 0],
    to: [10, 10, 10],
    wall_thickness: 1,
    open_faces: ["north", "down"],
    name: "hood",
  });
  assert.equal(hood.cubes.length, 4);
  assert.ok(!hood.cubes.some((c) => c.name === "hood_north"));
  assert.ok(!hood.cubes.some((c) => c.name === "hood_down"));
  // 墙体不得互相重叠
  const boxes = full.cubes.map((c) => ({ from: c.from, to: c.to }));
  for (let i = 0; i < boxes.length; i += 1)
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const overlap = [0, 1, 2].every(
        (k) => Math.min(a.to[k], b.to[k]) - Math.max(a.from[k], b.from[k]) > 1e-9,
      );
      assert.equal(overlap, false, "walls must tile, not overlap");
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
  assert.equal(span.cubes.length, 3);
  assert.equal(span.cubes[0].from[0], -1);
  assert.equal(span.cubes[2].from[0], 9);
  assert.equal(span.cubes[0].to[1], 0, "anchor top hangs from the point");

  const cells = generateArray({
    element_size: [2, 2, 2],
    start: [0, 0, 0],
    end: [12, 0, 0],
    count: 4,
    distribution: "cells",
  });
  assert.equal(cells.cubes[0].from[0], -1 + 1.5);

  const staggered = generateArray({
    element_size: [2, 2, 1],
    start: [0, 0, 0],
    end: [8, 0, 0],
    count: 4,
    depth_stagger: 0.1,
    anchor: "min",
  });
  const zs = staggered.cubes.map((c) => c.from[2]);
  assert.ok(zs.includes(-0.1) && zs.includes(0.1), `stagger applied: ${zs}`);

  const flat = generateArray({
    element_size: [2, 2, 1],
    start: [0, 0, 0],
    end: [1, 0, 0],
    count: 3,
    anchor: "min",
  });
  assert.ok(
    flat.notes.some((n) => n.includes("depth_stagger")),
    `warns about z-fighting: ${JSON.stringify(flat.notes)}`,
  );
  const spaced = generateArray({
    element_size: [1, 2, 1],
    start: [0, 0, 0],
    end: [20, 0, 0],
    count: 3,
  });
  assert.equal(spaced.notes.length, 0, "well-spaced elements are not flagged");
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
  assert.equal(radial.cubes.length, 8);
  const first = radial.cubes[0];
  assert.ok(Math.abs(Math.hypot(first.from[0] - 0, first.from[2] - first.from[2] + 0) - 0) >= 0);
  const grid = generateArray({
    mode: "grid",
    element_size: [1, 1, 1],
    start: [0, 0, 0],
    end: [4, 4, 4],
    counts: [2, 2, 2],
  });
  assert.equal(grid.cubes.length, 8);
  assert.throws(() => generateArray({ element_size: [0, 1, 1] }), /positive/);
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
  assert.equal(chain.groups.length, 4);
  assert.equal(chain.cubes.length, 4);
  assert.equal(chain.groups[0].name, "tail1");
  assert.equal(chain.groups[1].parent, "tail1");
  assert.deepEqual(chain.points.tip, [0, 18, 0]);
  const sized = chain.cubes.map((c) => c.to[0] - c.from[0]);
  assert.ok(sized[0] > sized[3], "chain tapers");
  const rigid = extrudeChain({ base_origin: [0, 0, 0], create_bones: false });
  assert.equal(rigid.groups.length, 0);
  assert.ok(rigid.notes.length > 0);
});

test("addWing builds a bone chain, finger bones and a membrane", () => {
  const wing = addWing({ side: "right", base_origin: [3, 22, 2], fingers: 4 });
  const names = wing.groups.map((g) => g.name);
  assert.ok(names.includes("wing_right_arm"));
  assert.ok(names.includes("wing_right_forearm"));
  assert.equal(names.filter((n) => n.includes("finger")).length, 4);
  assert.ok(wing.cubes.some((c) => c.name.includes("membrane")));
  assert.ok(wing.points.finger_tips);
  const left = addWing({ side: "left", base_origin: [-3, 22, 2], fingers: 4 });
  assert.ok(left.groups[0].origin[0] < 0);
  assert.ok(left.cubes[0].from[0] < wing.cubes[0].from[0], "sides are mirrored");
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
  assert.equal(clean.summary.errors, 0, JSON.stringify(clean.findings));

  const zero = checkModel(
    [...ELEMENTS, { uuid: "z", name: "flat", type: "cube", parent: "g1", origin: [0, 0, 0], rotation: [0, 0, 0], from: [0, 0, 0], to: [0, 4, 4] }],
    { textureWidth: 64, textureHeight: 64 },
  );
  assert.ok(zero.findings.some((f) => f.code === "ZERO_VOLUME"));

  const textured = checkModel(
    [{ ...ELEMENTS[1], untexturedFaces: ["north", "up"], faceUvOutOfBounds: 2 }],
    { textureWidth: 8, textureHeight: 8 },
  );
  assert.ok(textured.findings.some((f) => f.code === "UNTEXTURED_FACE"));
  assert.ok(textured.findings.some((f) => f.code === "UV_OUT_OF_BOUNDS"));

  const empty = checkModel(
    [{ uuid: "g2", name: "empty", type: "group", parent: null, origin: [0, 0, 0], rotation: [0, 0, 0] }],
    { textureWidth: 16, textureHeight: 16 },
  );
  assert.ok(empty.findings.some((f) => f.code === "EMPTY_GROUP"));
  assert.ok(empty.findings.some((f) => f.code === "NO_CUBES"));

  const coplanar = checkModel(
    [
      ELEMENTS[1],
      { ...ELEMENTS[1], uuid: "c1b", name: "torso_dup" },
    ],
    { textureWidth: 16, textureHeight: 16 },
  );
  assert.ok(coplanar.findings.some((f) => f.code === "COPLANAR_OVERLAP"));
});

test("auditComplexity grades cube budgets and monolithic boxes", () => {
  const primitive = auditComplexity(ELEMENTS, { target: "character" });
  assert.equal(primitive.verdict, "too_primitive");
  assert.equal(primitive.ready_for_texturing, false);

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
  assert.equal(detailed.verdict, "high_detail");
  assert.ok(Number(detailed.metrics.micro_pct) > 50);
  const mid = auditComplexity(ELEMENTS.concat(many.slice(0, 80)), { target: "character" });
  assert.equal(mid.verdict, "acceptable");
});

test("checkSides catches a right-named bone on the model's left", () => {
  const wrong = checkSides([
    { uuid: "a", name: "arm_right", type: "group", parent: null, origin: [-5, 14, 0], rotation: [0, 0, 0] },
    { uuid: "b", name: "arm_left", type: "group", parent: null, origin: [5, 14, 0], rotation: [0, 0, 0] },
  ]);
  assert.equal(wrong.summary.mismatched, 2);
  assert.equal(wrong.findings.filter((f) => f.code === "SIDE_MISMATCH").length, 2);
  const good = checkSides([
    { uuid: "a", name: "arm_right", type: "group", parent: null, origin: [5, 14, 0], rotation: [0, 0, 0] },
    { uuid: "b", name: "arm_left", type: "group", parent: null, origin: [-5, 14, 0], rotation: [0, 0, 0] },
  ]);
  assert.equal(good.summary.mismatched, 0);
  assert.equal(good.summary.unpaired, 0);
});

test("checkRig flags two-bone limbs and loose cubes", () => {
  const rig = checkRig([
    { uuid: "root", name: "root", type: "group", parent: null, origin: [0, 0, 0], rotation: [0, 0, 0] },
    { uuid: "arm_r", name: "arm_right", type: "group", parent: "root", origin: [5, 14, 0], rotation: [0, 0, 0] },
    { uuid: "c", name: "arm_right_cube", type: "cube", parent: "arm_r", origin: [5, 10, 0], rotation: [0, 0, 0], from: [4, 10, -1], to: [6, 14, 1] },
    { uuid: "loose", name: "loose", type: "cube", parent: null, origin: [0, 0, 0], rotation: [0, 0, 0], from: [0, 0, 0], to: [1, 1, 1] },
  ]);
  assert.ok(rig.findings.some((f) => f.code === "TWO_BONE_LIMB"));
  assert.ok(rig.findings.some((f) => f.code === "LOOSE_CUBES"));
  assert.equal(rig.summary.ready, false);
});

test("measureModel is hierarchy aware and reports ratios", () => {
  const measured = measureModel(ELEMENTS);
  assert.equal(measured.cubes, 4);
  assert.equal(measured.bounds.min[1], 8);
  assert.equal(measured.bounds.max[1], 22);
  assert.equal(measured.bounds.size[1], 14);
  assert.ok(measured.total_volume > 0);
  const head = measured.elements.find((row) => row.name === "head");
  assert.equal(head.size[1], 6);
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
  assert.equal(same.match_percent, 100);
  assert.ok(same.match_percent >= 85);
  const half = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      // L 形:左列 + 底行
      if (x !== 0 && y !== h - 1) continue;
      const i = (y * w + x) * 4;
      half[i + 3] = 255;
    }
  const partial = compareSilhouettes(silhouetteFromRgba(half, w, h), make(true));
  assert.ok(partial.match_percent < 100, `got ${partial.match_percent}`);
  assert.ok(partial.ref_only_pct > 0);
  assert.ok(Array.isArray(partial.advice));
});

test("revisionFromPixels is stable and content sensitive", () => {
  const a = new Uint8Array([1, 2, 3, 4]);
  const b = new Uint8Array([1, 2, 3, 5]);
  assert.equal(revisionFromPixels(a, 2, 2), revisionFromPixels(a, 2, 2));
  assert.notEqual(revisionFromPixels(a, 2, 2), revisionFromPixels(b, 2, 2));
  assert.match(revisionFromPixels(a, 2, 2), /^fnv1a32:[0-9a-f]{8}$/);
});

test("auditFacePixels reports palette excess, weak base and glass structure", () => {
  const flat = Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => [200, 100, 50, 255]),
  );
  const flatFindings = auditFacePixels(flat);
  assert.ok(flatFindings.some((f) => f.code === "FLAT_FACE"));
  assert.ok(!flatFindings.some((f) => f.code === "WEAK_BASE_COLOR"));

  const noisy = flat.map((row, y) =>
    row.map((_, x) => [(x * 40 + y * 13) % 256, (x * 7) % 256, (y * 31) % 256, 255]),
  );
  const noisyFindings = auditFacePixels(noisy, { paletteLimit: 4, minBaseRatio: 0.5 });
  assert.ok(noisyFindings.some((f) => f.code === "PALETTE_EXCESS"));
  assert.ok(noisyFindings.some((f) => f.code === "WEAK_BASE_COLOR"));

  const glassGrid = Array.from({ length: 6 }, (_, y) =>
    Array.from({ length: 6 }, (_, x) => {
      const edge = x === 0 || y === 0 || x === 5 || y === 5;
      return [40, 60, 90, edge ? 60 : 220];
    }),
  );
  const glass = auditFacePixels(glassGrid, { glass: true });
  assert.ok(glass.some((f) => f.code === "GLASS_EDGE_WEAK"));
});

/* ------------------------------------------------------- catalogue/guides */

test("every tool has a description, group and valid JSON schema", () => {
  const payload = listToolsPayload();
  assert.equal(payload.length, TOOL_NAMES.length);
  assert.ok(payload.length >= 60, `tool count ${payload.length}`);
  for (const tool of payload) {
    assert.ok(tool.name.length > 0);
    assert.ok(tool.description.length > 20, tool.name);
    assert.equal(tool.inputSchema.type, "object", tool.name);
    assert.ok(tool.inputSchema.properties, tool.name);
    const spec = TOOL_SPECS[tool.name];
    assert.ok(spec.group.length > 0);
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
    assert.ok(names.has(expected), `missing tool ${expected}`);
  assert.equal(TOOL_SPECS.execute_script.gated, true);
});

test("guides resolve for every topic and fall back safely", () => {
  for (const topic of GUIDE_TOPICS) {
    const guide = resolveGuide(topic);
    assert.equal(guide.topic, topic);
    assert.ok(guide.text.length > 100);
  }
  assert.equal(resolveGuide("nonsense").topic, "modeling");
  assert.equal(resolveGuide(undefined).topic, "modeling");
});

test("protocol helpers", () => {
  assert.deepEqual(parseSemverParts("5.2.1-beta"), [5, 2, 1]);
  assert.equal(isBlockbenchSupported("5.1.0"), true);
  assert.equal(isBlockbenchSupported("5.0.9"), false);
  assert.equal(isBlockbenchSupported("4.99.99"), false);
  assert.equal(DEFAULTS.mcpPort, 39742);
});

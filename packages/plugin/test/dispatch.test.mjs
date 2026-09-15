/**
 * 插件分发层功能测试 —— 真实执行每个工具的处理器,使用 mock 的 Blockbench 宿主。
 *   node --test test/dispatch.test.mjs   (先 npm run build -w @bbmcp/plugin)
 */
import test from "node:test";
import assert from "node:assert/strict";

const mock = (await import("./mock-blockbench.mjs")).installMockBlockbench();
const api = await import("../dist/testing.mjs");

const call = (name, args = {}) => api.runTool(name, args);

async function ok(name, args = {}) {
  const result = await call(name, args);
  assert.equal(result.ok, true, `${name} failed: ${JSON.stringify(result.error ?? result)}`);
  return result.result;
}

async function fails(name, args = {}, code) {
  const result = await call(name, args);
  assert.equal(result.ok, false, `${name} unexpectedly succeeded: ${JSON.stringify(result.result)}`);
  if (code) assert.equal(result.error.code, code, `${name}: got ${result.error.code} — ${result.error.message}`);
  return result.error;
}

function newProject(format = "bedrock") {
  const result = api.handlers.create_project({ format, texture_width: 64, texture_height: 64 });
  assert.equal(result.ok, true);
  return result;
}

/* ------------------------------------------------------------- basics */

test("every tool in the catalogue has an implementation", () => {
  const missing = Object.keys(api.TOOL_SPECS).filter((name) => !api.handlers[name]);
  assert.deepEqual(missing, []);
  assert.ok(api.registeredToolNames().length >= 60, `tool count ${api.registeredToolNames().length}`);
});

test("unknown tool and invalid params return structured errors", async () => {
  const unknown = await fails("does_not_exist", {}, "E_UNSUPPORTED_COMMAND");
  assert.match(unknown.message, /tools\/list/);
  const invalid = await fails("which_side", {}, "E_INVALID_PARAM");
  assert.match(invalid.message, /element/);
  const unknownKey = await fails("health", { nope: 1 }, "E_INVALID_PARAM");
  assert.match(unknownKey.message, /Unrecognized key|nope/);
});

test("JSON-string arguments from sloppy clients are coerced", async () => {
  const coerced = api.coerceArguments({ refs: '["a","b"]', nested: { matrix: '["#"]' }, n: 3 });
  assert.deepEqual(coerced.refs, ["a", "b"]);
  assert.deepEqual(coerced.nested.matrix, ["#"]);
  assert.equal(coerced.n, 3);
  const result = await call("which_side", { element: "missing" });
  assert.equal(result.ok, false);
});

test("health reports transport, capabilities and the gate state", async () => {
  const health = await ok("health");
  assert.equal(health.ok, true);
  assert.equal(health.protocol_version, 1);
  assert.equal(health.blockbench_supported, true);
  assert.deepEqual(health.transport.length, 2);
  assert.equal(health.execute_script_allowed, false);
  assert.ok(health.capabilities.includes("geometry"));
  assert.ok(health.capabilities.includes("textures"));
  assert.ok(health.capabilities.includes("screenshots"));
});

test("guides resolve and list_formats works", async () => {
  const guide = await ok("get_guide", { topic: "detailing" });
  assert.equal(guide.topic, "detailing");
  assert.match(guide.text, /monolithic|layering/i);
  const formats = await ok("list_formats");
  assert.ok(formats.formats.some((f) => f.id === "java_block"));
});

/* ---------------------------------------------------------- project */

test("create_project validates uv_mode against the format", async () => {
  mock.reset();
  const created = newProject("bedrock");
  assert.equal(created.ok, true);
  assert.equal(created.uv_mode, "box");
  const summary = await ok("get_project_summary");
  assert.equal(summary.format, "bedrock");
  assert.equal(summary.uv_mode, "box");
  assert.equal(summary.cubes, 0);

  mock.reset();
  await fails("create_project", { format: "java_block", uv_mode: "box" }, "E_INVALID_PARAM");
  await fails("create_project", { format: "nope" }, "E_UNSUPPORTED_FORMAT");
});

test("save_project / export_model are refused until a directory is approved", async () => {
  mock.reset();
  newProject();
  const error = await fails("save_project", { path: "C:/tmp/a.bbmodel" }, "E_SCOPE_DENIED");
  assert.match(error.message, /propose_scoped_directory/);
  await fails("export_model", { path: "C:/tmp/a.json" }, "E_SCOPE_DENIED");
});

/* --------------------------------------------------------- geometry */

test("apply_geometry_batch builds a posed hierarchy in one undo step", async () => {
  mock.reset();
  newProject();
  const result = await ok("apply_geometry_batch", {
    create_groups: [
      { name: "body", origin: [0, 12, 0] },
      { name: "head", origin: [0, 16, 0], parent: "body", rotation: [10, 0, 0] },
    ],
    create_cubes: [
      { name: "torso", from: [-4, 8, -2], to: [4, 16, 2], parent: "body" },
      { name: "skull", from: [-3, 16, -3], to: [3, 22, 3], parent: "head" },
    ],
  });
  assert.equal(result.created.length, 4);
  assert.equal(mock.MockCube.all.length, 2);
  assert.equal(mock.MockGroup.all.length, 2);
  assert.equal(mock.state.undoInit, 1, "one undo step");
  assert.equal(mock.state.undoFinish, 1);
  const head = mock.MockCube.all.find((c) => c.name === "skull");
  assert.equal(head.parent.name, "head");
});

test("apply_geometry_batch refuses contradictory sides and missing parents before writing", async () => {
  mock.reset();
  newProject();
  const side = await fails(
    "apply_geometry_batch",
    { create_cubes: [{ name: "arm_right", from: [-6, 10, -1], to: [-4, 16, 1], side: "right" }] },
    "E_INVALID_PARAM",
  );
  assert.match(side.message, /declared side/);
  assert.equal(mock.MockCube.all.length, 0, "nothing was created");
  await fails(
    "apply_geometry_batch",
    { create_cubes: [{ name: "x", from: [0, 0, 0], to: [1, 1, 1], parent: "nope" }] },
    "E_PARTIAL_FORBIDDEN",
  );
  assert.equal(mock.MockCube.all.length, 0);
});

test("voxelize_matrix turns a character matrix into real cubes", async () => {
  mock.reset();
  newProject();
  const result = await ok("voxelize_matrix", {
    matrix: ["..##..", ".####.", "######"],
    palette: { "#": { name: "blade", depth: 2 } },
    origin: [0, 0, 0],
    merge_adjacent: true,
  });
  assert.equal(result.cubes, 3);
  assert.equal(mock.MockCube.all.length, 3);
  assert.ok(mock.MockCube.all.every((c) => c.name.startsWith("blade")));
});

test("add_hollow_volume builds a shell with a cavity and can omit faces", async () => {
  mock.reset();
  newProject();
  const full = await ok("add_hollow_volume", { bounds: { from: [0, 0, 0], to: [10, 10, 10] } });
  assert.equal(full.created_elements, 6);
  assert.deepEqual(full.cavity.min, [1, 1, 1]);
  mock.reset();
  newProject();
  await ok("add_hollow_volume", {
    bounds: { from: [0, 0, 0], to: [10, 10, 10] },
    open_faces: ["north", "down"],
    name: "hood",
  });
  assert.equal(mock.MockCube.all.length, 4);
  assert.ok(!mock.MockCube.all.some((c) => /hood_(north|down)/.test(c.name)));
});

test("generate_array places elements and extrude_chain creates bones with a taper", async () => {
  mock.reset();
  newProject();
  const array = await ok("generate_array", {
    element_size: [2, 5, 1],
    start: [-6, 7, 3],
    end: [6, 7, 3],
    count: 5,
    anchor: "top",
    depth_stagger: 0.1,
    seed: 3,
  });
  assert.equal(array.elements, 5);
  const chain = await ok("extrude_chain", {
    segments: 4,
    base_origin: [3, 30, 0],
    segment_length: 2,
    taper: 0.6,
    curvature: [12, 0, 0],
    name: "horn",
    side: "right",
  });
  assert.equal(chain.bones, 4);
  assert.deepEqual(chain.tip, [3, 38, 0]);
  assert.equal(mock.MockGroup.all.filter((g) => g.name.startsWith("horn")).length, 4);
});

test("add_wing lands bones and a membrane, and refuses the wrong side", async () => {
  mock.reset();
  newProject();
  const wing = await ok("add_wing", { side: "right", base_origin: [3, 22, 2], fingers: 3 });
  assert.ok(wing.joints.elbow);
  assert.ok(mock.MockGroup.all.some((g) => g.name === "wing_right_arm"));
  assert.ok(mock.MockCube.all.some((c) => c.name.includes("membrane")));
  mock.reset();
  newProject();
  await fails("add_wing", { side: "left", base_origin: [3, 22, 2] }, "E_INVALID_PARAM");
});

test("transform_elements moves a subtree and rejects non-uniform scale of rotated parts", async () => {
  mock.reset();
  newProject();
  await ok("apply_geometry_batch", {
    create_groups: [{ name: "body", origin: [0, 12, 0] }],
    create_cubes: [{ name: "torso", from: [0, 12, 0], to: [4, 16, 4], parent: "body", rotation: [45, 0, 0] }],
  });
  const moved = await ok("transform_elements", {
    refs: ["body"],
    translate: [0, 2, 0],
    scale: [1.5, 1.5, 1.5],
    uv_policy: "auto",
  });
  assert.equal(moved.updated.length, 2);
  const torso = mock.MockCube.all.find((c) => c.name === "torso");
  assert.equal(torso.from[0], 0);
  assert.equal(torso.from[1], 20);
  assert.equal(torso.to[0], 6);
  await fails("transform_elements", { refs: ["body"], scale: [2, 1, 1] }, "E_INVALID_PARAM");
});

test("mirror_elements renames left/right and check_sides agrees", async () => {
  mock.reset();
  newProject();
  await ok("create_limb", { name: "arm_right", pivot: [6, 22, 0], size: [4, 12, 4], mirror: "x" });
  const names = mock.MockGroup.all.map((g) => g.name).sort();
  assert.deepEqual(names, ["arm_left", "arm_right"]);
  const sides = await ok("check_sides");
  assert.equal(sides.summary.mismatched, 0);
  assert.equal(sides.summary.unpaired, 0);
});

test("scaffold_biped builds a real rig, packs UVs and returns check_model", async () => {
  mock.reset();
  newProject();
  const result = await ok("scaffold_biped", { texture_size: 64 });
  assert.equal(result.uv_mode, "box");
  assert.ok(result.created.length >= 13, `created ${result.created.length}`);
  assert.ok(mock.MockTexture.all.length === 1);
  const bones = mock.MockGroup.all.map((g) => g.name);
  for (const expected of ["root", "body", "head", "arm_right", "arm_left", "leg_right", "leg_left"])
    assert.ok(bones.includes(expected), `missing ${expected}`);
  const cubes = mock.MockCube.all;
  assert.ok(cubes.every((c) => c.box_uv === true));
  const uvs = new Set(cubes.map((c) => c.uv_offset.join(",")));
  assert.equal(uvs.size, cubes.length, "every cube got its own atlas region");
  const rig = await ok("check_rig");
  assert.equal(rig.summary.ready, true, JSON.stringify(rig.findings));
});

test("measure_model / audit_symmetry report numbers", async () => {
  mock.reset();
  newProject();
  await ok("create_limb", { name: "arm_right", pivot: [6, 22, 0], size: [4, 12, 4], mirror: "x" });
  const measured = await ok("measure_model");
  assert.equal(measured.cubes, 2);
  assert.equal(measured.bounds.size[0], 16);
  const symmetry = await ok("audit_symmetry", { pairs: [{ left: "arm_right", right: "arm_left" }] });
  assert.equal(symmetry.summary.passed, 1);
  assert.ok(symmetry.pairs[0].max_error < 1e-6);
});

/* ---------------------------------------------------------- quality */

test("check_model catches the classic failures and passes a clean rig", async () => {
  mock.reset();
  newProject();
  await ok("scaffold_biped");
  const clean = await ok("check_model");
  assert.equal(clean.summary.errors, 0, JSON.stringify(clean.findings));
  assert.equal(clean.ready, true);

  await ok("apply_geometry_batch", {
    create_cubes: [
      { name: "torso", from: [-4, 12, -2], to: [4, 24, 2], parent: "body" },
      { name: "torso_twin", from: [-4, 12, -2], to: [4, 24, 2], parent: "body" },
    ],
  });
  const dirty = await ok("check_model");
  assert.ok(dirty.findings.some((f) => f.code === "COPLANAR_OVERLAP"), JSON.stringify(dirty.findings));
});

test("audit_complexity gates a blockout and reports the budget", async () => {
  mock.reset();
  newProject();
  await ok("apply_geometry_batch", {
    create_groups: [{ name: "body", origin: [0, 0, 0] }],
    create_cubes: [{ name: "torso", from: [0, 0, 0], to: [8, 16, 8], parent: "body" }],
  });
  const primitive = await ok("audit_complexity", { target: "character" });
  assert.equal(primitive.verdict, "too_primitive");
  assert.equal(primitive.ready_for_texturing, false);
  assert.ok(primitive.issues.length > 0);
});

test("execute_script stays gated until the user enables it", async () => {
  await fails("execute_script", { code: "return 1" }, "E_AUTH_FAILED");
  globalThis.settings.bbmcp_allow_execute_script.value = true;
  const result = await ok("execute_script", { code: "return [1,2,3].reduce((a,b)=>a+b,0)" });
  assert.equal(result.result, 6);
  globalThis.settings.bbmcp_allow_execute_script.value = false;
  const timed = await call("execute_script", { code: "return 1" });
  assert.equal(timed.ok, false);
});

/* ------------------------------------------------------- uv/texture */

test("ensure_texture → pack_box_uv → get_uv_layout keeps islands apart", async () => {
  mock.reset();
  newProject();
  await ok("apply_geometry_batch", {
    create_cubes: [
      { name: "a", from: [0, 0, 0], to: [4, 4, 4] },
      { name: "b", from: [6, 0, 0], to: [10, 6, 4] },
    ],
  });
  const texture = await ok("ensure_texture", { name: "skin", width: 64, height: 64, fill: "#808080" });
  assert.equal(texture.size[0], 64);
  const packed = await ok("pack_box_uv", { padding: 1 });
  assert.equal(packed.mode, "box");
  assert.equal(packed.packed, 2);
  const layout = await ok("get_uv_layout");
  assert.equal(layout.summary.out_of_bounds, 0);
  assert.equal(layout.summary.overlaps, 0);
  assert.equal(layout.summary.islands, 12, "six faces per cube");
});

test("paint_face_grid → get_face_grid round-trips exact pixels", async () => {
  mock.reset();
  newProject();
  await ok("apply_geometry_batch", {
    create_cubes: [{ name: "face_cube", from: [0, 0, 0], to: [2, 2, 2] }],
  });
  await ok("ensure_texture", { name: "skin", width: 64, height: 64, fill: "#000000" });
  await ok("pack_box_uv", { cubes: ["face_cube"] });
  const rows = ["ab", "ba"];
  const painted = await ok("paint_face_grid", {
    cube: "face_cube",
    face: "north",
    rows,
    palette: { a: "#ff0000", b: "#00ff00" },
  });
  assert.equal(painted.pixels, 4);
  assert.match(painted.revision, /^fnv1a32:/);
  const read = await ok("get_face_grid", { cube: "face_cube", face: "north" });
  assert.deepEqual(read.rows, [["#ff0000ff", "#00ff00ff"], ["#00ff00ff", "#ff0000ff"]]);
  assert.equal(read.revision, painted.revision);
});

test("texture revision tokens reject stale writes", async () => {
  mock.reset();
  newProject();
  await ok("apply_geometry_batch", { create_cubes: [{ name: "c", from: [0, 0, 0], to: [2, 2, 2] }] });
  await ok("ensure_texture", { name: "skin", width: 32, height: 32, fill: "#111111" });
  const revision = await ok("get_texture_revision");
  await ok("replace_texture_color", { from: "#111111", to: "#222222", expected_revision: revision.revision });
  const stale = await fails(
    "replace_texture_color",
    { from: "#222222", to: "#333333", expected_revision: revision.revision },
    "E_PARTIAL_FORBIDDEN",
  );
  assert.match(stale.message, /changed since it was read/);
});

test("shade_model_base paints every face and audit_texture_quality reads it back", async () => {
  mock.reset();
  newProject();
  await ok("apply_geometry_batch", {
    create_cubes: [
      { name: "torso", from: [0, 0, 0], to: [4, 4, 4] },
      { name: "head", from: [0, 6, 0], to: [4, 10, 4] },
    ],
  });
  await ok("ensure_texture", { name: "skin", width: 64, height: 64, fill: "#000000" });
  await ok("pack_box_uv", {});
  const shaded = await ok("shade_model_base", {
    base: "#8a5a2b",
    regions: [{ match: "head", color: "#c8a06a" }],
    crisp: true,
    noise: 0,
    blur: 0,
    seed: 5,
  });
  assert.equal(shaded.textured, 2);
  assert.equal(shaded.faces, 12);
  const audit = await ok("audit_texture_quality");
  assert.equal(audit.faces, 12);
  assert.equal(audit.summary.errors, 0);
  // 面被真的上了色,不再是透明
  assert.ok(audit.findings.every((f) => f.code !== "EMPTY_FACE_TEXTURE"));
});

test("copy_face_pixels, transform_texture_region and analyze_texture_palette work", async () => {
  mock.reset();
  newProject();
  await ok("apply_geometry_batch", {
    create_cubes: [
      { name: "a", from: [0, 0, 0], to: [2, 2, 2] },
      { name: "b", from: [4, 0, 0], to: [6, 2, 2] },
    ],
  });
  await ok("ensure_texture", { name: "skin", width: 64, height: 64, fill: "#000000" });
  await ok("pack_box_uv", {});
  await ok("paint_face_grid", { cube: "a", face: "north", rows: ["ab", "ba"], palette: { a: "#ff0000", b: "#0000ff" } });
  const copied = await ok("copy_face_pixels", {
    source: { cube: "a", face: "north" },
    target: { cube: "b", face: "north" },
    flip_x: true,
  });
  assert.equal(copied.pixels, 4);
  const flipped = await ok("get_face_grid", { cube: "b", face: "north" });
  assert.deepEqual(flipped.rows, [["#0000ffff", "#ff0000ff"], ["#ff0000ff", "#0000ffff"]]);
  const turned = await ok("transform_texture_region", { face: { cube: "a", face: "north" }, operation: "rotate_180" });
  assert.equal(turned.pixels, 4);
  const palette = await ok("analyze_texture_palette", { face: { cube: "a", face: "north" } });
  assert.equal(palette.total_pixels, 4);
  assert.equal(palette.unique_colors, 2);
});

test("face-local painting works on a rotated face", async () => {
  mock.reset();
  newProject();
  await ok("apply_geometry_batch", {
    create_cubes: [{ name: "c", from: [0, 0, 0], to: [2, 2, 2] }],
  });
  await ok("ensure_texture", { name: "skin", width: 64, height: 64, fill: "#000000" });
  await ok("pack_box_uv", { cubes: ["c"] });
  await ok("set_face_uv", { entries: [{ cube: "c", face: "north", uv: [8, 8, 10, 10], rotation: 90 }] });
  const features = await ok("paint_face_features", {
    faces: [
      {
        cube: "c",
        face: "north",
        ops: [{ type: "fill", color: "#123456" }, { type: "rect", x: 0, y: 0, width: 1, height: 1, color: "#ffffff" }],
      },
    ],
  });
  assert.equal(features.painted, 1);
  const grid = await ok("get_face_grid", { cube: "c", face: "north" });
  assert.equal(grid.width, 2);
  assert.equal(grid.height, 2);
  assert.ok(grid.rows.flat().includes("#123456ff"));
  assert.ok(grid.rows.flat().includes("#ffffffff"));
});

test("resize_texture scales the bitmap and the UVs together", async () => {
  mock.reset();
  newProject();
  await ok("apply_geometry_batch", { create_cubes: [{ name: "c", from: [0, 0, 0], to: [4, 4, 4] }] });
  await ok("ensure_texture", { name: "skin", width: 32, height: 32, fill: "#202020" });
  await ok("set_project_meta", { texture_width: 32, texture_height: 32 });
  await ok("pack_box_uv", { auto_resize: false });
  const before = mock.MockCube.all[0].uv_offset.slice();
  const resized = await ok("resize_texture", { width: 64, height: 64 });
  assert.deepEqual(resized.size, [64, 64]);
  assert.deepEqual(resized.uv_scale, [2, 2]);
  assert.deepEqual(globalThis.Project.texture_width, 64);
  assert.deepEqual(mock.MockCube.all[0].uv_offset, [before[0] * 2, before[1] * 2]);
});

test("ensure_material_set + audit_material_set agree on the sheet size", async () => {
  mock.reset();
  newProject();
  const set = await ok("ensure_material_set", {
    prefix: "golem",
    width: 64,
    height: 64,
    channels: ["base", "emissive", "normal", "specular"],
  });
  assert.equal(set.textures.length, 4);
  const audit = await ok("audit_material_set", {
    channels: { base: "golem_base", emissive: "golem_emissive", normal: "golem_normal" },
    naming_prefix: "golem",
  });
  assert.equal(audit.summary.errors, 0);
  assert.equal(audit.summary.warns, 0);
  const renamed = await ok("audit_material_set", {
    channels: { base: "golem_base", emissive: "golem_emissive" },
    naming_prefix: "wrong_prefix",
  });
  assert.ok(renamed.summary.warns >= 2, "naming prefix mismatch reported");
});

/* -------------------------------------------------------- animation */

test("upsert_animation writes keys, inspect reads them back", async () => {
  mock.reset();
  newProject();
  await ok("scaffold_biped");
  const created = await ok("upsert_animation", {
    name: "animation.test.wave",
    length: 1,
    loop: "loop",
    bones: {
      arm_right: {
        rotation: [
          { time: 0, value: [0, 0, 0], interpolation: "catmullrom" },
          { time: 0.5, value: [45, 0, 0], interpolation: "catmullrom" },
          { time: 1, value: [0, 0, 0], interpolation: "catmullrom" },
        ],
      },
    },
  });
  assert.equal(created.keyframes, 3);
  const inspected = await ok("inspect_animation", { name: "animation.test.wave" });
  assert.equal(inspected.bones.length, 1);
  assert.equal(inspected.summary.keyframes, 3);
  assert.deepEqual(inspected.bones[0].channels.rotations[1].value, [45, 0, 0]);

  await fails("upsert_animation", { name: "animation.test.wave", length: 1 }, "E_INVALID_PARAM");
});

test("generate_animation produces a direction-correct walk cycle on a real rig", async () => {
  mock.reset();
  newProject();
  await ok("scaffold_biped");
  const cycle = await ok("generate_animation", { type: "walk", replace: true });
  assert.equal(cycle.loop, "loop");
  assert.ok(cycle.bones.join(",").includes("leg_right"));
  const inspected = await ok("inspect_animation", { name: cycle.name });
  const legR = inspected.bones.find((b) => b.name === "leg_right");
  const legL = inspected.bones.find((b) => b.name === "leg_left");
  assert.ok(legR && legL, "both legs keyed");
  // 对侧相位:同样时间点旋转符号相反 (+X 让下垂的腿向前)
  assert.ok(
    Math.sign(legR.channels.rotations[0].value[0]) === -Math.sign(legL.channels.rotations[0].value[0]),
    "limbs are in opposite phase",
  );
  assert.notEqual(legR.channels.rotations[0].value[0], 0);
  const body = inspected.bones.find((b) => b.name === "body");
  assert.ok(body.channels.position.length >= 3, "body bobs");
  for (const type of ["idle", "run", "attack", "cast", "jump", "hurt", "death", "fly"]) {
    const other = await ok("generate_animation", { type, replace: true });
    assert.equal(other.type, type);
    assert.ok(other.keyframes > 0, `${type} produced keys`);
  }
  await fails("generate_animation", { type: "not-a-cycle" }, "E_INVALID_PARAM");
});

test("transform_animation_keys retimes and mirrors", async () => {
  mock.reset();
  newProject();
  await ok("scaffold_biped");
  const cycle = await ok("generate_animation", { type: "walk", replace: true });
  const transformed = await ok("transform_animation_keys", { name: cycle.name, time_scale: 2, value_scale: [1, 1, 1] });
  assert.ok(transformed.updated_keyframes > 0);
  const inspected = await ok("inspect_animation", { name: cycle.name });
  assert.equal(inspected.length, Number(cycle.length) * 2);
});

test("set_timeline_time poses a frame and delete_animation removes a clip", async () => {
  mock.reset();
  newProject();
  await ok("scaffold_biped");
  const cycle = await ok("generate_animation", { type: "idle", replace: true });
  const posed = await ok("set_timeline_time", { time: 0.5 });
  assert.equal(posed.time, 0.5);
  const deleted = await ok("delete_animation", { name: cycle.name });
  assert.equal(deleted.deleted, cycle.name);
  assert.equal(mock.MockAnimation.all.length, 0);
});

/* ------------------------------------------------------------ views */

test("capture_views returns captioned images and silhouette analysis is numeric", async () => {
  mock.reset();
  newProject();
  await ok("scaffold_biped");
  const views = await ok("capture_views", { views: ["north", "iso"], max_edge: 64, format: "png" });
  assert.equal(views.views.length, 2);
  assert.match(views.views[0].data_url, /^data:image\/png;base64,/);
  assert.match(views.views[0].caption, /mirrored/i);
  assert.equal(views.views[1].visible_face, null);
  const silhouette = await ok("analyze_view_silhouette", { views: ["north"], max_edge: 64 });
  assert.equal(silhouette.views.length, 1);
  assert.ok(typeof silhouette.views[0].coverage === "number");
});

/* --------------------------------------------------- review & files */

test("request_review returns pending and wait_review resolves once answered", async () => {
  mock.reset();
  newProject();
  await ok("scaffold_biped");
  const pending = await ok("request_review", {
    question: "Is the blockout right?",
    wait_seconds: 0.05,
    views: ["north"],
  });
  assert.equal(pending.pending, true);
  assert.equal(pending.answer, null);
  assert.ok(pending.review_id);
  assert.equal(pending.views.length, 1);

  api.answerReview(pending.review_id, 1, "elbows too straight");
  const answered = await ok("wait_review", { review_id: pending.review_id, wait_seconds: 1 });
  assert.equal(answered.pending, false);
  assert.equal(answered.answer, "Needs changes");
  assert.equal(answered.comment, "elbows too straight");
});

test("ask_user offers custom options", async () => {
  mock.reset();
  const pending = await ok("ask_user", {
    question: "Which hand holds the shield?",
    options: ["Left", "Right"],
    wait_seconds: 0.05,
  });
  assert.deepEqual(pending.options, ["Left", "Right"]);
  api.answerReview(pending.review_id, 0);
  const answered = await ok("wait_review", { review_id: pending.review_id, wait_seconds: 1 });
  assert.equal(answered.answer, "Left");
});

test("reference matching: load, pin, compare and clear", async () => {
  mock.reset();
  newProject();
  await ok("scaffold_biped");
  const loaded = await ok("load_reference", {
    data_url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
    name: "wolf",
  });
  assert.equal(loaded.name, "wolf");
  const list = await ok("list_references");
  assert.equal(list.count, 1);
  const image = await ok("get_reference", { name: "wolf" });
  assert.match(image.references[0].data_url, /^data:image\/png;base64,/);
  const comparison = await ok("compare_reference", { view: "north" });
  assert.equal(typeof comparison.match_percent, "number");
  assert.ok(comparison.composite_data_url.startsWith("data:image/png;base64,"));
  assert.ok(Array.isArray(comparison.advice));
  const cleared = await ok("clear_references");
  assert.equal(cleared.cleared, 1);
  await fails("compare_reference", {}, "E_NOT_FOUND");
});

/* -------------------------------------------------------- coverage */

test("action bridge lists and runs Blockbench commands", async () => {
  const actions = await ok("list_actions", {});
  assert.ok(actions.actions.some((a) => a.id === "mirror_model"));
  const filtered = await ok("list_actions", { filter: "mirror" });
  assert.equal(filtered.actions.length, 1);
  const one = await ok("get_action", { id: "mirror_model" });
  assert.equal(one.has_click, true);
  const run = await ok("run_action", { id: "mirror_model" });
  assert.equal(run.result, true);
  await fails("run_action", { id: "nope" }, "E_NOT_FOUND");
  await fails("get_action", { id: "nope" }, "E_NOT_FOUND");
});

test("settings, plugins and history tools work through the mock", async () => {
  const listed = await ok("list_settings", {});
  assert.ok(listed.settings.some((s) => s.id === "bbmcp_allow_execute_script"));
  const one = await ok("get_setting", { id: "bbmcp_port" });
  assert.equal(one.value, 39742);
  const updated = await ok("set_setting", { id: "bbmcp_port", value: 40000 });
  assert.equal(updated.value, 40000);
  await ok("set_setting", { id: "bbmcp_port", value: 39742 });
  const plugins = await ok("list_plugins");
  assert.ok(Array.isArray(plugins.plugins));
  assert.equal((await ok("undo")).action, "undo");
  assert.equal((await ok("redo")).action, "redo");
  const modes = await ok("list_modes");
  assert.ok(modes.modes.some((m) => m.id === "edit"));
  assert.equal((await ok("set_mode", { id: "edit" })).mode, "edit");
});

/* ----------------------------------------------------------- orientation */

test("which_side and get_orientation encode the -Z-facing convention", async () => {
  mock.reset();
  newProject();
  await ok("create_limb", { name: "arm_right", pivot: [6, 22, 0], size: [4, 12, 4] });
  await ok("create_limb", { name: "arm_left", pivot: [-6, 22, 0], size: [4, 12, 4] });
  const right = await ok("which_side", { element: "arm_right" });
  assert.equal(right.side, "right");
  assert.equal(right.name_agrees, true);
  const mislabeled = await ok("which_side", { element: "arm_right_cube" });
  assert.equal(mislabeled.side, "right");
  const orientation = await ok("get_orientation");
  assert.equal(orientation.model_right_axis, "+X");
  assert.match(orientation.front_view_mirror_trap, /mirrored/i);
});

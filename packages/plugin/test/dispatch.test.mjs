/**
 * 插件分发层功能测试 —— 真实执行每个工具的处理器,使用 mock 的 Blockbench 宿主。
 *   pnpm --filter @anningui/blockbench-mcp test   (先 pnpm run build)
 */
import { test, expect, afterAll } from "vitest";
import { mkdirSync } from "node:fs";
import path from "node:path";

const mock = (await import("./mock-blockbench.mjs")).installMockBlockbench();
const api = await import("../dist/testing.mjs");

const call = (name, args = {}) => api.runTool(name, args);

async function ok(name, args = {}) {
  const result = await call(name, args);
  expect(result.ok, `${name} failed: ${JSON.stringify(result.error ?? result)}`).toBe(true);
  return result.result;
}

async function fails(name, args = {}, code) {
  const result = await call(name, args);
  expect(result.ok, `${name} unexpectedly succeeded: ${JSON.stringify(result.result)}`).toBe(false);
  if (code) expect(result.error.code, `${name}: got ${result.error.code} — ${result.error.message}`).toBe(code);
  return result.error;
}

function newProject(format = "bedrock") {
  const result = api.handlers.create_project({ format, texture_width: 64, texture_height: 64 });
  expect(result.ok).toBe(true);
  return result;
}

/* ------------------------------------------------------------- basics */

test("every tool in the catalogue has an implementation", () => {
  const missing = Object.keys(api.TOOL_SPECS).filter((name) => !api.handlers[name]);
  expect(missing).toEqual([]);
  expect(api.registeredToolNames().length >= 60, `tool count ${api.registeredToolNames().length}`).toBeTruthy();
});

test("unknown tool and invalid params return structured errors", async () => {
  const unknown = await fails("does_not_exist", {}, "E_UNSUPPORTED_COMMAND");
  expect(unknown.message).toMatch(/tools\/list/);
  const invalid = await fails("which_side", {}, "E_INVALID_PARAM");
  expect(invalid.message).toMatch(/element/);
  const unknownKey = await fails("health", { nope: 1 }, "E_INVALID_PARAM");
  expect(unknownKey.message).toMatch(/Unrecognized key|nope/);
});

test("JSON-string arguments from sloppy clients are coerced", async () => {
  const coerced = api.coerceArguments({ refs: '["a","b"]', nested: { matrix: '["#"]' }, n: 3 });
  expect(coerced.refs).toEqual(["a", "b"]);
  expect(coerced.nested.matrix).toEqual(["#"]);
  expect(coerced.n).toBe(3);
  const result = await call("which_side", { element: "missing" });
  expect(result.ok).toBe(false);
});

test("health reports transport, capabilities and the gate state", async () => {
  const health = await ok("health");
  expect(health.ok).toBe(true);
  expect(health.protocol_version).toBe(1);
  expect(health.blockbench_supported).toBe(true);
  expect(health.transport.length).toEqual(2);
  expect(health.execute_script_allowed).toBe(false);
  expect(health.capabilities.includes("geometry")).toBeTruthy();
  expect(health.capabilities.includes("textures")).toBeTruthy();
  expect(health.capabilities.includes("screenshots")).toBeTruthy();
});

test("guides resolve and list_formats works", async () => {
  const guide = await ok("get_guide", { topic: "detailing" });
  expect(guide.topic).toBe("detailing");
  expect(guide.text).toMatch(/monolithic|layering/i);
  const formats = await ok("list_formats");
  expect(formats.formats.some((f) => f.id === "java_block")).toBeTruthy();
});

/* ---------------------------------------------------------- project */

test("create_project validates uv_mode against the format", async () => {
  mock.reset();
  const created = newProject("bedrock");
  expect(created.ok).toBe(true);
  expect(created.uv_mode).toBe("box");
  const summary = await ok("get_project_summary");
  expect(summary.format).toBe("bedrock");
  expect(summary.uv_mode).toBe("box");
  expect(summary.cubes).toBe(0);

  mock.reset();
  await fails("create_project", { format: "java_block", uv_mode: "box" }, "E_INVALID_PARAM");
  await fails("create_project", { format: "nope" }, "E_UNSUPPORTED_FORMAT");
});

test("propose_scoped_directory asks once, then remembers the approved folder", async () => {
  mock.reset();
  newProject();
  mock.state.autoAnswerDialogs = true;
  const dir = path.resolve(process.cwd(), "out/mock-scope");
  mkdirSync(dir, { recursive: true });
  const first = await ok("propose_scoped_directory", { path: dir });
  expect(first.confirmed).toBe(true);
  expect(mock.state.dialogs.length, "第一次弹了一次框").toBe(1);
  const second = await ok("propose_scoped_directory", { path: dir });
  expect(second.already_approved, "第二次直接用已批准的目录").toBe(true);
  expect(mock.state.dialogs.length, "第二次不再弹框").toBe(1);
  mock.state.autoAnswerDialogs = false;
  // 会话状态在同一个测试文件里是共享的:用完必须清掉,否则后面的拒绝用例会失败
  api.session.scopedDirectory = null;
});

test("save_project / export_model are refused until a directory is approved", async () => {
  mock.reset();
  newProject();
  const error = await fails("save_project", { path: "C:/tmp/a.bbmodel" }, "E_SCOPE_DENIED");
  expect(error.message).toMatch(/propose_scoped_directory/);
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
  expect(result.created.length).toBe(4);
  expect(mock.MockCube.all.length).toBe(2);
  expect(mock.MockGroup.all.length).toBe(2);
  expect(mock.state.undoInit, "one undo step").toBe(1);
  expect(mock.state.undoFinish).toBe(1);
  const head = mock.MockCube.all.find((c) => c.name === "skull");
  expect(head.parent.name).toBe("head");
});

test("a group may not be named root (it collides with Blockbench's project-root sentinel)", async () => {
  mock.reset();
  newProject();
  const error = await fails(
    "apply_geometry_batch",
    { create_groups: [{ name: "root", origin: [0, 0, 0] }] },
    "E_INVALID_PARAM",
  );
  expect(error.message).toMatch(/root_bone/);
  expect(mock.MockGroup.all.length).toBe(0);
});

test("apply_geometry_batch refuses contradictory sides and missing parents before writing", async () => {
  mock.reset();
  newProject();
  const side = await fails(
    "apply_geometry_batch",
    { create_cubes: [{ name: "arm_right", from: [-6, 10, -1], to: [-4, 16, 1], side: "right" }] },
    "E_INVALID_PARAM",
  );
  expect(side.message).toMatch(/declared side/);
  expect(mock.MockCube.all.length, "nothing was created").toBe(0);
  await fails(
    "apply_geometry_batch",
    { create_cubes: [{ name: "x", from: [0, 0, 0], to: [1, 1, 1], parent: "nope" }] },
    "E_PARTIAL_FORBIDDEN",
  );
  expect(mock.MockCube.all.length).toBe(0);
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
  expect(result.cubes).toBe(3);
  expect(mock.MockCube.all.length).toBe(3);
  expect(mock.MockCube.all.every((c) => c.name.startsWith("blade"))).toBeTruthy();
});

test("add_hollow_volume builds a shell with a cavity and can omit faces", async () => {
  mock.reset();
  newProject();
  const full = await ok("add_hollow_volume", { bounds: { from: [0, 0, 0], to: [10, 10, 10] } });
  expect(full.created_elements).toBe(6);
  expect(full.cavity.min).toEqual([1, 1, 1]);
  mock.reset();
  newProject();
  await ok("add_hollow_volume", {
    bounds: { from: [0, 0, 0], to: [10, 10, 10] },
    open_faces: ["north", "down"],
    name: "hood",
  });
  expect(mock.MockCube.all.length).toBe(4);
  expect(!mock.MockCube.all.some((c) => /hood_(north|down)/.test(c.name))).toBeTruthy();
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
  expect(array.elements).toBe(5);
  const chain = await ok("extrude_chain", {
    segments: 4,
    base_origin: [3, 30, 0],
    segment_length: 2,
    taper: 0.6,
    curvature: [12, 0, 0],
    name: "horn",
    side: "right",
  });
  expect(chain.bones).toBe(4);
  expect(chain.tip).toEqual([3, 38, 0]);
  expect(mock.MockGroup.all.filter((g) => g.name.startsWith("horn")).length).toBe(4);
});

test("add_wing lands bones and a membrane, and refuses the wrong side", async () => {
  mock.reset();
  newProject();
  const wing = await ok("add_wing", { side: "right", base_origin: [3, 22, 2], fingers: 3 });
  expect(wing.joints.elbow).toBeTruthy();
  expect(mock.MockGroup.all.some((g) => g.name === "wing_right_arm")).toBeTruthy();
  expect(mock.MockCube.all.some((c) => c.name.includes("membrane"))).toBeTruthy();
  mock.reset();
  newProject();
  await fails("add_wing", { side: "left", base_origin: [3, 22, 2] }, "E_INVALID_PARAM");
});

test("update_elements can resize a cube (and refuses from/to on a group)", async () => {
  mock.reset();
  newProject();
  await ok("apply_geometry_batch", {
    create_groups: [{ name: "body", origin: [0, 10, 0] }],
    create_cubes: [{ name: "head_cube", from: [-2, 10, -2], to: [2, 14, 2], parent: "body" }],
  });
  // cube 的 resize 必须成功(这条路径以前被写反的校验挡住,真机才暴露)
  const resized = await ok("update_elements", {
    updates: [{ ref: "head_cube", from: [-3, 10, -3], to: [3, 16, 3] }],
    uv_policy: "auto",
  });
  expect(resized.updated.length).toBe(1);
  const cube = mock.MockCube.all.find((c) => c.name === "head_cube");
  expect(cube.to).toEqual([3, 16, 3]);
  await fails("update_elements", { updates: [{ ref: "body", from: [0, 0, 0] }] }, "E_INVALID_PARAM");
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
  expect(moved.updated.length).toBe(2);
  const torso = mock.MockCube.all.find((c) => c.name === "torso");
  expect(torso.from[0]).toBe(0);
  expect(torso.from[1]).toBe(20);
  expect(torso.to[0]).toBe(6);
  await fails("transform_elements", { refs: ["body"], scale: [2, 1, 1] }, "E_INVALID_PARAM");
  // 只旋转"组"也必须被拒(真机发现:原来只检查 cube 自身 rotation)
  await ok("update_elements", { updates: [{ ref: "body", rotation: [8, 0, 0] }] });
  const rotatedGroup = await fails("transform_elements", { refs: ["body"], scale: [2, 1, 1] }, "E_INVALID_PARAM");
  expect(rotatedGroup.message).toMatch(/shear/i);
  // 均匀缩放仍然可以
  await ok("transform_elements", { refs: ["body"], scale: [1.5, 1.5, 1.5] });
});

test("mirror_elements renames left/right and check_sides agrees", async () => {
  mock.reset();
  newProject();
  await ok("create_limb", { name: "arm_right", pivot: [6, 22, 0], size: [4, 12, 4], mirror: "x" });
  const names = mock.MockGroup.all.map((g) => g.name).sort();
  expect(names).toEqual(["arm_left", "arm_right"]);
  const sides = await ok("check_sides");
  expect(sides.summary.mismatched).toBe(0);
  expect(sides.summary.unpaired).toBe(0);
});

test("duplicate_hierarchy keeps original UVs by default, regenerates on uv_policy:auto", async () => {
  mock.reset();
  newProject();
  await ok("apply_geometry_batch", {
    create_groups: [{ name: "arm_right", origin: [5, 14, 0] }],
    create_cubes: [{ name: "arm_right_cube", from: [4, 8, -1], to: [6, 14, 1], parent: "arm_right" }],
  });
  const source = mock.MockCube.all.find((c) => c.name === "arm_right_cube");
  source.faces.north.uv = [1, 2, 3, 4]; // 人为标记
  await ok("duplicate_hierarchy", { root: "arm_right", name_suffix: "_copy" });
  const shared = mock.MockCube.all.find((c) => c.name === "arm_right_cube_copy");
  expect(shared.faces.north.uv, "share 模式下沿用原 UV").toEqual([1, 2, 3, 4]);
  await ok("duplicate_hierarchy", { root: "arm_right", name_suffix: "_auto", uv_policy: "auto" });
  const regenerated = mock.MockCube.all.find((c) => c.name === "arm_right_cube_auto");
  expect(regenerated.faces.north.uv, "auto 模式下重新生成").not.toEqual([1, 2, 3, 4]);
});

test("paint_face_features rejects unknown paint ops instead of silently doing nothing", async () => {
  mock.reset();
  newProject();
  await ok("apply_geometry_batch", { create_cubes: [{ name: "c", from: [0, 0, 0], to: [2, 2, 2] }] });
  await ok("ensure_texture", { name: "skin", width: 32, height: 32, fill: "#111111" });
  await ok("pack_box_uv", { cubes: ["c"] });
  const bad = await call("paint_face_features", {
    faces: [{ cube: "c", face: "north", ops: [{ type: "spray", color: "#fff" }] }],
  });
  expect(bad.ok).toBe(false);
  expect(bad.error.code).toBe("E_INVALID_PARAM");
  // 合法 op 仍然工作
  const good = await ok("paint_face_features", {
    faces: [{ cube: "c", face: "north", ops: [{ type: "rect", x: 0, y: 0, width: 1, height: 1, color: "#ff0000" }] }],
  });
  expect(good.painted).toBe(1);
});

test("flood_fill_texture rejects seeds outside the texture", async () => {
  mock.reset();
  newProject();
  await ok("apply_geometry_batch", { create_cubes: [{ name: "c", from: [0, 0, 0], to: [2, 2, 2] }] });
  await ok("ensure_texture", { name: "skin", width: 16, height: 16, fill: "#222222" });
  await fails("flood_fill_texture", { x: -1, y: 0, color: "#ff0000" }, "E_INVALID_PARAM");
  await fails("flood_fill_texture", { x: 0, y: 99, color: "#ff0000" }, "E_INVALID_PARAM");
  const filled = await ok("flood_fill_texture", { x: 0, y: 0, color: "#ff0000", max_pixels: 4096 });
  expect(filled.filled).toBeGreaterThan(0);
});

test("scaffold_biped builds a real rig, packs UVs and returns check_model", async () => {
  mock.reset();
  newProject();
  const result = await ok("scaffold_biped", { texture_size: 64 });
  expect(result.uv_mode).toBe("box");
  expect(result.created.length >= 13, `created ${result.created.length}`).toBeTruthy();
  expect(mock.MockTexture.all.length === 1).toBeTruthy();
  const bones = mock.MockGroup.all.map((g) => g.name);
  for (const expected of ["root_bone", "body", "head", "arm_right", "arm_left", "leg_right", "leg_left"])
    expect(bones.includes(expected), `missing ${expected}`).toBeTruthy();
  const cubes = mock.MockCube.all;
  expect(cubes.every((c) => c.box_uv === true)).toBeTruthy();
  const uvs = new Set(cubes.map((c) => c.uv_offset.join(",")));
  expect(uvs.size, "every cube got its own atlas region").toBe(cubes.length);
  const rig = await ok("check_rig");
  expect(rig.summary.ready, JSON.stringify(rig.findings)).toBe(true);
  // 描述承诺返回 check_model 摘要 —— 断言它真的在结果里
  expect(result.check, "scaffold_biped returns a check_model summary").toBeTruthy();
  expect(result.check.summary.errors).toBe(0);
});

test("declared params that the implementation ignores are gone from the contract", async () => {
  // compare_reference / load_reference 曾经声明了 position/target/overlay/opacity 但没用
  await fails("compare_reference", { position: [1, 2, 3] }, "E_INVALID_PARAM");
  await fails("load_reference", { data_url: "data:image/png;base64,x", overlay: true }, "E_INVALID_PARAM");
  // add_wing 曾经声明 membrane:\"mesh\",但没有 mesh 实现
  await fails("add_wing", { side: "right", base_origin: [3, 22, 2], membrane: "mesh" }, "E_INVALID_PARAM");
});

test("analyze_view_silhouette really forwards luminance_threshold", async () => {
  mock.reset();
  newProject();
  await ok("scaffold_biped");
  // 阈值极高 → 几乎所有像素都被判为背景,覆盖率必须明显下降
  const strict = await ok("analyze_view_silhouette", {
    views: ["north"],
    max_edge: 64,
    luminance_threshold: 0,
  });
  const normal = await ok("analyze_view_silhouette", { views: ["north"], max_edge: 64 });
  expect(normal.views[0].coverage).toBeGreaterThanOrEqual(strict.views[0].coverage);
  expect(strict.views[0].foreground_pixels).toBe(0);
});

test("measure_model / audit_symmetry report numbers", async () => {
  mock.reset();
  newProject();
  await ok("create_limb", { name: "arm_right", pivot: [6, 22, 0], size: [4, 12, 4], mirror: "x" });
  const measured = await ok("measure_model");
  expect(measured.cubes).toBe(2);
  expect(measured.bounds.size[0]).toBe(16);
  const symmetry = await ok("audit_symmetry", { pairs: [{ left: "arm_right", right: "arm_left" }] });
  expect(symmetry.summary.passed).toBe(1);
  expect(symmetry.pairs[0].max_error < 1e-6).toBeTruthy();
});

/* ---------------------------------------------------------- quality */

test("check_model catches the classic failures and passes a clean rig", async () => {
  mock.reset();
  newProject();
  await ok("scaffold_biped");
  const clean = await ok("check_model");
  expect(clean.summary.errors, JSON.stringify(clean.findings)).toBe(0);
  expect(clean.ready).toBe(true);

  await ok("apply_geometry_batch", {
    create_cubes: [
      { name: "torso", from: [-4, 12, -2], to: [4, 24, 2], parent: "body" },
      { name: "torso_twin", from: [-4, 12, -2], to: [4, 24, 2], parent: "body" },
    ],
  });
  const dirty = await ok("check_model");
  expect(dirty.findings.some((f) => f.code === "COPLANAR_OVERLAP"), JSON.stringify(dirty.findings)).toBeTruthy();
});

test("audit_complexity gates a blockout and reports the budget", async () => {
  mock.reset();
  newProject();
  await ok("apply_geometry_batch", {
    create_groups: [{ name: "body", origin: [0, 0, 0] }],
    create_cubes: [{ name: "torso", from: [0, 0, 0], to: [8, 16, 8], parent: "body" }],
  });
  const primitive = await ok("audit_complexity", { target: "character" });
  expect(primitive.verdict).toBe("too_primitive");
  expect(primitive.ready_for_texturing).toBe(false);
  expect(primitive.issues.length > 0).toBeTruthy();
});

test("execute_script stays gated until the user enables it", async () => {
  await fails("execute_script", { code: "return 1" }, "E_AUTH_FAILED");
  globalThis.settings.bbmcp_allow_execute_script.value = true;
  const result = await ok("execute_script", { code: "return [1,2,3].reduce((a,b)=>a+b,0)" });
  expect(result.result).toBe(6);
  globalThis.settings.bbmcp_allow_execute_script.value = false;
  const timed = await call("execute_script", { code: "return 1" });
  expect(timed.ok).toBe(false);
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
  expect(texture.size[0]).toBe(64);
  const packed = await ok("pack_box_uv", { padding: 1 });
  expect(packed.mode).toBe("box");
  expect(packed.packed).toBe(2);
  const layout = await ok("get_uv_layout");
  expect(layout.summary.out_of_bounds).toBe(0);
  expect(layout.summary.overlaps).toBe(0);
  expect(layout.summary.islands, "six faces per cube").toBe(12);
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
  expect(painted.pixels).toBe(4);
  expect(painted.revision).toMatch(/^fnv1a32:/);
  const read = await ok("get_face_grid", { cube: "face_cube", face: "north" });
  expect(read.rows).toEqual([["#ff0000ff", "#00ff00ff"], ["#00ff00ff", "#ff0000ff"]]);
  expect(read.revision).toBe(painted.revision);
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
  expect(stale.message).toMatch(/changed since it was read/);
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
  expect(shaded.textured).toBe(2);
  expect(shaded.faces).toBe(12);
  const audit = await ok("audit_texture_quality");
  expect(audit.faces).toBe(12);
  expect(audit.summary.errors).toBe(0);
  // 面被真的上了色,不再是透明
  expect(audit.findings.every((f) => f.code !== "EMPTY_FACE_TEXTURE")).toBeTruthy();
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
  expect(copied.pixels).toBe(4);
  const flipped = await ok("get_face_grid", { cube: "b", face: "north" });
  expect(flipped.rows).toEqual([["#0000ffff", "#ff0000ff"], ["#ff0000ff", "#0000ffff"]]);
  const turned = await ok("transform_texture_region", { face: { cube: "a", face: "north" }, operation: "rotate_180" });
  expect(turned.pixels).toBe(4);
  const palette = await ok("analyze_texture_palette", { face: { cube: "a", face: "north" } });
  expect(palette.total_pixels).toBe(4);
  expect(palette.unique_colors).toBe(2);
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
  expect(features.painted).toBe(1);
  const grid = await ok("get_face_grid", { cube: "c", face: "north" });
  expect(grid.width).toBe(2);
  expect(grid.height).toBe(2);
  expect(grid.rows.flat().includes("#123456ff")).toBeTruthy();
  expect(grid.rows.flat().includes("#ffffffff")).toBeTruthy();
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
  expect(resized.size).toEqual([64, 64]);
  expect(resized.uv_scale).toEqual([2, 2]);
  expect(globalThis.Project.texture_width).toEqual(64);
  expect(mock.MockCube.all[0].uv_offset).toEqual([before[0] * 2, before[1] * 2]);
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
  expect(set.textures.length).toBe(4);
  const audit = await ok("audit_material_set", {
    channels: { base: "golem_base", emissive: "golem_emissive", normal: "golem_normal" },
    naming_prefix: "golem",
  });
  expect(audit.summary.errors).toBe(0);
  expect(audit.summary.warns).toBe(0);
  const renamed = await ok("audit_material_set", {
    channels: { base: "golem_base", emissive: "golem_emissive" },
    naming_prefix: "wrong_prefix",
  });
  expect(renamed.summary.warns >= 2, "naming prefix mismatch reported").toBeTruthy();
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
  expect(created.keyframes).toBe(3);
  const inspected = await ok("inspect_animation", { name: "animation.test.wave" });
  expect(inspected.bones.length).toBe(1);
  expect(inspected.summary.keyframes).toBe(3);
  expect(inspected.bones[0].channels.rotation[1].value).toEqual([45, 0, 0]);

  await fails("upsert_animation", { name: "animation.test.wave", length: 1 }, "E_INVALID_PARAM");
});

test("generate_animation produces a direction-correct walk cycle on a real rig", async () => {
  mock.reset();
  newProject();
  await ok("scaffold_biped");
  const cycle = await ok("generate_animation", { type: "walk", replace: true });
  expect(cycle.loop).toBe("loop");
  expect(cycle.bones.join(",").includes("leg_right")).toBeTruthy();
  const inspected = await ok("inspect_animation", { name: cycle.name });
  const legR = inspected.bones.find((b) => b.name === "leg_right");
  const legL = inspected.bones.find((b) => b.name === "leg_left");
  expect(legR && legL, "both legs keyed").toBeTruthy();
  // 对侧相位:同样时间点旋转符号相反 (+X 让下垂的腿向前)
  expect(Math.sign(legR.channels.rotation[0].value[0]) === -Math.sign(legL.channels.rotation[0].value[0]), "limbs are in opposite phase").toBeTruthy();
  expect(legR.channels.rotation[0].value[0]).not.toBe(0);
  const body = inspected.bones.find((b) => b.name === "body");
  expect(body.channels.position.length >= 3, "body bobs").toBeTruthy();
  for (const type of ["idle", "run", "attack", "cast", "jump", "hurt", "death", "fly"]) {
    const other = await ok("generate_animation", { type, replace: true });
    expect(other.type).toBe(type);
    expect(other.keyframes > 0, `${type} produced keys`).toBeTruthy();
  }
  await fails("generate_animation", { type: "not-a-cycle" }, "E_INVALID_PARAM");
});

test("transform_animation_keys retimes and mirrors", async () => {
  mock.reset();
  newProject();
  await ok("scaffold_biped");
  const cycle = await ok("generate_animation", { type: "walk", replace: true });
  const transformed = await ok("transform_animation_keys", { name: cycle.name, time_scale: 2, value_scale: [1, 1, 1] });
  expect(transformed.updated_keyframes > 0).toBeTruthy();
  const inspected = await ok("inspect_animation", { name: cycle.name });
  expect(inspected.length).toBe(Number(cycle.length) * 2);
});

test("set_timeline_time really poses (animate mode + bone selection + setup + preview)", async () => {
  mock.reset();
  newProject();
  await ok("scaffold_biped");
  const cycle = await ok("generate_animation", { type: "idle", replace: true });
  mock.state.timelineCalls.length = 0;
  mock.state.animatorPreviews = 0;
  const posed = await ok("set_timeline_time", { time: 0.5, animation: cycle.name });
  expect(posed.time).toBe(0.5);
  // 真机实测:只调 setTime 是空操作,必须切 animate 模式 + 选骨骼 + setup + preview
  expect(mock.state.modeCalls).toContain("animate");
  expect(mock.state.timelineCalls).toContain("setup");
  expect(mock.state.timelineCalls).toContain("setTime:0.5");
  expect(mock.state.animatorPreviews, "Animator.preview 必须被调用").toBe(1);
  expect(posed.animators_loaded, "时间轴装载了 animator(说明骨骼确实被选中)").toBeGreaterThan(0);
  expect(posed.previous_mode).toBeTruthy();
  await ok("delete_animation", { name: cycle.name });
});

test("set_timeline_time poses a frame and delete_animation removes a clip", async () => {
  mock.reset();
  newProject();
  await ok("scaffold_biped");
  const cycle = await ok("generate_animation", { type: "idle", replace: true });
  const posed = await ok("set_timeline_time", { time: 0.5 });
  expect(posed.time).toBe(0.5);
  const deleted = await ok("delete_animation", { name: cycle.name });
  expect(deleted.deleted).toBe(cycle.name);
  expect(mock.MockAnimation.all.length).toBe(0);
});

/* ------------------------------------------------------------ views */

test("capture_views returns captioned images and silhouette analysis is numeric", async () => {
  mock.reset();
  newProject();
  await ok("scaffold_biped");
  const views = await ok("capture_views", { views: ["north", "iso"], max_edge: 64, format: "png" });
  expect(views.views.length).toBe(2);
  expect(views.views[0].data_url).toMatch(/^data:image\/png;base64,/);
  expect(views.views[0].caption).toMatch(/mirrored/i);
  expect(views.views[1].visible_face).toBe(null);
  const silhouette = await ok("analyze_view_silhouette", { views: ["north"], max_edge: 64 });
  expect(silhouette.views.length).toBe(1);
  expect(typeof silhouette.views[0].coverage === "number").toBeTruthy();
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
  expect(pending.pending).toBe(true);
  expect(pending.answer).toBe(null);
  expect(pending.review_id).toBeTruthy();
  expect(pending.views.length).toBe(1);

  api.answerReview(pending.review_id, 1, "elbows too straight");
  const answered = await ok("wait_review", { review_id: pending.review_id, wait_seconds: 1 });
  expect(answered.pending).toBe(false);
  expect(answered.answer).toBe("Needs changes");
  expect(answered.comment).toBe("elbows too straight");
});

test("dismissing the review dialog is NOT an answer (stays pending)", async () => {
  mock.reset();
  const pending = await ok("ask_user", { question: "Pick one", wait_seconds: 0.05 });
  // 用户按了 ESC / 关掉对话框:Blockbench 会回调 -1
  api.answerReview(pending.review_id, -1);
  const after = await ok("wait_review", { review_id: pending.review_id, wait_seconds: 0.05 });
  expect(after.pending, "关闭对话框不算回答").toBe(true);
  expect(after.dismissed).toBe(true);
  expect(after.answer).toBe(null);
  // 之后仍然可以被正常回答
  api.answerReview(pending.review_id, 0, "还是选第一个");
  const answered = await ok("wait_review", { review_id: pending.review_id, wait_seconds: 1 });
  expect(answered.pending).toBe(false);
  expect(answered.answer).toBe("Yes");
});

test("ask_user offers custom options", async () => {
  mock.reset();
  const pending = await ok("ask_user", {
    question: "Which hand holds the shield?",
    options: ["Left", "Right"],
    wait_seconds: 0.05,
  });
  expect(pending.options).toEqual(["Left", "Right"]);
  api.answerReview(pending.review_id, 0);
  const answered = await ok("wait_review", { review_id: pending.review_id, wait_seconds: 1 });
  expect(answered.answer).toBe("Left");
});

test("reference matching: load, pin, compare and clear", async () => {
  mock.reset();
  newProject();
  await ok("scaffold_biped");
  const loaded = await ok("load_reference", {
    data_url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
    name: "wolf",
  });
  expect(loaded.name).toBe("wolf");
  const list = await ok("list_references");
  expect(list.count).toBe(1);
  const image = await ok("get_reference", { name: "wolf" });
  expect(image.references[0].data_url).toMatch(/^data:image\/png;base64,/);
  const comparison = await ok("compare_reference", { view: "north" });
  expect(typeof comparison.match_percent).toBe("number");
  expect(comparison.composite_data_url.startsWith("data:image/png;base64,")).toBeTruthy();
  expect(Array.isArray(comparison.advice)).toBeTruthy();
  const cleared = await ok("clear_references");
  expect(cleared.cleared).toBe(1);
  await fails("compare_reference", {}, "E_NOT_FOUND");
});

/* -------------------------------------------------------- coverage */

test("action bridge lists and runs Blockbench commands", async () => {
  const actions = await ok("list_actions", {});
  expect(actions.actions.some((a) => a.id === "mirror_model")).toBeTruthy();
  const filtered = await ok("list_actions", { filter: "mirror" });
  expect(filtered.actions.length).toBe(1);
  const one = await ok("get_action", { id: "mirror_model" });
  expect(one.has_click).toBe(true);
  const run = await ok("run_action", { id: "mirror_model" });
  expect(run.result).toBe(true);
  await fails("run_action", { id: "nope" }, "E_NOT_FOUND");
  await fails("get_action", { id: "nope" }, "E_NOT_FOUND");
});

test("settings, plugins and history tools work through the mock", async () => {
  const listed = await ok("list_settings", {});
  expect(listed.settings.some((s) => s.id === "bbmcp_allow_execute_script")).toBeTruthy();
  const one = await ok("get_setting", { id: "bbmcp_port" });
  expect(one.value).toBe(39742);
  const updated = await ok("set_setting", { id: "bbmcp_port", value: 40000 });
  expect(updated.value).toBe(40000);
  // 必须经 Setting.set() 写存储,否则重启就丢(和令牌那个 bug 同一类)
  expect(mock.state.persisted.bbmcp_port).toBe(40000);
  await ok("set_setting", { id: "bbmcp_port", value: 39742 });
  // 插件:list_plugins 要区分"已安装"和"商店里可见"
  const plugins = await ok("list_plugins");
  expect(plugins.summary.installed).toBe(1);
  expect(plugins.summary.available).toBe(2);
  expect(plugins.plugins.find((p) => p.id === "animated_java").installed).toBe(true);
  expect(plugins.plugins.find((p) => p.id === "geckolib").installed).toBe(false);

  // 按商店 id 安装(真 API = plugin.install())
  const installed = await ok("install_plugin", { id: "geckolib" });
  expect(installed.installed).toBe(true);
  expect(installed.title).toBe("GeckoLib");
  expect(mock.state.pluginInstalls).toContain("geckolib");

  // 平台不支持时给出原因而不是静默失败
  const unsupported = await call("install_plugin", { id: "hytale" });
  expect(unsupported.ok).toBe(false);
  expect(unsupported.error.code).toBe("E_UNSUPPORTED_FORMAT");
  expect(unsupported.error.message).toMatch(/web app/);

  // 按 URL 安装
  const fromUrl = await ok("install_plugin", { url: "https://example.com/p.js" });
  expect(fromUrl.source).toBe("url");
  expect(mock.state.pluginInstalls).toContain("url:https://example.com/p.js");

  await fails("install_plugin", { id: "nope" }, "E_NOT_FOUND");
  await fails("install_plugin", {}, "E_INVALID_PARAM");

  // 未安装的不能下架
  await fails("uninstall_plugin", { id: "hytale" }, "E_INVALID_PARAM");
  const uninstalled = await ok("uninstall_plugin", { id: "animated_java" });
  expect(uninstalled.uninstalled).toBe("animated_java");
  expect(mock.state.pluginUninstalls).toContain("animated_java");
  const undo = await ok("undo");
  expect(undo.action).toBe("undo");
  expect(mock.state.undoCalls).toBe(1);
  const redo = await ok("redo");
  expect(redo.action).toBe("redo");
  expect(mock.state.redoCalls).toBe(1);
  const modes = await ok("list_modes");
  expect(modes.modes.some((m) => m.id === "edit")).toBeTruthy();
  const switched = await ok("set_mode", { id: "paint" });
  expect(switched.mode).toBe("paint");
  const after = await ok("list_modes");
  expect(after.selected).toBe("paint");
  expect(after.modes.find((m) => m.id === "paint").active).toBe(true);
  expect(after.modes.find((m) => m.id === "edit").active).toBe(false);
  await ok("set_mode", { id: "edit" });
});

/* ----------------------------------------------------------- orientation */

test("which_side and get_orientation encode the -Z-facing convention", async () => {
  mock.reset();
  newProject();
  await ok("create_limb", { name: "arm_right", pivot: [6, 22, 0], size: [4, 12, 4] });
  await ok("create_limb", { name: "arm_left", pivot: [-6, 22, 0], size: [4, 12, 4] });
  const right = await ok("which_side", { element: "arm_right" });
  expect(right.side).toBe("right");
  expect(right.name_agrees).toBe(true);
  const mislabeled = await ok("which_side", { element: "arm_right_cube" });
  expect(mislabeled.side).toBe("right");
  const orientation = await ok("get_orientation");
  expect(orientation.model_right_axis).toBe("+X");
  expect(orientation.front_view_mirror_trap).toMatch(/mirrored/i);
});

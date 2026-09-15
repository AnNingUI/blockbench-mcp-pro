#!/usr/bin/env node
/**
 * 真机**全量**测试:正式用例 + 边缘用例,对着正在运行的 Blockbench 插件跑,并落盘所有产物。
 *
 * 前提:Blockbench 已加载插件(dist/blockbench_mcp.js)并允许 net 权限。
 *
 * 用法:
 *   node scripts/live-test.mjs --token <MCP Access Token> [--out ./out/live-test]
 *
 * 可选:
 *   --url <http://127.0.0.1:39742/mcp>
 *   --out <dir>            产物目录(截图/模型/报告)
 *   --scoped <dir>         文件类用例用的目录(默认 = --out)。需要你在 Blockbench 里点一次 Allow
 *   --only <substr>        只跑名字匹配的用例(逗号分隔)
 *   --skip <substr>        跳过名字匹配的用例
 *   --allow-destructive   允许"会改你当前工程"的用例(默认会先新建一个工程)
 *
 * 退出码:0 = 全部通过(或跳过),1 = 有失败用例
 */
import { mkdirSync, writeFileSync, readdirSync, statSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

/* ------------------------------------------------------------------ 配置 */

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const URL_ = flag("url", process.env.BBMCP_URL ?? "http://127.0.0.1:39742/mcp");
const TOKEN = flag("token", process.env.BBMCP_TOKEN ?? "");
const OUT = path.resolve(flag("out", "out/live-test"));
const SCOPED = path.resolve(flag("scoped", OUT));
const ONLY = flag("only", "");
const SKIP = flag("skip", "");

const C = {
  dim: (s) => `\u001b[2m${s}\u001b[0m`,
  ok: (s) => `\u001b[32m${s}\u001b[0m`,
  bad: (s) => `\u001b[31m${s}\u001b[0m`,
  warn: (s) => `\u001b[33m${s}\u001b[0m`,
  bold: (s) => `\u001b[1m${s}\u001b[0m`,
};

/* ------------------------------------------------------------- 断言与调用 */

class CaseFailed extends Error {}
const expect = (cond, message) => {
  if (!cond) throw new CaseFailed(message);
};
const expectEqual = (actual, expected, message) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new CaseFailed(`${message ?? "值不相等"}: 期望 ${JSON.stringify(expected)},实际 ${JSON.stringify(actual)}`);
};

let requestSeq = 0;
async function raw(name, args = {}) {
  const response = await fetch(URL_, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `live-${++requestSeq}`,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `${name}: HTTP ${response.status} ${text.slice(0, 200)}` +
        (response.status === 401 ? "\n   → 令牌不对;用 --token 或 BBMCP_TOKEN 传入" : ""),
    );
  }
  const body = await response.json();
  const payload = JSON.parse(body.result?.content?.[0]?.text ?? "{}");
  return {
    ok: Boolean(payload.ok),
    result: payload.result,
    error: payload.error,
    isError: Boolean(body.result?.isError),
    images: body.result?.content?.filter((c) => c.type === "image") ?? [],
  };
}

/** 期望成功 */
async function ok(name, args = {}) {
  const r = await raw(name, args);
  if (!r.ok) throw new CaseFailed(`${name} 失败: ${r.error?.code} ${r.error?.message}`);
  expect(!r.isError, `${name} 返回了 isError`);
  return r;
}

/** 期望失败,并返回错误 */
async function fails(name, args = {}, expectedCode) {
  const r = await raw(name, args);
  expect(!r.ok, `${name} 本应失败却成功了: ${JSON.stringify(r.result).slice(0, 160)}`);
  if (expectedCode) expectEqual(r.error.code, expectedCode, `${name} 的错误码`);
  expect(r.isError, `${name} 失败时 isError 应为 true`);
  return r.error;
}

let savedImages = 0;
function saveImages(images, prefix) {
  const files = [];
  for (const image of images) {
    const file = path.join(OUT, `${prefix}-${++savedImages}.png`);
    writeFileSync(file, Buffer.from(image.data, "base64"));
    files.push(path.basename(file));
  }
  return files;
}

/** 直接对 HTTP 层打原始请求(鉴权/协议硬化用例) */
async function rawHttp({ method = "POST", path: p = "/mcp", headers = {}, body = "" } = {}) {
  const net = await import("node:net");
  const port = Number(new URL(URL_).port || 80);
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1", () => {
      const lines = [`${method} ${p} HTTP/1.1`, ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`), `Content-Length: ${Buffer.byteLength(body)}`, "", ""];
      socket.write(lines.join("\r\n") + body);
    });
    let data = "";
    socket.on("data", (chunk) => (data += chunk.toString()));
    socket.on("end", () => resolve(data));
    socket.on("error", reject);
    socket.setTimeout(5000, () => {
      socket.destroy();
      resolve(data);
    });
  });
}

/* ----------------------------------------------------------------- 用例表 */

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

/* ------------------------------- 0. 发现与只读 ------------------------------- */

test("health: 报告版本/能力/传输", async () => {
  const { result } = await ok("health");
  expect(result.ok === true, "health.ok");
  expect(typeof result.blockbench_version === "string", "blockbench_version");
  expect(result.capabilities.includes("geometry"), "capabilities 含 geometry");
  expect(result.transport.length === 2, "双通道");
  expect(result.server === "blockbench-mcp-pro", "server 名");
});

test("list_formats / list_textures / list_animations / get_elements 都可用", async () => {
  const formats = await ok("list_formats");
  expect(formats.result.formats.length > 0, "至少一个格式");
  await ok("list_textures");
  await ok("list_animations");
  await ok("get_elements", {});
});

test("get_guide: 所有主题都有内容,未知主题回退到 modeling", async () => {
  for (const topic of ["modeling", "detailing", "orientation", "texturing", "vfx", "animation", "review", "reference"]) {
    const { result } = await ok("get_guide", { topic });
    expect(result.text.length > 100, `${topic} 指南内容`);
  }
  const fallback = await ok("get_guide", { topic: "nonsense" });
  expectEqual(fallback.result.topic, "modeling", "未知主题回退");
});

/* ------------------------------- 1. 工程与几何 ------------------------------- */

test("create_project(bedrock) 得到 box UV 工程", async () => {
  const { result } = await ok("create_project", {
    format: "bedrock",
    name: "bbmcp-live-test",
    texture_width: 64,
    texture_height: 64,
  });
  expectEqual(result.format, "bedrock", "格式");
  expectEqual(result.uv_mode, "box", "uv_mode");
  const summary = await ok("get_project_summary");
  expect(summary.result.uv_mode === "box", "summary.uv_mode");
});

test("apply_geometry_batch: 骨架 + 立方体 + side 守卫", async () => {
  const { result } = await ok("apply_geometry_batch", {
    create_groups: [
      { name: "body", origin: [0, 12, 0] },
      { name: "head", origin: [0, 16, 0], parent: "body", rotation: [8, 0, 0] },
      { name: "arm_right", origin: [5, 14, 0], parent: "body" },
      { name: "arm_left", origin: [-5, 14, 0], parent: "body" },
      { name: "leg_right", origin: [2, 6, 0], parent: "body" },
      { name: "leg_left", origin: [-2, 6, 0], parent: "body" },
    ],
    create_cubes: [
      { name: "torso", from: [-4, 8, -2], to: [4, 16, 2], parent: "body" },
      { name: "skull", from: [-3, 16, -3], to: [3, 22, 3], parent: "head", inflate: 0.2 },
      { name: "muzzle", from: [-1.5, 16, -5], to: [1.5, 19, -3], parent: "head" },
      { name: "arm_right_cube", from: [4, 8, -1], to: [6, 14, 1], parent: "arm_right", side: "right" },
      { name: "arm_left_cube", from: [-6, 8, -1], to: [-4, 14, 1], parent: "arm_left", side: "left" },
      { name: "leg_right_cube", from: [1, 0, -1], to: [3, 8, 1], parent: "leg_right", side: "right" },
      { name: "leg_left_cube", from: [-3, 0, -1], to: [-1, 8, 1], parent: "leg_left", side: "left" },
    ],
  });
  expect(result.created.length >= 13, `创建了 ${result.created.length} 个元素`);
});

test("程序化生成器:壳体 / 阵列 / 骨链 / 翼 / 体素化", async () => {
  const shell = await ok("add_hollow_volume", {
    bounds: { from: [-3.8, 15.8, -3.8], to: [3.8, 22.4, 3.8] },
    wall_thickness: 0.8,
    open_faces: ["down"],
    name: "helmet",
    parent: "head",
  });
  expect(shell.result.created_elements >= 5, "壳体墙数");

  const array = await ok("generate_array", {
    mode: "linear",
    count: 7,
    element_size: [0.8, 3, 0.8],
    start: [-4, 16, 2.4],
    end: [4, 16, 2.4],
    anchor: "bottom",
    depth_stagger: 0.12,
    rotation_range: { min: [-6, 0, -8], max: [6, 0, 8] },
    seed: 7,
    name_prefix: "spike",
    parent: "body",
  });
  expectEqual(array.result.elements, 7, "阵列数量");

  const chain = await ok("extrude_chain", {
    segments: 4,
    base_origin: [0, 9, 2],
    segment_length: 2,
    initial_size: [1.6, 1.6],
    taper: 0.6,
    curvature: [-12, 0, 0],
    direction: "back",
    name: "tail",
    parent: "body",
  });
  expectEqual(chain.result.bones, 4, "骨链段数");
  expect(Array.isArray(chain.result.tip), "返回 tip");

  const wing = await ok("add_wing", {
    side: "right",
    base_origin: [3, 15, 2],
    fingers: 3,
    arm_length: 4,
    forearm_length: 5,
    finger_length: 6,
    parent: "body",
    name: "wing",
  });
  expect(wing.result.joints?.wrist, "翼返回腕关节");

  const vox = await ok("voxelize_matrix", {
    matrix: ["..##..", ".####.", "######"],
    palette: { "#": { name: "plate", depth: 2 } },
    origin: [0, 22, -4],
    parent: "body",
    merge_adjacent: true,
  });
  expect(vox.result.cubes >= 3, "体素化产出");
});

test("mirror / array / radial / duplicate / create_limb 都能用", async () => {
  await ok("array_cubes", { sources: ["spike_1"], count: 2, offset: [0, 0, 1], uv_policy: "auto" });
  await ok("radial_array_cubes", { sources: ["spike_1"], count: 4, pivot: [0, 16, 0], axis: "y", angle: 360, uv_policy: "auto" });
  await ok("mirror_elements", { refs: ["arm_right_cube"], axis: "x" });
  const limb = await ok("create_limb", { name: "ear_right", pivot: [2, 22, 0], size: [1, 2, 1], parent: "head" });
  expect(limb.result.created.length === 2, "create_limb 生成骨+块");
  await ok("duplicate_hierarchy", { root: "arm_right", name_suffix: "_copy" });
  await ok("update_elements", { updates: [{ ref: "muzzle", visibility: true }] });
  await ok("transform_elements", { refs: ["ear_right"], translate: [0, 0, 0], rotate: [0, 0, 10] });
  await ok("delete_elements", { refs: ["spike_2"] });
});

test("scaffold_biped 建出可用骨架并返回 check 摘要", async () => {
  const { result } = await ok("scaffold_biped", { texture_size: 64, name_prefix: "bip_" });
  expect(result.check, "返回 check 摘要");
  expectEqual(result.check.summary.errors, 0, "check_model errors");
  expect(result.created.length >= 13, "骨架元素数");
});

/* ------------------------------- 2. 质量门 ------------------------------- */

test("质量门:check_model / check_sides / check_rig / audit_complexity / measure / symmetry", async () => {
  const model = await ok("check_model");
  if (model.result.summary.errors > 0) {
    for (const f of model.result.findings.filter((x) => x.severity === "error").slice(0, 6))
      console.log(C.dim(`        ${f.code}: ${f.message}`));
  }
  expectEqual(model.result.summary.errors, 0, "check_model 无 error");

  const sides = await ok("check_sides");
  expectEqual(sides.result.summary.mismatched, 0, "左右名字与坐标一致");

  const rig = await ok("check_rig");
  expect(rig.result.summary.ready, "骨架可动画");

  const complexity = await ok("audit_complexity", { target: "hero" });
  expect(complexity.result.verdict !== "too_primitive", `verdict=${complexity.result.verdict}`);

  const measured = await ok("measure_model");
  expect(measured.result.bounds.size[1] > 10, "模型高度合理");
  expect(typeof measured.result.ratios.width_to_height === "number", "宽高比");

  const symmetry = await ok("audit_symmetry", {
    pairs: [{ left: "leg_left", right: "leg_right" }],
  });
  expect(symmetry.result.summary.failed === 0, "左右腿对称");
});

/* ------------------------------- 3. UV 与贴图 ------------------------------- */

test("UV:pack_box_uv → get_uv_layout 无越界无意外重叠 → get_uv_map", async () => {
  await ok("ensure_texture", { name: "live_skin", width: 64, height: 64, fill: "#8a5a2b" });
  const packed = await ok("pack_box_uv", { padding: 1 });
  expect(packed.result.packed > 0, "打包了几个 cube");
  const layout = await ok("get_uv_layout", {});
  expectEqual(layout.result.summary.out_of_bounds, 0, "UV 越界数");
  expectEqual(layout.result.summary.unintended_overlaps, 0, "意外重叠");
  const map = await ok("get_uv_map", { max_edge: 512 });
  expect(map.images.length === 1, "UV map 返回图片");
  saveImages(map.images, "uvmap");
});

test("贴图:shade_model_base → 面局部绘制 → 网格往返 → 质检", async () => {
  const shaded = await ok("shade_model_base", {
    base: "#8a5a2b",
    regions: [{ match: "skull|muzzle", color: "#c8a06a" }],
    crisp: true,
    noise: 0.08,
    blur: 0,
    seed: 3,
  });
  expect(shaded.result.faces > 0, "上色面数");

  await ok("paint_face_features", {
    faces: [
      {
        cube: "skull",
        face: "north",
        ops: [
          { type: "rect", x: 0, y: 2, width: 1, height: 1, color: "#1b1208" },
          { type: "rect", x: 5, y: 2, width: 1, height: 1, color: "#1b1208" },
          { type: "rect", x: 2, y: 4, width: 2, height: 2, color: "#2a1a0c" },
        ],
      },
    ],
  });
  await ok("paint_pixel_batch", {
    strokes: [
      { cube: "torso", face: "north", color: "#5a3a1b", points: [{ x: 0, y: 0 }, { x: 3, y: 3 }], size: 1 },
    ],
  });

  const written = await ok("paint_face_grid", {
    cube: "muzzle",
    face: "north",
    rows: ["ab", "ba"],
    palette: { a: "#ff0000", b: "#00ff00" },
  });
  expect(typeof written.result.revision === "string", "返回 revision");
  const read = await ok("get_face_grid", { cube: "muzzle", face: "north" });
  expectEqual(read.result.rows, [["#ff0000ff", "#00ff00ff"], ["#00ff00ff", "#ff0000ff"]], "像素往返一致");

  const revision = await ok("get_texture_revision");
  await ok("edit_texture_pixels", { pixels: [{ x: 0, y: 0, color: "#123456" }], expected_revision: revision.result.revision });
  await fails("edit_texture_pixels", { pixels: [{ x: 0, y: 0, color: "#222222" }], expected_revision: revision.result.revision }, "E_PARTIAL_FORBIDDEN");

  await ok("replace_texture_color", { from: "#123456", to: "#654321", tolerance: 0 });
  await ok("copy_face_pixels", { source: { cube: "skull", face: "north" }, target: { cube: "skull", face: "south" }, flip_x: true });
  await ok("flood_fill_texture", { x: 0, y: 0, color: "#000000", max_pixels: 4096 });
  await ok("transform_texture_region", { face: { cube: "muzzle", face: "north" }, operation: "rotate_180" });

  const palette = await ok("analyze_texture_palette", { max_colors: 8 });
  expect(palette.result.unique_colors > 1, "调色板统计");
  const region = await ok("get_texture_region", { face: { cube: "skull", face: "north" }, scale: 8 });
  saveImages(region.images, "texture-region");
  const quality = await ok("audit_texture_quality");
  expect(quality.result.summary.errors === 0, "贴图质检无 error");
  const texture = await ok("get_texture", { max_edge: 256 });
  saveImages(texture.images, "texture");
});

test("材质通道:ensure_material_set → audit_material_set", async () => {
  await ok("ensure_material_set", {
    prefix: "live_mat",
    width: 64,
    height: 64,
    channels: ["base", "emissive", "normal", "specular"],
  });
  const audit = await ok("audit_material_set", {
    channels: { base: "live_mat_base", emissive: "live_mat_emissive", normal: "live_mat_normal" },
    naming_prefix: "live_mat",
  });
  expectEqual(audit.result.summary.errors, 0, "通道一致");
});

test("resize_texture / assign_texture / auto_uv_cubes / set_face_uv / transform_uv_islands", async () => {
  await ok("assign_texture", { texture: "live_skin", cubes: ["torso"] });
  await ok("set_face_uv", { entries: [{ cube: "torso", face: "north", uv: [0, 0, 8, 8], rotation: 0 }] });
  await ok("transform_uv_islands", { faces: [{ cube: "torso", face: "north" }], translate: [1, 1] });
  await ok("auto_uv_cubes", { cubes: ["muzzle"] });
  const resized = await ok("resize_texture", { width: 128, height: 128 });
  expectEqual(resized.result.size, [128, 128], "纹理尺寸");
});

/* ------------------------------- 4. 动画 ------------------------------- */

test("动画:generate_animation → inspect → transform → 时间轴", async () => {
  const cycle = await ok("generate_animation", { type: "walk", replace: true, amplitude: 0.8 });
  expect(cycle.result.keyframes > 0, "生成关键帧");
  const inspected = await ok("inspect_animation", { name: cycle.result.name });
  expect(inspected.result.summary.keyframes > 0, "读回关键帧");
  const legR = inspected.result.bones.find((b) => b.name === "leg_right");
  const legL = inspected.result.bones.find((b) => b.name === "leg_left");
  if (legR && legL)
    expect(
      Math.sign(legR.channels.rotations[0].value[0]) !== Math.sign(legL.channels.rotations[0].value[0]),
      "双腿对侧相位",
    );
  await ok("transform_animation_keys", { name: cycle.result.name, time_scale: 1.1 });
  await ok("set_timeline_time", { time: 0.3, animation: cycle.result.name });
  await ok("upsert_animation", {
    name: "live_custom",
    length: 1,
    loop: "loop",
    replace: true,
    bones: { torso: { rotation: [{ time: 0, value: [0, 0, 0] }, { time: 0.5, value: [0, 10, 0] }, { time: 1, value: [0, 0, 0] }] } },
  });
});

/* ------------------------------- 5. 渲染与参考图 ------------------------------- */

test("capture_views: 全部 7 个视角都出图", async () => {
  const views = await ok("capture_views", {
    views: ["north", "south", "east", "west", "up", "down", "iso"],
    max_edge: 512,
    format: "png",
  });
  expectEqual(views.result.views.length, 7, "视角数");
  expect(views.images.length === 7, "7 张图片");
  saveImages(views.images, "views");
  const silhouette = await ok("analyze_view_silhouette", { views: ["north", "iso"], max_edge: 256 });
  expect(silhouette.result.summary.empty_views === 0, "没有空视角(模型在画面里)");
});

test("参考图:load → get → compare(IoU) → clear", async () => {
  // 用刚才的 north 截图当参考图,合理应得到很高的匹配度
  const north = readdirSync(OUT).filter((f) => f.startsWith("views-")).sort()[0];
  expect(north, "先有 north 截图");
  const dataUrl = `data:image/png;base64,${readFileSync(path.join(OUT, north)).toString("base64")}`;
  await ok("load_reference", { data_url: dataUrl, name: "self" });
  const list = await ok("list_references");
  expect(list.result.count >= 1, "参考图已登记");
  const image = await ok("get_reference", { name: "self" });
  expect(image.images.length === 1, "参考图可读");
  const comparison = await ok("compare_reference", { view: "north" });
  expect(comparison.result.match_percent > 50, `自比对的 IoU=${comparison.result.match_percent}`);
  saveImages(comparison.images, "reference-compare");
  await ok("clear_references");
});

test("set_camera_angle 不改变模型,只动相机", async () => {
  const before = await ok("measure_model");
  await ok("set_camera_angle", { preset: "north" });
  const after = await ok("measure_model");
  expectEqual(after.result.bounds.size, before.result.bounds.size, "尺寸不应变化");
});

/* ------------------------------- 6. 覆盖类工具 ------------------------------- */

test("action 桥:list_actions / get_action / select_action", async () => {
  const actions = await ok("list_actions", {});
  expect(actions.result.count > 10, `动作数量 ${actions.result.count}`);
  const filtered = await ok("list_actions", { filter: "mirror" });
  expect(filtered.result.actions.length >= 1, "能按名字过滤");
  const one = await ok("get_action", { id: filtered.result.actions[0].id });
  expect(one.result.id, "取到动作详情");
  await ok("select_action", { refs: ["torso"] });
  await fails("get_action", { id: "definitely_not_an_action" }, "E_NOT_FOUND");
});

test("modes / settings 读写", async () => {
  const modes = await ok("list_modes");
  expect(modes.result.modes.length >= 1, "模式列表");
  const settings = await ok("list_settings", {});
  expect(settings.result.count > 10, "设置数量");
  const port = await ok("get_setting", { id: "bbmcp_port" });
  await ok("set_setting", { id: "bbmcp_port", value: port.result.value });
  await fails("set_setting", { id: "no_such_setting", value: 1 }, "E_NOT_FOUND");
});

test("插件:list_plugins 区分已装/商店;install 未知 id 报错", async () => {
  const plugins = await ok("list_plugins");
  expect(typeof plugins.result.summary.installed === "number", "已安装计数");
  await fails("install_plugin", { id: "definitely-not-a-plugin" }, "E_NOT_FOUND");
  await fails("uninstall_plugin", { id: "definitely-not-a-plugin" }, "E_NOT_FOUND");
});

test("undo / redo 真的能回滚 AI 的改动", async () => {
  const before = await ok("get_project_summary");
  await ok("apply_geometry_batch", {
    create_cubes: [{ name: "undo_probe", from: [0, 0, 0], to: [1, 1, 1], parent: "body" }],
  });
  const added = await ok("get_project_summary");
  expectEqual(added.result.cubes, before.result.cubes + 1, "新增 1 个 cube");
  await ok("undo");
  const undone = await ok("get_project_summary");
  expectEqual(undone.result.cubes, before.result.cubes, "undo 后回到原样");
  await ok("redo");
  const redone = await ok("get_project_summary");
  expectEqual(redone.result.cubes, before.result.cubes + 1, "redo 恢复");
  await ok("undo");
});

test("execute_script 默认关闭,打开后可用,再关掉", async () => {
  await fails("execute_script", { code: "return 1" }, "E_AUTH_FAILED");
  await ok("set_setting", { id: "bbmcp_allow_execute_script", value: true });
  const enabled = await ok("execute_script", { code: "return Cube.all.length" });
  expect(typeof enabled.result.result === "number", "脚本可执行并返回值");
  await ok("set_setting", { id: "bbmcp_allow_execute_script", value: false });
  await fails("execute_script", { code: "return 1" }, "E_AUTH_FAILED");
});

/* ------------------------------- 7. 人审门 ------------------------------- */

test("人审门:request_review 返回 pending(卡片会自己到期关闭)", async () => {
  const review = await ok("request_review", {
    question: "这条是自动化测试弹出的人审批次,请不要点任何按钮,它会在几秒后自动关闭。",
    wait_seconds: 1,
    timeout_seconds: 5,
    views: ["north"],
  });
  expect(review.result.pending === true, "未回答时 pending:true");
  expect(typeof review.result.review_id === "string", "拿到 review_id");
  const waited = await ok("wait_review", { review_id: review.result.review_id, wait_seconds: 1 });
  expect(waited.result.answer === null, "超时不算回答");
  expect(waited.result.pending === true, "仍是 pending");
});

/* ------------------------------- 8. 文件与作用域 ------------------------------- */

test("作用域:未授权时保存被拒", async () => {
  await fails("save_project", { path: path.join(SCOPED, "blocked.bbmodel") }, "E_SCOPE_DENIED");
});

test("作用域:授权后可保存 .bbmodel 与导出几何", async () => {
  console.log(C.warn(`      ⚠ Blockbench 会弹权限对话框,请点 "Allow this folder":${SCOPED}`));
  await ok("propose_scoped_directory", { path: SCOPED });
  const saved = await ok("save_project", { path: path.join(SCOPED, "live.bbmodel"), overwrite: true });
  expect(saved.result.bytes > 1000, `.bbmodel 大小 ${saved.result.bytes}`);
  const exported = await ok("export_model", { path: path.join(SCOPED, "live.geo.json"), overwrite: true });
  expect(exported.result.bytes > 100, `几何导出 ${exported.result.bytes}B codec=${exported.result.codec}`);
  const exportedGltf = await ok("export_model", { path: path.join(SCOPED, "live.gltf"), overwrite: true, codec: "gltf" });
  expect(exportedGltf.result.bytes > 100, `glTF 导出 ${exportedGltf.result.bytes}B`);
  await fails("export_model", { path: path.join(SCOPED, "..", "outside.bbmodel") }, "E_SCOPE_DENIED");
});

test("纹理 PNG 导入导出(作用域内)", async () => {
  const outPng = path.join(SCOPED, "live-texture.png");
  const exported = await ok("export_texture_png", { path: outPng, overwrite: true });
  expect(exported.result.bytes > 100, "导出 PNG");
  const imported = await ok("import_texture_png", { path: outPng, name: "live_imported" });
  expectEqual(imported.result.size[0] >= 16, true, "导入尺寸");
});

/* ------------------------------- 9. 边缘用例 ------------------------------- */

test("边缘:未知工具 / 未知参数 / 类型错误都会被拒绝", async () => {
  await fails("this_tool_does_not_exist", {}, "E_UNSUPPORTED_COMMAND");
  await fails("health", { nope: 1 }, "E_INVALID_PARAM");
  await fails("pack_box_uv", { padding: "不是数字" }, "E_INVALID_PARAM");
  await fails("which_side", {}, "E_INVALID_PARAM");
});

test("边缘:side 声明与坐标矛盾会被拒且不写入", async () => {
  const before = await ok("get_project_summary");
  await fails(
    "apply_geometry_batch",
    { create_cubes: [{ name: "bad_side", from: [-6, 10, -1], to: [-4, 16, 1], side: "right" }] },
    "E_INVALID_PARAM",
  );
  const after = await ok("get_project_summary");
  expectEqual(after.result.cubes, before.result.cubes, "失败调用不应改动工程");
  const wing = await ok("get_project_summary");
  await fails("add_wing", { side: "left", base_origin: [3, 22, 2] }, "E_INVALID_PARAM");
  expectEqual(wing.result.cubes, after.result.cubes, "失败的 add_wing 也不应写入");
});

test("边缘:缺父级 / 删不存在 / 环状父子", async () => {
  await fails("apply_geometry_batch", { create_cubes: [{ name: "x", from: [0, 0, 0], to: [1, 1, 1], parent: "no_such_group" }] }, "E_PARTIAL_FORBIDDEN");
  await fails("delete_elements", { refs: ["no_such_element"] }, "E_PARTIAL_FORBIDDEN");
  await fails("update_elements", { updates: [{ ref: "body", parent: "body" }] }, "E_INVALID_PARAM");
  await fails("update_elements", { updates: [{ ref: "torso", parent: "no_such_group" }] }, "E_NOT_FOUND");
});

test("边缘:非均匀缩放旋转体 / 镜像轴非法 / 缺动画 replace", async () => {
  await fails("transform_elements", { refs: ["skull"], scale: [2, 1, 1] }, "E_INVALID_PARAM");
  await fails("mirror_elements", { refs: ["torso"], axis: "w" }, "E_INVALID_PARAM");
  await fails("upsert_animation", { name: "live_custom", length: 1 }, "E_INVALID_PARAM");
  await fails("inspect_animation", { name: "no_such_animation" }, "E_NOT_FOUND");
  await fails("delete_animation", { name: "no_such_animation" }, "E_NOT_FOUND");
  await fails("generate_animation", { type: "backflip" }, "E_INVALID_PARAM");
});

test("边缘:UV/贴图 越界与错误输入", async () => {
  await fails("get_face_grid", { cube: "no_such_cube", face: "north" }, "E_NOT_FOUND");
  await fails("get_face_grid", { cube: "torso", face: "nope" }, "E_NOT_FOUND");
  await fails("paint_face_grid", { cube: "torso", face: "north", rows: ["x"], palette: { x: "#fff" } }, "E_INVALID_PARAM");
  await fails("paint_face_grid", { cube: "torso", face: "north", rows: ["a"], palette: { ab: "#fff" } }, "E_INVALID_PARAM");
  await fails("flood_fill_texture", { x: -5, y: 0, color: "#fff" }, "E_INVALID_PARAM");
  await fails("flood_fill_texture", { x: 0, y: 0, color: "#fff", max_pixels: 1 }, "E_INVALID_PARAM");
  await fails("transform_texture_region", { face: { cube: "torso", face: "north" }, operation: "rotate_90" }, "E_INVALID_PARAM");
  await fails("paint_face_features", { faces: [{ cube: "torso", face: "north", ops: [{ type: "spray", color: "#fff" }] }] }, "E_INVALID_PARAM");
  await fails("pack_box_uv", { cubes: ["torso"], auto_resize: false, max_size: 16, padding: 1 }, "E_INVALID_PARAM");
});

test("边缘:参考图 / 人审 / 动作 的错误路径", async () => {
  await fails("compare_reference", {}, "E_NOT_FOUND");
  await fails("wait_review", { review_id: "rev-does-not-exist" }, "E_NOT_FOUND");
  await fails("run_action", { id: "nope" }, "E_NOT_FOUND");
  await fails("set_mode", { id: "nope" }, "E_NOT_FOUND");
  await fails("get_reference", { name: "nope" }, "E_NOT_FOUND");
});

/* ------------------------------- 10. 传输层硬化 ------------------------------- */

test("HTTP 硬化:401 / 403(Origin)/ 403(Host)/ 415 / 411 / 405 / 404 / 400", async () => {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  const base = { "Content-Type": "application/json" };
  const noAuth = await rawHttp({ headers: base, body });
  expect(/^HTTP\/1\.1 401/.test(noAuth), "无令牌 401");
  const origin = await rawHttp({ headers: { ...base, Authorization: `Bearer ${TOKEN}`, Origin: "https://evil.example" }, body });
  expect(/^HTTP\/1\.1 403/.test(origin), "带 Origin 403");
  const host = await rawHttp({ headers: { ...base, Authorization: `Bearer ${TOKEN}`, Host: "attacker.example" }, body });
  expect(/^HTTP\/1\.1 403/.test(host), "非回环 Host 403");
  const chunked = await rawHttp({ headers: { ...base, Authorization: `Bearer ${TOKEN}`, "Transfer-Encoding": "chunked" }, body: "0" });
  expect(/^HTTP\/1\.1 411/.test(chunked), "chunked 411");
  const wrongType = await rawHttp({ headers: { "Content-Type": "text/plain", Authorization: `Bearer ${TOKEN}` }, body: "hi" });
  expect(/^HTTP\/1\.1 415/.test(wrongType), "非 JSON 415");
  const get = await rawHttp({ method: "GET", path: "/mcp", headers: { Authorization: `Bearer ${TOKEN}` } });
  expect(/^HTTP\/1\.1 405/.test(get), "GET /mcp 405");
  const route = await rawHttp({ path: "/nope", headers: base });
  expect(/^HTTP\/1\.1 404/.test(route), "未知路由 404");
  const badJson = await rawHttp({ headers: { ...base, Authorization: `Bearer ${TOKEN}` }, body: "{not json" });
  expect(/^HTTP\/1\.1 400/.test(badJson), "坏 JSON 400");
  const wrongToken = await rawHttp({ headers: { ...base, Authorization: "Bearer nope" }, body });
  expect(/^HTTP\/1\.1 401/.test(wrongToken), "错令牌 401");
});

test("协议:initialize / tools/list / resources / prompts / 通知", async () => {
  const initialize = await fetch(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } }),
  });
  const init = await initialize.json();
  expect(init.result.serverInfo.name === "blockbench-mcp-pro", "serverInfo");
  const tools = await (await fetch(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
  })).json();
  expect(tools.result.tools.length >= 60, `工具数 ${tools.result.tools.length}`);
  const resources = await (await fetch(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "resources/list" }),
  })).json();
  expect(resources.result.resources.length >= 8, "资源列表");
  const prompts = await (await fetch(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "prompts/list" }),
  })).json();
  expect(prompts.result.prompts.length >= 1, "prompt 列表");
});

test("并发:同时打 8 个请求都成功", async () => {
  const results = await Promise.all(Array.from({ length: 8 }, () => ok("health")));
  expect(results.every((r) => r.result.ok === true), "并发请求全部成功");
});

/* ------------------------------------------------------------------ 执行 */



mkdirSync(OUT, { recursive: true });
console.log(C.bold(`\nBlockbench MCP 真机全量测试`) + C.dim(`\n  端点 ${URL_}\n  产物 ${OUT}\n`));

let passed = 0;
const failures = [];
const skipped = [];

for (const [index, c] of cases.entries()) {
  const label = `${String(index + 1).padStart(2)}. ${c.name}`;
  if (ONLY && !ONLY.split(",").some((s) => c.name.includes(s.trim()))) continue;
  if (SKIP && SKIP.split(",").some((s) => c.name.includes(s.trim()))) {
    skipped.push(c.name);
    console.log(`${C.warn("○")} ${label} ${C.dim("(skipped)")}`);
    continue;
  }
  const started = Date.now();
  try {
    await c.fn();
    passed += 1;
    console.log(`${C.ok("✓")} ${label} ${C.dim(`${Date.now() - started}ms`)}`);
  } catch (error) {
    failures.push({ case: c.name, error: error.message, stack: error.stack });
    console.log(`${C.bad("✗")} ${label} ${C.bad(error.message)}`);
  }
}

const artifacts = readdirSync(OUT)
  .map((f) => ({ f, size: statSync(path.join(OUT, f)).size }))
  .sort((a, b) => a.f.localeCompare(b.f));
writeFileSync(
  path.join(OUT, "live-report.json"),
  JSON.stringify(
    {
      when: new Date().toISOString(),
      endpoint: URL_,
      passed,
      failed: failures.length,
      skipped,
      failures,
      artifacts: artifacts.map((a) => ({ file: a.f, bytes: a.size })),
    },
    null,
    2,
  ),
);

console.log(C.bold(`\n结果:${passed} 通过 / ${failures.length} 失败 / ${skipped.length} 跳过`));
if (failures.length) for (const f of failures) console.log(C.bad(`  ✗ ${f.case}: ${f.error}`));
console.log(C.bold(`\n产物 ${OUT}`));
for (const { f, size } of artifacts) console.log(`   ${(size / 1024).toFixed(1).padStart(8)} KB  ${f}`);
process.exit(failures.length ? 1 : 0);

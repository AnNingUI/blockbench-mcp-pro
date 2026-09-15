#!/usr/bin/env node
/**
 * 真机端到端冒烟:对着**正在运行的 Blockbench**里的插件跑完整流程,并落盘真实产物。
 *
 * 前提:Blockbench 已加载本插件(File ▸ Plugins ▸ Load Plugin from File → dist/blockbench_mcp.js),
 *      并允许 net 权限,右下角出现 "Blockbench MCP ready"。
 *
 * 用法:
 *   node scripts/live-smoke.mjs --token <MCP Access Token>
 *   BBMCP_TOKEN=<token> node scripts/live-smoke.mjs --out ./out
 *
 * 可选参数:
 *   --url <http://127.0.0.1:39742/mcp>   覆盖端点
 *   --out <dir>                          产物目录(默认 ./out/live-smoke)
 *   --scoped-dir <dir>                   保存/导出用的目录(默认 = --out;需要在 Blockbench 里点 Allow)
 *   --no-blocks                          跳过程序化生成器(只做基础形体)
 *   --no-save                            跳过保存/导出(不弹权限对话框)
 *   --views north,east,iso               截取哪些视角
 */
import { mkdirSync, writeFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

/* ------------------------------------------------------------------ args */

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(`--${name}`);

const URL_ = flag("url", process.env.BBMCP_URL ?? "http://127.0.0.1:39742/mcp");
const TOKEN = flag("token", process.env.BBMCP_TOKEN ?? "");
const OUT = path.resolve(flag("out", "out/live-smoke"));
const SCOPED = path.resolve(flag("scoped-dir", OUT));
const VIEWS = flag("views", "north,east,iso").split(",").map((v) => v.trim()).filter(Boolean);
const SKIP_BLOCKS = has("no-blocks");
const SKIP_SAVE = has("no-save");

const C = {
  dim: (s) => `\u001b[2m${s}\u001b[0m`,
  ok: (s) => `\u001b[32m${s}\u001b[0m`,
  bad: (s) => `\u001b[31m${s}\u001b[0m`,
  warn: (s) => `\u001b[33m${s}\u001b[0m`,
  bold: (s) => `\u001b[1m${s}\u001b[0m`,
};

let step = 0;
const results = [];

async function call(name, args = {}) {
  const response = await fetch(URL_, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `${name}-${++step}`,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `${name}: HTTP ${response.status} ${body.slice(0, 200)}` +
        (response.status === 401 ? "\n   → 令牌不对;用 --token 或 BBMCP_TOKEN 传入 Settings ▸ General ▸ MCP Access Token" : ""),
    );
  }
  const body = await response.json();
  const payload = JSON.parse(body.result?.content?.[0]?.text ?? "{}");
  if (body.result?.isError || payload.ok === false) {
    throw new Error(`${name}: ${payload.error?.code ?? "ERROR"} ${payload.error?.message ?? JSON.stringify(payload)}`);
  }
  return { result: payload.result, images: body.result?.content?.filter((c) => c.type === "image") ?? [] };
}

function saveImages(images, prefix) {
  const written = [];
  images.forEach((image, index) => {
    const file = path.join(OUT, `${prefix}-${index + 1}.png`);
    writeFileSync(file, Buffer.from(image.data, "base64"));
    written.push(file);
  });
  return written;
}

const check = (label, condition, detail) => {
  if (condition) {
    console.log(`   ${C.ok("✓")} ${label}${detail ? C.dim(` — ${detail}`) : ""}`);
    return true;
  }
  console.log(`   ${C.bad("✗")} ${label}${detail ? ` — ${detail}` : ""}`);
  return false;
};

/* ------------------------------------------------------------------ run */

mkdirSync(OUT, { recursive: true });
console.log(C.bold(`\nBlockbench MCP 真机冒烟\n`) + C.dim(`  端点 ${URL_}\n  产物 ${OUT}\n`));

let failed = false;

try {
  // 1. 连通性
  console.log(C.bold("[1/9] health"));
  const health = await call("health");
  console.log(
    `   Blockbench ${health.result.blockbench_version} · 插件 ${health.result.plugin_version} · 工具能力 ${health.result.capabilities.join(",")}`,
  );
  if (!check("Blockbench 版本受支持", health.result.blockbench_supported, health.result.min_blockbench_version))
    failed = true;

  // 2. 新建工程
  console.log(C.bold("\n[2/9] create_project"));
  const project = await call("create_project", {
    format: "bedrock",
    name: "bbmcp-smoke",
    texture_width: 64,
    texture_height: 64,
  });
  console.log(`   格式 ${project.result.format} · uv_mode ${project.result.uv_mode}`);

  // 3. 基础形体(带 side 守卫)
  console.log(C.bold("\n[3/9] apply_geometry_batch"));
  const batch = await call("apply_geometry_batch", {
    create_groups: [
      { name: "root", origin: [0, 0, 0] },
      { name: "body", origin: [0, 12, 0], parent: "root" },
      { name: "head", origin: [0, 16, 0], parent: "body", rotation: [8, 0, 0] },
      { name: "arm_right", origin: [5, 14, 0], parent: "body" },
      { name: "arm_left", origin: [-5, 14, 0], parent: "body" },
    ],
    create_cubes: [
      { name: "torso", from: [-4, 8, -2], to: [4, 16, 2], parent: "body" },
      { name: "skull", from: [-3, 16, -3], to: [3, 22, 3], parent: "head", inflate: 0.2 },
      { name: "muzzle", from: [-1.5, 16, -5], to: [1.5, 19, -3], parent: "head" },
      { name: "arm_right_cube", from: [4, 8, -1], to: [6, 14, 1], parent: "arm_right", side: "right" },
      { name: "arm_left_cube", from: [-6, 8, -1], to: [-4, 14, 1], parent: "arm_left", side: "left" },
    ],
  });
  check("创建元素", batch.result.created.length >= 10, `${batch.result.created.length} 个`);

  // 4. 程序化生成器
  if (!SKIP_BLOCKS) {
    console.log(C.bold("\n[4/9] 程序化生成器"));
    const helmet = await call("add_hollow_volume", {
      bounds: { from: [-3.8, 15.8, -3.8], to: [3.8, 22.4, 3.8] },
      wall_thickness: 0.8,
      open_faces: ["down"],
      name: "helmet",
      parent: "head",
    });
    check("add_hollow_volume", helmet.result.created_elements >= 5, `${helmet.result.created_elements} 面墙`);

    const spikes = await call("generate_array", {
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
    check("generate_array", spikes.result.elements === 7, `7 个尖刺,notes=${spikes.result.notes.length}`);

    const tail = await call("extrude_chain", {
      segments: 4,
      base_origin: [0, 9, 2],
      segment_length: 2,
      initial_size: [1.6, 1.6],
      taper: 0.6,
      curvature: [-12, 0, 0],
      direction: "back",
      name: "tail",
      parent: "body",
      side: "right",
    });
    check("extrude_chain", tail.result.bones === 4, `4 段骨头,tip=${JSON.stringify(tail.result.tip)}`);
  } else {
    console.log(C.dim("\n[4/9] 程序化生成器 (--no-blocks 跳过)"));
  }

  // 5. 质量门
  console.log(C.bold("\n[5/9] 质量门"));
  const model = await call("check_model");
  if (!check("check_model 无 error", model.result.summary.errors === 0, `${model.result.summary.errors} error / ${model.result.summary.warns} warn`)) {
    for (const f of model.result.findings.filter((x) => x.severity === "error").slice(0, 5))
      console.log(C.dim(`      ${f.code}: ${f.message}`));
    failed = true;
  }
  const sides = await call("check_sides");
  if (!check("check_sides 名字与坐标一致", sides.result.summary.mismatched === 0, `${sides.result.summary.mismatched} 处不符`)) failed = true;
  const rig = await call("check_rig");
  check("check_rig 可动画", rig.result.summary.ready, `${rig.result.summary.bones} 骨`);
  const complexity = await call("audit_complexity", { target: "prop" });
  check(
    "audit_complexity 不是 too_primitive",
    complexity.result.verdict !== "too_primitive",
    `${complexity.result.verdict} · ${complexity.result.cubes} cubes`,
  );
  const measured = await call("measure_model");
  console.log(
    `   尺寸 ${measured.result.bounds.size.map((v) => v.toFixed(1)).join(" × ")} · 比例 w:h=${measured.result.ratios.width_to_height}`,
  );

  // 6. UV + 贴图
  console.log(C.bold("\n[6/9] UV 与贴图"));
  await call("ensure_texture", { name: "smoke_skin", width: 64, height: 64, fill: "#8a5a2b" });
  const packed = await call("pack_box_uv", { padding: 1 });
  const layout = await call("get_uv_layout", {});
  if (!check("UV 全部在图集内", layout.result.summary.out_of_bounds === 0, `islands=${layout.result.summary.islands}`)) failed = true;
  check("UV 无意外重叠", layout.result.summary.unintended_overlaps === 0, `overlaps=${layout.result.summary.overlaps}`);
  const shaded = await call("shade_model_base", {
    base: "#8a5a2b",
    regions: [{ match: "skull|muzzle", color: "#c8a06a" }],
    crisp: true,
    noise: 0.08,
    blur: 0,
    seed: 3,
  });
  check("shade_model_base 覆盖每个面", shaded.result.faces === layout.result.summary.islands, `${shaded.result.faces} 面`);
  await call("paint_face_features", {
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
  const quality = await call("audit_texture_quality");
  check("audit_texture_quality 无 error", quality.result.summary.errors === 0, `${quality.result.summary.warns} warn`);

  // 7. 动画
  console.log(C.bold("\n[7/9] 动画"));
  const cycle = await call("generate_animation", { type: "walk", replace: true, amplitude: 0.8 });
  check("generate_animation", cycle.result.keyframes > 0, `${cycle.result.keyframes} 关键帧 · ${cycle.result.bones.length} 骨`);
  const inspected = await call("inspect_animation", { name: cycle.result.name });
  const legR = inspected.result.bones.find((b) => b.name === "leg_right");
  const legL = inspected.result.bones.find((b) => b.name === "leg_left");
  check(
    "双腿对侧相位",
    !legR || !legL ? true : Math.sign(legR.channels.rotations[0].value[0]) !== Math.sign(legL.channels.rotations[0].value[0]),
    legR && legL ? `${legR.channels.rotations[0].value[0]} vs ${legL.channels.rotations[0].value[0]}` : "无腿骨(跳过)",
  );
  await call("set_timeline_time", { time: 0.3 });
  console.log(C.dim("   已把时间轴停在 0.3s"));

  // 8. 渲染
  console.log(C.bold("\n[8/9] 渲染视角"));
  const views = await call("capture_views", { views: VIEWS, max_edge: 512, format: "png" });
  const pngs = saveImages(views.images, "view");
  check("截图落盘", pngs.length > 0, pngs.map((f) => path.basename(f)).join(", "));
  const silhouette = await call("analyze_view_silhouette", { views: VIEWS, max_edge: 256 });
  console.log(
    `   覆盖率 ${silhouette.result.views.map((v) => `${v.view}=${(v.coverage * 100).toFixed(1)}%`).join(" ")}`,
  );

  // 9. 保存 / 导出
  console.log(C.bold("\n[9/9] 保存与导出"));
  if (SKIP_SAVE) {
    console.log(C.dim("   (--no-save 跳过;这一步需要在 Blockbench 里点 Allow)"));
  } else {
    console.log(C.warn(`   ⚠ Blockbench 里会弹出文件权限对话框,点 "Allow this folder": ${SCOPED}`));
    await call("propose_scoped_directory", { path: SCOPED });
    const saved = await call("save_project", { path: path.join(OUT, "smoke.bbmodel"), overwrite: true });
    check("save_project", saved.result.bytes > 0, path.basename(saved.result.path));
    const exported = await call("export_model", { path: path.join(OUT, "smoke.geo.json"), overwrite: true });
    check("export_model", exported.result.bytes > 0, `${path.basename(exported.result.path)} (${exported.result.codec})`);
  }

  // 报告
  const artifacts = readdirSync(OUT)
    .map((f) => ({ f, size: statSync(path.join(OUT, f)).size }))
    .sort((a, b) => a.f.localeCompare(b.f));
  writeFileSync(
    path.join(OUT, "report.json"),
    JSON.stringify(
      {
        when: new Date().toISOString(),
        endpoint: URL_,
        blockbench: health.result.blockbench_version,
        plugin: health.result.plugin_version,
        project: project.result,
        cubes: complexity.result.cubes,
        verdict: complexity.result.verdict,
        uv: layout.result.summary,
        views: VIEWS,
        animation: cycle.result.name,
        artifacts: artifacts.map((a) => a.f),
      },
      null,
      2,
    ),
  );

  console.log(C.bold("\n产物"));
  for (const { f, size } of artifacts) console.log(`   ${(size / 1024).toFixed(1).padStart(8)} KB  ${path.join(OUT, f)}`);
  console.log(failed ? C.bad("\n有检查项失败,见上面 ✗") : C.ok("\n全部检查通过 ✓"));
  process.exit(failed ? 1 : 0);
} catch (error) {
  console.log(C.bad(`\n失败: ${error.message}\n`));
  if (/Cannot reach|fetch failed|ECONNREFUSED/i.test(String(error.message)))
    console.log(
      "Blockbench 没在跑、插件没加载,或端口不对。\n" +
        "  1) 打开 Blockbench 桌面版\n" +
        "  2) File ▸ Plugins ▸ Load Plugin from File → packages/plugin/dist/blockbench_mcp.js\n" +
        "  3) 允许 net 权限,等到提示 'Blockbench MCP ready'\n" +
        "  4) 再跑一次本脚本(令牌见 Tools ▸ MCP Server Status / Token)\n",
    );
  process.exit(1);
}

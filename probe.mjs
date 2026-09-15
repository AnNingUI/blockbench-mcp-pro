import { readFileSync } from "node:fs";
const TOKEN = (process.env.BBMCP_TOKEN ?? "").trim();
const URL_ = "http://127.0.0.1:39742/mcp";
let seq = 0;
async function call(name, args = {}) {
  const r = await fetch(URL_, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ jsonrpc: "2.0", id: ++seq, method: "tools/call", params: { name, arguments: args } }) });
  const b = await r.json();
  const p = JSON.parse(b.result?.content?.[0]?.text ?? "{}");
  return { ok: p.ok, result: p.result, error: p.error };
}
const log = (...a) => console.log(...a);

// 1) 新工程 + 与套件相同的几何
await call("create_project", { format: "bedrock", name: "probe", texture_width: 64, texture_height: 64 });
await call("apply_geometry_batch", {
  create_groups: [
    { name: "body", origin: [0, 12, 0] },
    { name: "head", origin: [0, 16, 0], parent: "body", rotation: [8, 0, 0] },
    { name: "leg_right", origin: [2, 6, 0], parent: "body" },
    { name: "leg_left", origin: [-2, 6, 0], parent: "body" },
  ],
  create_cubes: [
    { name: "torso", from: [-4, 8, -2], to: [4, 16, 2], parent: "body" },
    { name: "skull", from: [-3, 16, -3], to: [3, 22, 3], parent: "head", inflate: 0.2 },
    { name: "leg_right_cube", from: [1, 0, -1], to: [3, 8, 1], parent: "leg_right" },
    { name: "leg_left_cube", from: [-3, 0, -1], to: [-1, 8, 1], parent: "leg_left" },
  ],
});

log("=== A) check_model findings(未经贴图的原始工程)===");
const cm = await call("check_model");
log("errors:", cm.result.summary.errors, "warns:", cm.result.summary.warns);
for (const f of cm.result.findings.slice(0, 10)) log(`  [${f.severity}] ${f.code} ${f.element ?? ""}: ${f.message}`);

log("\n=== B) array_cubes 不带 parent(源 cube 有父级)===");
const arr = await call("array_cubes", { sources: ["torso"], count: 2, offset: [0, 0, 5], uv_policy: "auto" });
log("ok:", arr.ok, "| error:", arr.error?.message);

log("\n=== C) generate_animation 在只有 torso/skull/legs 的工程上 ===");
const gen = await call("generate_animation", { type: "walk", replace: true });
log("ok:", gen.ok, "| bones:", JSON.stringify(gen.result?.bones), "| keyframes:", gen.result?.keyframes);
const ins = await call("inspect_animation", { name: gen.result?.name ?? "animation.walk" });
log("inspect bones:", ins.result?.bones?.map((b) => `${b.name}[${Object.entries(b.channels).filter(([, v]) => v.length).map(([k, v]) => k + ":" + v.length).join(",")}]`).join(" "));

log("\n=== D) undo 一次到底撤了什么 ===");
const before = await call("get_project_summary");
await call("apply_geometry_batch", { create_cubes: [{ name: "undo_probe", from: [0, 0, 0], to: [1, 1, 1], parent: "body" }] });
const added = await call("get_project_summary");
await call("undo");
const after = await call("get_project_summary");
log(`cubes: before=${before.result.cubes} after-add=${added.result.cubes} after-undo=${after.result.cubes}`);

log("\n=== E) select_action 的真实报错 ===");
log("list_actions 可用:", (await call("list_actions", {})).result?.count);
const sel = await call("select_action", { refs: ["torso"] });
log("select_action:", sel.ok, sel.error?.message);
const sc = await call("execute_script", { code: "return { hasCubeSelect: typeof Cube.all[0]?.select, hasGroupSelect: typeof Group.all[0]?.select, hasUnselectAll: typeof unselectAll, canvasHasUpdateSelected: typeof Canvas.updateSelected }" });
log("宿主选择相关 API:", JSON.stringify(sc.result?.result ?? sc.error));

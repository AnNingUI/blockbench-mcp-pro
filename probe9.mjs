const TOKEN = (process.env.BBMCP_TOKEN ?? "").trim();
const URL_ = "http://127.0.0.1:39742/mcp";
let seq = 0;
async function call(name, args = {}) {
  const r = await fetch(URL_, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ jsonrpc: "2.0", id: ++seq, method: "tools/call", params: { name, arguments: args } }) });
  const b = await r.json();
  const p = JSON.parse(b.result?.content?.[0]?.text ?? "{}");
  return { ok: p.ok, result: p.result, error: p.error };
}
console.log("=== 复现套件顺序:biped + 生成器 → check_model ===");
await call("create_project", { format: "bedrock", name: "probe9", texture_width: 64, texture_height: 64 });
const biped = await call("scaffold_biped", { texture_size: 64, name_prefix: "bip_" });
console.log("scaffold_biped:", biped.ok, "| check errors:", biped.result?.check?.summary?.errors);
const cm1 = await call("check_model");
console.log("第一次 check_model errors:", cm1.result.summary.errors);
for (const f of cm1.result.findings.filter((x) => x.severity === "error").slice(0, 8)) console.log("   ", f.code, f.element, f.message.slice(0, 90));
await call("add_hollow_volume", { bounds: { from: [-4, 23, -4], to: [4, 31, 4] }, wall_thickness: 1, open_faces: ["down"], name: "helmet", parent: "bip_head" });
await call("generate_array", { mode: "linear", count: 5, element_size: [1, 2, 1], start: [-4, 12, 2.5], end: [4, 12, 2.5], anchor: "bottom", depth_stagger: 0.1, name_prefix: "spike", parent: "bip_body" });
await call("extrude_chain", { segments: 3, base_origin: [0, 13, 2.5], segment_length: 1.5, initial_size: [1.2, 1.2], taper: 0.6, direction: "back", name: "tail", parent: "bip_body" });
const cm2 = await call("check_model");
console.log("\n加完生成器后 check_model errors:", cm2.result.summary.errors, "warns:", cm2.result.summary.warns);
for (const f of cm2.result.findings.filter((x) => x.severity === "error").slice(0, 8)) console.log("   ", f.code, f.element, f.message.slice(0, 100));
console.log("\n=== updateSelection 是否存在 ===");
await call("set_setting", { id: "bbmcp_allow_execute_script", value: true });
console.log(JSON.stringify((await call("execute_script", { code: "return { globalUpdateSelection: typeof updateSelection, canvasUpdateSelection: typeof Canvas.updateSelection, canvasUpdateSelected: typeof Canvas.updateSelected }" })).result?.result));
await call("set_setting", { id: "bbmcp_allow_execute_script", value: false });

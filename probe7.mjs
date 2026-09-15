const TOKEN = (process.env.BBMCP_TOKEN ?? "").trim();
const URL_ = "http://127.0.0.1:39742/mcp";
let seq = 0;
async function call(name, args = {}) {
  const r = await fetch(URL_, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ jsonrpc: "2.0", id: ++seq, method: "tools/call", params: { name, arguments: args } }) });
  const b = await r.json();
  const p = JSON.parse(b.result?.content?.[0]?.text ?? "{}");
  return { ok: p.ok, result: p.result, error: p.error };
}
const script = async (code) => (await call("execute_script", { code })).result?.result;
await call("set_setting", { id: "bbmcp_allow_execute_script", value: true });

const info = async (label) => {
  const r = await script(`
    const e = Undo.history[Undo.index - 1];
    return {
      label: '${label}',
      index: Undo.index, histLen: Undo.history.length,
      action: String(e?.action ?? ''),
      postElementKeys: e ? Object.keys(e.post.elements || {}).length : -1,
      postOutlinerHasCube: e ? JSON.stringify(e.post.outliner || '').includes('${label}') : null,
      cubes: Cube.all.length, root: Outliner.root.length, projectElements: Project.elements?.length ?? null,
    };
  `);
  return r;
};

console.log("--- 场景 1:cube 建在 root ---");
console.log(JSON.stringify(await info("before1")));
await call("apply_geometry_batch", { create_cubes: [{ name: "rootprobe", from: [0, 60, 0], to: [1, 61, 1] }] });
console.log(JSON.stringify(await info("rootprobe")));
console.log(JSON.stringify(await script("const c=Cube.all.length; Undo.undo(false); Canvas.updateAll(); return { cubesBefore: c, cubesAfter: Cube.all.length, index: Undo.index }")));

console.log("\n--- 场景 2:cube 建在组里 ---");
await call("apply_geometry_batch", { create_groups: [{ name: "probeGrp", origin: [0, 62, 0] }] });
console.log(JSON.stringify(await info("groupOnly")));
await call("apply_geometry_batch", { create_cubes: [{ name: "groupprobe", from: [0, 62, 0], to: [1, 63, 1], parent: "probeGrp" }] });
console.log(JSON.stringify(await info("groupprobe")));
console.log(JSON.stringify(await script("const c=Cube.all.length; Undo.undo(false); Canvas.updateAll(); return { cubesBefore: c, cubesAfter: Cube.all.length, index: Undo.index }")));

await call("set_setting", { id: "bbmcp_allow_execute_script", value: false });

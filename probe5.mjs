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

// 用工具正常加一个 cube(会推入 undo 条目)
await call("apply_geometry_batch", { create_cubes: [{ name: "undo_x", from: [0, 48, 0], to: [1, 49, 1], parent: "body" }] });

console.log("=== 条目已推入? ===");
console.log(JSON.stringify(await script(`
  const last = Undo.history[Undo.history.length - 1];
  return { historyLen: Undo.history.length, lastAction: String(last?.action), index: Undo.index, cubes: Cube.all.length };
`)));

console.log("=== 三种 undo 调用方式 ===");
for (const [label, code] of [
  ["undo(false)", "Undo.undo(false);"],
  ["undo() 无参", "Undo.undo();"],
  ["undo(true)", "Undo.undo(true);"],
]) {
  const r = await script(`
    const before = Cube.all.length;
    const histBefore = Undo.history.length;
    let err = null;
    try { ${code} } catch (e) { err = String((e && e.message) || e); }
    Canvas.updateAll();
    return { label: '${label}', cubesBefore: before, cubesAfter: Cube.all.length, histBefore, histAfter: Undo.history.length, index: Undo.index, err };
  `);
  console.log(JSON.stringify(r));
  // 每次测试后重新加回来,保持状态一致
  const has = await call("get_project_summary");
  if (!has.result.outliner.some((e) => e.name === "undo_x"))
    await call("apply_geometry_batch", { create_cubes: [{ name: "undo_x", from: [0, 48, 0], to: [1, 49, 1], parent: "body" }] });
}

await call("set_setting", { id: "bbmcp_allow_execute_script", value: false });

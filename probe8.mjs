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

console.log("=== Undo 与 Project.undo 是不是同一个对象 ===");
console.log(JSON.stringify(await script(`
  return {
    sameObject: Undo === Project.undo,
    sameHistory: Undo.history === Project.undo?.history,
    undoIndex: Undo.index,
    projectUndoIndex: Project.undo?.index ?? null,
    undoKeys: Object.keys(Undo).join(','),
    projectUndoKeys: Object.keys(Project.undo || {}).join(','),
    hasBarItemUndo: !!BarItems.undo,
  };
`), null, 1));

console.log("\n=== 三种撤销方式对照(每次都新加一根 cube)===");
console.log(JSON.stringify(await script(`
  const out = [];
  const addCube = (name) => { const c = new Cube({ name, from: [0, 64, 0], to: [1, 65, 1] }).init(); c.addTo('root'); Canvas.updateAll(); return c; };
  const measure = (fn, label) => {
    Undo.initEdit({ outliner: true, elements: [] });
    const c = addCube('undo_' + label);
    Undo.finishEdit('add ' + label, { outliner: true, elements: [c] });
    const before = Cube.all.length;
    let err = null;
    try { fn(); } catch (e) { err = String((e && e.message) || e); }
    Canvas.updateAll();
    out.push({ label, before, after: Cube.all.length, index: Undo.index, err });
  };
  measure(() => Undo.undo(false), 'global_false');
  measure(() => Undo.undo(true), 'global_true');
  measure(() => Project.undo.undo(false), 'project_false');
  measure(() => BarItems.undo.click(), 'action_click');
  return { results: JSON.stringify(out) };
`), null, 1));

await call("set_setting", { id: "bbmcp_allow_execute_script", value: false });

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

console.log("=== 快照里到底有没有那根新 cube ===");
console.log(JSON.stringify(await script(`
  const entry = Undo.history[Undo.history.length - 1];
  const before = JSON.stringify(entry.before.outliner || '').length;
  const post = JSON.stringify(entry.post.outliner || '').length;
  return {
    action: String(entry.action),
    beforeOutlinerLen: before,
    postOutlinerLen: post,
    beforeOutlinerHasUndoX: JSON.stringify(entry.before.outliner || '').includes('undo_x'),
    postOutlinerHasUndoX: JSON.stringify(entry.post.outliner || '').includes('undo_x'),
    postElementsKeys: Object.keys(entry.post.elements || {}).length,
    rootLen: Outliner.root.length,
    cubes: Cube.all.length,
    projectElements: Project.elements?.length ?? null,
  };
`), null, 1));

console.log("\n=== V1: init{outliner,elements:[]} + finish{outliner,elements:[cube]} ===");
console.log(JSON.stringify(await script(`
  const out = [];
  const run = (label, initA, finishA) => {
    const h0 = Undo.history.length, c0 = Cube.all.length;
    Undo.initEdit(initA);
    const cube = new Cube({ name: 'probe_' + label, from: [0, 50, 0], to: [1, 51, 1] }).init();
    cube.addTo('root');
    Canvas.updateAll();
    Undo.finishEdit('probe ' + label, finishA);
    const h1 = Undo.history.length, c1 = Cube.all.length;
    Undo.undo(false);
    Canvas.updateAll();
    out.push({ label, pushed: h1 > h0, cubes: [c0, c1, Cube.all.length], root: Outliner.root.length, idx: Undo.index });
  };
  run('V1', { outliner: true, elements: [] }, { outliner: true, elements: null });
  return { results: JSON.stringify(out) };
`), null, 1));

console.log("\n=== V2: 创建后把 cube 放进 finish 的 elements(真实引用)===");
console.log(JSON.stringify(await script(`
  const out = [];
  const h0 = Undo.history.length, c0 = Cube.all.length;
  Undo.initEdit({ outliner: true, elements: [] });
  const cube = new Cube({ name: 'probe_V2', from: [0, 52, 0], to: [1, 53, 1] }).init();
  cube.addTo('root');
  Canvas.updateAll();
  const hMid = Undo.history.length;
  Undo.finishEdit('probe V2', { outliner: true, elements: [cube] });
  const h1 = Undo.history.length, c1 = Cube.all.length;
  const entry = Undo.history[Undo.history.length - 1];
  const info = {
    pushed: h1 > h0, histMid: hMid, cubes: [c0, c1],
    postHasCube: Object.keys(entry.post.elements || {}).includes(cube.uuid),
    postOutlinerHasCube: JSON.stringify(entry.post.outliner || '').includes('probe_V2'),
    beforeHasCube: JSON.stringify(entry.before.outliner || '').includes('probe_V2'),
  };
  Undo.undo(false);
  Canvas.updateAll();
  info.cubesAfterUndo = Cube.all.length;
  info.rootAfterUndo = Outliner.root.length;
  info.idx = Undo.index;
  return info;
`), null, 1));

await call("set_setting", { id: "bbmcp_allow_execute_script", value: false });

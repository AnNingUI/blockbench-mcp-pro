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
const script = (code) => call("execute_script", { code });
await call("set_setting", { id: "bbmcp_allow_execute_script", value: true });

log("=== animator 的通道数组到底叫什么 ===");
log(JSON.stringify((await script(`
  const leg = Group.all.find((g) => g.name === 'leg_right');
  const anim = Animation.all.find((a) => a.name === 'animation.walk');
  const an = anim.getBoneAnimator(leg);
  return {
    keys: Object.keys(an).filter((k) => Array.isArray(an[k])),
    rotation: an.rotation?.length ?? null,
    rotations: an.rotations?.length ?? null,
    position: an.position?.length ?? null,
    scale: an.scale?.length ?? null,
    firstKey: an.rotation?.[0] ? { time: an.rotation[0].time, dp: an.rotation[0].data_points } : null,
  };
`)).result?.result));

log("\n=== Undo 的内部状态 ===");
log(JSON.stringify((await script(`
  const out = {};
  out.undoKeys = Object.keys(Undo);
  out.historyProps = { has_history: Array.isArray(Undo.history), history_len: Undo.history?.length ?? null, undo_stack_len: Undo.undo_stack?.length ?? null, redo_stack_len: Undo.redo_stack?.length ?? null };
  const before = Cube.all.length;
  out.before = before;
  Undo.initEdit({ outliner: true, elements: [] });
  const c = new Cube({ name: 'probeC', from: [0, 44, 0], to: [1, 45, 1] }).init();
  c.addTo('root');
  out.afterCreate = Cube.all.length;
  const entry = Undo.finishEdit('probe C');
  out.finishReturned = entry ? Object.keys(entry).slice(0, 8) : null;
  out.stackAfter = Undo.undo_stack?.length ?? Undo.history?.length ?? null;
  out.canUndo = typeof Undo.undo === 'function';
  return out;
`)).result?.result, null, 1));

log("\n=== 调 undo 之后 ===");
log(JSON.stringify((await script(`
  const before = Cube.all.length;
  let err = null;
  try { Undo.undo(false); } catch (e) { err = String(e && e.message || e); }
  return { cubesBefore: before, cubesAfter: Cube.all.length, err, stackAfter: Undo.undo_stack?.length ?? null, redoStack: Undo.redo_stack?.length ?? null };
`)).result?.result));

await call("set_setting", { id: "bbmcp_allow_execute_script", value: false });

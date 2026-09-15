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

console.log("=== animator 通道名(只返回基本类型)===");
console.log(JSON.stringify(await script(`
  const leg = Group.all.find((g) => g.name === 'leg_right');
  const anim = Animation.all.find((a) => a.name === 'animation.walk');
  const an = anim.getBoneAnimator(leg);
  const arrayKeys = Object.keys(an).filter((k) => Array.isArray(an[k]));
  const lens = {};
  for (const k of ['rotation','rotations','position','scale']) lens[k] = Array.isArray(an[k]) ? an[k].length : null;
  const first = Array.isArray(an.rotation) && an.rotation[0] ? an.rotation[0].time : null;
  return { arrayKeys: arrayKeys.join(','), lens: JSON.stringify(lens), firstTime: first };
`), null, 1));

console.log("\n=== 已有 3 条 undo 条目的结构 ===");
console.log(JSON.stringify(await script(`
  const out = [];
  for (const e of Undo.history) {
    out.push({
      action: String(e.action),
      type: String(e.type),
      beforeKeys: Object.keys(e.before || {}).join(','),
      postKeys: Object.keys(e.post || {}).join(','),
      beforeElements: Array.isArray(e.before?.elements) ? e.before.elements.length : null,
      postElements: Array.isArray(e.post?.elements) ? e.post.elements.length : null,
    });
  }
  return { count: Undo.history.length, entries: JSON.stringify(out) };
`), null, 1));

console.log("\n=== 三种 finishEdit 写法,看哪个会推入条目 ===");
console.log(JSON.stringify(await script(`
  const results = [];
  const tryVariant = (label, initAspects, finishAspects) => {
    const beforeLen = Undo.history.length;
    const beforeCubes = Cube.all.length;
    Undo.initEdit(initAspects);
    const c = new Cube({ name: 'probe_' + label, from: [0, 46, 0], to: [1, 47, 1] }).init();
    c.addTo('root');
    Canvas.updateAll();
    Undo.finishEdit('probe ' + label, finishAspects);
    const afterLen = Undo.history.length;
    Undo.undo(false);
    results.push({ label, pushed: afterLen > beforeLen, cubesBefore: beforeCubes, cubesAfterAdd: beforeCubes + 1, cubesAfterUndo: Cube.all.length });
  };
  tryVariant('A_outliner_plus_elements_finish', { outliner: true }, { outliner: true, elements: [] });
  tryVariant('B_empty_elements_init', { outliner: true, elements: [] }, undefined);
  tryVariant('C_elements_in_both', { outliner: true, elements: [] }, { outliner: true, elements: [] });
  return { results: JSON.stringify(results), historyLen: Undo.history.length };
`), null, 1));

await call("set_setting", { id: "bbmcp_allow_execute_script", value: false });

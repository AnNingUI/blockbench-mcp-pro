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

await call("set_setting", { id: "bbmcp_allow_execute_script", value: true });

log("=== 宿主选择相关 API 是否真的存在 ===");
const api = await call("execute_script", { code: "return { cubeSelect: typeof Cube.all[0]?.select, groupSelect: typeof Group.all[0]?.select, unselectAll: typeof unselectAll, updateSelected: typeof Canvas.updateSelected, updateAll: typeof Canvas.updateAll, updateView: typeof Canvas.updateView }" });
log(JSON.stringify(api.result?.result ?? api.error));

log("\n=== undo 的两种写法对照(直接用宿主 API)===");
const undoTest = await call("execute_script", {
  code: `
    const out = {};
    const count = () => Cube.all.length;
    // 变体 A:我们现在的写法(initEdit 只有 outliner,finishEdit 带 elements)
    const beforeA = count();
    Undo.initEdit({ outliner: true });
    const a = new Cube({ name: 'probeA', from: [0, 40, 0], to: [1, 41, 1] }).init();
    a.addTo('root');
    Undo.finishEdit('probe A', { outliner: true, elements: [a] });
    const afterAddA = count();
    Undo.undo(false);
    out.A = { before: beforeA, afterAdd: afterAddA, afterUndo: count() };
    // 变体 B:参考实现(initEdit 带 elements:[],finishEdit 不传 aspects)
    const beforeB = count();
    Undo.initEdit({ outliner: true, elements: [] });
    const b = new Cube({ name: 'probeB', from: [0, 42, 0], to: [1, 43, 1] }).init();
    b.addTo('root');
    Undo.finishEdit('probe B');
    const afterAddB = count();
    Undo.undo(false);
    out.B = { before: beforeB, afterAdd: afterAddB, afterUndo: count() };
    return out;
  `,
});
log(JSON.stringify(undoTest.result?.result ?? undoTest.error, null, 1));

log("\n=== 动画:select() 之后再写关键帧 ===");
const animTest = await call("execute_script", {
  code: `
    const out = {};
    const leg = Group.all.find((g) => g.name === 'leg_right');
    const anim = Animation.all.find((a) => a.name === 'animation.walk');
    if (!leg || !anim) return { note: '缺少 leg_right 或 animation.walk', groups: Group.all.map(g=>g.name), anims: Animation.all.map(a=>a.name) };
    const animator = anim.getBoneAnimator(leg);
    out.hasAnimator = !!animator;
    out.channelsBefore = animator ? Object.keys(animator).filter((k) => Array.isArray(animator[k])) : null;
    const before = animator ? (animator.rotations?.length ?? 0) : -1;
    const kf = animator.addKeyframe({ channel: 'rotation', time: 0.25, interpolation: 'linear', data_points: [{ x: 15, y: 0, z: 0 }] });
    out.keyframeCreated = !!kf;
    out.rotationsAfter = animator.rotations?.length ?? -1;
    out.before = before;
    // 再试:先 select 动画
    anim.select();
    const kf2 = animator.addKeyframe({ channel: 'rotation', time: 0.75, interpolation: 'linear', data_points: [{ x: -15, y: 0, z: 0 }] });
    out.afterSelectRotations = animator.rotations?.length ?? -1;
    out.kf2 = !!kf2;
    return out;
  `,
});
log(JSON.stringify(animTest.result?.result ?? animTest.error, null, 1));

await call("set_setting", { id: "bbmcp_allow_execute_script", value: false });

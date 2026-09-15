/** 动画工具 —— 包含方向正确的完整基础循环生成器 */
import { CommandError } from "../errors.js";
import { requireGroup, requireProject, withUndo } from "../bb.js";
import type { ToolHandler } from "../dispatch.js";

type Key = { time: number; value: [number, number, number]; interpolation?: "linear" | "catmullrom" | "step" };
type BoneChannels = { rotation?: Key[]; position?: Key[]; scale?: Key[] };
type CycleDefinition = Record<string, BoneChannels>;

type CycleType =
  | "idle"
  | "walk"
  | "run"
  | "attack"
  | "cast"
  | "jump"
  | "hurt"
  | "death"
  | "fly";

/**
 * 生成方向正确的基础循环。
 * 约定:模型面朝 -Z;+X 让下垂的肢体(手/腿)向前摆,肘 +X 弯,膝 -X 弯;+Y 转向自身左侧。
 */
function buildCycle(
  type: CycleType,
  bones: Record<string, string | undefined>,
  length: number,
  amplitude: number,
): { cycle: CycleDefinition; loop: "once" | "hold" | "loop"; notes: string[] } {
  const a = amplitude;
  const bonesOf = (name: string) => bones[name];
  const notes: string[] = [];
  const put = (
    cycle: CycleDefinition,
    bone: string | undefined,
    channel: "rotation" | "position",
    keys: Key[],
  ) => {
    if (!bone) return;
    cycle[bone] = cycle[bone] ?? {};
    cycle[bone][channel] = [...(cycle[bone][channel] ?? []), ...keys];
  };
  const k = (time: number, value: [number, number, number], interpolation: Key["interpolation"] = "catmullrom"): Key => ({
    time: Number(time.toFixed(4)),
    value,
    interpolation,
  });

  const cycle: CycleDefinition = {};
  const body = bonesOf("body");
  const head = bonesOf("head");
  const armL = bonesOf("arm_left");
  const armR = bonesOf("arm_right");
  const legL = bonesOf("leg_left");
  const legR = bonesOf("leg_right");
  const tail = bonesOf("tail");
  const wingL = bonesOf("wing_left");
  const wingR = bonesOf("wing_right");

  const bob = (amount: number, times: number[] = [0, 0.5, 1]) =>
    times.map((t) => k(t * length, [0, t === 0.5 ? amount : 0, 0]));

  switch (type) {
    case "idle": {
      put(cycle, body, "position", bob(0.35 * a));
      put(cycle, head, "rotation", [
        k(0, [2 * a, -3 * a, 0]),
        k(0.5 * length, [0, 3 * a, 0]),
        k(length, [2 * a, -3 * a, 0]),
      ]);
      put(cycle, armL, "rotation", [k(0, [2 * a, 0, 0]), k(0.5 * length, [-2 * a, 0, 0]), k(length, [2 * a, 0, 0])]);
      put(cycle, armR, "rotation", [k(0, [-2 * a, 0, 0]), k(0.5 * length, [2 * a, 0, 0]), k(length, [-2 * a, 0, 0])]);
      put(cycle, tail, "rotation", [k(0, [0, 6 * a, 0]), k(0.5 * length, [0, -6 * a, 0]), k(length, [0, 6 * a, 0])]);
      notes.push("Idle is a small body bob + head sway; keep it subtle so it never looks twitchy.");
      return { cycle, loop: "loop", notes };
    }
    case "walk":
    case "run": {
      const stride = (type === "run" ? 38 : 26) * a;
      const lean = type === "run" ? -12 * a : -4 * a;
      const armSwing = (type === "run" ? 34 : 22) * a;
      put(cycle, legL, "rotation", [k(0, [stride, 0, 0]), k(0.5 * length, [-stride, 0, 0]), k(length, [stride, 0, 0])]);
      put(cycle, legR, "rotation", [k(0, [-stride, 0, 0]), k(0.5 * length, [stride, 0, 0]), k(length, [-stride, 0, 0])]);
      put(cycle, armL, "rotation", [k(0, [-armSwing, 0, 0]), k(0.5 * length, [armSwing, 0, 0]), k(length, [-armSwing, 0, 0])]);
      put(cycle, armR, "rotation", [k(0, [armSwing, 0, 0]), k(0.5 * length, [-armSwing, 0, 0]), k(length, [armSwing, 0, 0])]);
      put(cycle, body, "position", [k(0, [0, 0, 0]), k(0.25 * length, [0, -0.4 * a, 0]), k(0.5 * length, [0, 0, 0]), k(0.75 * length, [0, -0.4 * a, 0]), k(length, [0, 0, 0])]);
      put(cycle, body, "rotation", [
        k(0, [lean, 0, 3 * a]),
        k(0.5 * length, [lean, 0, -3 * a]),
        k(length, [lean, 0, 3 * a]),
      ]);
      put(cycle, head, "rotation", [
        k(0, [-lean * 0.6, 4 * a, 0]),
        k(0.5 * length, [-lean * 0.6, -4 * a, 0]),
        k(length, [-lean * 0.6, 4 * a, 0]),
      ]);
      put(cycle, tail, "rotation", [k(0, [0, 8 * a, 0]), k(0.5 * length, [0, -8 * a, 0]), k(length, [0, 8 * a, 0])]);
      notes.push(
        type === "walk"
          ? "Walk: opposite-phase limbs, bent joints, small counter-rotation, seamless loop."
          : "Run: bigger stride, forward lean, more vertical bob — still seamless.",
      );
      return { cycle, loop: "loop", notes };
    }
    case "attack": {
      const swing = 70 * a;
      put(cycle, armR, "rotation", [
        k(0, [0, 0, 0], "step"),
        k(0.2 * length, [-25 * a, 0, 0]),
        k(0.45 * length, [swing, 0, 0]),
        k(0.65 * length, [swing * 0.6, 0, 0]),
        k(length, [0, 0, 0]),
      ]);
      put(cycle, armL, "rotation", [k(0, [0, 0, 0]), k(0.45 * length, [-15 * a, 0, 0]), k(length, [0, 0, 0])]);
      put(cycle, body, "rotation", [
        k(0, [0, 0, 0]),
        k(0.2 * length, [0, -14 * a, 0]),
        k(0.45 * length, [0, 20 * a, 0]),
        k(length, [0, 0, 0]),
      ]);
      put(cycle, body, "position", [k(0, [0, 0, 0]), k(0.45 * length, [0, -0.3 * a, -0.6 * a]), k(length, [0, 0, 0])]);
      put(cycle, head, "rotation", [k(0, [0, 0, 0]), k(0.45 * length, [6 * a, 10 * a, 0]), k(length, [0, 0, 0])]);
      notes.push("Attack swings the right arm FORWARD (+X) with body counter-twist and follow-through.");
      return { cycle, loop: "once", notes };
    }
    case "cast": {
      put(cycle, armR, "rotation", [k(0, [0, 0, 0]), k(0.3 * length, [-80 * a, 0, -20 * a]), k(0.6 * length, [-70 * a, 0, -15 * a]), k(length, [0, 0, 0])]);
      put(cycle, armL, "rotation", [k(0, [0, 0, 0]), k(0.3 * length, [-80 * a, 0, 20 * a]), k(0.6 * length, [-70 * a, 0, 15 * a]), k(length, [0, 0, 0])]);
      put(cycle, body, "rotation", [k(0, [0, 0, 0]), k(0.3 * length, [-10 * a, 0, 0]), k(length, [0, 0, 0])]);
      put(cycle, head, "rotation", [k(0, [0, 0, 0]), k(0.3 * length, [-12 * a, 0, 0]), k(length, [0, 0, 0])]);
      notes.push("Cast raises both arms and leans back, then settles with follow-through.");
      return { cycle, loop: "once", notes };
    }
    case "jump": {
      put(cycle, body, "position", [
        k(0, [0, 0, 0]),
        k(0.25 * length, [0, -1.2 * a, 0]),
        k(0.55 * length, [0, 3 * a, 0]),
        k(length, [0, 0, 0]),
      ]);
      put(cycle, legL, "rotation", [k(0, [0, 0, 0]), k(0.25 * length, [-30 * a, 0, 0]), k(0.55 * length, [25 * a, 0, 0]), k(length, [0, 0, 0])]);
      put(cycle, legR, "rotation", [k(0, [0, 0, 0]), k(0.25 * length, [-30 * a, 0, 0]), k(0.55 * length, [25 * a, 0, 0]), k(length, [0, 0, 0])]);
      put(cycle, armL, "rotation", [k(0, [0, 0, 0]), k(0.55 * length, [-50 * a, 0, 0]), k(length, [0, 0, 0])]);
      put(cycle, armR, "rotation", [k(0, [0, 0, 0]), k(0.55 * length, [-50 * a, 0, 0]), k(length, [0, 0, 0])]);
      notes.push("Jump crouches then springs; both legs bend the same way (knees -X).");
      return { cycle, loop: "once", notes };
    }
    case "hurt": {
      put(cycle, body, "rotation", [k(0, [0, 0, 0], "step"), k(0.15 * length, [-16 * a, 0, 0]), k(0.5 * length, [4 * a, 0, 0]), k(length, [0, 0, 0])]);
      put(cycle, head, "rotation", [k(0, [0, 0, 0], "step"), k(0.15 * length, [-20 * a, 8 * a, 0]), k(length, [0, 0, 0])]);
      put(cycle, armL, "rotation", [k(0, [0, 0, 0]), k(0.15 * length, [-30 * a, 0, 0]), k(length, [0, 0, 0])]);
      put(cycle, armR, "rotation", [k(0, [0, 0, 0]), k(0.15 * length, [-30 * a, 0, 0]), k(length, [0, 0, 0])]);
      return { cycle, loop: "once", notes };
    }
    case "death": {
      put(cycle, body, "rotation", [k(0, [0, 0, 0]), k(0.4 * length, [-20 * a, 0, 40 * a]), k(length, [-85 * a, 0, 85 * a])]);
      put(cycle, body, "position", [k(0, [0, 0, 0]), k(length, [0, -6 * a, 0])]);
      put(cycle, head, "rotation", [k(0, [0, 0, 0]), k(length, [-30 * a, 20 * a, 0])]);
      put(cycle, armL, "rotation", [k(0, [0, 0, 0]), k(length, [-40 * a, 0, 0])]);
      put(cycle, armR, "rotation", [k(0, [0, 0, 0]), k(length, [-40 * a, 0, 0])]);
      notes.push("Death is a fall to the model's side (rotation z) with collapse; loop 'hold'.");
      put(cycle, legL, "rotation", [k(0, [0, 0, 0]), k(length, [-25 * a, 0, 0])]);
      put(cycle, legR, "rotation", [k(0, [0, 0, 0]), k(length, [-25 * a, 0, 0])]);
      return { cycle, loop: "hold", notes };
    }
    case "fly": {
      const flap = 55 * a;
      put(cycle, wingL, "rotation", [
        k(0, [0, 0, -flap]),
        k(0.5 * length, [0, 0, flap]),
        k(length, [0, 0, -flap]),
      ]);
      put(cycle, wingR, "rotation", [k(0, [0, 0, flap]), k(0.5 * length, [0, 0, -flap]), k(length, [0, 0, flap])]);
      put(cycle, body, "position", [k(0, [0, 0.8 * a, 0]), k(0.5 * length, [0, -0.8 * a, 0]), k(length, [0, 0.8 * a, 0])]);
      put(cycle, head, "rotation", [k(0, [-6 * a, 0, 0]), k(length, [-6 * a, 0, 0])]);
      put(cycle, legL, "rotation", [k(0, [-20 * a, 0, 0]), k(length, [-20 * a, 0, 0])]);
      put(cycle, legR, "rotation", [k(0, [-20 * a, 0, 0]), k(length, [-20 * a, 0, 0])]);
      notes.push("Fly flaps the wings in opposite z signs so the pair beats symmetrically; legs tuck.");
      return { cycle, loop: "loop", notes };
    }
    default:
      throw new CommandError("E_INVALID_PARAM", `Unknown animation type: ${type}`);
  }
}

function requireAnimations(): void {
  if (!Array.isArray(Animation.all))
    throw new CommandError(
      "E_UNSUPPORTED_FORMAT",
      "Animations are unavailable in this format/plugin set. Create a bedrock or geckolib_model project.",
    );
}

function findAnimation(name: string): _Animation {
  requireProject();
  requireAnimations();
  const animation = Animation.all.find((item) => item.name === name);
  if (!animation)
    throw new CommandError("E_NOT_FOUND", `Animation not found: ${name}. Call list_animations.`);
  return animation;
}

function writeChannels(
  animation: any,
  bones: Array<{ group: any; channels: BoneChannels }>,
): number {
  let keyframes = 0;
  for (const { group, channels } of bones) {
    const animator = animation.getBoneAnimator(group);
    if (!animator)
      throw new CommandError("E_BLOCKBENCH_ERROR", `Cannot create an animator for bone: ${group.name}`);
    for (const channel of ["rotation", "position", "scale"] as const) {
      for (const key of channels[channel] ?? []) {
        animator.addKeyframe({
          channel,
          time: key.time,
          interpolation: key.interpolation ?? "linear",
          data_points: [{ x: key.value[0], y: key.value[1], z: key.value[2] }],
        });
        keyframes += 1;
      }
    }
  }
  return keyframes;
}

function replaceAnimation(
  name: string,
  length: number,
  loop: "once" | "hold" | "loop",
  replace?: boolean,
) {
  const existing = Animation.all.find((animation) => animation.name === name);
  if (existing && replace !== true)
    throw new CommandError(
      "E_INVALID_PARAM",
      `Animation "${name}" already exists; pass replace:true to overwrite it.`,
    );
  if (existing) existing.remove(false, true);
  const created = new Animation({ name, length, loop });
  created.add(false);
  created.setLength(length);
  return created;
}

export const animationTools: Record<string, ToolHandler> = {
  upsert_animation: (args: any) => {
    requireProject();
    const bones = Object.entries(args?.bones ?? {}).map(([ref, channels]) => ({
      group: requireGroup(ref),
      channels: channels as BoneChannels,
    }));
    return withUndo(
      { animations: [], keyframes: [] },
      `upsert_animation ${args.name}`,
      (track) => {
        const animation = replaceAnimation(args.name, args.length, args.loop ?? "loop", args.replace);
        track.addAnimations([animation]);
        const keyframes = writeChannels(animation, bones);
        return { ok: true, undo_label: `upsert_animation ${args.name}`, name: args.name, keyframes };
      },
    );
  },

  generate_animation: (args: any) => {
    requireProject();
    const type = args?.type as CycleType;
    const amplitude = args?.amplitude ?? 1;
    const defaults: Record<string, number> = {
      idle: 1.6,
      walk: 1.2,
      run: 0.9,
      attack: 0.8,
      cast: 1,
      jump: 1,
      hurt: 0.6,
      death: 1.4,
      fly: 1.2,
    };
    const length = args?.length ?? defaults[type] ?? 1;
    const name = args?.name ?? `animation.${type}`;

    // 骨骼引用:显式给出优先,否则按名字推断
    const explicit = args?.bones ?? {};
    const infer = (patterns: RegExp[]) =>
      (Group?.all ?? []).find((g: any) => patterns.some((p) => p.test(g.name)))?.name;
    const bones = {
      body: explicit.body ?? infer([/^(body|torso|chest)$/i, /body/i]),
      head: explicit.head ?? infer([/head/i]),
      arm_left: explicit.arm_left ?? infer([/arm.*left|left.*arm/i]),
      arm_right: explicit.arm_right ?? infer([/arm.*right|right.*arm/i]),
      leg_left: explicit.leg_left ?? infer([/leg.*left|left.*leg/i]),
      leg_right: explicit.leg_right ?? infer([/leg.*right|right.*leg/i]),
      tail: explicit.tail ?? infer([/tail/i]),
      wing_left: explicit.wing_left ?? infer([/wing.*left|left.*wing/i]),
      wing_right: explicit.wing_right ?? infer([/wing.*right|right.*wing/i]),
    };
    const { cycle, loop, notes } = buildCycle(type, bones, length, amplitude);
    const resolved = Object.entries(cycle)
      .map(([ref, channels]) => ({ group: requireGroup(ref), channels }))
      .filter((entry) => Object.values(entry.channels).some((keys) => (keys ?? []).length));
    if (!resolved.length)
      throw new CommandError(
        "E_NOT_FOUND",
        `No matching bones for a "${type}" cycle. Build the rig first (scaffold_biped), or pass bones:{body:'body', head:'head', ...}.`,
      );
    return withUndo({ animations: [], keyframes: [] }, `generate_animation ${name}`, (track) => {
      const animation = replaceAnimation(name, length, loop, args?.replace);
      track.addAnimations([animation]);
      const keyframes = writeChannels(animation, resolved);
      return {
        ok: true,
        undo_label: `generate_animation ${name}`,
        name,
        type,
        length,
        loop,
        bones: resolved.map((r) => r.group.name),
        keyframes,
        notes: [...notes, "Now set_timeline_time and capture_views to actually LOOK at the cycle."],
      };
    });
  },

  inspect_animation: (args: { name: string }) => {
    const animation = findAnimation(args?.name);
    const bones = Object.entries(animation.animators ?? {}).map(([id, animator]) => ({
      id,
      name: animator.group?.name ?? id,
      channels: Object.fromEntries(
        (["rotation", "position", "scale"] as const).map((channel) => [
          channel,
          (animator[channel] ?? []).map((key: any) => ({
            time: Number(key.time),
            // 真机实测:Blockbench 的 data_points 可能是字符串,统一成数字
            value: key.data_points?.[0]
              ? [
                  Number(key.data_points[0].x),
                  Number(key.data_points[0].y),
                  Number(key.data_points[0].z),
                ]
              : null,
            interpolation: key.interpolation,
          })),
        ]),
      ),
    }));
    return {
      name: animation.name,
      length: animation.length,
      loop: animation.loop,
      bones,
      summary: {
        bones: bones.length,
        keyframes: bones.reduce(
          (sum, bone) =>
            sum + Object.values(bone.channels).reduce((n, keys) => n + (keys as unknown[]).length, 0),
          0,
        ),
      },
    };
  },

  transform_animation_keys: (args: any) => {
    const animation = findAnimation(args?.name);
    const wanted = args?.bones ? new Set(args.bones) : null;
    const selected = Object.entries(animation.animators ?? {}).filter(
      ([id, animator]) =>
        !wanted || wanted.has(id) || (animator.group?.name && wanted.has(animator.group.name)),
    );
    if (wanted && !selected.length)
      throw new CommandError("E_NOT_FOUND", "None of the requested bones have keys in this animation.");
    const axisIndex = args?.mirror_axis === "x" ? 0 : args?.mirror_axis === "y" ? 1 : 2;
    return withUndo({ animations: [animation], keyframes: [] }, `transform_animation_keys ${args.name}`, () => {
      let updated = 0;
      for (const [, animator] of selected) {
        for (const channel of ["rotations", "position", "scale"] as const) {
          for (const key of animator[channel] ?? []) {
            key.time = Math.max(
              0,
              key.time * (args?.time_scale ?? 1) + (args?.time_offset ?? 0),
            );
            for (const point of key.data_points ?? []) {
              const values = [point.x, point.y, point.z];
              for (let i = 0; i < 3; i += 1) values[i] *= args?.value_scale?.[i] ?? 1;
              if (args?.mirror_axis) {
                if (channel === "position") values[axisIndex] *= -1;
                else if (channel === "rotations") {
                  for (let i = 0; i < 3; i += 1) if (i !== axisIndex) values[i] *= -1;
                }
              }
              [point.x, point.y, point.z] = values;
            }
            updated += 1;
          }
        }
      }
      if (args?.time_scale !== undefined || args?.time_offset !== undefined)
        animation.length = Math.max(
          0.001,
          animation.length * (args?.time_scale ?? 1) + (args?.time_offset ?? 0),
        );
      return {
        ok: true,
        undo_label: `transform_animation_keys ${args.name}`,
        updated_keyframes: updated,
        length: animation.length,
      };
    });
  },

  delete_animation: (args: { name: string }) => {
    const animation = findAnimation(args?.name);
    return withUndo({ animations: [animation] }, `delete_animation ${args.name}`, () => {
      animation.remove(false, true);
      return { ok: true, undo_label: `delete_animation ${args.name}`, deleted: args.name };
    });
  },

  set_timeline_time: async (args: { time: number; animation?: string }) => {
    requireProject();
    // 真机实测(5.1.6):只调 Timeline.setTime 是**空操作** —— 渲染仍是 rest pose。
    // 必须按 Blockbench 自己的顺序做:
    //   ① 切到 animate 模式  ② 选中骨骼(时间轴只装载"被选中元素"的 animator!)
    //   ③ 选动画 ④ Timeline.setup() ⑤ setTime ⑥ Animator.preview() ⑦ 重绘
    const previousMode = (Modes.selected as { id?: string } | undefined)?.id ?? null;
    const animateMode = (Modes.options as unknown as Record<string, { select?: () => void } | undefined>)
      .animate;
    animateMode?.select?.();

    if (typeof unselectAll === "function") unselectAll();
    for (const group of Group.all) group.select?.();

    const animation = args?.animation ? findAnimation(args.animation) : undefined;
    animation?.select();
    (Timeline as unknown as { setup?: () => void }).setup?.();
    // Timeline 的装载是 Vue 驱动的,要等一个 tick 才会填好 animators
    await new Promise((resolve) => setTimeout(resolve, 120));

    Timeline.setTime(args?.time ?? 0);
    (globalThis as { Animator?: { preview?: () => void } }).Animator?.preview?.();
    Canvas.updateAll();

    const loaded = (Timeline as unknown as { animators?: unknown[] }).animators?.length ?? 0;
    return {
      ok: true,
      time: args?.time ?? 0,
      animation: args?.animation ?? animation?.name ?? null,
      previous_mode: previousMode,
      animators_loaded: loaded,
      note:
        loaded > 0
          ? "Posed. capture_views now renders this frame. The editor was switched to animate mode and the bones selected (that is what loads the timeline) — use set_mode {id:'edit'} to go back."
          : "No animator loaded — check that the animation has keys for these bones (inspect_animation) and that this format supports animations.",
    };
  },
};

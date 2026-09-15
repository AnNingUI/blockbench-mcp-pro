/** 几何工具 —— 组装 / 编辑 / 变换 / 镜像 / 阵列 / 肢体 / 骨架 / 测量 */
import {
  auditSymmetry as auditSymmetryPure,
  checkModel as checkModelPure,
  composeRotation,
  measureModel as measureModelPure,
  planUvPack,
  type SymmetrySide,
  type Vec3,
} from "@bbmcp/shared";
import { CommandError } from "../errors.js";
import {
  assertSide,
  findCube,
  findElement,
  materialize,
  parentOf,
  refreshCanvas,
  requireCube,
  requireElement,
  requireGroup,
  requireProject,
  resolveUvMode,
  sideSuffix,
  snapshotElements,
  uvIslands,
  withUndo,
} from "../bb.js";
import { createTexture, findTexture } from "../host.js";
import type { ToolHandler } from "../dispatch.js";

function descendants(root: any): any[] {
  const out: any[] = [];
  const visit = (node: any) => {
    out.push(node);
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return out;
}

type V3 = [number, number, number];

/** Blockbench 的几何字段是定长元组,统一在这里收窄(比到处写 as 更清楚) */
const v3 = (value: number[]): V3 => [value[0], value[1], value[2]];
const v2 = (value: number[]): [number, number] => [value[0], value[1]];
const v4 = (value: number[]): [number, number, number, number] => [
  value[0],
  value[1],
  value[2],
  value[3],
];

const DEFAULT_SKIN = "#8a8a8a";

export const geometryTools: Record<string, ToolHandler> = {
  apply_geometry_batch: (args: any) => materialize(args ?? {}),

  update_elements: (args: { updates: any[]; uv_policy?: "preserve" | "auto" }) => {
    requireProject();
    const label = "update_elements";
    const resolved = (args?.updates ?? []).map((update) => {
      const element = requireElement(update.ref);
      if (update.parent !== undefined && !element.from) {
        const target = update.parent === "root" ? null : requireGroup(update.parent);
        let cursor = target;
        let guard = 0;
        while (cursor && guard < 64) {
          if (cursor.uuid === element.uuid)
            throw new CommandError(
              "E_INVALID_PARAM",
              `Reparenting ${element.name} would create a cycle.`,
            );
          cursor = cursor.parent && cursor.parent !== "root" && typeof cursor.parent !== "string"
            ? cursor.parent
            : null;
          guard += 1;
        }
      }
      // 注意方向:cube 有 from/to,group 没有 —— 给 group 传 from/to/inflate 才该报错。
      // (原来这行写反了,导致任何 cube 的 resize 都被拒绝;真机 resize 头部时才暴露)
      if (!element.from && (update.from || update.to || update.inflate !== undefined)) {
        throw new CommandError(
          "E_INVALID_PARAM",
          `"${element.name}" is a group/bone, which does not support from/to/inflate.`,
        );
      }
      return { update, element };
    });
    const elements = [...new Set(resolved.map((r) => r.element))];
    return withUndo({ outliner: true, elements }, label, () => {
      for (const { update, element } of resolved) {
        if (update.name !== undefined) element.name = update.name;
        if (update.origin !== undefined) element.origin = [...update.origin];
        if (update.rotation !== undefined) element.rotation = [...update.rotation];
        if (update.visibility !== undefined) element.visibility = update.visibility;
        if (element.from) {
          const dimensioned = update.from !== undefined || update.to !== undefined;
          if (update.from !== undefined) element.from = [...update.from];
          if (update.to !== undefined) element.to = [...update.to];
          if (update.inflate !== undefined) element.inflate = update.inflate;
          if (dimensioned && args?.uv_policy === "auto") {
            element.autouv = 1;
            element.mapAutoUV?.();
          }
        }
        if (update.parent !== undefined) element.addTo(parentOf(update.parent));
      }
      refreshCanvas(elements.map((e) => ({ uuid: e.uuid })));
      return { ok: true, undo_label: label, updated: elements.map((e) => e.uuid) };
    });
  },

  delete_elements: (args: { refs: string[] }) => materialize({ delete_refs: args.refs, undo_label: "delete_elements" }),

  transform_elements: (args: any) => {
    requireProject();
    const rotate = (args?.rotate ?? [0, 0, 0]) as Vec3;
    const scale = (args?.scale ?? [1, 1, 1]) as Vec3;
    const translate = (args?.translate ?? [0, 0, 0]) as Vec3;
    const pivot = (args?.pivot ?? [0, 0, 0]) as Vec3;
    if (scale.some((v) => v <= 0))
      throw new CommandError("E_INVALID_PARAM", "Scale components must be positive; use mirror_elements to reflect.");
    const selected: any[] = [
      ...new Set((args?.refs ?? []).map((ref: string) => requireElement(ref))),
    ];
    const roots: any[] = selected.filter((element: any) => {
      let parent = element.parent;
      let guard = 0;
      while (parent && parent !== "root" && guard < 64) {
        if (selected.includes(parent)) return false;
        parent = typeof parent === "string" ? findElement(parent)?.parent : parent.parent;
        guard += 1;
      }
      return true;
    });
    const trees = roots.map((root: any) => ({ root, nodes: descendants(root) }));
    const nodes = trees.flatMap((tree) => tree.nodes);
    const uniform = Math.abs(scale[0] - scale[1]) < 1e-8 && Math.abs(scale[0] - scale[2]) < 1e-8;
    // 非均匀缩放 + 任何旋转(组的或 cube 的)都会产生剪切,立方体表达不了。
    // 原来只检查 cube 自身的 rotation,漏掉了"旋转的骨骼组"(真机用 head 组做非均匀缩放到才暴露)。
    const anyRotated = nodes.some((node: any) =>
      (node.rotation ?? []).some((value: number) => Math.abs(value) > 1e-8),
    );
    if (!uniform && anyRotated)
      throw new CommandError(
        "E_INVALID_PARAM",
        "Non-uniform scaling of rotated geometry (a bone group or a cube) would introduce shear; use a uniform scale or reset the rotation first.",
      );
    const radial = (point: number[]) => {
      let [x, y, z] = [point[0] - pivot[0], point[1] - pivot[1], point[2] - pivot[2]];
      for (let axis = 0; axis < 3; axis += 1) {
        const deg = rotate[axis] ?? 0;
        if (!deg) continue;
        const r = (deg * Math.PI) / 180;
        const c = Math.cos(r);
        const s = Math.sin(r);
        if (axis === 0) [y, z] = [y * c - z * s, y * s + z * c];
        else if (axis === 1) [x, z] = [x * c + z * s, -x * s + z * c];
        else [x, y] = [x * c - y * s, x * s + y * c];
      }
      return [x + pivot[0], y + pivot[1], z + pivot[2]];
    };
    return withUndo({ outliner: true, elements: nodes }, "transform_elements", () => {
      for (const { root, nodes: treeNodes } of trees) {
        const anchor: number[] = [...root.origin];
        const scaledAnchor = anchor.map((v, i) => pivot[i] + (v - pivot[i]) * scale[i]);
        const nextAnchor = radial(scaledAnchor).map((v, i) => v + translate[i]);
        for (const node of treeNodes) {
          const move = (point: number[]) =>
            point.map((v, i) => nextAnchor[i] + (v - anchor[i]) * scale[i]) as Vec3;
          node.origin = move(node.origin);
          if (node.from) {
            if (!uniform && node.rotation?.some((v: number) => Math.abs(v) > 1e-8))
              throw new CommandError(
                "E_INVALID_PARAM",
                "Non-uniform scaling of rotated geometry would introduce shear; use a uniform scale.",
              );
            node.from = move(node.from);
            node.to = move(node.to);
            if (uniform) node.inflate = (node.inflate ?? 0) * scale[0];
            if (args?.uv_policy === "auto") {
              node.autouv = 1;
              node.mapAutoUV?.();
            }
          }
        }
        root.rotation = composeRotation((root.rotation ?? [0, 0, 0]) as Vec3, rotate);
      }
      refreshCanvas(nodes.map((n) => ({ uuid: n.uuid })));
      return { ok: true, undo_label: "transform_elements", updated: nodes.map((n) => n.uuid) };
    });
  },

  mirror_elements: (args: { refs: string[]; axis?: "x" | "y" | "z"; pivot?: number; rename?: boolean }) => {
    requireProject();
    const axis = args?.axis ?? "x";
    const ai = axis === "x" ? 0 : axis === "y" ? 1 : 2;
    const pivot = args?.pivot ?? 0;
    const sources = args.refs.map((ref) => requireElement(ref));
    const boxUv = resolveUvMode() === "box";
    const texture = findTexture();
    const swap = (name: string) => {
      if (/right/i.test(name)) return name.replace(/right/gi, "left");
      if (/left/i.test(name)) return name.replace(/left/gi, "right");
      if (/_r\b/i.test(name)) return name.replace(/_r\b/i, "_l");
      if (/_l\b/i.test(name)) return name.replace(/_l\b/i, "_r");
      return `${name}_mirrored`;
    };
    return withUndo({ outliner: true }, "mirror_elements", (track) => {
      const created: Array<{ uuid: string; name: string; type: string }> = [];
      for (const source of sources) {
        const name = args.rename === false ? `${source.name}_mirrored` : swap(source.name);
        const origin = [...source.origin];
        origin[ai] = pivot * 2 - origin[ai];
        const parent =
          !source.parent || source.parent === "root" || typeof source.parent === "string"
            ? "root"
            : source.parent;
        if (source.from) {
          const from = [...source.from];
          const to = [...source.to];
          from[ai] = pivot * 2 - from[ai];
          to[ai] = pivot * 2 - to[ai];
          const mirroredRotation = [...source.rotation].map((v: number, i: number) =>
            i === ai ? v : -v,
          );
          const cube = new Cube({
            name,
            from: v3(from.map((v: number, i: number) => Math.min(v, to[i]))),
            to: v3(from.map((v: number, i: number) => Math.max(v, to[i]))),
            origin: v3(origin),
            rotation: v3(mirroredRotation),
            inflate: source.inflate ?? 0,
            autouv: 1,
            box_uv: boxUv,
          })
            .init()
            .addTo(parent);
          cube.mapAutoUV?.();
          texture?.applyToCube(cube.uuid, true);
          const row = { uuid: cube.uuid, name: cube.name, type: "cube" };
          created.push(row);
          track.addElements([cube]);
        } else {
          const group = new Group({ name, origin: v3(origin), rotation: [0, 0, 0] }).init().addTo(parent);
          group.createUniqueName?.();
          const row = { uuid: group.uuid, name: group.name, type: "group" };
          created.push(row);
          track.addElements([group]);
        }
      }
      refreshCanvas(created.map((c) => ({ uuid: c.uuid })));
      return { ok: true, undo_label: `mirror_elements ${axis}`, created };
    });
  },

  array_cubes: (args: any) => {
    requireProject();
    const sources = args.sources.map((ref: string) => requireCube(ref));
    const boxUv = resolveUvMode() === "box";
    return withUndo({ outliner: true }, "array_cubes", (track) => {
      const created: Array<{ uuid: string; name: string; type: string }> = [];
      for (let index = 1; index <= args.count; index += 1) {
        for (const source of sources) {
          const delta = args.offset.map((v: number) => v * index);
          const name = String(args.name_pattern ?? "{name}_{index}")
            .replace("{name}", source.name)
            .replace("{index}", String(index));
          const parent =
            args.parent ??
            (!source.parent || source.parent === "root" || typeof source.parent === "string"
              ? "root"
              : source.parent);
          const cube = new Cube({
            name,
            from: source.from.map((v: number, i: number) => v + delta[i]),
            to: source.to.map((v: number, i: number) => v + delta[i]),
            origin: source.origin.map((v: number, i: number) => v + delta[i]),
            rotation: v3([...source.rotation]),
            inflate: source.inflate ?? 0,
            autouv: args.uv_policy === "auto" ? 1 : 0,
            box_uv: source.box_uv ?? boxUv,
            uv_offset: source.uv_offset ? v2([...source.uv_offset]) : undefined,
          })
            .init()
            // parent 可能已经是活着的 Group 对象(来自源 cube 的 parent),只有字符串才需要解析
            .addTo(parent === "root" || typeof parent !== "string" ? parent : requireGroup(parent));
          if (args.uv_policy === "auto") cube.mapAutoUV?.();
          else
            for (const [faceName, face] of Object.entries(source.faces ?? {}) as any[])
              if (cube.faces?.[faceName] && face?.uv)
                cube.faces[faceName].uv = v4([...face.uv]);
          const row = { uuid: cube.uuid, name: cube.name, type: "cube" };
          created.push(row);
          track.addElements([cube]);
        }
      }
      refreshCanvas(created.map((c) => ({ uuid: c.uuid })));
      return { ok: true, undo_label: "array_cubes", created };
    });
  },

  radial_array_cubes: (args: any) => {
    requireProject();
    const sources = args.sources.map((ref: string) => requireCube(ref));
    const axis = args.axis === "x" ? 0 : args.axis === "z" ? 2 : 1;
    const total = args.angle ?? 360;
    const rotateAround = (point: number[], degrees: number) => {
      const out = point.map((v, i) => v - args.pivot[i]);
      const a = (axis + 1) % 3;
      const b = (axis + 2) % 3;
      const r = (degrees * Math.PI) / 180;
      const av = out[a] * Math.cos(r) - out[b] * Math.sin(r);
      const bv = out[a] * Math.sin(r) + out[b] * Math.cos(r);
      out[a] = av;
      out[b] = bv;
      return out.map((v, i) => v + args.pivot[i]);
    };
    return withUndo({ outliner: true }, "radial_array_cubes", (track) => {
      const created: Array<{ uuid: string; name: string; type: string }> = [];
      for (let index = 1; index < args.count; index += 1) {
        const degrees = (total * index) / args.count;
        for (const source of sources) {
          const parent =
            args.parent ??
            (!source.parent || source.parent === "root" || typeof source.parent === "string"
              ? "root"
              : source.parent);
          const center = source.from.map((v: number, i: number) => (v + source.to[i]) / 2);
          const nextCenter = rotateAround(center, degrees);
          const half = source.from.map((v: number, i: number) => Math.abs(source.to[i] - v) / 2);
          const rotation = [...source.rotation];
          if (args.rotate_cubes !== false) rotation[axis] += degrees;
          const name = String(args.name_pattern ?? "{name}_{index}")
            .replace("{name}", source.name)
            .replace("{index}", String(index));
          const cube = new Cube({
            name,
            from: v3(nextCenter.map((v: number, i: number) => v - half[i])),
            to: v3(nextCenter.map((v: number, i: number) => v + half[i])),
            origin: v3(rotateAround(source.origin, degrees)),
            rotation: v3(rotation),
            inflate: source.inflate ?? 0,
            autouv: args.uv_policy === "auto" ? 1 : 0,
            box_uv: source.box_uv,
          })
            .init()
            // parent 可能已经是活着的 Group 对象(来自源 cube 的 parent),只有字符串才需要解析
            .addTo(parent === "root" || typeof parent !== "string" ? parent : requireGroup(parent));
          if (args.uv_policy === "auto") cube.mapAutoUV?.();
          const row = { uuid: cube.uuid, name: cube.name, type: "cube" };
          created.push(row);
          track.addElements([cube]);
        }
      }
      refreshCanvas(created.map((c) => ({ uuid: c.uuid })));
      return { ok: true, undo_label: "radial_array_cubes", created };
    });
  },

  duplicate_hierarchy: (args: any) => {
    requireProject();
    const sourceRoot = requireGroup(args.root);
    const suffix = args.name_suffix ?? "_copy";
    const delta = args.translate ?? [0, 0, 0];
    const target = parentOf(args.parent);
    const boxUv = resolveUvMode() === "box";
    return withUndo({ outliner: true }, "duplicate_hierarchy", (track) => {
      const created: Array<{ uuid: string; name: string; type: string }> = [];
      const copyGroup = (source: any, parent: any) => {
        const group = new Group({
          name: `${source.name}${suffix}`,
          origin: source.origin.map((v: number, i: number) => v + delta[i]),
          rotation: v3([...source.rotation]),
        })
          .init()
          .addTo(parent);
        created.push({ uuid: group.uuid, name: group.name, type: "group" });
        track.addElements([group]);
        for (const child of source.children ?? []) {
          if (child.children) copyGroup(child, group);
          else {
            const cube = new Cube({
              name: `${child.name}${suffix}`,
              from: child.from.map((v: number, i: number) => v + delta[i]),
              to: child.to.map((v: number, i: number) => v + delta[i]),
              origin: child.origin.map((v: number, i: number) => v + delta[i]),
              rotation: v3([...child.rotation]),
              inflate: child.inflate ?? 0,
              autouv: 1,
              box_uv: child.box_uv ?? boxUv,
            })
              .init()
              .addTo(group);
            // uv_policy 决定新副本是共用原 UV 还是重新生成(默认 share,与文档一致)
            if (args?.uv_policy === "auto") cube.mapAutoUV?.();
            else
              for (const [faceName, face] of Object.entries(child.faces ?? {}) as any[])
                if (cube.faces?.[faceName] && face?.uv) cube.faces[faceName].uv = v4(face.uv);
            created.push({ uuid: cube.uuid, name: cube.name, type: "cube" });
            track.addElements([cube]);
          }
        }
      };
      copyGroup(sourceRoot, target);
      refreshCanvas(created.map((c) => ({ uuid: c.uuid })));
      return { ok: true, undo_label: "duplicate_hierarchy", created };
    });
  },

  create_limb: (args: any) => {
    requireProject();
    const texture = findTexture();
    const boxUv = resolveUvMode() === "box";
    const make = (name: string, pivot: number[], size: number[], from?: number[]) => {
      const box = from
        ? { from, to: [from[0] + size[0], from[1] + size[1], from[2] + size[2]] }
        : {
            from: [pivot[0] - size[0] / 2, pivot[1] - size[1], pivot[2] - size[2] / 2],
            to: [
              pivot[0] + size[0] / 2,
              pivot[1],
              pivot[2] + size[2] / 2,
            ],
          };
      const group = new Group({ name, origin: v3([...pivot]), rotation: [0, 0, 0] })
        .init()
        .addTo(parentOf(args.parent));
      group.createUniqueName?.();
      const cube = new Cube({
        name: `${group.name}_cube`,
        from: v3(box.from),
        to: v3(box.to),
        origin: v3([...pivot]),
        autouv: 1,
        box_uv: boxUv,
      })
        .init()
        .addTo(group);
      cube.mapAutoUV?.();
      texture?.applyToCube(cube.uuid, true);
      return { group, cube };
    };
    return withUndo({ outliner: true }, `create_limb ${args.name}`, (track) => {
      const created: Array<{ uuid: string; name: string; type: string }> = [];
      const primary = make(args.name, args.pivot, args.size, args.from);
      created.push(
        { uuid: primary.group.uuid, name: primary.group.name, type: "group" },
        { uuid: primary.cube.uuid, name: primary.cube.name, type: "cube" },
      );
      if (args.mirror === "x") {
        const mirroredName = sideSuffix(
          args.name.replace(/right|left/gi, (m: string) => (m.toLowerCase() === "right" ? "left" : "right")),
          undefined,
        );
        const secondary = make(
          mirroredName === args.name ? `${args.name}_mirrored` : mirroredName,
          [-args.pivot[0], args.pivot[1], args.pivot[2]],
          args.size,
          args.from ? [-args.from[0] - args.size[0], args.from[1], args.from[2]] : undefined,
        );
        created.push(
          { uuid: secondary.group.uuid, name: secondary.group.name, type: "group" },
          { uuid: secondary.cube.uuid, name: secondary.cube.name, type: "cube" },
        );
      }
      for (const row of created) {
        const element = row.type === "group" ? findElement(row.uuid) : findCube(row.uuid);
        if (element) track.addElements([element]);
      }
      refreshCanvas(created.map((c) => ({ uuid: c.uuid })));
      return { ok: true, undo_label: `create_limb ${args.name}`, created };
    });
  },

  scaffold_biped: (args: any) => {
    requireProject();
    const scale = args?.scale ?? 1;
    const prefix = args?.name_prefix ?? "";
    const texSize = args?.texture_size ?? 64;
    const uvMode = resolveUvMode();
    const label = `scaffold_biped x${scale} uv=${uvMode}`;
    return withUndo({ outliner: true, textures: [], bitmap: true }, label, (track) => {
      const skin = createTexture({
        name: `${prefix || ""}skin`,
        width: texSize,
        height: texSize,
        fill: DEFAULT_SKIN,
      });
      track.addTextures([skin.raw]);
      skin.edit((ctx, canvas) => {
        ctx.fillStyle = "#6e6e6e";
        ctx.fillRect(0, Math.floor(canvas.height / 2), canvas.width, Math.ceil(canvas.height / 2));
        ctx.fillStyle = "#9a9a9a";
        ctx.fillRect(0, 0, canvas.width, Math.floor(canvas.height / 2));
      }, "scaffold base shade");

      const created: Array<{ uuid: string; name: string; type: string }> = [];
      const add = (element: any, type: string) => {
        created.push({ uuid: element.uuid, name: element.name, type });
        track.addElements([element]);
      };
      const bone = (name: string, origin: number[], parent: any) => {
        const group = new Group({ name, origin: v3(origin), rotation: [0, 0, 0] }).init().addTo(parent);
        group.createUniqueName?.();
        return group;
      };
      const cubeOn = (
        name: string,
        parent: any,
        from: number[],
        size: number[],
        origin: number[],
        inflate = 0,
      ) => {
        const cube = new Cube({
          name,
          from: v3(from),
          to: [from[0] + size[0], from[1] + size[1], from[2] + size[2]],
          origin: v3(origin),
          inflate,
          autouv: 1,
          box_uv: uvMode === "box",
        })
          .init()
          .addTo(parent);
        cube.mapAutoUV?.();
        skin.applyToCube(cube.uuid, true);
        return cube;
      };

      // 不能叫 "root"(那是 Blockbench 的工程根哨兵),所以顶级骨用 root_bone
      const root = bone(`${prefix}root_bone`, [0, 0, 0], "root");
      add(root, "group");
      const body = bone(`${prefix}body`, [0, 24 * scale, 0], root);
      add(body, "group");
      add(
        cubeOn(`${prefix}body_cube`, body, [-4 * scale, 12 * scale, -2 * scale], [8 * scale, 12 * scale, 4 * scale], [0, 24 * scale, 0]),
        "cube",
      );
      const head = bone(`${prefix}head`, [0, 24 * scale, 0], body);
      add(head, "group");
      add(
        cubeOn(`${prefix}head_cube`, head, [-4 * scale, 24 * scale, -4 * scale], [8 * scale, 8 * scale, 8 * scale], [0, 24 * scale, 0]),
        "cube",
      );
      for (const side of ["right", "left"] as const) {
        const sign = side === "right" ? 1 : -1;
        const arm = bone(`${prefix}arm_${side}`, [sign * 6 * scale, 22 * scale, 0], body);
        add(arm, "group");
        add(
          cubeOn(
            `${prefix}arm_${side}_cube`,
            arm,
            [sign * 6 * scale - 2 * scale, 12 * scale, -2 * scale],
            [4 * scale, 12 * scale, 4 * scale],
            [sign * 6 * scale, 22 * scale, 0],
          ),
          "cube",
        );
        const leg = bone(`${prefix}leg_${side}`, [sign * 2 * scale, 12 * scale, 0], body);
        add(leg, "group");
        add(
          cubeOn(
            `${prefix}leg_${side}_cube`,
            leg,
            [sign * 2 * scale - 2 * scale, 0, -2 * scale],
            [4 * scale, 12 * scale, 4 * scale],
            [sign * 2 * scale, 12 * scale, 0],
          ),
          "cube",
        );
      }
      if (args?.include_outer_layers)
        add(
          cubeOn(`${prefix}hat`, head, [-4.5 * scale, 23.5 * scale, -4.5 * scale], [9 * scale, 9 * scale, 9 * scale], [0, 24 * scale, 0], 0.25 * scale),
          "cube",
        );

      // 按工程 UV 模式打包
      const cubes = (Cube?.all ?? []).filter((c: any) => !prefix || c.name.startsWith(prefix));
      const plan = planUvPack(
        cubes.map((cube: any) => ({ uuid: cube.uuid, name: cube.name, from: cube.from, to: cube.to })),
        { mode: uvMode, texW: texSize, padding: 1 },
      );
      if (plan.mode === "box") {
        for (const item of plan.items) {
          const cube = cubes.find((c: any) => c.uuid === item.uuid);
          if (!cube) continue;
          cube.box_uv = true;
          cube.uv_offset = item.uv_offset;
          cube.autouv = 0;
          cube.mapAutoUV?.();
        }
      } else {
        for (const item of plan.items) {
          const cube = cubes.find((c: any) => c.uuid === item.uuid);
          if (!cube) continue;
          cube.box_uv = false;
          cube.autouv = 0;
          for (const face of item.faces) if (cube.faces?.[face.face]) cube.faces[face.face].uv = face.uv;
        }
      }
      refreshCanvas(created.map((c) => ({ uuid: c.uuid })));
      // 描述承诺返回 check_model 摘要,所以这里真的跑一遍(误差早发现早修)
      const check = checkModelPure(snapshotElements(), {
        textureWidth: Project?.texture_width ?? 16,
        textureHeight: Project?.texture_height ?? 16,
        uvIslands: uvIslands(),
      });
      return {
        ok: true,
        undo_label: label,
        uv_mode: uvMode,
        created,
        check: { summary: check.summary, findings: check.findings },
      };
    });
  },

  measure_model: (args: { refs?: string[] }) => {
    requireProject();
    const measured = measureModelPure(snapshotElements(), args?.refs);
    const size = measured.bounds.size;
    return {
      ...measured,
      ratios: {
        width_to_height: size[1] ? Number((size[0] / size[1]).toFixed(3)) : null,
        depth_to_height: size[1] ? Number((size[2] / size[1]).toFixed(3)) : null,
        head_height_fraction: (() => {
          const head = measured.elements.find((row) => /head/i.test(String(row.name)));
          return head && size[1] ? Number(((head.size as number[])[1] / size[1]).toFixed(3)) : null;
        })(),
      },
      note: "Bounds include cube and parent rotations. Use compare_reference for silhouette matching.",
    };
  },

  audit_symmetry: (args: {
    pairs: Array<{ left: string; right: string }>;
    axis?: "x" | "y" | "z";
    pivot?: number;
    tolerance?: number;
  }) => {
    requireProject();
    const axis = args?.axis ?? "x";
    const ai = axis === "x" ? 0 : axis === "y" ? 1 : 2;
    const pivot = args?.pivot ?? 0;
    const tolerance = args?.tolerance ?? 0.001;
    const snapshot = snapshotElements();
    const side = (element: (typeof snapshot)[number]): SymmetrySide => ({
      name: element.name,
      min: (element.from ?? element.origin) as Vec3,
      max: (element.to ?? element.origin) as Vec3,
      origin: element.origin,
    });
    const resolved = args.pairs.map((pair) => {
      const left = snapshot.find((e) => e.name === pair.left || e.uuid === pair.left);
      const right = snapshot.find((e) => e.name === pair.right || e.uuid === pair.right);
      if (!left || !right)
        throw new CommandError("E_NOT_FOUND", `Symmetry pair missing: ${pair.left}/${pair.right}`);
      return { left: side(left), right: side(right) };
    });
    return auditSymmetryPure(resolved, { axis, pivot, tolerance });
  },
};


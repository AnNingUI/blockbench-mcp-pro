/** Blockbench 元素/工程读写助手(薄,只做数据搬运;判断逻辑在 shared 的纯函数里) */
import {
  FACE_NAMES,
  collectUvIslands,
  makeError,
  resolveUvModeFromHints,
  type ElementSnapshot,
  type FaceName,
  type UvMode,
  type Vec3,
} from "@bbmcp/shared";
import { CommandError } from "./errors.js";
import { createTexture, currentFormatId, findTexture, refreshCanvas, withUndo } from "./host.js";

type AnyElement = any;

export function requireProject(): void {
  if (!Project)
    throw new CommandError("E_NOT_FOUND", "No project is open. Call create_project first.");
}

export function findGroup(ref: string): any {
  return (Group?.all ?? []).find((g: any) => g.uuid === ref || g.name === ref);
}

export function findCube(ref: string): any {
  return (Cube?.all ?? []).find((c: any) => c.uuid === ref || c.name === ref);
}

export function findElement(ref: string): AnyElement {
  return findGroup(ref) ?? findCube(ref);
}

export function requireElement(ref: string): AnyElement {
  const element = findElement(ref);
  if (!element)
    throw new CommandError(
      "E_NOT_FOUND",
      `Element not found: ${ref}. Use get_project_summary or get_elements for valid names/uuids.`,
    );
  return element;
}

export function requireGroup(ref: string): any {
  const group = findGroup(ref);
  if (!group) throw new CommandError("E_NOT_FOUND", `Group/bone not found: ${ref}`);
  return group;
}

export function requireCube(ref: string): any {
  const cube = findCube(ref);
  if (!cube) throw new CommandError("E_NOT_FOUND", `Cube not found: ${ref}`);
  return cube;
}

export function parentOf(ref?: string): any {
  if (!ref || ref === "root") return "root";
  return requireGroup(ref);
}

export function isCube(element: AnyElement): boolean {
  return typeof element?.from !== "undefined" && typeof element?.to !== "undefined";
}

/* ------------------------------------------------------------------ snapshot */

function parentUuid(parent: any): string | null {
  if (!parent || parent === "root") return null;
  return typeof parent === "string" ? parent : (parent.uuid ?? null);
}

export function snapshotElements(refs?: string[]): ElementSnapshot[] {
  const wanted = refs?.length ? new Set(refs) : null;
  const match = (el: any) =>
    !wanted || wanted.has(el.uuid) || wanted.has(el.name);
  const out: ElementSnapshot[] = [];
  for (const group of Group?.all ?? []) {
    if (!match(group)) continue;
    out.push({
      uuid: group.uuid,
      name: group.name,
      type: "group",
      parent: parentUuid(group.parent),
      origin: [...(group.origin ?? [0, 0, 0])] as Vec3,
      rotation: [...(group.rotation ?? [0, 0, 0])] as Vec3,
      visibility: group.visibility !== false,
    });
  }
  const textureWidth = Project?.texture_width ?? 16;
  const textureHeight = Project?.texture_height ?? 16;
  for (const cube of Cube?.all ?? []) {
    if (!match(cube)) continue;
    const faces = cube.faces ?? {};
    const untextured = FACE_NAMES.filter((face) => {
      const f = faces[face];
      return f && (f.texture === null || f.texture === undefined || f.texture === false);
    });
    let outOfBounds = 0;
    for (const face of FACE_NAMES) {
      const uv = faces[face]?.uv;
      if (!Array.isArray(uv) || uv.length < 4) continue;
      if (
        Math.min(uv[0], uv[2]) < 0 ||
        Math.min(uv[1], uv[3]) < 0 ||
        Math.max(uv[0], uv[2]) > textureWidth ||
        Math.max(uv[1], uv[3]) > textureHeight
      )
        outOfBounds += 1;
    }
    out.push({
      uuid: cube.uuid,
      name: cube.name,
      type: "cube",
      parent: parentUuid(cube.parent),
      origin: [...(cube.origin ?? cube.from ?? [0, 0, 0])] as Vec3,
      rotation: [...(cube.rotation ?? [0, 0, 0])] as Vec3,
      from: [...(cube.from ?? [0, 0, 0])] as Vec3,
      to: [...(cube.to ?? [0, 0, 0])] as Vec3,
      inflate: cube.inflate ?? 0,
      visibility: cube.visibility !== false,
      untexturedFaces: untextured,
      faceUvOutOfBounds: outOfBounds,
    });
  }
  return out;
}

export function uvIslands() {
  const cubes = (Cube?.all ?? []).map((cube: any) => ({
    uuid: cube.uuid,
    name: cube.name,
    from: [...cube.from] as Vec3,
    to: [...cube.to] as Vec3,
    faces: cube.faces ?? {},
  }));
  return collectUvIslands(cubes, Project?.texture_width ?? 16, Project?.texture_height ?? 16);
}

export function resolveUvMode(explicit?: UvMode | "auto" | null): UvMode {
  return resolveUvModeFromHints({
    explicit,
    projectBoxUv: typeof Project?.box_uv === "boolean" ? Project.box_uv : null,
    formatBoxUv: typeof Format?.box_uv === "boolean" ? Format.box_uv : null,
    formatId: currentFormatId(),
    cubeBoxFlags: (Cube?.all ?? []).map((c: any) => Boolean(c.box_uv)),
  });
}

/* --------------------------------------------------------------------- reads */

export function getElements(opts: { refs?: string[] }) {
  const wanted = opts.refs?.length ? new Set(opts.refs) : null;
  const match = (el: any) => !wanted || wanted.has(el.uuid) || wanted.has(el.name);
  return {
    groups: (Group?.all ?? []).filter(match).map((group: any) => ({
      uuid: group.uuid,
      name: group.name,
      parent: parentUuid(group.parent),
      origin: [...(group.origin ?? [])],
      rotation: [...(group.rotation ?? [])],
      visibility: group.visibility !== false,
      children: (group.children ?? []).map((c: any) => c.uuid),
    })),
    cubes: (Cube?.all ?? []).filter(match).map((cube: any) => ({
      uuid: cube.uuid,
      name: cube.name,
      parent: parentUuid(cube.parent),
      from: [...(cube.from ?? [])],
      to: [...(cube.to ?? [])],
      origin: [...(cube.origin ?? [])],
      rotation: [...(cube.rotation ?? [])],
      inflate: cube.inflate ?? 0,
      visibility: cube.visibility !== false,
      box_uv: cube.box_uv ?? false,
      uv_offset: cube.uv_offset ? [...cube.uv_offset] : null,
      mirror_uv: cube.mirror_uv ?? false,
      faces: Object.fromEntries(
        Object.entries(cube.faces ?? {}).map(([name, face]: [string, any]) => [
          name,
          {
            uv: face?.uv ? [...face.uv] : null,
            rotation: face?.rotation ?? 0,
            texture:
              face?.texture == null
                ? null
                : typeof face.texture === "string"
                  ? face.texture
                  : (face.texture.uuid ?? face.texture.name ?? "assigned"),
          },
        ]),
      ),
    })),
  };
}

export function projectSummary() {
  requireProject();
  const outliner = [
    ...(Group?.all ?? []).map((g: any) => ({
      uuid: g.uuid,
      name: g.name,
      type: "group" as const,
      parent: parentUuid(g.parent),
    })),
    ...(Cube?.all ?? []).map((c: any) => ({
      uuid: c.uuid,
      name: c.name,
      type: "cube" as const,
      parent: parentUuid(c.parent),
    })),
  ];
  return {
    format: currentFormatId() ?? "unknown",
    name: Project?.name ?? null,
    geometry_name: Project?.geometry_name ?? null,
    texture_width: Project?.texture_width ?? null,
    texture_height: Project?.texture_height ?? null,
    uv_mode: resolveUvMode(),
    cubes: (Cube?.all ?? []).length,
    groups: (Group?.all ?? []).length,
    textures: (Texture?.all ?? []).length,
    animations: (Animation?.all ?? []).length,
    outliner,
  };
}

export function orientationInfo() {
  return {
    faces: "-Z (north) is the model's front",
    model_right_axis: "+X",
    model_left_axis: "-X",
    front_view_mirror_trap:
      "A 'front' render shows the model mirrored: its right hand appears on the LEFT of the image, exactly like facing a person.",
    rotation_signs: {
      "+X": "lifts the front: a DOWN-pointing bone (arm/leg) swings its tip FORWARD; an UP-pointing bone (torso/neck) tips BACKWARD",
      "+Y": "turns the model toward its own left",
      "+Z": "rolls the model toward its own right",
      elbows: "+X",
      knees: "-X",
    },
    side_param:
      "apply_geometry_batch / generators accept side:'left'|'right' and REFUSE coordinates that contradict it.",
  };
}

/* ------------------------------------------------------------ side guarding */

/** 模型自身右侧是 +X;返回坐标所在的一侧 */
export function sideOfX(x: number): "left" | "right" | null {
  if (x > 0.001) return "right";
  if (x < -0.001) return "left";
  return null;
}

export function assertSide(
  declared: "left" | "right" | undefined,
  x: number,
  what: string,
): void {
  if (!declared) return;
  const actual = sideOfX(x);
  if (actual && actual !== declared)
    throw new CommandError(
      "E_INVALID_PARAM",
      `${what} was declared side:"${declared}" but sits at x=${x} (the model's ${actual}). ` +
        `The model faces -Z, so its OWN right is +X.`,
    );
}

export function sideSuffix(name: string, side?: "left" | "right"): string {
  if (!side) return name;
  if (/(left|right)/i.test(name)) return name;
  return `${name}_${side}`;
}

/* --------------------------------------------------------- materialization */

export type MaterializeOptions = {
  create_groups?: Array<{ name: string; origin?: Vec3; rotation?: Vec3; parent?: string }>;
  create_cubes?: Array<{
    name: string;
    from: Vec3;
    to: Vec3;
    origin?: Vec3;
    rotation?: Vec3;
    inflate?: number;
    parent?: string;
    side?: "left" | "right";
  }>;
  delete_refs?: string[];
  auto_uv?: boolean;
  undo_label?: string;
  /** 已存在的组名(GeneratorResult 的 parent 可指向它) */
  extraParents?: string[];
  texture?: string;
  /** 为生成的 cube 建 group 骨架(extrude_chain / add_wing) */
  generated_groups?: Array<{ name: string; origin: Vec3; rotation: Vec3; parent?: string }>;
};

/**
 * 一次性把 spec 变成真实的 group/cube(单 undo 步骤)。
 * 整批在写入前校验:缺父级、side 违例都会在"什么都没改"之前失败。
 */
export function materialize(opts: MaterializeOptions) {
  requireProject();
  const label = opts.undo_label ?? "blockbench-mcp batch";
  const pendingGroups = new Set([
    ...(opts.create_groups ?? []).map((g) => g.name),
    ...(opts.generated_groups ?? []).map((g) => g.name),
  ]);
  const known = (ref?: string) =>
    !ref || ref === "root" || pendingGroups.has(ref) || Boolean(findGroup(ref));

  for (const group of [...(opts.generated_groups ?? []), ...(opts.create_groups ?? [])]) {
    // Blockbench 用字符串 "root" 表示"工程根"(element.addTo('root')),
    // 所以一个**名字叫 root 的组**会让 parent:"root" 产生歧义(实测:body 被挂到工程根,root 组空掉)。
    if (group.name === "root")
      throw new CommandError(
        "E_INVALID_PARAM",
        'A group cannot be named "root": that name means the project root in Blockbench. Name it "root_bone" (or give a name_prefix).',
      );
    if (!known(group.parent))
      throw new CommandError("E_PARTIAL_FORBIDDEN", `Missing parent group: ${group.parent}`);
  }
  for (const cube of opts.create_cubes ?? []) {
    if (!known(cube.parent))
      throw new CommandError("E_PARTIAL_FORBIDDEN", `Missing parent group for cube ${cube.name}: ${cube.parent}`);
    assertSide(cube.side, cube.from[0], `Cube "${cube.name}"`);
  }
  for (const ref of opts.delete_refs ?? []) {
    if (!findElement(ref))
      throw new CommandError("E_PARTIAL_FORBIDDEN", `Cannot delete missing element: ${ref}`);
  }

  const boxUv = resolveUvMode() === "box";
  const textureRef = opts.texture ?? undefined;
  const targetTexture = findTexture(textureRef);

  return withUndo({ outliner: true }, label, (track) => {
    const created: Array<{ uuid: string; name: string; type: string }> = [];
    const nameToGroup = new Map<string, any>();

    const resolveParent = (ref?: string) => {
      if (!ref || ref === "root") return "root";
      return nameToGroup.get(ref) ?? findGroup(ref) ?? "root";
    };

    for (const spec of [
      ...(opts.generated_groups ?? []),
      ...(opts.create_groups ?? []).map((g) => ({
        name: g.name,
        origin: g.origin ?? ([0, 0, 0] as Vec3),
        rotation: g.rotation ?? ([0, 0, 0] as Vec3),
        parent: g.parent,
      })),
    ]) {
      const group = new Group({
        name: spec.name,
        origin: [...spec.origin],
        rotation: [...spec.rotation],
      })
        .init()
        .addTo(resolveParent(spec.parent));
      group.createUniqueName?.();
      nameToGroup.set(spec.name, group);
      nameToGroup.set(group.name, group);
      const row = { uuid: group.uuid, name: group.name, type: "group" };
      created.push(row);
      track.addElements([group]);
    }

    for (const spec of opts.create_cubes ?? []) {
      const cube = new Cube({
        name: spec.name,
        from: [...spec.from],
        to: [...spec.to],
        origin: spec.origin ? [...spec.origin] : [...spec.from],
        rotation: spec.rotation ? [...spec.rotation] : [0, 0, 0],
        inflate: spec.inflate ?? 0,
        autouv: opts.auto_uv === false ? 0 : 1,
        box_uv: boxUv,
      })
        .init()
        .addTo(resolveParent(spec.parent));
      cube.createUniqueName?.();
      cube.mapAutoUV?.();
      if (targetTexture) targetTexture.applyToCube(cube.uuid, true);
      const row = { uuid: cube.uuid, name: cube.name, type: "cube" };
      created.push(row);
      track.addElements([cube]);
    }

    const deleted: string[] = [];
    for (const ref of opts.delete_refs ?? []) {
      const element = findElement(ref);
      if (!element) continue;
      deleted.push(element.uuid);
      element.remove?.(false);
    }

    refreshCanvas(created);
    return { ok: true, undo_label: label, created, deleted };
  });
}

export { createTexture, refreshCanvas, withUndo, findTexture, FACE_NAMES, makeError };
export type { FaceName };

/** 程序化生成器 —— 能力来自 shared 的纯函数,这里只负责落地与 side 校验 */
import {
  addWing as addWingPure,
  extrudeChain as extrudeChainPure,
  generateArray as generateArrayPure,
  hollowVolume as hollowVolumePure,
  voxelizeMatrix as voxelizeMatrixPure,
  type GeneratorResult,
} from "@bbmcp/shared";
import { CommandError } from "../errors.js";
import { assertSide, findGroup, materialize, requireProject } from "../bb.js";
import type { ToolHandler } from "../dispatch.js";

function land(
  result: GeneratorResult,
  opts: {
    name: string;
    parent?: string;
    side?: "left" | "right";
    undoLabel: string;
    extra?: Record<string, unknown>;
  },
) {
  requireProject();
  if (opts.parent && !findGroup(opts.parent))
    throw new CommandError("E_NOT_FOUND", `Parent group not found: ${opts.parent}`);
  const created = materialize({
    generated_groups: result.groups.map((g) => ({
      name: g.name,
      origin: g.origin,
      rotation: g.rotation,
      parent: g.parent ?? opts.parent,
    })),
    create_cubes: result.cubes.map((c) => ({
      name: c.name,
      from: c.from,
      to: c.to,
      origin: c.origin,
      rotation: c.rotation,
      inflate: c.inflate,
      parent: c.parent ?? opts.parent,
    })),
    undo_label: opts.undoLabel,
  });
  return {
    ok: true,
    generator: opts.name,
    created_elements: created.created.length,
    created: created.created,
    notes: result.notes,
    points: result.points ?? null,
    side_validated: Boolean(opts.side),
    ...(opts.extra ?? {}),
  };
}

export const generatorTools: Record<string, ToolHandler> = {
  voxelize_matrix: (args: any) => {
    if (args.side) {
      // 网格最小角在声明一侧即可
      assertSide(args.side, args.origin?.[0] ?? 0, "voxelize_matrix origin");
    }
    const result = voxelizeMatrixPure(args);
    return land(result, {
      name: "voxelize_matrix",
      parent: args.parent,
      side: args.side,
      undoLabel: "voxelize_matrix",
      extra: { cubes: result.cubes.length },
    });
  },

  add_hollow_volume: (args: any) => {
    if (args.side)
      assertSide(args.side, (args.bounds.from[0] + args.bounds.to[0]) / 2, "add_hollow_volume bounds");
    const result = hollowVolumePure({
      from: args.bounds.from,
      to: args.bounds.to,
      wall_thickness: args.wall_thickness,
      open_faces: args.open_faces,
      name: args.name,
      inflate: args.inflate,
      parent: args.parent,
    });
    return land(result, {
      name: "add_hollow_volume",
      parent: args.parent,
      side: args.side,
      undoLabel: "add_hollow_volume",
      extra: { cavity: { min: result.points?.cavity_min, max: result.points?.cavity_max } },
    });
  },

  generate_array: (args: any) => {
    if (args.side)
      assertSide(args.side, args.start?.[0] ?? args.center?.[0] ?? 0, "generate_array start");
    const result = generateArrayPure(args);
    return land(result, {
      name: "generate_array",
      parent: args.parent,
      side: args.side,
      undoLabel: "generate_array",
      extra: { elements: result.cubes.length },
    });
  },

  extrude_chain: (args: any) => {
    if (args.side) assertSide(args.side, args.base_origin[0], "extrude_chain base_origin");
    const result = extrudeChainPure(args);
    return land(result, {
      name: "extrude_chain",
      parent: args.parent,
      side: args.side,
      undoLabel: `extrude_chain ${args.name ?? "chain"}`,
      extra: { tip: result.points?.tip ?? null, bones: result.groups.length },
    });
  },

  add_wing: (args: any) => {
    assertSide(args.side, args.base_origin[0], "add_wing base_origin");
    const result = addWingPure(args);
    return land(result, {
      name: "add_wing",
      parent: args.parent,
      side: args.side,
      undoLabel: `add_wing ${args.side}`,
      extra: { joints: result.points ?? null },
    });
  },
};

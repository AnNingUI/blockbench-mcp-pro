/**
 * 工具目录 —— 名称 / 描述 / zod 参数契约。
 * 插件端 tools/list 与网关都从这里取;单一事实源。
 */
import { z } from "zod";
import { GUIDE_TOPICS } from "./guides.js";
import { paintOpSchema } from "./contracts.js";

const N = z.number();
const S = z.string();
const B = z.boolean();
const vec3 = z.tuple([N, N, N]);
const vec2 = z.tuple([N, N]);
const face = z.enum(["north", "south", "east", "west", "up", "down"]);
const textureRef = S.optional();

export type ToolSpec = {
  name: string;
  description: string;
  params: z.ZodType;
  group: string;
  /** 会修改工程 */
  mutation?: boolean;
  /** 高危:需要用户在设置里显式开启 */
  gated?: boolean;
};

const spec = (
  name: string,
  group: string,
  description: string,
  params: z.ZodType = z.object({}).strict(),
  flags: { mutation?: boolean; gated?: boolean } = {},
): [string, ToolSpec] => [
  name,
  { name, group, description, params, ...flags },
];

export const TOOL_SPECS: Record<string, ToolSpec> = Object.fromEntries([
  /* ---------------- status & discovery ---------------- */
  spec(
    "health",
    "status",
    "Plugin MCP status: listening port, protocol version, Blockbench version, current format, uv_mode and probed capabilities. Call this first.",
    z.object({}).strict(),
  ),
  spec(
    "get_guide",
    "status",
    `Return a playbook. topic: ${GUIDE_TOPICS.map((t) => `'${t}'`).join(" | ")} (default modeling). READ the relevant topic BEFORE building/rigging/texturing/animating — it is the difference between a detailed model and 15 flat boxes.`,
    z.object({ topic: z.enum(GUIDE_TOPICS).optional() }).strict(),
  ),
  spec("list_formats", "status", "List every model format available in this Blockbench install (id, name, box_uv). Use ids with create_project.", z.object({}).strict()),
  spec(
    "get_project_summary",
    "status",
    "Compact observation of the open project: format, uv_mode, name, texture size, counts, and the outliner tree (uuid/name/type/parent). Prefer this over screenshots for orientation.",
    z.object({}).strict(),
  ),
  spec(
    "get_elements",
    "status",
    "Read exact geometry: groups and cubes with uuid, name, parent, origin, rotation, from/to, inflate, visibility, box_uv, uv_offset and per-face uv/rotation/texture. The safe read-back after every mutation.",
    z.object({ refs: z.array(S).optional() }).strict(),
  ),
  spec("list_textures", "status", "List textures (uuid, name, width, height).", z.object({}).strict()),
  spec("list_animations", "status", "List animations with length, loop mode, bone count and keyframe count.", z.object({}).strict()),

  /* ---------------- orientation ---------------- */
  spec(
    "get_orientation",
    "orientation",
    "THE left/right authority. Returns which way the model faces, which axis is its own right/left, the front-view mirror trap, and the rotation-sign cheat sheet. Call before rigging, mirroring or interpreting a render.",
    z.object({}).strict(),
  ),
  spec(
    "which_side",
    "orientation",
    "Answer 'is this bone the model's left or right?' from its COORDINATES (not from a picture), and report whether its name agrees.",
    z.object({ element: S }).strict(),
  ),
  spec(
    "check_sides",
    "orientation",
    "Audit every left/right name against actual geometry: bones named arm_right sitting on the model's left, mirrored pairs that landed on the same side, limbs with no counterpart, orphan parents. Run after building or mirroring anything symmetric.",
    z.object({}).strict(),
  ),

  /* ---------------- project ---------------- */
  spec(
    "create_project",
    "project",
    "Create a new project/tab from the start screen. format: list_formats id (java_block | bedrock | bedrock_old | geckolib_model). uv_mode is validated against the format before anything is created; existing tabs are preserved.",
    z.object({
      format: S,
      name: S.optional(),
      geometry_name: S.optional(),
      uv_mode: z.enum(["box", "face", "auto"]).optional(),
      texture_width: N.optional(),
      texture_height: N.optional(),
    }).strict(),
    { mutation: true },
  ),
  spec(
    "set_project_meta",
    "project",
    "Update the open project's name, geometry name or texture resolution (resolution also rescales every UV so paint stays aligned).",
    z.object({
      name: S.optional(),
      geometry_name: S.optional(),
      texture_width: N.optional(),
      texture_height: N.optional(),
    }).strict(),
    { mutation: true },
  ),
  spec(
    "save_project",
    "project",
    "Write a real .bbmodel to disk. Requires propose_scoped_directory first; pass overwrite:true to replace an existing file.",
    z.object({ path: S, overwrite: B.optional() }).strict(),
    { mutation: true },
  ),
  spec(
    "export_model",
    "project",
    "Export to a file. By default it uses the ACTIVE format's codec (Bedrock geometry JSON, Java model, GeckoLib); pass codec:'gltf' for a self-contained .gltf that imports into Godot/Unity/Blender. Requires propose_scoped_directory.",
    z.object({ path: S, overwrite: B.optional(), codec: S.optional(), format: S.optional(), options: z.record(z.unknown()).optional() }).strict(),
    { mutation: true },
  ),
  spec(
    "propose_scoped_directory",
    "project",
    "Ask the USER to approve ONE folder for AI file access this session. Every file read/write is confined to it; nothing outside is reachable. Call before save_project / export_model / PNG import-export.",
    z.object({ path: S }).strict(),
  ),

  /* ---------------- geometry ---------------- */
  spec(
    "revoke_scope",
    "project",
    "Drop the folder approved with propose_scoped_directory: every file tool (save/export/PNG import-export/load_reference) then requires a fresh approval. Use it when you are done with disk work.",
    z.object({}).strict(),
    { mutation: true },
  ),
  spec(
    "apply_geometry_batch",
    "geometry",
    "Create groups and cubes in ONE undo step. Parent references may point at groups created earlier in the same call (build a posed skeleton at once). The whole batch is validated before anything is written — a missing parent or a side violation fails loudly instead of half-applying. Pass side:'left'|'right' and the tool refuses coordinates that contradict it (model faces -Z so its own right is +X).",
    z.object({
      create_groups: z.array(z.object({ name: S, origin: vec3.optional(), rotation: vec3.optional(), parent: S.optional() })).optional(),
      create_cubes: z.array(z.object({
        name: S,
        from: vec3,
        to: vec3,
        origin: vec3.optional(),
        rotation: vec3.optional(),
        inflate: N.optional(),
        parent: S.optional(),
        side: z.enum(["left", "right"]).optional(),
      })).optional(),
      delete_refs: z.array(S).optional(),
      auto_uv: B.optional(),
      undo_label: S.optional(),
    }).strict(),
    { mutation: true },
  ),
  spec(
    "update_elements",
    "geometry",
    "Bounded edits: rename, reparent, move origin/rotation, resize (from/to), inflate, toggle visibility. uv_policy:'auto' recomputes UVs when dimensions change. Reparenting that would create a cycle is rejected.",
    z.object({
      updates: z.array(z.object({
        ref: S,
        name: S.optional(),
        parent: S.optional(),
        from: vec3.optional(),
        to: vec3.optional(),
        origin: vec3.optional(),
        rotation: vec3.optional(),
        inflate: N.optional(),
        visibility: B.optional(),
      })).min(1),
      uv_policy: z.enum(["preserve", "auto"]).optional(),
    }).strict(),
    { mutation: true },
  ),
  spec(
    "delete_elements",
    "geometry",
    "Delete elements by uuid or name in one undo step.",
    z.object({ refs: z.array(S).min(1) }).strict(),
    { mutation: true },
  ),
  spec(
    "transform_elements",
    "geometry",
    "Relative edit of a whole subtree: translate/scale/rotate around a pivot, in the selected root's parent space. Non-uniform scaling of rotated or inflated geometry is rejected (it would introduce shear) — use mirror_elements for reflection.",
    z.object({
      refs: z.array(S).min(1),
      translate: vec3.optional(),
      scale: vec3.optional(),
      pivot: vec3.optional(),
      rotate: vec3.optional(),
      uv_policy: z.enum(["preserve", "auto"]).optional(),
    }).strict(),
    { mutation: true },
  ),
  spec(
    "mirror_elements",
    "geometry",
    "Mirror elements across an axis (default X about 0) and rename left<->right intelligently. The correct way to make a symmetric second half.",
    z.object({ refs: z.array(S).min(1), axis: z.enum(["x", "y", "z"]).optional(), pivot: N.optional(), rename: B.optional() }).strict(),
    { mutation: true },
  ),
  spec(
    "array_cubes",
    "geometry",
    "Repeat cubes along a straight line with a fixed offset. uv_policy share (copy UVs) or auto (regenerate).",
    z.object({
      sources: z.array(S).min(1),
      count: z.number().int().positive(),
      offset: vec3,
      name_pattern: S.optional(),
      uv_policy: z.enum(["share", "auto"]).optional(),
      parent: S.optional(),
    }).strict(),
    { mutation: true },
  ),
  spec(
    "radial_array_cubes",
    "geometry",
    "Repeat cubes around a circle/arc (pillars, spokes, petals, spokes of a wheel), rotating each copy about the axis.",
    z.object({
      sources: z.array(S).min(1),
      count: z.number().int().positive(),
      axis: z.enum(["x", "y", "z"]).optional(),
      pivot: vec3,
      angle: N.optional(),
      rotate_cubes: B.optional(),
      name_pattern: S.optional(),
      uv_policy: z.enum(["share", "auto"]).optional(),
      parent: S.optional(),
    }).strict(),
    { mutation: true },
  ),
  spec(
    "duplicate_hierarchy",
    "geometry",
    "Deep-copy a whole group subtree (children, grandchildren, cubes) with an optional translation — the fast way to build a mirrored or repeated limb cluster.",
    z.object({ root: S, name_suffix: S.optional(), translate: vec3.optional(), parent: S.optional(), uv_policy: z.enum(["share", "auto"]).optional() }).strict(),
    { mutation: true },
  ),
  spec(
    "create_limb",
    "geometry",
    "Create a bone + cube hanging from a real joint pivot, optionally mirrored to the other side (mirror:'x') with automatic left/right naming. Use it for arms, legs, wings, ears, tails.",
    z.object({ name: S, parent: S.optional(), pivot: vec3, size: vec3, from: vec3.optional(), mirror: z.enum(["none", "x"]).optional() }).strict(),
    { mutation: true },
  ),
  spec(
    "scaffold_biped",
    "geometry",
    "Build a correctly-pivoted classical biped (root_bone -> body -> head/arms/legs, feet on y=0), pack UVs in the project's UV mode, create the skin texture, and return a check_model summary of the result. Start here for anything humanoid.",
    z.object({ scale: N.optional(), texture_size: N.optional(), name_prefix: S.optional(), include_outer_layers: B.optional() }).strict(),
    { mutation: true },
  ),
  spec(
    "measure_model",
    "geometry",
    "Measurable proportions: overall bounds/centre/size, per-element bounds and volume (rotation- and hierarchy-aware), plus width:height and depth:height ratios. Use it to match a reference numerically instead of by hand.",
    z.object({ refs: z.array(S).optional() }).strict(),
  ),
  spec(
    "audit_symmetry",
    "geometry",
    "Check explicit left/right pairs of coordinates against a mirror plane and report the error in units.",
    z.object({ pairs: z.array(z.object({ left: S, right: S })).min(1), axis: z.enum(["x", "y", "z"]).optional(), pivot: N.optional(), tolerance: N.optional() }).strict(),
  ),

  /* ---------------- generators ---------------- */
  spec(
    "voxelize_matrix",
    "generators",
    "DRAW a shape as a character matrix and get 3D cubes back — the fix for parts you cannot compute [from,to] for. Universal: blades, bows, emblems, fins, keys, gears, banners. Rows are top-first; ' ' and '.' are empty. plane picks the projection: xy = front view (columns +X, rows descend -Y, depth +Z), xz = top view (rows front-to-back, depth +Y), yz = side view (columns +Z with column 0 at the model FRONT, depth +X). origin is the grid's minimum corner. merge_adjacent:true merges runs into one cube (far fewer cubes, same shape).",
    z.object({
      matrix: z.array(S).min(1),
      palette: z.record(z.string(), z.object({ name: S.optional(), depth: N.optional(), offset_z: N.optional(), inflate: N.optional() })).optional(),
      pixel_size: N.optional(),
      plane: z.enum(["xy", "xz", "yz"]).optional(),
      origin: vec3,
      parent: S.optional(),
      merge_adjacent: B.optional(),
      max_cubes: N.optional(),
      z_fight_guard: B.optional(),
    }).strict(),
    { mutation: true },
  ),
  spec(
    "add_hollow_volume",
    "generators",
    "Build a SHELL with a real cavity instead of a solid box — the fix for the biggest 'AI model' tell. Universal: hoods, helmets, masks, visors, breastplates, pauldrons, bracers, collars, cages, crates, pipes. open_faces takes world directions (north=-Z is the model's front, south, east=+X, west, up, down) and model-relative words (front/back/left/right/top/bottom). Walls tile exactly so they never z-fight. Returns the cavity bounds.",
    z.object({
      bounds: z.object({ from: vec3, to: vec3 }),
      wall_thickness: N.optional(),
      open_faces: z.array(S).optional(),
      name: S.optional(),
      inflate: N.optional(),
      parent: S.optional(),
      side: z.enum(["left", "right"]).optional(),
    }).strict(),
    { mutation: true },
  ),
  spec(
    "generate_array",
    "generators",
    "Repeat one element along a line, around a ring, or over a grid: torn hems, scales, feathers, armour plates, teeth, spikes, rivets, chain links, ribs, tassels. anchor decides how each element sits on its point (center | top = hangs | bottom = stands | min). jitter breaks the machine-regular look, size_decay tapers the run, rotation_range gives each its own tilt, depth_stagger alternates neighbours in depth so shingled rows CANNOT z-fight (pass 0.05-0.2), seed makes it reproducible. Reports coincident positions to fix.",
    z.object({
      mode: z.enum(["linear", "radial", "grid"]).optional(),
      count: N.optional(),
      element_size: vec3,
      start: vec3.optional(),
      end: vec3.optional(),
      center: vec3.optional(),
      radii: vec2.optional(),
      arc_degrees: N.optional(),
      start_degrees: N.optional(),
      align_to_center: B.optional(),
      counts: vec3.optional(),
      distribution: z.enum(["span", "cells"]).optional(),
      anchor: z.enum(["center", "top", "bottom", "min"]).optional(),
      jitter: vec3.optional(),
      size_decay: vec3.optional(),
      depth_stagger: N.optional(),
      depth_axis: z.enum(["auto", "x", "y", "z", "radial", "none"]).optional(),
      rotation: vec3.optional(),
      rotation_range: z.object({ min: vec3, max: vec3 }).optional(),
      seed: N.optional(),
      name_prefix: S.optional(),
      parent: S.optional(),
      inflate: N.optional(),
      max_cubes: N.optional(),
    }).strict(),
    { mutation: true },
  ),
  spec(
    "extrude_chain",
    "generators",
    "Build a tapering, curving chain of segments — optionally one BONE per segment so it can be animated. Universal: tentacles, horns, antlers, claws, curved tails, tusks, branches, braids, cables. Each segment is `taper` thinner and each bone adds `curvature` degrees on top of its parent, so the chain sweeps into a curve. With create_bones:true (default) the rest pose is straight and the bones produce the curve (that is what gives a tail follow-through). Returns the tip position to attach something to.",
    z.object({
      segments: N.optional(),
      base_origin: vec3,
      segment_length: N.optional(),
      initial_size: vec2.optional(),
      taper: N.optional(),
      length_taper: N.optional(),
      curvature: vec3.optional(),
      base_rotation: vec3.optional(),
      direction: z.enum(["up", "down", "forward", "back", "left", "right"]).optional(),
      create_bones: B.optional(),
      name: S.optional(),
      inflate: N.optional(),
      parent: S.optional(),
      side: z.enum(["left", "right"]).optional(),
    }).strict(),
    { mutation: true },
  ),
  spec(
    "add_wing",
    "generators",
    "Build a complete bat / dragon / demon wing in ONE call: arm -> forearm -> a fan of finger bones plus a CONTINUOUS membrane, every panel cut from one shared outline and parented to the bone it rides on, with alternating thickness so panels never z-fight. Call once per side with the same numbers and side flipped — do not mirror a wing. Returns shoulder/elbow/wrist/tip/attach positions.",
    z.object({
      side: z.enum(["left", "right"]),
      base_origin: vec3,
      plane: z.enum(["horizontal", "vertical"]).optional(),
      fingers: N.optional(),
      arm_length: N.optional(),
      forearm_length: N.optional(),
      finger_length: z.union([N, z.array(N)]).optional(),
      arm_angle: N.optional(),
      forearm_angle: N.optional(),
      finger_spread: vec2.optional(),
      finger_angles: z.array(N).optional(),
      membrane: z.enum(["cubes", "none"]).optional(),
      membrane_attach: vec3.optional(),
      attach_to_body: B.optional(),
      membrane_thickness: N.optional(),
      bone_thickness: N.optional(),
      name: S.optional(),
      parent: S.optional(),
      max_cubes: N.optional(),
    }).strict(),
    { mutation: true },
  ),

  /* ---------------- UV ---------------- */
  spec("auto_uv_cubes", "uv", "Regenerate UVs for the given (or all) cubes in the resolved UV mode.", z.object({ cubes: z.array(S).optional(), mode: z.enum(["box", "face", "auto"]).optional() }).strict(), { mutation: true }),
  spec(
    "pack_box_uv",
    "uv",
    "Shelf-pack UV islands so no two faces share pixels. REQUIRED before texturing a box-UV model — new cubes all sit at uv_offset [0,0] and would otherwise paint onto the same pixels. Subset packing preserves other islands; auto_resize grows the atlas (power of two) while preserving paint.",
    z.object({ cubes: z.array(S).optional(), texture: textureRef, padding: N.optional(), auto_resize: B.optional(), mode: z.enum(["box", "face", "auto"]).optional(), preserve_others: B.optional(), power_of_two: B.optional(), max_size: N.optional() }).strict(),
    { mutation: true },
  ),
  spec(
    "get_uv_layout",
    "uv",
    "Machine-readable UV islands: bounds, pixel size vs expected size, texel density, flips, rotation, texture, out-of-bounds flag, plus every overlapping pair and whether the overlap is intentional. Require out_of_bounds = 0 before painting.",
    z.object({ cubes: z.array(S).optional(), include_overlaps: B.optional(), allowed_overlaps: z.array(z.object({ a: S, b: S })).optional() }).strict(),
  ),
  spec(
    "get_uv_map",
    "uv",
    "Labeled atlas preview (PNG) with island outlines and names — the visual check that your layout matches the texture.",
    z.object({ texture: textureRef, cubes: z.array(S).optional(), max_edge: N.optional(), labels: B.optional() }).strict(),
  ),
  spec(
    "set_face_uv",
    "uv",
    "Set explicit UV rectangles (and optional 0/90/180/270 rotation) per cube face.",
    z.object({ entries: z.array(z.object({ cube: S, face, uv: z.tuple([N, N, N, N]), rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional() })).min(1) }).strict(),
    { mutation: true },
  ),
  spec(
    "transform_uv_islands",
    "uv",
    "Translate / scale / quarter-turn selected UV islands about a pivot without repacking the atlas. Refuses transforms that would leave the texture bounds.",
    z.object({ faces: z.array(z.object({ cube: S, face })).min(1), translate: vec2.optional(), scale: vec2.optional(), pivot: vec2.optional(), rotate: z.enum(["0", "90", "180", "270"]).optional(), clamp_to_texture: B.optional() }).strict(),
    { mutation: true },
  ),
  spec(
    "resize_texture",
    "uv",
    "Resize the bitmap and scale every UV with it (bitmap and layout stay in sync).",
    z.object({ texture: textureRef, width: z.number().int().positive(), height: z.number().int().positive(), rescale_uvs: B.optional() }).strict(),
    { mutation: true },
  ),

  /* ---------------- texture ---------------- */
  spec("ensure_texture", "texture", "Create the texture if missing (optionally filled). Defaults 64x64 entities, 16x16 blocks.", z.object({ name: S.optional(), width: N.optional(), height: N.optional(), fill: S.optional() }).strict(), { mutation: true }),
  spec("assign_texture", "texture", "Assign a texture to cubes (all faces or specific ones).", z.object({ texture: textureRef, cubes: z.array(S).min(1), faces: z.array(face).optional() }).strict(), { mutation: true }),
  spec("get_texture", "texture", "Return a texture as an inline PNG image so you can SEE it (max_edge keeps context cheap).", z.object({ texture: textureRef, max_edge: N.optional() }).strict()),
  spec(
    "get_texture_revision",
    "texture",
    "Content hash of a texture. Pass it back as expected_revision to a precision mutation: if someone (or another agent) painted in the meantime the call fails instead of overwriting newer work.",
    z.object({ texture: textureRef }).strict(),
  ),
  spec(
    "shade_model_base",
    "texture",
    "Smooth shaded base coat on EVERY face (no bare or untextured gaps): per-face lighting, region colors matched by name regex, soft mottle and optional blur. crisp:true for pixel art (no blur). Run pack_box_uv first.",
    z.object({
      cubes: z.array(S).optional(),
      texture: textureRef,
      base: S.optional(),
      regions: z.array(z.object({ match: S, color: S })).optional(),
      top_light: N.optional(),
      bottom_dark: N.optional(),
      noise: N.optional(),
      blur: N.optional(),
      edge_darken: N.optional(),
      seed: N.optional(),
      crisp: B.optional(),
    }).strict(),
    { mutation: true },
  ),
  spec(
    "paint_face_features",
    "texture",
    "Paint features in FACE-RELATIVE coordinates (eyes, nose, mouth, trim, runes) with fill/rect/ellipse/line ops, honoring the face's UV rotation and flips. Whole batch = one undo step. This is the tool that stops you computing absolute UVs by hand.",
    z.object({
      texture: textureRef,
      faces: z
        .array(z.object({ cube: S, face, ops: z.array(paintOpSchema).min(1) }))
        .min(1),
    }).strict(),
    { mutation: true },
  ),
  spec(
    "paint_pixel_batch",
    "texture",
    "Face-local pixel brush strokes (paths with square or circle brushes, clipped to the face) committed as ONE undo step. Deterministic — same input, same pixels.",
    z.object({
      texture: textureRef,
      strokes: z.array(z.object({ cube: S, face, color: S, points: z.array(z.object({ x: N, y: N })).min(1), size: N.optional(), shape: z.enum(["square", "circle"]).optional() })).min(1),
      clip_to_face: B.optional(),
    }).strict(),
    { mutation: true },
  ),
  spec(
    "paint_face_grid",
    "texture",
    "Write an EXACT palette-indexed grid to one face. rows must match the face's texel dimensions exactly; palette values are CSS colors and null means true transparent erase. Precision pixel art in one call.",
    z.object({ texture: textureRef, cube: S, face, rows: z.array(S).min(1), palette: z.record(S, z.string().nullable()), expected_revision: S.optional() }).strict(),
    { mutation: true },
  ),
  spec(
    "get_face_grid",
    "texture",
    "Read a face back as exact RGBA texels in the same face-local orientation (plus the revision for read-modify-write).",
    z.object({ texture: textureRef, cube: S, face }).strict(),
  ),
  spec(
    "edit_texture_pixels",
    "texture",
    "Surgical RGBA writes: a list of {x,y,color} in atlas or face-local space. null clears to transparent.",
    z.object({ texture: textureRef, expected_revision: S.optional(), face: z.object({ cube: S, face }).optional(), pixels: z.array(z.object({ x: N, y: N, color: S.nullable() })).min(1) }).strict(),
    { mutation: true },
  ),
  spec(
    "replace_texture_color",
    "texture",
    "Tolerant palette revision: replace every pixel within `tolerance` of `from` with `to` (null = erase), optionally limited to one face.",
    z.object({ texture: textureRef, expected_revision: S.optional(), face: z.object({ cube: S, face }).optional(), from: S, to: S.nullable(), tolerance: N.optional() }).strict(),
    { mutation: true },
  ),
  spec(
    "copy_face_pixels",
    "texture",
    "Copy one face's pixels onto another, with flips and 0/90/180/270 rotation — the mirror-symmetry texture fix.",
    z.object({ texture: textureRef, expected_revision: S.optional(), source: z.object({ cube: S, face }), target: z.object({ cube: S, face }), flip_x: B.optional(), flip_y: B.optional(), rotation: z.enum(["0", "90", "180", "270"]).optional() }).strict(),
    { mutation: true },
  ),
  spec(
    "flood_fill_texture",
    "texture",
    "Bounded flood fill from a seed (optionally inside one face) with tolerance, diagonal option and a hard max_pixels cap so it cannot eat the atlas.",
    z.object({ texture: textureRef, expected_revision: S.optional(), face: z.object({ cube: S, face }).optional(), x: N, y: N, color: S.nullable(), tolerance: N.optional(), diagonal: B.optional(), max_pixels: N.optional() }).strict(),
    { mutation: true },
  ),
  spec(
    "transform_texture_region",
    "texture",
    "Lossless flip / 180 / quarter-turn of a region or a whole face (quarter turns require a square region).",
    z.object({ texture: textureRef, expected_revision: S.optional(), face: z.object({ cube: S, face }).optional(), rect: z.tuple([N, N, N, N]).optional(), operation: z.enum(["flip_x", "flip_y", "rotate_180", "rotate_90", "rotate_270"]) }).strict(),
    { mutation: true },
  ),
  spec("analyze_texture_palette", "texture", "Palette statistics: unique colors, per-color counts and percentages, transparent pixel count.", z.object({ texture: textureRef, face: z.object({ cube: S, face }).optional(), max_colors: N.optional() }).strict()),
  spec(
    "get_texture_region",
    "texture",
    "Checkerboard pixel zoom of a region or face with an optional 1px grid — the way to inspect a few texels at scale.",
    z.object({ texture: textureRef, face: z.object({ cube: S, face }).optional(), rect: z.tuple([N, N, N, N]).optional(), scale: N.optional(), grid: B.optional(), checkerboard: B.optional() }).strict(),
  ),
  spec(
    "audit_texture_quality",
    "texture",
    "Turns pixel-art rules into per-face findings: palette excess, weak base coverage, isolated pixels, flat fills, and (glass:true) transparent-material edge/center alpha structure.",
    z.object({ texture: textureRef, faces: z.array(z.object({ cube: S, face })).optional(), palette_limit: N.optional(), min_base_ratio: N.optional(), glass: B.optional() }).strict(),
  ),
  spec(
    "import_texture_png",
    "texture",
    "Import a PNG from the scoped directory into the project (optionally replacing an existing texture with a revision check).",
    z.object({ path: S, texture: textureRef, name: S.optional(), resize_project: B.optional(), expected_revision: S.optional() }).strict(),
    { mutation: true },
  ),
  spec(
    "export_texture_png",
    "texture",
    "Write a texture out as PNG into the scoped directory.",
    z.object({ path: S, texture: textureRef, overwrite: B.optional() }).strict(),
    { mutation: true },
  ),
  spec(
    "ensure_material_set",
    "texture",
    "Create a consistent channel sheet set (base/emissive/normal/specular) at one size — PBR-ready naming without pretending every format exports the same material semantics.",
    z.object({ prefix: S, width: z.number().int().positive(), height: z.number().int().positive(), channels: z.array(z.enum(["base", "emissive", "normal", "specular"])).min(1), fills: z.record(S, S).optional() }).strict(),
    { mutation: true },
  ),
  spec(
    "audit_material_set",
    "texture",
    "Validate channel sheets agree on dimensions, power-of-two and naming prefix before export.",
    z.object({ channels: z.object({ base: S, emissive: S.optional(), normal: S.optional(), specular: S.optional() }), require_power_of_two: B.optional(), naming_prefix: S.optional() }).strict(),
  ),

  /* ---------------- animation ---------------- */
  spec(
    "upsert_animation",
    "animation",
    "Create or fully replace an animation with keyframes for named bones (rotation/position/scale channels, linear/catmullrom/step interpolation). replace:true is required to overwrite an existing clip.",
    z.object({
      name: S,
      length: N,
      loop: z.enum(["once", "hold", "loop"]).optional(),
      replace: B.optional(),
      bones: z.record(S, z.object({
        rotation: z.array(z.object({ time: N, value: vec3, interpolation: z.enum(["linear", "catmullrom", "step"]).optional() })).optional(),
        position: z.array(z.object({ time: N, value: vec3, interpolation: z.enum(["linear", "catmullrom", "step"]).optional() })).optional(),
        scale: z.array(z.object({ time: N, value: vec3, interpolation: z.enum(["linear", "catmullrom", "step"]).optional() })).optional(),
      })).optional(),
    }).strict(),
    { mutation: true },
  ),
  spec(
    "generate_animation",
    "animation",
    "Write a complete, direction-correct base cycle for an existing rig: idle, walk, run, attack, cast, jump, hurt, death, fly. Applies the real rotation signs (+X swings a hanging limb forward, elbows +X, knees -X), opposite-phase limbs, body counter-rotation, follow-through and a seamless loop. Use it instead of hand-authoring 40 keyframes.",
    z.object({
      name: S.optional(),
      type: z.enum(["idle", "walk", "run", "attack", "cast", "jump", "hurt", "death", "fly"]),
      length: N.optional(),
      bones: z.object({
        body: S.optional(),
        head: S.optional(),
        arm_left: S.optional(),
        arm_right: S.optional(),
        leg_left: S.optional(),
        leg_right: S.optional(),
        tail: S.optional(),
        wing_left: S.optional(),
        wing_right: S.optional(),
      }).optional(),
      amplitude: N.optional(),
      replace: B.optional(),
    }).strict(),
    { mutation: true },
  ),
  spec("inspect_animation", "animation", "Read an animation's exact keys (per bone, per channel, with times and values) before revising it.", z.object({ name: S }).strict()),
  spec(
    "transform_animation_keys",
    "animation",
    "Bounded retiming (time_scale/time_offset), value scaling and axis-aware mirroring of keyframes, optionally limited to some bones.",
    z.object({ name: S, bones: z.array(S).optional(), time_scale: N.optional(), time_offset: N.optional(), value_scale: vec3.optional(), mirror_axis: z.enum(["x", "y", "z"]).optional() }).strict(),
    { mutation: true },
  ),
  spec("delete_animation", "animation", "Delete an animation by name.", z.object({ name: S }).strict(), { mutation: true }),
  spec("set_timeline_time", "animation", "Pose the model at a time in the current animation so capture_views renders that frame.", z.object({ time: N, animation: S.optional() }).strict(), { mutation: true }),

  /* ---------------- quality gates ---------------- */
  spec(
    "check_model",
    "quality",
    "Audit the model for what makes results look broken: empty groups, zero-volume cubes, slivers, untextured faces, out-of-bounds UVs, unintended UV overlaps, bad pivots, orphan parents, significant overlaps and COPLANAR z-fighting. Run after building and again after texturing, then fix every error.",
    z.object({ allow_overlaps: z.array(z.object({ a: S, b: S })).optional() }).strict(),
  ),
  spec(
    "audit_complexity",
    "quality",
    "THE detail gate. Grades the model against a cube budget (prop 30-60, mob 100-180, hero 180-300+) and reports monolithic boxes, layering, micro-detail density, bare slabs, hierarchy depth and rotation. verdict too_primitive means a blockout — do not texture it yet. Run before the texturing pass.",
    z.object({ target: z.enum(["auto", "prop", "character", "creature", "hero"]).optional(), min_cubes: N.optional(), monolith_share: N.optional(), min_overlays: N.optional(), flat_face_area: N.optional() }).strict(),
  ),
  spec(
    "check_rig",
    "quality",
    "Rig quality: two-bone limbs that will animate like cardboard, loose cubes not parented to a bone, and pivots far from the joint. Run before animating.",
    z.object({}).strict(),
  ),

  /* ---------------- views ---------------- */
  spec(
    "capture_views",
    "views",
    "Render labelled orthographic views as inline images so you can LOOK at your own work and iterate. Views are named from the MODEL's point of view (front = its face; a front view is mirrored, so each capture reports which edge is the model's right). Does not move the model or the user's camera.",
    z.object({ views: z.array(z.enum(["north", "south", "east", "west", "up", "down", "iso"])).optional(), max_edge: N.optional(), format: z.enum(["png", "jpeg"]).optional(), quality: N.optional() }).strict(),
  ),
  spec(
    "analyze_view_silhouette",
    "views",
    "Numeric multi-view bounds and coverage from captures: silhouette size, foreground pixels, coverage — a cheap objective check that the model is actually visible and framed.",
    z.object({ views: z.array(z.enum(["north", "south", "east", "west", "up", "down", "iso"])).optional(), max_edge: N.optional(), alpha_threshold: N.optional(), luminance_threshold: N.optional() }).strict(),
  ),
  spec("set_camera_angle", "views", "Aim the viewport camera with an angle preset or an explicit position/target.", z.object({ preset: z.enum(["north", "south", "east", "west", "up", "down", "iso"]).optional(), position: vec3.optional(), target: vec3.optional() }).strict(), { mutation: true }),

  /* ---------------- reference matching ---------------- */
  spec("load_reference", "reference", "Load a reference image (path inside the approved directory, or a data URL) and keep it in memory for compare_reference / get_reference. Note: it is NOT drawn as a viewport overlay — comparison is done numerically by compare_reference.", z.object({ path: S.optional(), data_url: S.optional(), name: S.optional() }).strict(), { mutation: true }),
  spec("list_references", "reference", "List loaded reference images (id, name, size, source).", z.object({}).strict()),
  spec("get_reference", "reference", "Return the reference image(s) as inline images so you can actually SEE what to build.", z.object({ name: S.optional(), id: S.optional() }).strict()),
  spec("clear_references", "reference", "Remove all loaded references and their overlays.", z.object({}).strict(), { mutation: true }),
  spec(
    "compare_reference",
    "reference",
    "THE reference-matching tool: renders your model from the same angle, extracts both silhouettes, normalises them (so viewport framing does not matter) and returns match_percent (silhouette IoU), aspect_delta_pct, ref_only_pct (MISSING mass), model_only_pct (EXTRA mass), a verdict, concrete advice and a composite [reference | model] image. Iterate until match_percent >= 85 — do not judge by eye.",
    z.object({
      reference: S.optional(),
      view: z.enum(["north", "south", "east", "west", "up", "down", "iso"]).optional(),
      alpha_threshold: N.optional(),
    }).strict(),
  ),

  /* ---------------- human review ---------------- */
  spec(
    "ask_user",
    "review",
    "Ask the user a question through a dialog inside Blockbench and wait for the answer without ending your turn — for decisions that are genuinely theirs. Optional one-click options and reference views. Returns pending:true + review_id when unanswered; keep polling with wait_review (pending is not an answer).",
    z.object({ question: S, title: S.optional(), details: S.optional(), options: z.array(S).optional(), views: z.array(S).optional(), wait_seconds: N.optional(), timeout_seconds: N.optional() }).strict(),
  ),
  spec(
    "request_review",
    "review",
    "Show the user your current work in a dialog inside Blockbench and WAIT for their verdict (Approve / Needs changes). Call it after every user-visible milestone and before claiming a task is finished. Run the objective gates first — do not spend the user's attention on something a tool would catch. pending or a timeout is NOT approval.",
    z.object({ question: S, title: S.optional(), details: S.optional(), views: z.array(S).optional(), animation: S.optional(), times: z.array(N).optional(), options: z.array(S).optional(), wait_seconds: N.optional(), timeout_seconds: N.optional() }).strict(),
  ),
  spec("wait_review", "review", "Keep waiting for a review/question the user has not answered yet. Call in a loop with the review_id — that is how a minutes-long human review fits inside a client's request timeout.", z.object({ review_id: S.optional(), wait_seconds: N.optional() }).strict()),

  /* ---------------- universal coverage ---------------- */
  spec("list_actions", "coverage", "Enumerate every Blockbench registered command/tool/toggle/select (the full menu + toolbar surface). Pair with run_action to reach anything without a dedicated tool.", z.object({ filter: S.optional() }).strict()),
  spec("get_action", "coverage", "Details about one Blockbench action/command by id.", z.object({ id: S }).strict()),
  spec("run_action", "coverage", "Run ANY Blockbench command by id, with an optional value for toggles/selects/sliders. Combine with select_action + list_actions for full UI coverage without a bespoke tool.", z.object({ id: S, value: z.unknown().optional() }).strict(), { mutation: true }),
  spec("select_action", "coverage", "Set what is selected in the outliner so selection-based commands act on the right elements.", z.object({ refs: z.array(S).min(1), mode: z.enum(["replace", "add"]).optional() }).strict(), { mutation: true }),
  spec("list_modes", "coverage", "List Blockbench editor modes (edit, paint, animate, display, ...).", z.object({}).strict()),
  spec("set_mode", "coverage", "Switch the editor mode by id.", z.object({ id: S }).strict(), { mutation: true }),
  spec("list_settings", "coverage", "List Blockbench settings (id, name, value, type, category).", z.object({ category: S.optional() }).strict()),
  spec("get_setting", "coverage", "Read one Blockbench setting.", z.object({ id: S }).strict()),
  spec("set_setting", "coverage", "Write one Blockbench setting (validated by Blockbench itself).", z.object({ id: S, value: z.unknown() }).strict(), { mutation: true }),
  spec("list_plugins", "coverage", "List plugins: installed:true entries plus the store catalog the user could install (id, title, version, author, installed, disabled).", z.object({}).strict()),
  spec("install_plugin", "coverage", "Install a Blockbench plugin from the store by id (e.g. 'geckolib' before creating a geckolib_model project) or from a URL. If the entry is not installable on this platform the reason is returned instead of a silent failure.", z.object({ id: S.optional(), url: S.optional() }).strict(), { mutation: true }),
  spec("uninstall_plugin", "coverage", "Uninstall a Blockbench plugin by id.", z.object({ id: S }).strict(), { mutation: true }),

  /* ---------------- history & escape hatch ---------------- */
  spec("undo", "history", "Undo the last edit (works on AI edits and user edits alike).", z.object({}).strict(), { mutation: true }),
  spec("redo", "history", "Redo the last undone edit.", z.object({}).strict(), { mutation: true }),
  spec(
    "execute_script",
    "history",
    "Escape hatch: run arbitrary Blockbench JavaScript as the body of an async function (you may await and return a value; the full API — Cube, Group, Texture, Animation, Undo, Canvas, Project, Format, BarItems, Painter, Timeline — is in scope). Use dedicated tools where they exist. DISABLED unless the user turns on 'Allow execute_script' in Blockbench settings.",
    z.object({ code: S, timeout_seconds: N.optional() }).strict(),
    { mutation: true, gated: true },
  ),
]);

export const TOOL_NAMES = Object.keys(TOOL_SPECS);
export const TOOL_GROUPS = [...new Set(Object.values(TOOL_SPECS).map((t) => t.group))];

/** name + description + JSON input schema(MCP tools/list 负载由插件生成) */
export function listToolsPayload(): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}> {
  return Object.values(TOOL_SPECS).map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: zodToJsonSchemaSafe(tool.params),
  }));
}

/** 极小 JSON-Schema 生成器,避免额外依赖 (仅覆盖本目录用到的结构) */
export function zodToJsonSchemaSafe(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = (schema as unknown as { _def?: { typeName?: string } })._def;
  const typeName = def?.typeName;
  if (typeName === "ZodObject") {
    const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchemaSafe(value as z.ZodTypeAny);
      if (!(value as z.ZodTypeAny).isOptional()) required.push(key);
    }
    return {
      type: "object",
      properties,
      ...(required.length ? { required } : {}),
    };
  }
  if (typeName === "ZodOptional" || typeName === "ZodDefault") {
    const inner = (schema as unknown as { _def: { innerType: z.ZodTypeAny } })._def.innerType;
    return zodToJsonSchemaSafe(inner);
  }
  if (typeName === "ZodNullable") {
    const inner = (schema as unknown as { _def: { innerType: z.ZodTypeAny } })._def.innerType;
    return zodToJsonSchemaSafe(inner);
  }
  if (typeName === "ZodString") return { type: "string" };
  if (typeName === "ZodNumber") {
    const checks = (schema as unknown as { _def: { checks?: Array<{ kind: string }> } })._def.checks ?? [];
    const integer = checks.some((c) => c.kind === "int");
    return { type: integer ? "integer" : "number" };
  }
  if (typeName === "ZodBoolean") return { type: "boolean" };
  if (typeName === "ZodLiteral") {
    const value = (schema as unknown as { _def: { value: unknown } })._def.value;
    return { const: value, type: typeof value };
  }
  if (typeName === "ZodEnum") {
    const values = (schema as unknown as { _def: { values: string[] } })._def.values;
    return { type: "string", enum: values };
  }
  if (typeName === "ZodNativeEnum") {
    const values = Object.values(
      (schema as unknown as { _def: { values: Record<string, string> } })._def.values,
    );
    return { type: "string", enum: values };
  }
  if (typeName === "ZodArray") {
    const inner = (schema as unknown as { _def: { type: z.ZodTypeAny } })._def.type;
    return { type: "array", items: zodToJsonSchemaSafe(inner) };
  }
  if (typeName === "ZodTuple") {
    const items = (schema as unknown as { _def: { items: z.ZodTypeAny[] } })._def.items;
    return { type: "array", items: items.map((i) => zodToJsonSchemaSafe(i)) };
  }
  if (typeName === "ZodRecord") {
    const value = (schema as unknown as { _def: { valueType: z.ZodTypeAny } })._def.valueType;
    return { type: "object", additionalProperties: zodToJsonSchemaSafe(value) };
  }
  if (typeName === "ZodUnion" || typeName === "ZodDiscriminatedUnion") {
    const options =
      (schema as unknown as { _def: { options: z.ZodTypeAny[] } })._def.options ?? [];
    return { anyOf: options.map((o) => zodToJsonSchemaSafe(o)) };
  }
  if (typeName === "ZodEffects") {
    const inner = (schema as unknown as { _def: { schema: z.ZodTypeAny } })._def.schema;
    return zodToJsonSchemaSafe(inner);
  }
  if (typeName === "ZodAny" || typeName === "ZodUnknown") return {};
  return {};
}

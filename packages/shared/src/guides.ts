/** LLM 指南(playbook) —— 让模型按正确顺序建模,而不是"15 个扁方块" */
export const GUIDE_MODELING = `
# Modeling (Blockbench 5.1+)

## Mandatory workflow
1. health + get_project_summary first: read format and uv_mode before touching anything.
2. create_project(format, uv_mode, texture_width/height). java_block => face UV. Bedrock/GeckoLib => box or face, preserve the reference project's mode.
3. Entities: scaffold_biped first (real joint pivots). Props/blocks: apply_geometry_batch for the primary masses.
4. check_model immediately. Fix every error BEFORE texturing.
5. Add density with the generators, not by hand-computing coordinates:
   - add_hollow_volume: hoods, helmets, armour shells, cages (a shell with a real cavity)
   - generate_array: hems, scales, plates, teeth, spikes, rivets, fence posts (depth_stagger >= 0.05 stops z-fighting)
   - extrude_chain: horns, tails, tentacles, braids (create_bones:true so it animates)
   - add_wing: complete bat/dragon wing with continuous membrane
   - voxelize_matrix: draw a silhouette as pixel art; blades, emblems, fins, keys
6. measure_model instead of hand-calculating extents (accounts for rotations). audit_symmetry for explicit left/right pairs. transform_elements for relative edits.
7. Texturing: pack_box_uv -> shade_model_base -> paint_face_features. Re-check get_uv_layout before painting.
8. capture_views only after check_model is clean. Then fix what you SEE and repeat.

## UV mode (never mix blindly)
- Read uv_mode from health / get_project_summary.
- java_block => per-face (face). Bedrock supports box or face. GeckoLib/skin => box.
- pack_box_uv / auto_uv_cubes follow Project/Format; override only with mode box|face.

## Proportions & hygiene
- Even integer sizes (2/4/6/8). Silhouette first; 8-20 well-placed cubes beat 80 random ones.
- Biped scale=1: head 8^3, body 8x12x4, limbs 4x12x4, feet on y=0.
- Bone origins sit ON the joint (hip top / shoulder / neck). A pivot in the middle makes limbs spin like propellers.
- Hierarchy: root -> body -> head / arm_* / leg_*. Animate bones, never loose cubes.
- Cube budget: prop 30-60, mob 100-180, hero 180-300+. audit_complexity enforces it.
`.trim();

export const GUIDE_ORIENTATION = `
# Orientation & rotation signs (the #1 source of wrong models)

- A Minecraft model faces -Z. Its OWN right is +X, its left is -X.
- A front-view render shows the model MIRRORED: its right hand appears on the LEFT of the image, exactly like facing a person.
- +X rotation lifts a bone's front: a DOWN-pointing bone (arm/leg) swings its tip FORWARD; an UP-pointing bone (torso/neck) tips BACKWARD.
- Elbows bend +X, knees bend -X. +Y turns the model toward its own left.
- Pass side:"left"|"right" to apply_geometry_batch / generators: the tool REJECTS a call whose coordinates contradict the declared side.
- Call which_side / check_sides instead of guessing from a picture.
`.trim();

export const GUIDE_DETAILING = `
# Detailing doctrine (fixes "AI models are 15 flat boxes")

1. Blockout: primary masses only, check_model clean.
2. Layering: never one cube per body part. A large mass needs >= 4 smaller pieces on/over it.
3. Four layers per major form: (a) core mass, (b) shell/overlay, (c) surface detail (edges, trims, straps), (d) micro detail (rivets, stitches, scales).
4. Silhouette breakers: horns, ears, tails, cloth, plates. Anything that makes the outline interesting.
5. Anti z-fighting: overlapping cubes must clearly penetrate (>= 0.1) or be staggered; never align two faces to the same coordinate.
6. Run audit_complexity before texturing. verdict too_primitive means a blockout wearing a costume — keep building.
`.trim();

export const GUIDE_TEXTURING = `
# Texturing

1. ensure_texture (64 for entities, 16 for blocks) then pack_box_uv (subset packing preserves other islands).
2. get_uv_layout: require out_of_bounds = 0, review every overlap, compare density across related faces.
3. get_uv_map to visually confirm island placement, orientation and flips.
4. Fast base: shade_model_base (regions per name pattern, top lighting, mottle). Set crisp:true for pixel art.
5. Authored work: call get_texture_revision before a long plan and pass expected_revision to precision mutations — a stale plan then fails instead of overwriting newer paint.
6. paint_face_grid writes an exact palette-indexed grid (rows must match the face exactly, null = transparent). get_face_grid reads the same orientation back.
7. paint_face_features / paint_pixel_batch for accents; edit_texture_pixels for surgical RGBA edits; replace_texture_color for palette revisions; copy_face_pixels for mirrored parts.
8. flood_fill_texture only with a face or a conservative max_pixels. transform_texture_region for lossless flips/turns.
9. Finish with analyze_texture_palette + audit_texture_quality (glass:true for transparent materials), then check_model again.
10. PNG import/export requires propose_scoped_directory and stays inside that user-approved folder.
`.trim();

export const GUIDE_ANIMATION = `
# Animation

1. Rig first (scaffold_biped / create_limb / extrude_chain create_bones:true). Never keyframe loose cubes.
2. generate_animation writes a complete direction-correct base cycle: idle, walk, run, attack, cast, jump, hurt, death, fly.
   - Elbows bend +X, knees bend -X, +X swings a hanging limb forward.
   - Walk/run use opposite-phase limbs, body counter-rotation, follow-through, seamless loop.
3. inspect_animation reads exact keys before revising. transform_animation_keys retimes / scales / mirrors keys.
4. upsert_animation(replace:true) for a full replacement.
5. set_timeline_time to pose a frame, then capture_views to LOOK at it.
6. Finish with check_model + capture_views; do not claim an animation is done from the numbers alone.
`.trim();

export const GUIDE_REVIEW = `
# Human review

Work is not done because you looked at your own screenshot.

- ask_user: a decision that is genuinely the user's (which hand holds the shield, which palette).
- request_review: a milestone (blockout, texture pass, each animation) — the user presses Approve / Needs changes.
- Both return pending:true with a review_id if the user has not answered yet; keep calling wait_review with that id.
  pending is NOT approval, and neither is a timeout.
- Run the objective gates (check_model / check_sides / check_rig / audit_complexity) BEFORE asking for attention.
`.trim();

export const GUIDE_REFERENCE = `
# Reference matching

1. The user may drop a reference image into the MCP panel (or you load_reference from a path/data URL).
2. get_reference returns it as an inline image — actually LOOK at it, and re-look during the build.
3. compare_reference renders your model from the same angle, extracts both silhouettes, normalises them and returns
   match_percent (IoU), aspect_delta_pct, ref_only_pct (missing mass), model_only_pct (extra mass) and a composite image.
4. Iterate until match_percent >= 85. Do not declare a match by eye.
5. measure_model gives the numbers behind the silhouette (width:height, depth:height, head fraction).
`.trim();

export const GUIDE_VFX = `
# Pixel VFX

- A flat two-sided plane is the building block: use add_wing/voxelize_matrix or apply_geometry_batch with a zero-depth cube.
- Give the plane render_sides "double" (set_texture_render_mode) so it is visible from both sides.
- Palette: 3-5 colors with a hard alpha cutout for flames/energy/slashes. No smooth gradients in pixel VFX.
- Parent each sheet to a bone so it animates. animation with step interpolation for a strobing flame.
`.trim();

export const GUIDE_TOPICS = [
  "modeling",
  "detailing",
  "orientation",
  "texturing",
  "vfx",
  "animation",
  "review",
  "reference",
] as const;
export type GuideTopic = (typeof GUIDE_TOPICS)[number];

const GUIDES: Record<GuideTopic, string> = {
  modeling: GUIDE_MODELING,
  detailing: GUIDE_DETAILING,
  orientation: GUIDE_ORIENTATION,
  texturing: GUIDE_TEXTURING,
  vfx: GUIDE_VFX,
  animation: GUIDE_ANIMATION,
  review: GUIDE_REVIEW,
  reference: GUIDE_REFERENCE,
};

export function resolveGuide(topic?: string): { topic: GuideTopic; text: string } {
  const key = (topic ?? "modeling") as GuideTopic;
  if (!(key in GUIDES))
    return { topic: "modeling", text: GUIDES.modeling };
  return { topic: key, text: GUIDES[key] };
}

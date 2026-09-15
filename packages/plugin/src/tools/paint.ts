/** UV 与纹理工具 —— 五项目里最实用的纹理能力(面局部绘制 / revision / 质检) */
import {
  FACE_NAMES,
  auditFacePixels,
  collectUvIslands,
  faceLocalToAtlas,
  findUvOverlaps,
  makeRandom,
  nextPowerOfTwo,
  parseColor,
  planUvPack,
  regionColorFor,
  resolveFaceSpace,
  revisionFromPixels,
  shadeHex,
  toHex,
  type FaceName,
  type UvMode,
  type Vec3,
} from "@bbmcp/shared";
import { CommandError } from "../errors.js";
import {
  findTexture,
  refreshCanvas,
  requireCube,
  requireProject,
  resolveUvMode,
  snapshotElements,
  withUndo,
} from "../bb.js";
import { createTexture, listTextures, toast, wrapTexture } from "../host.js";
import { readScopedFile, writeScopedFile } from "../session.js";
import type { ToolHandler } from "../dispatch.js";

/* ------------------------------------------------------------------ helpers */

function textureOrThrow(ref?: string) {
  requireProject();
  const texture = findTexture(ref);
  if (!texture)
    throw new CommandError(
      "E_NOT_FOUND",
      ref ? `Texture not found: ${ref}` : "No texture — call ensure_texture first.",
    );
  return texture;
}

function faceSpaceOf(cubeRef: string, face: string) {
  const cube = requireCube(cubeRef);
  const faceObj = cube.faces?.[face];
  if (!faceObj) throw new CommandError("E_NOT_FOUND", `Face not found: ${cubeRef}.${face}`);
  return { cube, face: face as FaceName, space: resolveFaceSpace(faceObj.uv, faceObj.rotation) };
}

function imageOf(texture: ReturnType<typeof textureOrThrow>): ImageData {
  return texture.read((ctx, canvas) => ctx.getImageData(0, 0, canvas.width, canvas.height));
}

function revisionOf(texture: ReturnType<typeof textureOrThrow>): string {
  return texture.read((ctx, canvas) =>
    revisionFromPixels(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height),
  );
}

function assertRevision(texture: ReturnType<typeof textureOrThrow>, expected?: string): void {
  if (!expected) return;
  const actual = revisionOf(texture);
  if (actual !== expected)
    throw new CommandError(
      "E_PARTIAL_FORBIDDEN",
      "Texture changed since it was read; call get_texture_revision again and redo the edit.",
      { expected, actual },
    );
}

function rgbaOf(color: string | null): [number, number, number, number] {
  if (color === null) return [0, 0, 0, 0];
  const parsed = parseColor(color);
  if (!parsed) throw new CommandError("E_INVALID_PARAM", `Invalid CSS color: ${color}`);
  return parsed;
}

function setPixel(image: ImageData, x: number, y: number, rgba: [number, number, number, number]): boolean {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return false;
  image.data.set(rgba, (y * image.width + x) * 4);
  return true;
}

function getPixel(image: ImageData, x: number, y: number): [number, number, number, number] {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return [0, 0, 0, 0];
  const i = (y * image.width + x) * 4;
  return [image.data[i], image.data[i + 1], image.data[i + 2], image.data[i + 3]];
}

/** 把"面局部"的绘制结果栅格化进图集(尊重 rotation 与 UV 翻转) */
function paintFaceLocal(
  atlas: ImageData,
  space: ReturnType<typeof resolveFaceSpace>,
  paint: (ctx: CanvasRenderingContext2D) => void,
): void {
  const local = document.createElement("canvas");
  local.width = space.width;
  local.height = space.height;
  const ctx = local.getContext("2d");
  if (!ctx) throw new CommandError("E_BLOCKBENCH_ERROR", "No 2d context");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, local.width, local.height);
  paint(ctx);
  const data = ctx.getImageData(0, 0, local.width, local.height).data;
  for (let y = 0; y < local.height; y += 1) {
    for (let x = 0; x < local.width; x += 1) {
      const i = (y * local.width + x) * 4;
      if (data[i + 3] === 0) continue;
      const [ax, ay] = faceLocalToAtlas(space, x, y);
      setPixel(atlas, ax, ay, [data[i], data[i + 1], data[i + 2], data[i + 3]]);
    }
  }
}

function writeImage(
  texture: ReturnType<typeof textureOrThrow>,
  image: ImageData,
  label: string,
): void {
  texture.edit((ctx) => ctx.putImageData(image, 0, 0), label);
}

function blurRegion(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, amount: number): void {
  if (w < 2 || h < 2 || amount <= 0) return;
  const src = ctx.getImageData(x, y, w, h);
  const out = ctx.createImageData(w, h);
  for (let py = 0; py < h; py += 1)
    for (let px = 0; px < w; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy += 1)
        for (let dx = -1; dx <= 1; dx += 1) {
          const sx = px + dx;
          const sy = py + dy;
          if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
          const i = (sy * w + sx) * 4;
          r += src.data[i];
          g += src.data[i + 1];
          b += src.data[i + 2];
          a += src.data[i + 3];
          n += 1;
        }
      const o = (py * w + px) * 4;
      out.data[o] = Math.round(src.data[o] * (1 - amount) + (r / n) * amount);
      out.data[o + 1] = Math.round(src.data[o + 1] * (1 - amount) + (g / n) * amount);
      out.data[o + 2] = Math.round(src.data[o + 2] * (1 - amount) + (b / n) * amount);
      out.data[o + 3] = Math.round(src.data[o + 3] * (1 - amount) + (a / n) * amount);
    }
  ctx.putImageData(out, x, y);
}

/* --------------------------------------------------------------------- tools */

export const paintTools: Record<string, ToolHandler> = {
  /* ------------------------------- UV ------------------------------- */

  auto_uv_cubes: (args: { cubes?: string[]; mode?: UvMode | "auto" }) => {
    requireProject();
    const list = args?.cubes?.length
      ? args.cubes.map((ref) => requireCube(ref))
      : [...(Cube?.all ?? [])];
    if (!list.length) throw new CommandError("E_NOT_FOUND", "No cubes to UV.");
    const mode = resolveUvMode(args?.mode ?? "auto");
    return withUndo({ elements: list, uv_only: true }, "auto_uv_cubes", () => {
      for (const cube of list) {
        cube.box_uv = mode === "box";
        cube.autouv = 1;
        cube.mapAutoUV?.();
      }
      refreshCanvas(list.map((c: any) => ({ uuid: c.uuid })));
      return { ok: true, undo_label: "auto_uv_cubes", mode, updated: list.map((c: any) => c.uuid) };
    });
  },

  pack_box_uv: (args: any) => {
    requireProject();
    const list = args?.cubes?.length ? args.cubes.map((ref: string) => requireCube(ref)) : [...(Cube?.all ?? [])];
    if (!list.length) throw new CommandError("E_NOT_FOUND", "No cubes to pack UV.");
    const mode = resolveUvMode(args?.mode ?? "auto");
    const pad = args?.padding ?? 1;
    let texW = Project?.texture_width ?? 64;
    let texH = Project?.texture_height ?? 64;
    const texture = findTexture(args?.texture);
    const selected = new Set(list.map((c: any) => c.uuid));
    const islands = collectUvIslands(
      (Cube?.all ?? []).map((cube: any) => ({
        uuid: cube.uuid,
        name: cube.name,
        from: cube.from,
        to: cube.to,
        faces: cube.faces ?? {},
      })),
      texW,
      texH,
    );
    const fixed = args?.preserve_others === false ? [] : islands.filter((i) => !selected.has(i.cube_uuid));
    const startY = fixed.length ? Math.ceil(Math.max(...fixed.map((i) => i.bounds[3])) + pad) : 0;

    return withUndo(
      { elements: list, textures: texture ? [texture.raw] : [], bitmap: Boolean(texture), uv_only: true },
      "pack_box_uv",
      () => {
        const plan = planUvPack(
          list.map((cube: any) => ({ uuid: cube.uuid, name: cube.name, from: cube.from, to: cube.to })),
          { mode, texW, padding: pad, startY },
        );
        if (plan.mode === "box") {
          for (const item of plan.items) {
            const cube = list.find((c: any) => c.uuid === item.uuid);
            if (!cube) continue;
            cube.box_uv = true;
            cube.uv_offset = item.uv_offset;
            cube.autouv = 0;
            cube.mapAutoUV?.();
          }
        } else {
          for (const item of plan.items) {
            const cube = list.find((c: any) => c.uuid === item.uuid);
            if (!cube) continue;
            cube.box_uv = false;
            cube.autouv = 0;
            for (const face of item.faces) if (cube.faces?.[face.face]) cube.faces[face.face].uv = face.uv;
          }
        }
        const used = plan.used;
        if (args?.auto_resize === false && (used[0] > texW || used[1] > texH))
          throw new CommandError(
            "E_INVALID_PARAM",
            `Packed UV extent ${used[0]}x${used[1]} exceeds atlas ${texW}x${texH}; enable auto_resize.`,
          );
        if (args?.auto_resize !== false) {
          let needW = Math.max(texW, used[0]);
          let needH = Math.max(texH, used[1]);
          if (args?.power_of_two !== false) {
            needW = nextPowerOfTwo(needW);
            needH = nextPowerOfTwo(needH);
          }
          const maxSize = args?.max_size ?? 1024;
          if (needW > maxSize || needH > maxSize)
            throw new CommandError(
              "E_INVALID_PARAM",
              `Packed atlas needs ${needW}x${needH}, over max_size ${maxSize}.`,
            );
          if (needW !== texW || needH !== texH) {
            texW = needW;
            texH = needH;
            if (Project) {
              Project.texture_width = texW;
              Project.texture_height = texH;
            }
            texture?.edit((ctx, canvas) => {
              if (canvas.width >= texW && canvas.height >= texH) return;
              const previous = document.createElement("canvas");
              previous.width = canvas.width;
              previous.height = canvas.height;
              previous.getContext("2d")?.drawImage(canvas, 0, 0);
              canvas.width = Math.max(canvas.width, texW);
              canvas.height = Math.max(canvas.height, texH);
              ctx.imageSmoothingEnabled = false;
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(previous, 0, 0);
            }, "pack_box_uv resize");
          }
        }
        for (const cube of list) texture?.applyToCube(cube.uuid, true);
        refreshCanvas(list.map((c: any) => ({ uuid: c.uuid })));
        return {
          ok: true,
          undo_label: "pack_box_uv",
          mode,
          packed: list.length,
          used,
          texture_size: [texW, texH],
        };
      },
    );
  },

  get_uv_layout: (args: { cubes?: string[]; include_overlaps?: boolean; allowed_overlaps?: Array<{ a: string; b: string }> }) => {
    requireProject();
    const all = collectUvIslands(
      (Cube?.all ?? []).map((cube: any) => ({
        uuid: cube.uuid,
        name: cube.name,
        from: cube.from,
        to: cube.to,
        faces: cube.faces ?? {},
      })),
      Project?.texture_width ?? 16,
      Project?.texture_height ?? 16,
    );
    const wanted = args?.cubes?.length ? new Set(args.cubes) : null;
    const islands = wanted
      ? all.filter((i) => wanted.has(i.cube) || wanted.has(i.cube_uuid))
      : all;
    const overlaps = args?.include_overlaps === false ? [] : findUvOverlaps(islands, args?.allowed_overlaps ?? []);
    const used = islands.length
      ? ([
          Math.min(...islands.map((i) => i.bounds[0])),
          Math.min(...islands.map((i) => i.bounds[1])),
          Math.max(...islands.map((i) => i.bounds[2])),
          Math.max(...islands.map((i) => i.bounds[3])),
        ] as [number, number, number, number])
      : [0, 0, 0, 0];
    return {
      texture_size: [Project?.texture_width ?? 16, Project?.texture_height ?? 16],
      islands,
      overlaps,
      summary: {
        islands: islands.length,
        out_of_bounds: islands.filter((i) => i.out_of_bounds).length,
        overlaps: overlaps.length,
        unintended_overlaps: overlaps.filter((o) => !o.intentional).length,
        used,
      },
    };
  },

  get_uv_map: async (args: { texture?: string; cubes?: string[]; max_edge?: number; labels?: boolean }) => {
    requireProject();
    const texture = findTexture(args?.texture);
    const width = Project?.texture_width ?? texture?.width ?? 16;
    const height = Project?.texture_height ?? texture?.height ?? 16;
    const scale = Math.min(args?.max_edge ?? 512, 1024) / Math.max(width, height, 1);
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(width * scale));
    out.height = Math.max(1, Math.round(height * scale));
    const ctx = out.getContext("2d");
    if (!ctx) throw new CommandError("E_BLOCKBENCH_ERROR", "No 2d context");
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#20242b";
    ctx.fillRect(0, 0, out.width, out.height);
    if (texture) {
      const dataUrl = texture.toDataURL(Math.max(width, height));
      await new Promise<void>((resolve) => {
        const image = new Image();
        image.onload = () => {
          ctx.drawImage(image, 0, 0, out.width, out.height);
          resolve();
        };
        image.onerror = () => resolve();
        image.src = dataUrl;
      });
    }
    const all = collectUvIslands(
      (Cube?.all ?? []).map((cube: any) => ({
        uuid: cube.uuid,
        name: cube.name,
        from: cube.from,
        to: cube.to,
        faces: cube.faces ?? {},
      })),
      width,
      height,
    );
    const wanted = args?.cubes?.length ? new Set(args.cubes) : null;
    const islands = wanted ? all.filter((i) => wanted.has(i.cube) || wanted.has(i.cube_uuid)) : all;
    ctx.lineWidth = Math.max(1, scale / 4);
    ctx.font = `${Math.max(8, Math.round(scale * 2))}px monospace`;
    islands.forEach((island, index) => {
      const hue = (index * 137.508) % 360;
      ctx.strokeStyle = `hsl(${hue} 90% 65%)`;
      ctx.strokeRect(
        island.bounds[0] * scale,
        island.bounds[1] * scale,
        island.pixel_size[0] * scale,
        island.pixel_size[1] * scale,
      );
      if (args?.labels !== false && scale >= 2) {
        ctx.fillStyle = `hsl(${hue} 90% 75%)`;
        ctx.fillText(`${island.cube}.${island.face}`, island.bounds[0] * scale + 2, island.bounds[1] * scale + 10);
      }
    });
    return {
      width: out.width,
      height: out.height,
      islands: islands.length,
      mime: "image/png",
      data_url: out.toDataURL("image/png"),
    };
  },

  set_face_uv: (args: { entries: Array<{ cube: string; face: string; uv: number[]; rotation?: number }> }) => {
    requireProject();
    const entries = args.entries.map((entry) => {
      const cube = requireCube(entry.cube);
      const face = cube.faces?.[entry.face];
      if (!face) throw new CommandError("E_INVALID_PARAM", `Face not found: ${entry.cube}.${entry.face}`);
      return { entry, cube, face };
    });
    const cubes = [...new Set(entries.map((e) => e.cube))];
    return withUndo({ elements: cubes, uv_only: true }, "set_face_uv", () => {
      for (const { entry, cube, face } of entries) {
        cube.box_uv = false;
        face.uv = [...entry.uv];
        if (entry.rotation !== undefined) face.rotation = entry.rotation;
      }
      refreshCanvas(cubes.map((c: any) => ({ uuid: c.uuid })));
      return { ok: true, undo_label: "set_face_uv", updated: cubes.map((c: any) => c.uuid) };
    });
  },

  transform_uv_islands: (args: any) => {
    requireProject();
    const entries = args.faces.map((target: { cube: string; face: string }) => {
      const cube = requireCube(target.cube);
      const face = cube.faces?.[target.face];
      if (!face?.uv) throw new CommandError("E_INVALID_PARAM", `Face has no UV: ${target.cube}.${target.face}`);
      return { cube, face };
    });
    const points = entries.flatMap(({ face }: any) => [
      [face.uv[0], face.uv[1]],
      [face.uv[2], face.uv[3]],
    ]);
    const pivot = args?.pivot ?? [
      (Math.min(...points.map((p: number[]) => p[0])) + Math.max(...points.map((p: number[]) => p[0]))) / 2,
      (Math.min(...points.map((p: number[]) => p[1])) + Math.max(...points.map((p: number[]) => p[1]))) / 2,
    ];
    const translate = args?.translate ?? [0, 0];
    const scale = args?.scale ?? [1, 1];
    const turns = Number(args?.rotate ?? "0") / 90;
    const transform = (point: number[]) => {
      let x = (point[0] - pivot[0]) * scale[0];
      let y = (point[1] - pivot[1]) * scale[1];
      for (let turn = 0; turn < turns; turn += 1) [x, y] = [-y, x];
      return [x + pivot[0] + translate[0], y + pivot[1] + translate[1]];
    };
    const next = entries.map(({ cube, face }: any) => ({
      cube,
      face,
      a: transform([face.uv[0], face.uv[1]]),
      b: transform([face.uv[2], face.uv[3]]),
    }));
    const width = Project?.texture_width ?? 16;
    const height = Project?.texture_height ?? 16;
    if (
      args?.clamp_to_texture !== false &&
      next.some(({ a, b }: any) => [a, b].some(([x, y]: number[]) => x < 0 || y < 0 || x > width || y > height))
    )
      throw new CommandError("E_INVALID_PARAM", `Transformed UV would leave ${width}x${height} bounds.`);
    const cubes = [...new Set(entries.map((e: any) => e.cube))];
    return withUndo({ elements: cubes, uv_only: true }, "transform_uv_islands", () => {
      for (const { cube, face, a, b } of next) {
        cube.box_uv = false;
        face.uv = [a[0], a[1], b[0], b[1]];
        face.rotation = (((face.rotation ?? 0) + Number(args?.rotate ?? "0")) % 360 + 360) % 360;
      }
      refreshCanvas(cubes.map((c: any) => ({ uuid: c.uuid })));
      return { ok: true, undo_label: "transform_uv_islands", updated: cubes.map((c: any) => c.uuid) };
    });
  },

  resize_texture: (args: { texture?: string; width: number; height: number; rescale_uvs?: boolean }) => {
    requireProject();
    const texture = textureOrThrow(args?.texture);
    const oldW = Project?.texture_width ?? texture.width;
    const oldH = Project?.texture_height ?? texture.height;
    const scaleX = args.width / oldW;
    const scaleY = args.height / oldH;
    return withUndo(
      { textures: [texture.raw], bitmap: true, elements: [...(Cube?.all ?? [])], uv_only: true },
      "resize_texture",
      (track) => {
        track.addTextures([texture.raw]);
        texture.edit((ctx, canvas) => {
          const previous = document.createElement("canvas");
          previous.width = canvas.width;
          previous.height = canvas.height;
          previous.getContext("2d")?.drawImage(canvas, 0, 0);
          canvas.width = Math.round(args.width);
          canvas.height = Math.round(args.height);
          ctx.imageSmoothingEnabled = false;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(previous, 0, 0, canvas.width, canvas.height);
        }, "resize_texture");
        if (args?.rescale_uvs !== false) {
          for (const cube of Cube?.all ?? []) {
            if (Array.isArray(cube.uv_offset))
              cube.uv_offset = [cube.uv_offset[0] * scaleX, cube.uv_offset[1] * scaleY];
            for (const face of Object.values(cube.faces ?? {}) as any[]) {
              if (!Array.isArray(face?.uv)) continue;
              face.uv = [face.uv[0] * scaleX, face.uv[1] * scaleY, face.uv[2] * scaleX, face.uv[3] * scaleY];
            }
          }
        }
        if (Project) {
          Project.texture_width = Math.round(args.width);
          Project.texture_height = Math.round(args.height);
        }
        refreshCanvas();
        return {
          ok: true,
          undo_label: "resize_texture",
          size: [Math.round(args.width), Math.round(args.height)],
          uv_scale: [scaleX, scaleY],
        };
      },
    );
  },

  /* ---------------------------- textures ---------------------------- */

  ensure_texture: (args: { name?: string; width?: number; height?: number; fill?: string }) => {
    requireProject();
    const name = args?.name ?? "texture";
    const width = args?.width ?? 64;
    const height = args?.height ?? 64;
    const existing = findTexture(name);
    if (existing)
      return { ok: true, existing: true, uuid: existing.uuid, name: existing.name, size: [existing.width, existing.height] };
    return withUndo({ textures: [], bitmap: true }, `ensure_texture ${name}`, (track) => {
      const texture = createTexture({ name, width, height, fill: args?.fill ?? "#808080" });
      track.addTextures([texture.raw]);
      return { ok: true, existing: false, uuid: texture.uuid, name: texture.name, size: [width, height] };
    });
  },

  assign_texture: (args: { texture?: string; cubes: string[]; faces?: string[] }) => {
    requireProject();
    const texture = textureOrThrow(args?.texture);
    const cubes = args.cubes.map((ref) => requireCube(ref));
    return withUndo({ elements: cubes, textures: [texture.raw], bitmap: true }, "assign_texture", () => {
      for (const cube of cubes) texture.applyToCube(cube.uuid, (args?.faces as any) ?? true);
      refreshCanvas(cubes.map((c: any) => ({ uuid: c.uuid })));
      return { ok: true, undo_label: "assign_texture", cubes: cubes.length, faces: args?.faces ?? "all" };
    });
  },

  get_texture: (args: { texture?: string; max_edge?: number }) => {
    const texture = textureOrThrow(args?.texture);
    const maxEdge = args?.max_edge ?? 256;
    return {
      name: texture.name,
      uuid: texture.uuid,
      width: texture.width,
      height: texture.height,
      max_edge: maxEdge,
      mime: "image/png",
      data_url: texture.toDataURL(maxEdge),
    };
  },

  get_texture_revision: (args: { texture?: string }) => {
    const texture = textureOrThrow(args?.texture);
    return {
      texture: texture.name,
      uuid: texture.uuid,
      width: texture.width,
      height: texture.height,
      revision: revisionOf(texture),
      usage:
        "Pass this as expected_revision to paint_face_grid / edit_texture_pixels / replace_texture_color / flood_fill_texture / transform_texture_region / copy_face_pixels so a stale plan cannot overwrite newer paint.",
    };
  },

  shade_model_base: (args: any) => {
    requireProject();
    const list = args?.cubes?.length ? args.cubes.map((ref: string) => requireCube(ref)) : [...(Cube?.all ?? [])];
    if (!list.length) throw new CommandError("E_NOT_FOUND", "No cubes to shade.");
    const texture = textureOrThrow(args?.texture);
    const base = args?.base ?? "#9c9c9c";
    const noise = args?.noise ?? 0.06;
    const blur = args?.blur ?? 0.45;
    const topLight = args?.top_light ?? 0.12;
    const bottomDark = args?.bottom_dark ?? 0.22;
    const edgeDark = args?.edge_darken ?? 0;
    const crisp = args?.crisp === true;
    const random = makeRandom(args?.seed ?? 0x9e3779b9);
    const faceMul: Record<string, number> = {
      up: 1 + topLight,
      down: 1 - bottomDark,
      north: 0.95,
      south: 1,
      east: 1.06,
      west: 0.88,
    };
    const scale = texture.width / (Project?.texture_width || texture.width || 64);
    return withUndo({ elements: list, textures: [texture.raw], bitmap: true }, "shade_model_base", (track) => {
      track.addTextures([texture.raw]);
      const jobs: Array<{ x: number; y: number; w: number; h: number; color: string; mul: number }> = [];
      for (const cube of list) {
        const color = regionColorFor(cube.name, args?.regions, base);
        texture.applyToCube(cube.uuid, true);
        for (const faceName of Object.keys(cube.faces ?? {})) {
          const uv = cube.faces[faceName]?.uv;
          if (!Array.isArray(uv) || uv.length < 4) continue;
          const x0 = Math.min(uv[0], uv[2]) * scale;
          const y0 = Math.min(uv[1], uv[3]) * scale;
          const w = Math.max(1, Math.round(Math.abs(uv[2] - uv[0]) * scale));
          const h = Math.max(1, Math.round(Math.abs(uv[3] - uv[1]) * scale));
          jobs.push({ x: Math.round(x0), y: Math.round(y0), w, h, color, mul: faceMul[faceName] ?? 1 });
        }
      }
      texture.edit((ctx) => {
        ctx.imageSmoothingEnabled = false;
        for (const job of jobs) {
          if (crisp) ctx.fillStyle = shadeHex(job.color, job.mul);
          else {
            const gradient = ctx.createLinearGradient(0, job.y, 0, job.y + job.h);
            gradient.addColorStop(0, shadeHex(job.color, job.mul * 1.1));
            gradient.addColorStop(1, shadeHex(job.color, job.mul * 0.84));
            ctx.fillStyle = gradient;
          }
          ctx.fillRect(job.x, job.y, job.w, job.h);
          if (edgeDark > 0 && job.w > 2 && job.h > 2) {
            ctx.fillStyle = shadeHex(job.color, job.mul * (1 - edgeDark));
            ctx.fillRect(job.x, job.y, job.w, 1);
            ctx.fillRect(job.x, job.y + job.h - 1, job.w, 1);
            ctx.fillRect(job.x, job.y, 1, job.h);
            ctx.fillRect(job.x + job.w - 1, job.y, 1, job.h);
          }
        }
        if (noise > 0) {
          for (const job of jobs) {
            const count = Math.max(1, Math.floor(job.w * job.h * 0.1));
            for (let i = 0; i < count; i += 1) {
              const px = job.x + Math.floor(random() * job.w);
              const py = job.y + Math.floor(random() * job.h);
              ctx.fillStyle = shadeHex(job.color, job.mul * (1 - noise + random() * noise * 2));
              ctx.fillRect(px, py, 1, 1);
            }
          }
        }
        if (blur > 0 && !crisp) for (const job of jobs) blurRegion(ctx, job.x, job.y, job.w, job.h, blur);
      }, "shade_model_base");
      refreshCanvas(list.map((c: any) => ({ uuid: c.uuid })));
      return { ok: true, undo_label: "shade_model_base", textured: list.length, faces: jobs.length };
    });
  },

  paint_face_features: (args: any) => {
    requireProject();
    if (!args?.faces?.length) throw new CommandError("E_INVALID_PARAM", "faces[] required");
    const texture = textureOrThrow(args?.texture);
    const jobs = args.faces.map((item: any) => ({
      ...faceSpaceOf(item.cube, item.face),
      ops: item.ops,
    }));
    return withUndo({ textures: [texture.raw], bitmap: true }, "paint_face_features", (track) => {
      track.addTextures([texture.raw]);
      for (const job of jobs) texture.applyToCube(job.cube.uuid, [job.face]);
      texture.edit((ctx, canvas) => {
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (const job of jobs) {
          paintFaceLocal(image, job.space, (local) => {
            for (const op of job.ops) {
              local.fillStyle = op.color;
              local.strokeStyle = op.color;
              if (op.type === "fill") {
                local.fillRect(0, 0, job.space.width, job.space.height);
              } else if (op.type === "line") {
                local.lineWidth = Math.max(1, op.width ?? 1);
                local.beginPath();
                local.moveTo(op.x + 0.5, op.y + 0.5);
                local.lineTo((op.x2 ?? op.x) + 0.5, (op.y2 ?? op.y) + 0.5);
                local.stroke();
              } else if (op.type === "rect") {
                local.fillRect(op.x, op.y, op.width, op.height);
              } else {
                local.beginPath();
                local.ellipse(
                  op.x + op.width / 2,
                  op.y + op.height / 2,
                  Math.max(0.5, op.width / 2),
                  Math.max(0.5, op.height / 2),
                  0,
                  0,
                  Math.PI * 2,
                );
                local.fill();
              }
            }
          });
        }
        ctx.putImageData(image, 0, 0);
      }, "paint_face_features");
      refreshCanvas(jobs.map((j: any) => ({ uuid: j.cube.uuid })));
      return { ok: true, undo_label: "paint_face_features", painted: jobs.length };
    });
  },

  paint_pixel_batch: (args: any) => {
    requireProject();
    if (!args?.strokes?.length) throw new CommandError("E_INVALID_PARAM", "strokes[] required");
    const texture = textureOrThrow(args?.texture);
    const jobs = args.strokes.map((stroke: any) => ({
      ...faceSpaceOf(stroke.cube, stroke.face),
      stroke,
    }));
    let stamps = 0;
    return withUndo({ textures: [texture.raw], bitmap: true }, "paint_pixel_batch", (track) => {
      track.addTextures([texture.raw]);
      for (const job of jobs) texture.applyToCube(job.cube.uuid, [job.face]);
      texture.edit((ctx, canvas) => {
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (const job of jobs) {
          const size = job.stroke.size ?? 1;
          const shape = job.stroke.shape ?? "square";
          paintFaceLocal(image, job.space, (local) => {
            if (args?.clip_to_face !== false) {
              local.beginPath();
              local.rect(0, 0, job.space.width, job.space.height);
              local.clip();
            }
            local.fillStyle = job.stroke.color;
            const stamp = (x: number, y: number) => {
              const offset = Math.floor(size / 2);
              if (shape === "square") local.fillRect(x - offset, y - offset, size, size);
              else {
                const center = (size - 1) / 2;
                const radiusSquared = (size / 2) ** 2;
                for (let py = 0; py < size; py += 1)
                  for (let px = 0; px < size; px += 1) {
                    const dx = px - center;
                    const dy = py - center;
                    if (dx * dx + dy * dy <= radiusSquared) local.fillRect(x - offset + px, y - offset + py, 1, 1);
                  }
              }
              stamps += 1;
            };
            const points = job.stroke.points;
            stamp(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i += 1) {
              let x = points[i - 1].x;
              let y = points[i - 1].y;
              const target = points[i];
              const dx = Math.abs(target.x - x);
              const sx = x < target.x ? 1 : -1;
              const dy = -Math.abs(target.y - y);
              const sy = y < target.y ? 1 : -1;
              let error = dx + dy;
              for (;;) {
                if (x === target.x && y === target.y) break;
                const twice = error * 2;
                if (twice >= dy) {
                  error += dy;
                  x += sx;
                }
                if (twice <= dx) {
                  error += dx;
                  y += sy;
                }
                stamp(x, y);
              }
            }
          });
        }
        ctx.putImageData(image, 0, 0);
      }, "paint_pixel_batch");
      refreshCanvas(jobs.map((j: any) => ({ uuid: j.cube.uuid })));
      return { ok: true, undo_label: "paint_pixel_batch", strokes: jobs.length, stamps };
    });
  },

  paint_face_grid: (args: any) => {
    requireProject();
    const texture = textureOrThrow(args?.texture);
    assertRevision(texture, args?.expected_revision);
    const { cube, face, space } = faceSpaceOf(args.cube, args.face);
    const grid = args.rows.map((row: string) => Array.from(row));
    if (grid.length !== space.height || grid.some((row: string[]) => row.length !== space.width))
      throw new CommandError(
        "E_INVALID_PARAM",
        `Grid must be exactly ${space.width}x${space.height} face-local texels (rows=${
          args.rows.length
        }, widths=${args.rows.map((r: string) => Array.from(r).length).join("/")}).`,
      );
    const palette = new Map<string, [number, number, number, number]>();
    for (const [symbol, color] of Object.entries(args.palette)) {
      if (Array.from(symbol).length !== 1)
        throw new CommandError("E_INVALID_PARAM", `Palette key must be exactly one symbol: "${symbol}"`);
      palette.set(symbol, rgbaOf(color as string | null));
    }
    let painted = 0;
    return withUndo({ textures: [texture.raw], bitmap: true }, "paint_face_grid", (track) => {
      track.addTextures([texture.raw]);
      texture.applyToCube(cube.uuid, [face]);
      texture.edit((ctx, canvas) => {
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let y = 0; y < space.height; y += 1)
          for (let x = 0; x < space.width; x += 1) {
            const symbol = grid[y][x];
            const color = palette.get(symbol);
            if (!color) throw new CommandError("E_INVALID_PARAM", `Unknown palette symbol: "${symbol}"`);
            const [ax, ay] = faceLocalToAtlas(space, x, y);
            if (!setPixel(image, ax, ay, color))
              throw new CommandError("E_INVALID_PARAM", `Mapped pixel outside atlas: ${ax},${ay}`);
            painted += 1;
          }
        ctx.putImageData(image, 0, 0);
      }, "paint_face_grid");
      refreshCanvas([{ uuid: cube.uuid }]);
      return { ok: true, undo_label: "paint_face_grid", pixels: painted, revision: revisionOf(texture) };
    });
  },

  get_face_grid: (args: { texture?: string; cube: string; face: string }) => {
    const texture = textureOrThrow(args?.texture);
    const { space } = faceSpaceOf(args.cube, args.face);
    const image = imageOf(texture);
    const rows: string[][] = [];
    for (let y = 0; y < space.height; y += 1) {
      const row: string[] = [];
      for (let x = 0; x < space.width; x += 1) {
        const [ax, ay] = faceLocalToAtlas(space, x, y);
        row.push(toHex(getPixel(image, ax, ay)));
      }
      rows.push(row);
    }
    return {
      cube: args.cube,
      face: args.face,
      width: space.width,
      height: space.height,
      rows,
      revision: revisionFromPixels(image.data, image.width, image.height),
    };
  },

  edit_texture_pixels: (args: any) => {
    requireProject();
    const texture = textureOrThrow(args?.texture);
    assertRevision(texture, args?.expected_revision);
    const target = args?.face ? faceSpaceOf(args.face.cube, args.face.face) : undefined;
    return withUndo({ textures: [texture.raw], bitmap: true }, "edit_texture_pixels", (track) => {
      track.addTextures([texture.raw]);
      texture.edit((ctx, canvas) => {
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let changed = 0;
        for (const pixel of args.pixels) {
          const [x, y] = target ? faceLocalToAtlas(target.space, pixel.x, pixel.y) : [pixel.x, pixel.y];
          const rgba = rgbaOf(pixel.color);
          if (!setPixel(image, x, y, rgba))
            throw new CommandError(
              "E_INVALID_PARAM",
              `Pixel outside target: ${pixel.x},${pixel.y}${
                target ? ` (face is ${target.space.width}x${target.space.height})` : ""
              }`,
            );
          changed += 1;
        }
        ctx.putImageData(image, 0, 0);
        return changed;
      }, "edit_texture_pixels");
      if (target) refreshCanvas([{ uuid: target.cube.uuid }]);
      return { ok: true, undo_label: "edit_texture_pixels", changed: args.pixels.length, revision: revisionOf(texture) };
    });
  },

  replace_texture_color: (args: any) => {
    requireProject();
    const texture = textureOrThrow(args?.texture);
    assertRevision(texture, args?.expected_revision);
    const target = args?.face ? faceSpaceOf(args.face.cube, args.face.face) : undefined;
    const from = rgbaOf(args.from);
    const to = rgbaOf(args.to ?? null);
    const tolerance = args?.tolerance ?? 0;
    let replaced = 0;
    return withUndo({ textures: [texture.raw], bitmap: true }, "replace_texture_color", (track) => {
      track.addTextures([texture.raw]);
      texture.edit((ctx, canvas) => {
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const visit = (x: number, y: number) => {
          const pixel = getPixel(image, x, y);
          if (!pixel.every((v, i) => Math.abs(v - from[i]) <= tolerance)) return;
          setPixel(image, x, y, to);
          replaced += 1;
        };
        if (target) {
          for (let y = 0; y < target.space.height; y += 1)
            for (let x = 0; x < target.space.width; x += 1) visit(...faceLocalToAtlas(target.space, x, y));
        } else {
          for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) visit(x, y);
        }
        ctx.putImageData(image, 0, 0);
      }, "replace_texture_color");
      refreshCanvas();
      return { ok: true, undo_label: "replace_texture_color", replaced, revision: revisionOf(texture) };
    });
  },

  copy_face_pixels: (args: any) => {
    requireProject();
    const texture = textureOrThrow(args?.texture);
    assertRevision(texture, args?.expected_revision);
    const source = faceSpaceOf(args.source.cube, args.source.face);
    const target = faceSpaceOf(args.target.cube, args.target.face);
    const rotation = Number(args?.rotation ?? "0");
    const turns = rotation === 90 || rotation === 270;
    const expectW = turns ? source.space.height : source.space.width;
    const expectH = turns ? source.space.width : source.space.height;
    if (target.space.width !== expectW || target.space.height !== expectH)
      throw new CommandError(
        "E_INVALID_PARAM",
        `Target face must be ${expectW}x${expectH} after rotation (it is ${target.space.width}x${target.space.height}).`,
      );
    const image = imageOf(texture);
    const colors: Array<Array<[number, number, number, number]>> = [];
    for (let y = 0; y < source.space.height; y += 1) {
      const row: Array<[number, number, number, number]> = [];
      for (let x = 0; x < source.space.width; x += 1)
        row.push(getPixel(image, ...faceLocalToAtlas(source.space, x, y)));
      colors.push(row);
    }
    return withUndo({ textures: [texture.raw], bitmap: true }, "copy_face_pixels", (track) => {
      track.addTextures([texture.raw]);
      texture.applyToCube(target.cube.uuid, [target.face]);
      texture.edit((ctx, canvas) => {
        const out = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let sy = 0; sy < source.space.height; sy += 1)
          for (let sx = 0; sx < source.space.width; sx += 1) {
            const fx = args?.flip_x ? source.space.width - 1 - sx : sx;
            const fy = args?.flip_y ? source.space.height - 1 - sy : sy;
            let tx = fx;
            let ty = fy;
            if (rotation === 90) {
              tx = source.space.height - 1 - fy;
              ty = fx;
            } else if (rotation === 180) {
              tx = source.space.width - 1 - fx;
              ty = source.space.height - 1 - fy;
            } else if (rotation === 270) {
              tx = fy;
              ty = source.space.width - 1 - fx;
            }
            setPixel(out, ...faceLocalToAtlas(target.space, tx, ty), colors[sy][sx]);
          }
        ctx.putImageData(out, 0, 0);
      }, "copy_face_pixels");
      refreshCanvas([{ uuid: target.cube.uuid }]);
      return {
        ok: true,
        undo_label: "copy_face_pixels",
        pixels: source.space.width * source.space.height,
        revision: revisionOf(texture),
      };
    });
  },

  flood_fill_texture: (args: any) => {
    requireProject();
    const texture = textureOrThrow(args?.texture);
    assertRevision(texture, args?.expected_revision);
    const target = args?.face ? faceSpaceOf(args.face.cube, args.face.face) : undefined;
    const width = target?.space.width ?? texture.width;
    const height = target?.space.height ?? texture.height;
    if (args.x >= width || args.y >= height)
      throw new CommandError("E_INVALID_PARAM", `Seed outside ${width}x${height}.`);
    const fill = rgbaOf(args.color ?? null);
    const tolerance = args?.tolerance ?? 0;
    const cap = args?.max_pixels ?? 65536;
    let filled = 0;
    return withUndo({ textures: [texture.raw], bitmap: true }, "flood_fill_texture", (track) => {
      track.addTextures([texture.raw]);
      texture.edit((ctx, canvas) => {
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const atlas = (x: number, y: number) =>
          target ? faceLocalToAtlas(target.space, x, y) : [x, y];
        const start = getPixel(image, ...(atlas(args.x, args.y) as [number, number]));
        if (start.every((v, i) => Math.abs(v - fill[i]) <= 0)) return;
        const queue: Array<[number, number]> = [[args.x, args.y]];
        const seen = new Uint8Array(width * height);
        const neighbours = args?.diagonal
          ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]
          : [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (let head = 0; head < queue.length; head += 1) {
          const [x, y] = queue[head];
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          const key = y * width + x;
          if (seen[key]) continue;
          seen[key] = 1;
          const point = atlas(x, y) as [number, number];
          const pixel = getPixel(image, ...point);
          if (!pixel.every((v, i) => Math.abs(v - start[i]) <= tolerance)) continue;
          setPixel(image, ...point, fill);
          filled += 1;
          if (filled > cap)
            throw new CommandError("E_INVALID_PARAM", `Flood fill exceeds max_pixels ${cap}.`);
          for (const [dx, dy] of neighbours) queue.push([x + dx, y + dy]);
        }
        ctx.putImageData(image, 0, 0);
      }, "flood_fill_texture");
      refreshCanvas();
      return { ok: true, undo_label: "flood_fill_texture", filled, revision: revisionOf(texture) };
    });
  },

  transform_texture_region: (args: any) => {
    requireProject();
    const texture = textureOrThrow(args?.texture);
    assertRevision(texture, args?.expected_revision);
    const target = args?.face ? faceSpaceOf(args.face.cube, args.face.face) : undefined;
    const rect = args?.rect ?? [0, 0, target?.space.width ?? texture.width, target?.space.height ?? texture.height];
    const [rx, ry, w, h] = rect;
    if (target && (rx !== 0 || ry !== 0))
      throw new CommandError("E_INVALID_PARAM", "Face transforms use the full face (omit rect).");
    if ((args.operation === "rotate_90" || args.operation === "rotate_270") && w !== h)
      throw new CommandError("E_INVALID_PARAM", "Quarter-turn region must be square.");
    return withUndo({ textures: [texture.raw], bitmap: true }, "transform_texture_region", (track) => {
      track.addTextures([texture.raw]);
      texture.edit((ctx, canvas) => {
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        if (!target && (rx + w > canvas.width || ry + h > canvas.height))
          throw new CommandError("E_INVALID_PARAM", "Region exceeds texture bounds.");
        const atlas = (x: number, y: number) =>
          target ? faceLocalToAtlas(target.space, x, y) : [rx + x, ry + y];
        const source: Array<Array<[number, number, number, number]>> = [];
        for (let y = 0; y < h; y += 1) {
          const row: Array<[number, number, number, number]> = [];
          for (let x = 0; x < w; x += 1) row.push(getPixel(image, ...(atlas(x, y) as [number, number])));
          source.push(row);
        }
        for (let y = 0; y < h; y += 1)
          for (let x = 0; x < w; x += 1) {
            let sx = x;
            let sy = y;
            if (args.operation === "flip_x") sx = w - 1 - x;
            else if (args.operation === "flip_y") sy = h - 1 - y;
            else if (args.operation === "rotate_180") {
              sx = w - 1 - x;
              sy = h - 1 - y;
            } else if (args.operation === "rotate_90") {
              sx = y;
              sy = h - 1 - x;
            } else {
              sx = w - 1 - y;
              sy = x;
            }
            setPixel(image, ...(atlas(x, y) as [number, number]), source[sy][sx]);
          }
        ctx.putImageData(image, 0, 0);
      }, "transform_texture_region");
      refreshCanvas();
      return { ok: true, undo_label: "transform_texture_region", pixels: w * h, revision: revisionOf(texture) };
    });
  },

  analyze_texture_palette: (args: { texture?: string; face?: { cube: string; face: string }; max_colors?: number }) => {
    requireProject();
    const texture = textureOrThrow(args?.texture);
    const image = imageOf(texture);
    const counts = new Map<string, number>();
    let total = 0;
    let transparent = 0;
    const visit = (x: number, y: number) => {
      const pixel = getPixel(image, x, y);
      const key = toHex(pixel);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      total += 1;
      if (pixel[3] === 0) transparent += 1;
    };
    if (args?.face) {
      const { space } = faceSpaceOf(args.face.cube, args.face.face);
      for (let y = 0; y < space.height; y += 1)
        for (let x = 0; x < space.width; x += 1) visit(...faceLocalToAtlas(space, x, y));
    } else {
      for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) visit(x, y);
    }
    return {
      total_pixels: total,
      unique_colors: counts.size,
      transparent_pixels: transparent,
      colors: [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, args?.max_colors ?? 32)
        .map(([color, count]) => ({ color, count, percent: total ? count / total : 0 })),
    };
  },

  get_texture_region: (args: any) => {
    requireProject();
    const texture = textureOrThrow(args?.texture);
    const image = imageOf(texture);
    const target = args?.face ? faceSpaceOf(args.face.cube, args.face.face) : undefined;
    const rect = args?.rect ?? [0, 0, image.width, image.height];
    const [rx, ry, w, h] = rect;
    if (rx + w > image.width || ry + h > image.height)
      throw new CommandError("E_INVALID_PARAM", "Region exceeds texture bounds.");
    const scale = args?.scale ?? 8;
    const outW = target ? target.space.width : w;
    const outH = target ? target.space.height : h;
    const out = document.createElement("canvas");
    out.width = outW * scale;
    out.height = outH * scale;
    const ctx = out.getContext("2d");
    if (!ctx) throw new CommandError("E_BLOCKBENCH_ERROR", "No 2d context");
    if (args?.checkerboard !== false) {
      for (let py = 0; py < outH; py += 1)
        for (let px = 0; px < outW; px += 1) {
          ctx.fillStyle = (px + py) % 2 ? "#9aa0a6" : "#d5d8dc";
          ctx.fillRect(px * scale, py * scale, scale, scale);
        }
    }
    ctx.imageSmoothingEnabled = false;
    if (target) {
      for (let py = 0; py < target.space.height; py += 1)
        for (let px = 0; px < target.space.width; px += 1) {
          const [ax, ay] = faceLocalToAtlas(target.space, px, py);
          const pixel = getPixel(image, ax, ay);
          ctx.fillStyle = toHex(pixel);
          ctx.globalAlpha = pixel[3] / 255;
          ctx.fillRect(px * scale, py * scale, scale, scale);
          ctx.globalAlpha = 1;
        }
    } else {
      for (let py = 0; py < h; py += 1)
        for (let px = 0; px < w; px += 1) {
          const pixel = getPixel(image, rx + px, ry + py);
          ctx.fillStyle = toHex(pixel);
          ctx.globalAlpha = pixel[3] / 255;
          ctx.fillRect(px * scale, py * scale, scale, scale);
          ctx.globalAlpha = 1;
        }
    }
    if (args?.grid !== false && scale >= 4) {
      ctx.strokeStyle = "rgba(0,0,0,.35)";
      ctx.lineWidth = 1;
      for (let px = 0; px <= outW; px += 1) {
        ctx.beginPath();
        ctx.moveTo(px * scale + 0.5, 0);
        ctx.lineTo(px * scale + 0.5, out.height);
        ctx.stroke();
      }
      for (let py = 0; py <= outH; py += 1) {
        ctx.beginPath();
        ctx.moveTo(0, py * scale + 0.5);
        ctx.lineTo(out.width, py * scale + 0.5);
        ctx.stroke();
      }
    }
    return {
      width: out.width,
      height: out.height,
      source: rect,
      mime: "image/png",
      data_url: out.toDataURL("image/png"),
    };
  },

  audit_texture_quality: (args: { texture?: string; faces?: Array<{ cube: string; face: string }>; palette_limit?: number; min_base_ratio?: number; glass?: boolean }) => {
    requireProject();
    const texture = textureOrThrow(args?.texture);
    const image = imageOf(texture);
    const refs =
      args?.faces ??
      (Cube?.all ?? []).flatMap((cube: any) =>
        FACE_NAMES.filter((face) => cube.faces?.[face]).map((face) => ({ cube: cube.uuid, face })),
      );
    const findings: Array<{ severity: string; code: string; face: string; message: string }> = [];
    for (const ref of refs) {
      const { cube, space } = faceSpaceOf(ref.cube, ref.face);
      const grid: Array<Array<[number, number, number, number]>> = [];
      for (let y = 0; y < space.height; y += 1) {
        const row: Array<[number, number, number, number]> = [];
        for (let x = 0; x < space.width; x += 1)
          row.push(getPixel(image, ...faceLocalToAtlas(space, x, y)));
        grid.push(row);
      }
      for (const finding of auditFacePixels(grid, {
        paletteLimit: args?.palette_limit,
        minBaseRatio: args?.min_base_ratio,
        glass: args?.glass,
      }))
        findings.push({ ...finding, face: `${cube.name}.${ref.face}` });
    }
    return {
      texture: texture.name,
      revision: revisionOf(texture),
      faces: refs.length,
      findings,
      summary: {
        errors: findings.filter((f) => f.severity === "error").length,
        warns: findings.filter((f) => f.severity === "warn").length,
        infos: findings.filter((f) => f.severity === "info").length,
      },
    };
  },

  import_texture_png: async (args: { path: string; texture?: string; name?: string; resize_project?: boolean; expected_revision?: string }) => {
    requireProject();
    const bytes = readScopedFile(args.path);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000)
      binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x8000)));
    const dataUrl = `data:image/png;base64,${btoa(binary)}`;
    const image = await new Promise<Image>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new CommandError("E_INVALID_PARAM", "PNG decode failed."));
      img.src = dataUrl;
    });
    const existing = args?.texture ? textureOrThrow(args.texture) : undefined;
    if (existing) assertRevision(existing, args?.expected_revision);
    return withUndo(
      { textures: existing ? [existing.raw] : [], bitmap: true },
      "import_texture_png",
      (track) => {
        const target =
          existing ??
          createTexture({
            name: args?.name ?? "imported_texture",
            width: image.naturalWidth,
            height: image.naturalHeight,
            fill: "rgba(0,0,0,0)",
          });
        track.addTextures([target.raw]);
        target.edit((ctx, canvas) => {
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          ctx.imageSmoothingEnabled = false;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(image, 0, 0);
        }, "import_texture_png");
        if (args?.resize_project !== false && Project) {
          Project.texture_width = image.naturalWidth;
          Project.texture_height = image.naturalHeight;
        }
        refreshCanvas();
        return {
          ok: true,
          undo_label: "import_texture_png",
          name: target.name,
          uuid: target.uuid,
          size: [image.naturalWidth, image.naturalHeight],
          bytes: bytes.byteLength,
          revision: revisionOf(target),
        };
      },
    );
  },

  export_texture_png: (args: { path: string; texture?: string; overwrite?: boolean }) => {
    requireProject();
    const texture = textureOrThrow(args?.texture);
    const dataUrl = texture.toDataURL(Math.max(texture.width, texture.height));
    const encoded = dataUrl.split(",", 2)[1] ?? "";
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const written = writeScopedFile(args.path, bytes, args.overwrite);
    return { ok: true, name: texture.name, size: [texture.width, texture.height], ...written };
  },

  ensure_material_set: (args: { prefix: string; width: number; height: number; channels: string[]; fills?: Record<string, string> }) => {
    requireProject();
    const defaults: Record<string, string> = {
      base: "#808080ff",
      emissive: "#000000ff",
      normal: "#8080ffff",
      specular: "#000000ff",
    };
    return withUndo({ textures: [], bitmap: true }, "ensure_material_set", (track) => {
      const textures = [...new Set(args.channels)].map((channel) => {
        const texture = createTexture({
          name: `${args.prefix}_${channel}`,
          width: args.width,
          height: args.height,
          fill: args?.fills?.[channel] ?? defaults[channel] ?? "#808080ff",
        });
        track.addTextures([texture.raw]);
        return { channel, uuid: texture.uuid, name: texture.name, size: [texture.width, texture.height] };
      });
      return {
        ok: true,
        undo_label: "ensure_material_set",
        textures,
        note: "Not every Blockbench format exports the same material semantics; this only guarantees consistent sheets.",
      };
    });
  },

  audit_material_set: (args: { channels: Record<string, string>; require_power_of_two?: boolean; naming_prefix?: string }) => {
    requireProject();
    const entries = Object.entries(args.channels).map(([channel, ref]) => {
      const texture = findTexture(ref);
      if (!texture) throw new CommandError("E_NOT_FOUND", `Texture not found: ${ref}`);
      return { channel, texture };
    });
    const base = entries.find((e) => e.channel === "base")?.texture;
    const findings: Array<{ severity: string; code: string; message: string }> = [];
    const isPowerOfTwo = (v: number) => (v & (v - 1)) === 0;
    for (const { channel, texture } of entries) {
      if (base && (texture.width !== base.width || texture.height !== base.height))
        findings.push({
          severity: "error",
          code: "MATERIAL_SIZE_MISMATCH",
          message: `${channel} ${texture.name} is ${texture.width}x${texture.height}; base is ${base.width}x${base.height}`,
        });
      if (args?.require_power_of_two !== false && (!isPowerOfTwo(texture.width) || !isPowerOfTwo(texture.height)))
        findings.push({
          severity: "warn",
          code: "MATERIAL_NOT_POWER_OF_TWO",
          message: `${channel} ${texture.name} is not power-of-two`,
        });
      if (args?.naming_prefix && !texture.name.startsWith(args.naming_prefix))
        findings.push({
          severity: "warn",
          code: "MATERIAL_NAME_MISMATCH",
          message: `${channel} ${texture.name} does not start with ${args.naming_prefix}`,
        });
    }
    return {
      channels: Object.fromEntries(
        entries.map(({ channel, texture }) => [
          channel,
          { uuid: texture.uuid, name: texture.name, width: texture.width, height: texture.height },
        ]),
      ),
      findings,
      summary: {
        channels: entries.length,
        errors: findings.filter((f) => f.severity === "error").length,
        warns: findings.filter((f) => f.severity === "warn").length,
      },
    };
  },
};

/** 渲染 / 视角工具 —— 让模型真的"看"到自己的工作 */
import { silhouetteBounds, silhouetteFromRgba, type ViewPreset } from "@bbmcp/shared";
import { CommandError } from "../errors.js";
import { requireProject } from "../bb.js";
import { captureView } from "../host.js";
import type { ToolHandler } from "../dispatch.js";

const DEFAULT_VIEWS: ViewPreset[] = ["iso", "north", "east", "south"];

const VIEW_LABELS: Record<string, string> = {
  north: "front — the model's FACE (front views are mirrored: its right hand is on the left of the image)",
  south: "back — the model's other side",
  east: "the model's own RIGHT side (+X)",
  west: "the model's own LEFT side (-X)",
  up: "top-down",
  down: "bottom-up",
  iso: "isometric (three-quarter) view",
};

async function loadImage(dataUrl: string): Promise<Image> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new CommandError("E_BLOCKBENCH_ERROR", "Cannot decode captured image."));
    image.src = dataUrl;
  });
}

export async function silhouetteOf(
  dataUrl: string,
  alphaThreshold = 8,
  luminanceThreshold = 245,
): Promise<{
  mask: Uint8Array;
  width: number;
  height: number;
  dataUrl: string;
}> {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || 64;
  canvas.height = image.naturalHeight || 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new CommandError("E_BLOCKBENCH_ERROR", "No 2d context for silhouette analysis.");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const silhouette = silhouetteFromRgba(
    data.data,
    canvas.width,
    canvas.height,
    alphaThreshold,
    luminanceThreshold,
  );
  return { ...silhouette, dataUrl };
}

export const viewTools: Record<string, ToolHandler> = {
  capture_views: async (args: { views?: ViewPreset[]; max_edge?: number; format?: "png" | "jpeg"; quality?: number }) => {
    requireProject();
    const views = args?.views?.length ? args.views : DEFAULT_VIEWS;
    const maxEdge = Math.min(args?.max_edge ?? 256, 1024);
    const format = args?.format ?? "jpeg";
    const quality = (args?.quality ?? 70) / 100;
    const out: Array<Record<string, unknown>> = [];
    for (const view of views) {
      const raw = await captureView(view, maxEdge);
      const compressed = await compressImage(raw, format, quality, maxEdge);
      out.push({
        view,
        caption: VIEW_LABELS[view] ?? view,
        visible_face: view === "iso" ? null : view,
        width: compressed.width,
        height: compressed.height,
        bytes: Math.floor((compressed.dataUrl.split(",")[1]?.length ?? 0) * 0.75),
        mime: compressed.dataUrl.startsWith("data:image/jpeg") ? "image/jpeg" : "image/png",
        data_url: compressed.dataUrl,
      });
    }
    return {
      views: out,
      note:
        "Views are named from the MODEL's point of view. A front (north) view is mirrored, exactly like facing a person. Capture does not move the model or the user's camera.",
    };
  },

  analyze_view_silhouette: async (args: {
    views?: ViewPreset[];
    max_edge?: number;
    alpha_threshold?: number;
    luminance_threshold?: number;
  }) => {
    requireProject();
    const views = args?.views?.length ? args.views : DEFAULT_VIEWS;
    const maxEdge = Math.min(args?.max_edge ?? 256, 1024);
    const rows: Array<Record<string, unknown>> = [];
    for (const view of views) {
      const raw = await captureView(view, maxEdge);
      const silhouette = await silhouetteOf(
        raw.dataUrl,
        args?.alpha_threshold,
        args?.luminance_threshold,
      );
      const bounds = silhouetteBounds(silhouette);
      const foreground = silhouette.mask.reduce((sum, v) => sum + v, 0);
      rows.push({
        view,
        width: silhouette.width,
        height: silhouette.height,
        bounds,
        silhouette_size: [bounds[2] - bounds[0], bounds[3] - bounds[1]],
        foreground_pixels: foreground,
        coverage: Number((foreground / Math.max(1, silhouette.width * silhouette.height)).toFixed(4)),
        data_url: raw.dataUrl,
      });
    }
    const empty = rows.filter((row) => (row.foreground_pixels as number) === 0);
    return {
      views: rows,
      summary: {
        views: rows.length,
        empty_views: empty.length,
        note: empty.length
          ? "Some views render nothing — the model may be off-camera, invisible, or inside another object."
          : "Every view shows geometry.",
      },
    };
  },

  set_camera_angle: (args: { preset?: ViewPreset; position?: number[]; target?: number[] }) => {
    requireProject();
    const preset = args?.preset;
    const presets: Record<string, unknown> = {
      north: { position: [0, 0, -100], target: [0, 0, 0] },
      south: { position: [0, 0, 100], target: [0, 0, 0] },
      east: { position: [100, 0, 0], target: [0, 0, 0] },
      west: { position: [-100, 0, 0], target: [0, 0, 0] },
      up: { position: [0, 100, 1], target: [0, 0, 0] },
      down: { position: [0, -100, 1], target: [0, 0, 0] },
      iso: { position: [80, 60, 80], target: [0, 0, 0] },
    };
    const chosen = preset ? (presets[preset] as { position: number[]; target: number[] }) : undefined;
    const position = (args?.position ?? chosen?.position) as number[] | undefined;
    const target = (args?.target ?? chosen?.target) as number[] | undefined;
    if (!position)
      throw new CommandError("E_INVALID_PARAM", "Pass a preset, or an explicit position (+ target).");
    try {
      // 视口相机挂在 Preview 上(Canvas 没有 camera);对每个打开的 preview 设置
      const previews = Preview.all;
      if (!previews.length) throw new Error("no preview");
      for (const preview of previews) {
        const camera = preview.camera as unknown as {
          position: { set(x: number, y: number, z: number): void };
          lookAt(x: number, y: number, z: number): void;
        };
        camera.position.set(position[0], position[1], position[2]);
        const lookAt = target ?? [0, 0, 0];
        camera.lookAt(lookAt[0], lookAt[1], lookAt[2]);
        preview.render();
      }
      Canvas.updateAll();
    } catch {
      throw new CommandError(
        "E_BLOCKBENCH_ERROR",
        "Could not set the viewport camera in this Blockbench build; capture_views uses its own offscreen camera and is unaffected.",
      );
    }
    return { ok: true, position, target: target ?? null };
  },
};

async function compressImage(
  source: { dataUrl: string; width: number; height: number },
  format: "png" | "jpeg",
  quality: number,
  maxEdge: number,
): Promise<{ dataUrl: string; width: number; height: number }> {
  if (format === "png" && source.dataUrl.startsWith("data:image/png")) return source;
  const image = await loadImage(source.dataUrl);
  const canvas = document.createElement("canvas");
  const width = image.naturalWidth || source.width;
  const height = image.naturalHeight || source.height;
  const scale = Math.min(1, maxEdge / Math.max(width, height, 1));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return source;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return {
    dataUrl: format === "jpeg" ? canvas.toDataURL("image/jpeg", quality) : canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height,
  };
}

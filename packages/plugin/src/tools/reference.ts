/** 参考图匹配 —— 把"像不像"变成 IoU 数字 */
import { compareSilhouettes, type ViewPreset } from "@bbmcp/shared";
import { CommandError } from "../errors.js";
import { requireProject } from "../bb.js";
import { captureView } from "../host.js";
import { readScopedFile, session, type ReferenceImage } from "../session.js";
import { silhouetteOf } from "./views.js";
import type { ToolHandler } from "../dispatch.js";

async function decode(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new CommandError("E_INVALID_PARAM", "Cannot decode the reference image."));
    image.src = dataUrl;
  });
}

function base64Of(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x8000)));
  return btoa(binary);
}

function pick(reference?: string): ReferenceImage | undefined {
  if (!session.references.length) return undefined;
  if (!reference) return session.references[session.references.length - 1];
  return (
    session.references.find((r) => r.id === reference) ??
    session.references.find((r) => r.name === reference) ??
    session.references[Number(reference)]
  );
}

/** 用归一化掩码画出 [参考 | 模型 | 叠加] 对比图 */
function compositeDataUrl(
  referenceMask: Uint8Array,
  modelMask: Uint8Array,
  size: number,
): string {
  const scale = 4;
  const canvas = document.createElement("canvas");
  canvas.width = size * scale * 3 + 16;
  canvas.height = size * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new CommandError("E_BLOCKBENCH_ERROR", "No 2d context for the composite.");
  ctx.fillStyle = "#101318";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const draw = (mask: Uint8Array, offset: number, color: string) => {
    ctx.fillStyle = color;
    for (let y = 0; y < size; y += 1)
      for (let x = 0; x < size; x += 1)
        if (mask[y * size + x]) ctx.fillRect(offset + x * scale, y * scale, scale, scale);
  };
  draw(referenceMask, 0, "#4b5563");
  draw(modelMask, size * scale + 8, "#4b5563");
  const overlayOffset = size * scale * 2 + 16;
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      const inRef = referenceMask[y * size + x] === 1;
      const inModel = modelMask[y * size + x] === 1;
      if (!inRef && !inModel) continue;
      ctx.fillStyle = inRef && inModel ? "#f8fafc" : inRef ? "#ef4444" : "#3b82f6";
      ctx.fillRect(overlayOffset + x * scale, y * scale, scale, scale);
    }
  return canvas.toDataURL("image/png");
}

export const referenceTools: Record<string, ToolHandler> = {
  load_reference: async (args: { path?: string; data_url?: string; name?: string }) => {
    let dataUrl = args?.data_url;
    let source = "data_url";
    if (!dataUrl && args?.path) {
      const bytes = readScopedFile(args.path);
      dataUrl = `data:image/png;base64,${base64Of(bytes)}`;
      source = args.path;
    }
    if (!dataUrl)
      throw new CommandError(
        "E_INVALID_PARAM",
        "Pass either path (inside the approved directory) or data_url ('data:image/png;base64,...').",
      );
    const size = await decode(dataUrl);
    session.referenceSeq += 1;
    const reference: ReferenceImage = {
      id: `ref-${session.referenceSeq}`,
      name: args?.name ?? `reference_${session.referenceSeq}`,
      data_url: dataUrl,
      width: size.width,
      height: size.height,
      source,
      addedAt: Date.now(),
    };
    session.references.push(reference);
    return {
      ok: true,
      id: reference.id,
      name: reference.name,
      width: reference.width,
      height: reference.height,
      source,
      note: "Call compare_reference every modeling pass until match_percent >= 85.",
    };
  },

  list_references: () => ({
    count: session.references.length,
    references: session.references.map((r) => ({
      id: r.id,
      name: r.name,
      width: r.width,
      height: r.height,
      source: r.source,
      added_at: r.addedAt,
    })),
  }),

  get_reference: (args: { name?: string; id?: string }) => {
    const wanted = args?.id ?? args?.name;
    const list = wanted ? [pick(wanted)].filter(Boolean) : session.references;
    if (!list.length)
      throw new CommandError("E_NOT_FOUND", "No reference image loaded. Use load_reference or call list_references.");
    return {
      count: list.length,
      references: (list as ReferenceImage[]).map((reference) => ({
        id: reference.id,
        name: reference.name,
        width: reference.width,
        height: reference.height,
        data_url: reference.data_url,
      })),
      note: "Actually LOOK at these before building, and re-look during the build.",
    };
  },

  clear_references: () => {
    const count = session.references.length;
    session.references = [];
    return { ok: true, cleared: count };
  },

  compare_reference: async (args: {
    reference?: string;
    view?: ViewPreset;
    position?: number[];
    target?: number[];
    alpha_threshold?: number;
  }) => {
    requireProject();
    const reference = pick(args?.reference);
    if (!reference)
      throw new CommandError(
        "E_NOT_FOUND",
        "No reference loaded — ask the user to drop one in, or call load_reference with a path/data_url.",
      );
    const view = args?.view ?? "north";
    const captured = await captureView(view, 512);
    const modelSilhouette = await silhouetteOf(captured.dataUrl, args?.alpha_threshold);
    const referenceSilhouette = await silhouetteOf(reference.data_url, args?.alpha_threshold);
    const result = compareSilhouettes(modelSilhouette, referenceSilhouette, 64);
    const composite = compositeDataUrl(result.reference_mask, result.model_mask, result.grid_size);
    const { model_mask, reference_mask, ...summary } = result;
    return {
      ...summary,
      reference: reference.name,
      view,
      reference_size: [reference.width, reference.height],
      composite_data_url: composite,
      composite_legend: "left = reference, middle = your model, right = overlay (white match, red missing mass, blue extra mass)",
      note:
        summary.match_percent >= 85
          ? "Silhouette match is good. Keep going with detail and texture."
          : "Iterate: act on the advice, then compare again. Do not declare a match by eye.",
    };
  },
};

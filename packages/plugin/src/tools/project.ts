/** 工程生命周期 / 文件 / 作用域 */
import { CommandError } from "../errors.js";
import { createProject, refreshCanvas, showBlockingDialog, withUndo } from "../host.js";
import { requireProject } from "../bb.js";
import { fsApi, pathApi, session, writeScopedFile } from "../session.js";
import type { ToolHandler } from "../dispatch.js";

const CODECS: Record<string, () => any> = {
  project: () => Codecs?.project,
  gltf: () => Codecs?.gltf ?? Codecs?.glTF,
};

function codecFor(name?: string): { id: string; codec: any } {
  if (name && CODECS[name]) {
    const codec = CODECS[name]();
    if (codec) return { id: name, codec };
  }
  if (name && Codecs?.[name]) return { id: name, codec: Codecs[name] };
  const current = Format?.codec;
  if (current) return { id: current.id ?? Format?.id ?? "format", codec: current };
  if (Codecs?.project) return { id: "project", codec: Codecs.project };
  throw new CommandError("E_UNSUPPORTED_FORMAT", `No export codec available${name ? ` for "${name}"` : ""}.`);
}

function serialize(content: unknown): string | Uint8Array {
  if (typeof content === "string" || content instanceof Uint8Array) return content;
  // 二进制 codec(.glb 等)会返回 ArrayBuffer
  if (typeof ArrayBuffer !== "undefined" && content instanceof ArrayBuffer)
    return new Uint8Array(content);
  if (content === undefined || content === null)
    throw new CommandError("E_BLOCKBENCH_ERROR", "Codec returned no content.");
  if (typeof content === "object" && "then" in (content as object))
    // 真机踩过:Codecs.gltf.compile 是 async,不 await 会 JSON.stringify(Promise) → "{}" 两字节
    throw new CommandError(
      "E_BLOCKBENCH_ERROR",
      "Codec returned a Promise; it must be awaited before serializing.",
    );
  return JSON.stringify(content, null, 2);
}

export const projectTools: Record<string, ToolHandler> = {
  create_project: (args: {
    format: string;
    name?: string;
    geometry_name?: string;
    uv_mode?: "box" | "face" | "auto";
    texture_width?: number;
    texture_height?: number;
  }) => {
    const result = createProject(args);
    return {
      ok: true,
      ...result,
      note: "Existing project tabs were preserved. Call get_project_summary to confirm uv_mode, then check_model after the first geometry pass.",
    };
  },

  set_project_meta: (args: {
    name?: string;
    geometry_name?: string;
    texture_width?: number;
    texture_height?: number;
  }) => {
    requireProject();
    const oldW = Project.texture_width ?? 16;
    const oldH = Project.texture_height ?? 16;
    const newW = args?.texture_width ?? oldW;
    const newH = args?.texture_height ?? oldH;
    const resizing = newW !== oldW || newH !== oldH;
    const scaleX = newW / oldW;
    const scaleY = newH / oldH;
    return withUndo(
      { elements: [...(Cube?.all ?? [])], textures: [...(Texture?.all ?? [])], bitmap: true, uv_only: true },
      "set_project_meta",
      () => {
        if (args?.name !== undefined) Project.name = args.name;
        if (args?.geometry_name !== undefined) Project.geometry_name = args.geometry_name;
        if (resizing) {
          for (const cube of Cube?.all ?? []) {
            if (Array.isArray(cube.uv_offset))
              cube.uv_offset = [cube.uv_offset[0] * scaleX, cube.uv_offset[1] * scaleY];
            for (const face of Object.values(cube.faces ?? {}) as any[]) {
              if (!Array.isArray(face?.uv)) continue;
              face.uv = [
                face.uv[0] * scaleX,
                face.uv[1] * scaleY,
                face.uv[2] * scaleX,
                face.uv[3] * scaleY,
              ];
            }
          }
          Project.texture_width = Math.round(newW);
          Project.texture_height = Math.round(newH);
          for (const texture of Texture?.all ?? []) {
            texture.edit?.((canvas: HTMLCanvasElement) => {
              const ctx = canvas.getContext("2d");
              if (!ctx) return;
              const previous = document.createElement("canvas");
              previous.width = canvas.width;
              previous.height = canvas.height;
              previous.getContext("2d")?.drawImage(canvas, 0, 0);
              canvas.width = Math.round(newW);
              canvas.height = Math.round(newH);
              ctx.imageSmoothingEnabled = false;
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(previous, 0, 0, canvas.width, canvas.height);
            }, { edit_name: "set_project_meta resize" });
          }
          refreshCanvas();
        }
        return {
          ok: true,
          name: Project.name,
          texture_size: [Project.texture_width, Project.texture_height],
          uv_scaled: resizing ? [scaleX, scaleY] : null,
        };
      },
    );
  },

  propose_scoped_directory: async (args: { path: string; reason?: string; purpose?: string }) => {
    const paths = pathApi();
    if (!paths.isAbsolute(args?.path))
      throw new CommandError("E_INVALID_PARAM", "Scoped directory must be an absolute path.");
    const resolved = paths.resolve(args.path);
    if (!fsApi().existsSync(resolved))
      throw new CommandError("E_NOT_FOUND", `Directory does not exist: ${resolved}`);
    // 同一目录本会话已批准过 → 直接用,不再弹框(否则每次文件操作都要用户点一次)
    if (session.scopedDirectory === resolved)
      return { scoped_directory: resolved, confirmed: true, already_approved: true };
    // 卡上必须写清楚"为什么要授权" —— 否则用户只能盲点 Allow
    const reason = (args?.reason ?? args?.purpose ?? "").trim();
    const scopeDialog = showBlockingDialog({
      id: "bbmcp_scope",
      title: "Blockbench MCP — file access",
      message: `${reason ? `AI 想干什么:${reason}\n\n` : ""}Allow MCP file access for this session?\n\n${resolved}\n\nOnly this folder becomes readable/writable by AI tools; nothing outside it is reachable.`,
      buttons: ["Allow this folder", "Deny"],
    });
    const result = await scopeDialog.result;
    if (result.index !== 0)
      throw new CommandError("E_SCOPE_DENIED", "User denied scoped directory access.");
    session.scopedDirectory = resolved;
    return { scoped_directory: resolved, confirmed: true };
  },

  revoke_scope: () => {
    const previous = session.scopedDirectory;
    session.scopedDirectory = null;
    return {
      ok: true,
      revoked: previous,
      scoped_directory: null,
      note: "File access revoked for this session; call propose_scoped_directory again when you need it.",
    };
  },

  save_project: async (args: { path: string; overwrite?: boolean }) => {
    requireProject();
    const codec = Codecs?.project;
    const id = "project";
    if (!codec?.compile)
      throw new CommandError("E_UNSUPPORTED_FORMAT", "The .bbmodel project codec is unavailable.");
    const data = serialize(await codec.compile());
    const written = writeScopedFile(args.path, data, args.overwrite);
    return { ok: true, codec: id, ...written };
  },

  export_model: async (args: {
    path: string;
    overwrite?: boolean;
    codec?: string;
    format?: string;
    options?: Record<string, unknown>;
  }) => {
    requireProject();
    const { codec, id } = codecFor(args?.codec);
    if (typeof codec.compile !== "function")
      throw new CommandError("E_UNSUPPORTED_FORMAT", `Codec "${id}" cannot compile.`);
    // 必须 await:Codecs.gltf.compile 是 async(真机实测:不 await 会写出 2 字节的 "{}")
    const data = serialize(await codec.compile(args?.options ?? {}));
    const written = writeScopedFile(args.path, data, args.overwrite);
    return {
      ok: true,
      codec: id,
      format: Format?.id ?? null,
      ...written,
    };
  },
};

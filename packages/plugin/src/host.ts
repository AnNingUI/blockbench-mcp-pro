/**
 * 宿主端口 —— 所有 Blockbench API 访问都收口在这里。
 * 插件逻辑只依赖这些函数,便于在 node 中 mock 测试。
 */
import { CommandError } from "./errors.js";

/* ------------------------------------------------------------- node modules */

export function requireNodeModule<T>(name: string): T {
  const loader =
    typeof require === "function"
      ? require
      : (globalThis as { require?: (id: string) => unknown }).require;
  if (!loader)
    throw new CommandError(
      "E_BLOCKBENCH_ERROR",
      "Node modules unavailable — use the Blockbench DESKTOP app.",
    );
  try {
    const value = loader(name);
    if (!value) throw new Error("denied");
    return value as T;
  } catch {
    throw new CommandError(
      "E_BLOCKBENCH_ERROR",
      `Node module "${name}" unavailable; allow this plugin's desktop module permission and retry.`,
    );
  }
}

/* -------------------------------------------------------------------- toast */

export function toast(message: string, ms = 3000): void {
  try {
    Blockbench?.showQuickMessage?.(message, ms);
  } catch {
    /* ignore */
  }
}

/* --------------------------------------------------------------------- undo */

type Track = {
  addElements: (elements: unknown[]) => void;
  addTextures: (textures: unknown[]) => void;
  addAnimations: (animations: unknown[]) => void;
};

/**
 * Blockbench 5.1 正确的 undo 包裹:失败时 cancelEdit 回滚,成功时把新建元素并进 finishEdit。
 * 所有会改工程的工具都必须经过它,这样用户 Ctrl+Z 能撤销 AI 的每一步。
 */
export function withUndo<T>(
  aspects: Record<string, unknown>,
  label: string,
  fn: (track: Track) => T,
): T {
  const created: { elements: unknown[]; textures: unknown[]; animations: unknown[] } = {
    elements: [],
    textures: [],
    animations: [],
  };
  const track: Track = {
    addElements: (els) => created.elements.push(...els),
    addTextures: (texs) => created.textures.push(...texs),
    addAnimations: (anims) => created.animations.push(...anims),
  };
  const init: Record<string, unknown> = { ...aspects };
  for (const key of ["elements", "textures", "groups"]) {
    if (Array.isArray(init[key]) && (init[key] as unknown[]).length === 0)
      delete init[key];
  }
  let started = false;
  try {
    Undo.initEdit(init);
    started = true;
  } catch {
    // 某些版本在没有 aspect 时会抛错;退回"无 undo 上下文"但仍尝试执行
    started = false;
  }
  try {
    const result = fn(track);
    if (started) {
      const finish: Record<string, unknown> = { ...init };
      const existing = (finish.elements as unknown[]) ?? [];
      const native = created.elements.filter(
        (el) => el && typeof el === "object" && "getUndoCopy" in (el as object),
      );
      if (native.length) finish.elements = [...existing, ...native];
      const nativeTex = created.textures.filter(
        (t) => t && typeof t === "object" && "getUndoCopy" in (t as object),
      );
      if (nativeTex.length)
        finish.textures = [...((finish.textures as unknown[]) ?? []), ...nativeTex];
      if (created.animations.length) {
        const anims = created.animations.filter(
          (a) => a && typeof a === "object" && "name" in (a as object),
        );
        const live = anims
          .map((a) => Animation?.all?.find?.((x: any) => x.name === (a as any).name))
          .filter(Boolean);
        if (live.length) finish.animations = live;
      }
      Undo.finishEdit(label, finish);
    }
    return result;
  } catch (err) {
    if (started) {
      try {
        Undo.cancelEdit?.(true);
      } catch {
        /* ignore */
      }
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ textures */

export type TextureHandle = {
  uuid: string;
  name: string;
  width: number;
  height: number;
  /** 在 Blockbench 的 texture.edit 中修改位图(计入 undo) */
  edit: (fn: (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void, label: string) => void;
  /** 只读访问位图 */
  read: <T>(fn: (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => T) => T;
  applyToCube: (cubeUuid: string, faces?: true | string[]) => void;
  toDataURL: (maxEdge?: number) => string;
  raw: any;
};

function canvasOf(tex: any): HTMLCanvasElement {
  const canvas = tex?.canvas ?? tex?.getCanvas?.();
  if (!canvas) throw new CommandError("E_BLOCKBENCH_ERROR", "Texture has no canvas");
  return canvas;
}

export function wrapTexture(tex: any): TextureHandle {
  return {
    uuid: tex.uuid,
    name: tex.name,
    width: tex.width ?? tex.canvas?.width ?? 16,
    height: tex.height ?? tex.canvas?.height ?? 16,
    raw: tex,
    edit(fn, label) {
      if (typeof tex.edit === "function") {
        tex.edit(
          (canvas: HTMLCanvasElement) => {
            const ctx = canvas.getContext("2d");
            if (ctx) fn(ctx, canvas);
          },
          { edit_name: label },
        );
        tex.updateChangesAfterEdit?.();
        return;
      }
      const canvas = canvasOf(tex);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new CommandError("E_BLOCKBENCH_ERROR", "No 2d context");
      fn(ctx, canvas);
      tex.updateChangesAfterEdit?.();
    },
    read(fn) {
      const canvas = canvasOf(tex);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new CommandError("E_BLOCKBENCH_ERROR", "No 2d context");
      return fn(ctx, canvas);
    },
    applyToCube(cubeUuid, faces = true) {
      const cube = Cube?.all?.find?.((c: any) => c.uuid === cubeUuid);
      if (!cube)
        throw new CommandError("E_NOT_FOUND", `Cube not found: ${cubeUuid}`);
      cube.applyTexture(tex, faces as true | CubeFaceDirection[]);
    },
    toDataURL(maxEdge = 256) {
      const canvas = canvasOf(tex);
      const w = canvas.width || tex.width || 16;
      const h = canvas.height || tex.height || 16;
      const scale = Math.min(1, maxEdge / Math.max(w, h, 1));
      if (scale >= 0.999) return canvas.toDataURL("image/png");
      const out = document.createElement("canvas");
      out.width = Math.max(1, Math.round(w * scale));
      out.height = Math.max(1, Math.round(h * scale));
      const ctx = out.getContext("2d");
      if (!ctx) throw new CommandError("E_BLOCKBENCH_ERROR", "No 2d context");
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(canvas, 0, 0, out.width, out.height);
      return out.toDataURL("image/png");
    },
  };
}

export function findTexture(ref?: string): TextureHandle | undefined {
  const all: any[] = Texture?.all ?? [];
  const hit = ref
    ? all.find((t) => t.uuid === ref || t.name === ref)
    : (Texture?.getDefault?.() ?? all[0]);
  return hit ? wrapTexture(hit) : undefined;
}

export function listTextures(): TextureHandle[] {
  return (Texture?.all ?? []).map((t: any) => wrapTexture(t));
}

/** 新建纹理(带内容),不负责 undo —— 调用方用 withUndo 包裹 */
export function createTexture(opts: {
  name: string;
  width: number;
  height: number;
  fill?: string;
}): TextureHandle {
  const existing = findTexture(opts.name);
  if (existing) return existing;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(opts.width));
  canvas.height = Math.max(1, Math.round(opts.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new CommandError("E_BLOCKBENCH_ERROR", "No 2d context");
  if (opts.fill) {
    ctx.fillStyle = opts.fill;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const tex = new Texture({ name: opts.name });
  // 尺寸先填好,Blockbench 才能按正确尺寸解码 data URL
  tex.width = canvas.width;
  tex.height = canvas.height;
  const dataUrl = canvas.toDataURL("image/png");
  if (typeof tex.fromDataURL === "function") tex.fromDataURL(dataUrl);
  else throw new CommandError("E_BLOCKBENCH_ERROR", "Texture.fromDataURL missing — need Blockbench ≥ 5.1");
  tex.add(false);
  return wrapTexture(tex);
}

export function solidPng(width: number, height: number, fill: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new CommandError("E_BLOCKBENCH_ERROR", "No 2d context");
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

/* -------------------------------------------------------------------- canvas */

export function refreshCanvas(elements?: Array<{ uuid: string }>): void {
  try {
    if (elements?.length && typeof Canvas?.updateView === "function") {
      const uuids = new Set(elements.map((e) => e.uuid));
      const cubes = (Cube?.all ?? []).filter((c: any) => uuids.has(c.uuid));
      const groups = (Group?.all ?? []).filter((g: any) => uuids.has(g.uuid));
      const expand = (group: any) => {
        for (const child of group.children ?? []) {
          uuids.add(child.uuid);
          if (child.children) expand(child);
        }
      };
      for (const group of groups) expand(group);
      Canvas.updateView({
        elements: cubes,
        groups,
        element_aspects: { geometry: true, uv: true, faces: true, transform: true, visibility: true },
        group_aspects: { transform: true, visibility: true },
        selection: false,
      });
      Canvas.updateAll?.();
      return;
    }
    Canvas?.updateAll?.();
  } catch {
    try {
      Canvas?.updateAll?.();
    } catch {
      /* ignore */
    }
  }
}

/* ------------------------------------------------------------------- formats */

export function currentFormatId(): string | null {
  return Format?.id ?? null;
}

export function listFormats(): Array<{ id: string; name: string; box_uv: boolean | null }> {
  const formats = Formats ?? {};
  return Object.entries(formats)
    .map(([key, value]: [string, any]) => ({
      id: value?.id ?? key,
      name: value?.name ?? value?.display_name ?? value?.id ?? key,
      box_uv: typeof value?.box_uv === "boolean" ? value.box_uv : null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function hasGeckoLib(): boolean {
  if (!Formats) return false;
  if (Formats.geckolib_model) return true;
  return Object.keys(Formats).some((id) => id.toLowerCase().includes("gecko"));
}

export function createProject(opts: {
  format: string;
  name?: string;
  geometry_name?: string;
  uv_mode?: "box" | "face" | "auto";
  texture_width?: number;
  texture_height?: number;
}): { format: string; name?: string; uv_mode: "box" | "face" } {
  let formatId = opts.format;
  let formatApi = Formats?.[formatId];
  if (!formatApi && opts.format === "geckolib_model") {
    const hit = Object.keys(Formats ?? {}).find((k) => k.toLowerCase().includes("gecko"));
    if (!hit)
      throw new CommandError(
        "E_UNSUPPORTED_FORMAT",
        "Install the GeckoLib Blockbench plugin first (install_plugin {id:'geckolib'}).",
      );
    formatId = hit;
    formatApi = Formats[hit];
  }
  if (!formatApi)
    throw new CommandError(
      "E_UNSUPPORTED_FORMAT",
      `Unknown format "${opts.format}"; call list_formats for valid ids.`,
    );
  if (typeof newProject !== "function")
    throw new CommandError("E_BLOCKBENCH_ERROR", "newProject() unavailable in this Blockbench build.");

  const wantsBox =
    opts.uv_mode === "box" || (opts.uv_mode !== "face" && formatApi.box_uv === true);
  if (opts.uv_mode && opts.uv_mode !== "auto") {
    const supportsChoice = formatApi.optional_box_uv !== false;
    if (!supportsChoice && typeof formatApi.box_uv === "boolean" && (opts.uv_mode === "box") !== formatApi.box_uv)
      throw new CommandError(
        "E_INVALID_PARAM",
        `Format "${formatId}" does not support uv_mode "${opts.uv_mode}".`,
      );
  }
  if (opts.uv_mode === "box" && formatId === "java_block")
    throw new CommandError("E_INVALID_PARAM", "java_block requires uv_mode 'face'.");

  const before = Project;
  if (newProject(formatApi) === false)
    throw new CommandError("E_BLOCKBENCH_ERROR", "Project creation was cancelled.");
  const created = Project;
  if (!created || created === before)
    throw new CommandError("E_BLOCKBENCH_ERROR", "A new project was not created.");
  if (opts.name) created.name = opts.name;
  if (opts.geometry_name) created.geometry_name = opts.geometry_name;
  created.box_uv = wantsBox;
  if (opts.texture_width) created.texture_width = Math.round(opts.texture_width);
  if (opts.texture_height) created.texture_height = Math.round(opts.texture_height);
  return {
    format: Format?.id ?? formatId,
    name: created.name,
    uv_mode: created.box_uv ? "box" : "face",
  };
}

/* ------------------------------------------------------------------- preview */

export function captureView(
  view: string,
  size: number,
): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const preview = Screencam?.NoAAPreview;
    if (!preview || typeof Screencam?.screenshotPreview !== "function") {
      reject(
        new CommandError(
          "E_BLOCKBENCH_ERROR",
          "Offscreen screenshot API unavailable (Screencam.NoAAPreview).",
        ),
      );
      return;
    }
    const timeout = setTimeout(
      () => reject(new CommandError("E_TIMEOUT", "Screenshot timed out")),
      20_000,
    );
    try {
      const frame = framing(view);
      preview.loadAnglePreset(frame.preset);
      const cam = preview.camOrtho;
      cam.zoom = Math.min(cam.right - cam.left, cam.top - cam.bottom) / frame.span;
      cam.near = 0.01;
      cam.far = Math.max(1000, frame.span * 10 + 128);
      cam.updateProjectionMatrix();
      preview.render?.();
      Screencam.screenshotPreview(
        preview,
        { width: size, height: size, crop: false },
        (url: string) => {
          clearTimeout(timeout);
          const image = new Image();
          image.onload = () =>
            resolve({ dataUrl: url, width: image.naturalWidth || size, height: image.naturalHeight || size });
          image.onerror = () => resolve({ dataUrl: url, width: size, height: size });
          image.src = url;
        },
      );
    } catch (err) {
      clearTimeout(timeout);
      reject(err);
    }
  });
}

/** 视野取景(基于可见几何的世界包围盒),返回官方 AnglePreset */
function framing(view: string): { preset: AnglePreset; span: number } {
  const cubes: any[] = (Cube?.all ?? []).filter((cube: any) => {
    if (cube.visibility === false) return false;
    let parent = cube.parent;
    let guard = 0;
    while (parent && parent !== "root" && typeof parent !== "string" && guard < 32) {
      if (parent.visibility === false) return false;
      parent = parent.parent;
      guard += 1;
    }
    return true;
  });
  const points: number[][] = [];
  for (const cube of cubes) {
    const inflate = cube.inflate ?? 0;
    const lo = cube.from.map((v: number, i: number) => Math.min(v, cube.to[i]) - inflate);
    const hi = cube.from.map((v: number, i: number) => Math.max(v, cube.to[i]) + inflate);
    for (const x of [lo[0], hi[0]])
      for (const y of [lo[1], hi[1]])
        for (const z of [lo[2], hi[2]]) points.push([x, y, z]);
  }
  const min = [0, 1, 2].map((i) => (points.length ? Math.min(...points.map((p) => p[i])) : -8));
  const max = [0, 1, 2].map((i) => (points.length ? Math.max(...points.map((p) => p[i])) : 8));
  const center = min.map((v, i) => (v + max[i]) / 2);
  const radius = Math.max(
    1,
    ...points.map((p) => Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2])),
  );
  const directions: Record<string, number[]> = {
    north: [0, 0, -1],
    south: [0, 0, 1],
    east: [1, 0, 0],
    west: [-1, 0, 0],
    up: [0, 1, 0.0001],
    down: [0, -1, 0.0001],
    iso: [1, 0.8, 1],
  };
  const dir = directions[view] ?? directions.iso;
  const distance = radius * 4 + 64;
  const length = Math.hypot(dir[0], dir[1], dir[2]);
  return {
    preset: {
      projection: "orthographic",
      position: center.map((v, i) => v + (dir[i] / length) * distance) as ArrayVector3,
      target: center as ArrayVector3,
    },
    span: radius * 2.3,
  };
}

/* --------------------------------------------------------------- ui dialogs */

export type DialogResult = { index: number; comment?: string };

/**
 * 显示一个阻塞式对话框并等待用户选择。
 * 优先用 Blockbench Dialog(可以带图片),不可用时退化为原生消息框。
 * ponytail: 富面板(缩略图 + 评论框 + 活动日志)是升级路径;这里先保证"人能回答"。
 */
export function showBlockingDialog(opts: {
  id: string;
  title: string;
  message: string;
  lines?: string[];
  buttons: string[];
}): Promise<DialogResult> {
  return new Promise((resolve) => {
    // 1) 原生 Dialog(支持 HTML,可放 <img>)
    if (typeof Dialog === "function") {
      try {
        let settled = false;
        const finish = (index: number) => {
          if (settled) return;
          settled = true;
          try {
            dialog.hide?.();
          } catch {
            /* ignore */
          }
          resolve({ index });
        };
        const dialog = new Dialog({
          id: opts.id,
          title: opts.title,
          lines: [opts.message, ...(opts.lines ?? [])],
          buttons: opts.buttons,
          onButton: (index: number) => finish(index),
          onCancel: () => finish(-1),
        });
        dialog.show?.();
        return;
      } catch {
        /* fall through to message box */
      }
    }
    // 2) 原生消息框
    try {
      Blockbench.showMessageBox(
        {
          title: opts.title,
          message: opts.message,
          buttons: opts.buttons,
          confirm: 0,
          cancel: opts.buttons.length - 1,
        },
        (button: string | number) =>
          resolve({ index: typeof button === "number" ? button : Number(button) }),
      );
    } catch {
      resolve({ index: -1 });
    }
  });
}

/** 收集评论(可选,用户取消则返回 undefined) */
export function askForComment(title: string, message: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    try {
      if (typeof Dialog === "function") {
        const dialog = new Dialog({
          id: `bbmcp_comment_${Date.now()}`,
          title,
          lines: [message],
          form: { comment: { label: "Comment", type: "textarea", value: "" } },
          onConfirm(form: any) {
            dialog.hide?.();
            resolve(String(form?.comment ?? ""));
          },
          onCancel() {
            dialog.hide?.();
            resolve(undefined);
          },
        });
        dialog.show?.();
        return;
      }
    } catch {
      /* fall through */
    }
    resolve(undefined);
  });
}

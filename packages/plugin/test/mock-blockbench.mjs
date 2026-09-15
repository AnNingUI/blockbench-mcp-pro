/**
 * Blockbench 宿主 mock —— 让插件逻辑可以在 node 中真实跑起来:
 * 真实的 canvas 像素缓冲、真实的 outliner、真实的 undo 调用记录。
 * 只为"被测试到的 API 面"实现,故意保持小。
 */

import { createRequire } from "node:module";

const nodeRequire = createRequire(import.meta.url);

function base64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

function fill(ctx, x, y, w, h, rgba) {
  const canvas = ctx.__canvas;
  for (let py = Math.max(0, Math.floor(y)); py < Math.min(canvas.height, Math.ceil(y + h)); py += 1)
    for (let px = Math.max(0, Math.floor(x)); px < Math.min(canvas.width, Math.ceil(x + w)); px += 1) {
      const i = (py * canvas.width + px) * 4;
      for (let c = 0; c < 4; c += 1) canvas._data[i + c] = rgba[c] ?? 255;
    }
}

function parseColor(value) {
  if (typeof value !== "string") return [0, 0, 0, 255];
  const hex8 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (hex8) return [1, 2, 3, 4].map((i) => parseInt(hex8[i], 16));
  const hex6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (hex6) return [1, 2, 3].map((i) => parseInt(hex6[i], 16)).concat(255);
  const rgba = /rgba?\(([^)]+)\)/i.exec(value);
  if (rgba) {
    const parts = rgba[1].split(",").map((p) => Number(p.trim()));
    return [parts[0] | 0, parts[1] | 0, parts[2] | 0, parts[3] === undefined ? 255 : parts[3] * 255];
  }
  return [0, 0, 0, 255];
}

export function makeCanvas(width = 1, height = 1) {
  const canvas = {
    width,
    height,
    _data: new Uint8ClampedArray(Math.max(1, width * height * 4)),
  };
  const ctx = {
    __canvas: canvas,
    fillStyle: "#000000",
    strokeStyle: "#000000",
    lineWidth: 1,
    font: "",
    globalAlpha: 1,
    imageSmoothingEnabled: false,
    _path: null,
  };
  const resize = () => {
    const size = Math.max(1, canvas.width * canvas.height * 4);
    if (canvas._data.length < size) {
      const next = new Uint8ClampedArray(size);
      next.set(canvas._data);
      canvas._data = next;
    }
  };
  ctx.getImageData = (x, y, w, h) => {
    const data = new Uint8ClampedArray(Math.max(1, w * h * 4));
    for (let py = 0; py < h; py += 1)
      for (let px = 0; px < w; px += 1) {
        const sx = x + px;
        const sy = y + py;
        if (sx < 0 || sy < 0 || sx >= canvas.width || sy >= canvas.height) continue;
        const si = (sy * canvas.width + sx) * 4;
        const di = (py * w + px) * 4;
        for (let c = 0; c < 4; c += 1) data[di + c] = canvas._data[si + c];
      }
    return { data, width: w, height: h };
  };
  ctx.createImageData = (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
  ctx.putImageData = (image, x, y) => {
    resize();
    for (let py = 0; py < image.height; py += 1)
      for (let px = 0; px < image.width; px += 1) {
        const dx = x + px;
        const dy = y + py;
        if (dx < 0 || dy < 0 || dx >= canvas.width || dy >= canvas.height) continue;
        const si = (py * image.width + px) * 4;
        const di = (dy * canvas.width + dx) * 4;
        for (let c = 0; c < 4; c += 1) canvas._data[di + c] = image.data[si + c];
      }
  };
  ctx.fillRect = (x, y, w, h) => {
    resize();
    fill(ctx, x, y, w, h, parseColor(ctx.fillStyle));
  };
  ctx.strokeRect = (x, y, w, h) => {
    ctx.fillRect(x, y, w, 1);
    ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x, y, 1, h);
    ctx.fillRect(x + w - 1, y, 1, h);
  };
  ctx.clearRect = (x, y, w, h) => {
    resize();
    fill(ctx, x, y, w, h, [0, 0, 0, 0]);
  };
  ctx.beginPath = () => {
    ctx._path = null;
  };
  ctx.rect = (x, y, w, h) => {
    ctx._path = { x, y, w, h };
  };
  ctx.clip = () => {};
  ctx.moveTo = (x, y) => {
    ctx._path = { x, y, x2: x, y2: y };
  };
  ctx.lineTo = (x, y) => {
    if (ctx._path) {
      ctx._path.x2 = x;
      ctx._path.y2 = y;
    }
  };
  ctx.stroke = () => {
    if (!ctx._path) return;
    const { x, y, x2, y2 } = ctx._path;
    const steps = Math.max(Math.abs(x2 - x), Math.abs(y2 - y), 1);
    for (let s = 0; s <= steps; s += 1) {
      const px = x + ((x2 - x) * s) / steps;
      const py = y + ((y2 - y) * s) / steps;
      ctx.fillRect(px - (ctx.lineWidth - 1) / 2, py - (ctx.lineWidth - 1) / 2, ctx.lineWidth, ctx.lineWidth);
    }
  };
  ctx.fill = () => {
    if (!ctx._path) return;
    const { x, y, w, h } = ctx._path;
    ctx.fillRect(x, y, w, h);
  };
  ctx.ellipse = (cx, cy, rx, ry) => {
    ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
  };
  ctx.fillText = () => {};
  ctx.createLinearGradient = () => ({ addColorStop() {} });
  ctx.drawImage = (image, ...rest) => {
    const src = image?.__canvas ?? image;
    if (!src?._data) return;
    resize();
    const dx = rest.length >= 4 ? rest[0] : 0;
    const dy = rest.length >= 4 ? rest[1] : 0;
    const dw = rest.length >= 4 ? rest[2] : src.width;
    const dh = rest.length >= 4 ? rest[3] : src.height;
    for (let py = 0; py < dh; py += 1)
      for (let px = 0; px < dw; px += 1) {
        const sx = Math.floor((px / dw) * src.width);
        const sy = Math.floor((py / dh) * src.height);
        const si = (sy * src.width + sx) * 4;
        const tx = Math.floor(dx + px);
        const ty = Math.floor(dy + py);
        if (tx < 0 || ty < 0 || tx >= canvas.width || ty >= canvas.height) continue;
        const di = (ty * canvas.width + tx) * 4;
        for (let c = 0; c < 4; c += 1) canvas._data[di + c] = src._data[si + c];
      }
  };

  canvas.getContext = () => ctx;
  canvas.toDataURL = () => `data:image/png;base64,${base64(Buffer.from(canvas._data.buffer, canvas._data.byteOffset, canvas._data.length))}`;
  canvas.__ctx = ctx;
  return canvas;
}

let uuidSeq = 0;
const nextUuid = () => `uuid-${(uuidSeq += 1)}`;

class MockElement {
  constructor(data = {}) {
    Object.assign(this, data);
    this.uuid = this.uuid ?? nextUuid();
    this.name = this.name ?? "element";
    this.origin = this.origin ?? [0, 0, 0];
    this.rotation = this.rotation ?? [0, 0, 0];
    this.parent = this.parent ?? "root";
  }
  init() {
    const list = this.constructor?.all;
    if (Array.isArray(list) && !list.includes(this)) list.push(this);
    return this;
  }
  createUniqueName() {
    return this;
  }
}

class MockGroup extends MockElement {
  constructor(data) {
    super({ rotation: [0, 0, 0], ...data });
    this.children = [];
  }
  addTo(parent) {
    this.parent = parent ?? "root";
    if (parent && parent !== "root") parent.children.push(this);
    return this;
  }
  remove() {
    MockGroup.all = MockGroup.all.filter((g) => g !== this);
    MockCube.all = MockCube.all.filter((c) => !this.children.includes(c));
    if (this.parent && this.parent !== "root") this.parent.children = this.parent.children.filter((c) => c !== this);
  }
  select() {
    return this;
  }
}
MockGroup.all = [];

class MockCube extends MockElement {
  constructor(data) {
    super({ rotation: [0, 0, 0], from: [0, 0, 0], to: [1, 1, 1], inflate: 0, ...data });
    this.faces = {};
    for (const face of ["north", "south", "east", "west", "up", "down"])
      this.faces[face] = { uv: [0, 0, 1, 1], rotation: 0, texture: null };
  }
  addTo(parent) {
    this.parent = parent ?? "root";
    if (parent && parent !== "root") parent.children.push(this);
    return this;
  }
  mapAutoUV() {
    const w = Math.max(1, Math.ceil(Math.abs(this.to[0] - this.from[0])));
    const h = Math.max(1, Math.ceil(Math.abs(this.to[1] - this.from[1])));
    const d = Math.max(1, Math.ceil(Math.abs(this.to[2] - this.from[2])));
    // box UV 模式下 uv_offset 平移整张展开图(与 Blockbench 行为一致)
    const ox = this.box_uv && Array.isArray(this.uv_offset) ? this.uv_offset[0] : 0;
    const oy = this.box_uv && Array.isArray(this.uv_offset) ? this.uv_offset[1] : 0;
    const uv = (x, y, ww, hh) => [x + ox, y + oy, x + ww + ox, y + hh + oy];
    this.faces.north.uv = uv(0, 0, w, h);
    this.faces.south.uv = uv(w, 0, w, h);
    this.faces.east.uv = uv(w * 2, 0, d, h);
    this.faces.west.uv = uv(w * 2 + d, 0, d, h);
    this.faces.up.uv = uv(0, h, w, d);
    this.faces.down.uv = uv(w, h, w, d);
    return this;
  }
  applyTexture(texture, faces = true) {
    const list = faces === true ? Object.keys(this.faces) : faces;
    for (const face of list) if (this.faces[face]) this.faces[face].texture = texture.uuid ?? texture;
    return this;
  }
  remove() {
    MockCube.all = MockCube.all.filter((c) => c !== this);
    if (this.parent && this.parent !== "root") this.parent.children = this.parent.children.filter((c) => c !== this);
  }
  select() {
    return this;
  }
}
MockCube.all = [];

class MockTexture {
  constructor(data = {}) {
    this.uuid = nextUuid();
    this.name = data.name ?? "texture";
    this.width = 16;
    this.height = 16;
    this.canvas = makeCanvas(16, 16);
    this.__canvas = this.canvas;
    this.__pixelEdits = 0;
  }
  get ctx() {
    return this.canvas.__ctx;
  }
  fromDataURL(url) {
    const encoded = String(url).split(",", 2)[1] ?? "";
    const bytes = Buffer.from(encoded, "base64");
    const width = Math.max(1, this.width ?? 16);
    const height = Math.max(1, this.height ?? 16);
    this.canvas = makeCanvas(width, height);
    this.__canvas = this.canvas;
    this.__sourceBytes = bytes.length;
    const expected = width * height * 4;
    if (bytes.length >= expected) {
      // mock 的 toDataURL 输出的是原始 RGBA 流,这里做真实往返
      this.canvas._data.set(bytes.subarray(0, expected));
    }
    return this;
  }
  setDataURL(url) {
    return this.fromDataURL(url);
  }
  add() {
    if (!MockTexture.all.includes(this)) MockTexture.all.push(this);
    return this;
  }
  edit(callback, options) {
    callback(this.canvas);
    this.__lastEdit = options?.edit_name ?? null;
    this.__pixelEdits += 1;
    this.updateChangesAfterEdit();
    return this;
  }
  updateChangesAfterEdit() {}
  getCanvas() {
    return this.canvas;
  }
  applyToCube(uuid, faces = true) {
    const cube = MockCube.all.find((c) => c.uuid === uuid);
    if (cube) cube.applyTexture(this, faces);
    return this;
  }
  toDataURL() {
    return this.canvas.toDataURL("image/png");
  }
}
MockTexture.all = [];
MockTexture.getDefault = () => MockTexture.all[0];

class MockAnimation {
  constructor(data = {}) {
    this.uuid = nextUuid();
    this.name = data.name ?? "animation";
    this.length = data.length ?? 1;
    this.loop = data.loop ?? "loop";
    this.animators = {};
  }
  add() {
    MockAnimation.all.push(this);
    return this;
  }
  remove() {
    MockAnimation.all = MockAnimation.all.filter((a) => a !== this);
  }
  setLength(length) {
    this.length = length;
    return this;
  }
  getBoneAnimator(group) {
    if (!this.animators[group.uuid]) {
      const animator = { group, rotations: [], position: [], scale: [] };
      animator.addKeyframe = ({ channel, time, interpolation, data_points }) => {
        const list = channel === "rotation" ? animator.rotations : animator[channel];
        list.push({ time, interpolation, data_points });
      };
      this.animators[group.uuid] = animator;
    }
    return this.animators[group.uuid];
  }
}
MockAnimation.all = [];

/** 安装 mock,返回可检查的句柄 */
export function installMockBlockbench() {
  const state = {
    dialogs: [],
    lastDialog: null,
    answers: [],
    viewport: { position: null, target: null },
    undoInit: 0,
    undoFinish: 0,
    undoCancel: 0,
    undoCalls: 0,
    redoCalls: 0,
    announcements: [],
    registered: null,
    settingsSaved: 0,
    persisted: {},
  };

  const canvas = makeCanvas(1, 1);

  globalThis.document = {
    createElement: (tag) => (tag === "canvas" ? makeCanvas(1, 1) : {}),
  };
  globalThis.Image = class {
    constructor() {
      this.naturalWidth = 64;
      this.naturalHeight = 64;
      this.width = 64;
      this.height = 64;
      this.onload = null;
      this.onerror = null;
    }
    set src(value) {
      this._src = value;
      setTimeout(() => this.onload?.(), 0);
    }
    get src() {
      return this._src;
    }
  };

  globalThis.Blockbench = {
    version: "5.1.0",
    isApp: true,
    showQuickMessage: (message) => state.announcements.push(message),
    showMessageBox: (options, callback) => {
      state.dialogs.push(options);
      state.lastDialog = callback;
    },
  };
  globalThis.Plugin = {
    register: (id, options) => {
      state.registered = { id, options };
    },
  };
  globalThis.Action = class {
    constructor(...args) {
      Object.assign(this, typeof args[0] === "string" ? { id: args[0], ...args[1] } : args[0]);
    }
  };
  globalThis.Plugins = { all: [] };
  globalThis.Settings = {
    add: (id, options) => {
      globalThis.settings[id] = options;
    },
    save: () => {
      state.settingsSaved += 1;
    },
  };
  // 真 Setting 的 set() 会写存储;mock 里记录调用次数以便断言"令牌确实被持久化"
  state.persisted = {};

  const formats = {
    bedrock: { id: "bedrock", name: "Bedrock", box_uv: true },
    java_block: { id: "java_block", name: "Java Block", box_uv: false },
    geckolib_model: { id: "geckolib_model", name: "GeckoLib", box_uv: true },
  };
  globalThis.Formats = formats;
  globalThis.Format = formats.bedrock;
  globalThis.Project = null;
  globalThis.newProject = (format) => {
    globalThis.Project = {
      uuid: nextUuid(),
      name: "project",
      texture_width: 64,
      texture_height: 64,
      box_uv: format?.box_uv ?? false,
    };
    globalThis.Format = format;
    return true;
  };

  globalThis.Cube = MockCube;
  globalThis.Group = MockGroup;
  globalThis.Texture = MockTexture;
  globalThis.Animation = MockAnimation;
  globalThis.MockAnimation = MockAnimation;
  globalThis.Undo = {
    initEdit: () => {
      state.undoInit += 1;
    },
    finishEdit: () => {
      state.undoFinish += 1;
    },
    cancelEdit: () => {
      state.undoCancel += 1;
    },
    // 真 Blockbench 的 UndoSystem 有 undo/redo(blockbench-types 也这么声明)
    undo: () => {
      state.undoCalls += 1;
    },
    redo: () => {
      state.redoCalls += 1;
    },
  };
  globalThis.Canvas = {
    updateAll: () => {},
    updateView: () => {},
    updateSelection: () => {},
    camera: { position: { set: (x, y, z) => (state.viewport.position = [x, y, z]) } },
  };
  globalThis.Timeline = { setTime: (t) => (state.timelineTime = t), setAnimation: () => {} };
  globalThis.BarItems = {
    mirror_model: { name: "Mirror", description: "Mirror the model", click: () => true },
    undo: { name: "Undo", click: () => true },
  };
  const modes = {
    options: {},
    selected: null,
  };
  for (const id of ["edit", "paint", "animate"]) {
    const mode = {
      id,
      name: id[0].toUpperCase() + id.slice(1),
      select() {
        modes.selected = mode;
        return mode;
      },
    };
    modes.options[id] = mode;
  }
  globalThis.Modes = modes;
  modes.options.edit.select();
  globalThis.Painter = { edit: () => {} };
  globalThis.Codecs = { project: { id: "project", compile: () => JSON.stringify({ meta: { format: "bedrock" } }) } };
  const settingObject = (id, value) => ({
    value,
    set(next) {
      this.value = next;
      state.persisted[id] = next;
    },
  });
  globalThis.settings = {
    bbmcp_allow_execute_script: settingObject("bbmcp_allow_execute_script", false),
    bbmcp_autostart: settingObject("bbmcp_autostart", true),
    bbmcp_port: settingObject("bbmcp_port", 39742),
    bbmcp_secret: settingObject("bbmcp_secret", ""),
  };
  globalThis.Screencam = {
    NoAAPreview: {
      camOrtho: { left: -1, right: 1, top: 1, bottom: -1, zoom: 1, near: 1, far: 100, updateProjectionMatrix() {} },
      loadAnglePreset() {},
      resize() {},
      render() {},
    },
    screenshotPreview: (_preview, _options, callback) => {
      setTimeout(() => callback(makeCanvas(64, 64).toDataURL("image/png")), 0);
    },
    camera: Canvas.camera,
  };
  globalThis.Dialog = undefined;
  globalThis.Outliner = { root: [], elements: [] };
  globalThis.unselectAll = () => {};
  globalThis.require = (id) => {
    if (id === "net") return nodeRequire("node:net");
    if (id === "fs") return nodeRequire("node:fs");
    if (id === "path") return nodeRequire("node:path");
    throw new Error(`module ${id} unavailable`);
  };

  const reset = () => {
    MockCube.all = [];
    MockGroup.all = [];
    MockTexture.all = [];
    MockAnimation.all = [];
    globalThis.Project = null;
    state.dialogs = [];
    state.lastDialog = null;
  };

  return { state, reset, MockCube, MockGroup, MockTexture, MockAnimation, canvas };
}

export { makeCanvas as canvas };

/**
 * 宿主类型 = 官方 `blockbench-types` + 极少量本项目补齐。
 *
 * Blockbench 的全局(Cube / Group / Texture / Animation / Timeline / Preview /
 * Undo / Canvas / Project / Format(s) / BarItems / Modes / Dialog / Action /
 * Codecs / Settings / Plugins / Plugin / newProject / unselectAll ...)全部来自
 * blockbench-types,这里**不再手写 any,也不重复声明**。
 *
 * 只补两件它没有的东西:
 *   1. 桌面端插件作用域里的 `require`(需要宿主授予模块权限)
 *   2. 浏览器 API —— 本项目刻意不引 lib.dom(Blockbench 全局与 DOM 的 Animation/Image 同名),
 *      所以只声明代码实际用到的那几个成员
 */
/// <reference types="blockbench-types" />

/** 桌面端 scoped require;返回 unknown,由 requireNodeModule<T>() 收口断言 */
declare function require(id: string): unknown;

/**
 * blockbench-types 把动画片段的类命名为 `_Animation`(避免与 DOM 的 Animation 撞名),
 * 运行时的全局值仍叫 `Animation`;`Plugin` 也只有类型没有值。两者的值声明在这里补上:
 *   new Animation({ name, length, loop }) / Animation.all: _Animation[]
 *   Plugin.register(id, options)
 */
declare const Animation: {
  new (data?: AnimationOptions): _Animation;
  all: _Animation[];
};
declare const Plugin: {
  register(id: string, options: Record<string, unknown>): unknown;
};

/* --------------------------- browser API(用到多少写多少) --------------------------- */

declare class BbGradient {
  addColorStop(offset: number, color: string): void;
}
declare class BbImageData {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}
declare class Bb2DContext {
  fillStyle: string | BbGradient;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  globalAlpha: number;
  imageSmoothingEnabled: boolean;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  fill(): void;
  ellipse(x: number, y: number, rx: number, ry: number, rotation: number, start: number, end: number): void;
  fillText(text: string, x: number, y: number): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): BbGradient;
  getImageData(x: number, y: number, w: number, h: number): BbImageData;
  createImageData(w: number, h: number): BbImageData;
  putImageData(data: BbImageData, x: number, y: number): void;
  drawImage(image: unknown, ...rest: number[]): void;
}
declare class BbCanvas {
  width: number;
  height: number;
  getContext(type: string): Bb2DContext | null;
  toDataURL(type?: string, quality?: number): string;
}
/** 同时是类型与值(业务代码里会写 Promise<Image> 和 new Image()) */
declare class Image {
  naturalWidth: number;
  naturalHeight: number;
  width: number;
  height: number;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  src: string;
}

/** 让业务代码可以用习惯的名字(BbCanvas ≡ HTMLCanvasElement …) */
type HTMLCanvasElement = BbCanvas;
type CanvasRenderingContext2D = Bb2DContext;
type ImageData = BbImageData;
type HTMLImageElement = Image;

declare const document: { createElement(tag: string): BbCanvas };
declare function btoa(data: string): string;
declare function atob(data: string): string;
declare class TextEncoder {
  encode(input?: string): Uint8Array;
}
declare class TextDecoder {
  constructor(label?: string);
  decode(input?: Uint8Array): string;
}
declare function setTimeout(handler: (...args: any[]) => void, ms?: number): any;
declare function clearTimeout(handle: any): void;
declare function setInterval(handler: (...args: any[]) => void, ms?: number): any;
declare function clearInterval(handle: any): void;
declare const console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
};

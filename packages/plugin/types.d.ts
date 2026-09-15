/**
 * 环境声明(插件运行在 Blockbench 渲染进程内)。
 * 这里刻意不引入 lib.dom —— Blockbench 的全局名(Animation/Plugin/...)与 DOM 冲突,
 * 因此只声明代码实际用到的那一小撮浏览器 API。
 */

/* ------------------------------- Blockbench ------------------------------- */
declare const Blockbench: any;
declare const Plugin: any;
declare const Plugins: any;
declare const Action: any;
declare const Cube: any;
declare const Group: any;
declare const Texture: any;
declare const Animation: any;
declare const Undo: any;
declare const Canvas: any;
declare const Project: any;
declare const Format: any;
declare const Formats: any;
declare const BarItems: any;
declare const Modes: any;
declare const Outliner: any;
declare const Painter: any;
declare const Timeline: any;
declare const Screencam: any;
declare const Dialog: any;
declare const Settings: any;
declare const settings: any;
declare const Codecs: any;
declare function newProject(format: any): boolean;
declare function unselectAll(): void;
declare function require(id: string): any;

/* --------------------------- minimal browser API --------------------------- */
declare const document: { createElement(tag: string): HTMLCanvasElement };
declare class Image {
  naturalWidth: number;
  naturalHeight: number;
  width: number;
  height: number;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  src: string;
}
declare class CanvasGradient {
  addColorStop(offset: number, color: string): void;
}
declare class ImageData {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}
declare class CanvasRenderingContext2D {
  fillStyle: any;
  strokeStyle: any;
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
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient;
  getImageData(x: number, y: number, w: number, h: number): ImageData;
  createImageData(w: number, h: number): ImageData;
  putImageData(data: ImageData, x: number, y: number): void;
  drawImage(image: any, ...rest: number[]): void;
}
declare class HTMLCanvasElement {
  width: number;
  height: number;
  getContext(type: string): CanvasRenderingContext2D | null;
  toDataURL(type?: string, quality?: number): string;
}
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
  log(...args: any[]): void;
  error(...args: any[]): void;
  warn(...args: any[]): void;
};

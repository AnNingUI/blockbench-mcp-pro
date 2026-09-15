/** 颜色工具 —— 与 Blockbench 解耦 */
export function clamp8(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

const NAMED: Record<string, string> = {
  white: "#ffffff",
  black: "#000000",
  gray: "#808080",
  grey: "#808080",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
};

/** 解析 #rgb/#rrggbb/rgb()/rgba()/命名色 → [r,g,b,a];失败返回 null */
export function parseColor(input: string): [number, number, number, number] | null {
  const s = input.trim().toLowerCase();
  const hex3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
  if (hex3)
    return [
      parseInt(hex3[1] + hex3[1], 16),
      parseInt(hex3[2] + hex3[2], 16),
      parseInt(hex3[3] + hex3[3], 16),
      255,
    ];
  const hex6 = /^#?([0-9a-f]{6})$/.exec(s);
  if (hex6) {
    const n = parseInt(hex6[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
  }
  const hex8 = /^#?([0-9a-f]{8})$/.exec(s);
  if (hex8) {
    const n = parseInt(hex8[1], 16);
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(s);
  if (rgb) {
    return [
      clamp8(Number(rgb[1])),
      clamp8(Number(rgb[2])),
      clamp8(Number(rgb[3])),
      rgb[4] === undefined ? 255 : clamp8(Number(rgb[4]) * 255),
    ];
  }
  const named = NAMED[s];
  if (named) return parseColor(named);
  return null;
}

export function toHex(rgba: [number, number, number, number]): string {
  return `#${rgba.map((v) => clamp8(v).toString(16).padStart(2, "0")).join("")}`;
}

/** RGB 乘以系数,返回 #rrggbb */
export function shadeHex(color: string, factor: number): string {
  const rgba = parseColor(color) ?? [154, 154, 154, 255];
  return toHex([
    clamp8(rgba[0] * factor),
    clamp8(rgba[1] * factor),
    clamp8(rgba[2] * factor),
    rgba[3],
  ]);
}

/** 按名称规则匹配区域颜色 (正则,忽略大小写) */
export function regionColorFor(
  name: string,
  regions: Array<{ match: string; color: string }> | undefined,
  fallback: string,
): string {
  if (!regions?.length) return fallback;
  for (const rule of regions) {
    try {
      if (new RegExp(rule.match, "i").test(name)) return rule.color;
    } catch {
      /* 忽略非法正则 */
    }
  }
  return fallback;
}

/** 可复现的 LCG 随机数 (同 seed 同输出) */
export function makeRandom(seed = 0x9e3779b9): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

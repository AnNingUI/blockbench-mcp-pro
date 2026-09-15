import { z } from "zod";

/** 协议版本 —— HTTP 网关与插件必须一致 */
export const PROTOCOL_VERSION = 1;

/** MCP 扩展能力声明 (MCP: protocolVersion 2024-11-05 + 扩展) */
export const PROTOCOL_VERSION_MCP = "2024-11-05";

export const DEFAULTS = {
  /** 插件内 HTTP MCP 端口 (127.0.0.1 回环) */
  mcpPort: 39742,
  /** 截图最长边默认值——保持上下文廉价 */
  screenshotMaxEdge: 256,
  screenshotMaxEdgeCap: 1024,
  screenshotQuality: 70,
  screenshotFormat: "jpeg" as const,
  /** 默认纹理尺寸 */
  textureSize: 64,
} as const;

/** 结构化错误码 —— 网关按码给 LLM 可执行建议 */
export const ERROR_CODES = [
  "E_PLUGIN_DISCONNECTED",
  "E_SECRET_MISSING",
  "E_AUTH_FAILED",
  "E_PROTOCOL_MISMATCH",
  "E_TIMEOUT",
  "E_INVALID_PARAM",
  "E_UNKNOWN_PARAM",
  "E_UNSUPPORTED_FORMAT",
  "E_UNSUPPORTED_COMMAND",
  "E_SCOPE_DENIED",
  "E_PARTIAL_FORBIDDEN",
  "E_NOT_FOUND",
  "E_BLOCKBENCH_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const errorPayloadSchema = z
  .object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    details: z.unknown().optional(),
  })
  .strict();

export type ErrorPayload = z.infer<typeof errorPayloadSchema>;

export function makeError(
  code: ErrorCode,
  message: string,
  details?: unknown,
): ErrorPayload {
  return details === undefined ? { code, message } : { code, message, details };
}

export const PROJECT_FORMATS = [
  "java_block",
  "bedrock",
  "bedrock_old",
  "geckolib_model",
] as const;
export type ProjectFormat = (typeof PROJECT_FORMATS)[number];

/** 截图视角 —— 模型自身坐标命名 (north/south 见协议说明) */
export const VIEW_PRESETS = [
  "north",
  "south",
  "east",
  "west",
  "up",
  "down",
  "iso",
] as const;
export type ViewPreset = (typeof VIEW_PRESETS)[number];

export const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
export type Vec3 = z.infer<typeof vec3Schema>;

/** 能力探测 —— LLM 可据此决定可用工作流 */
export const CAPABILITY_IDS = [
  "geometry",
  "textures",
  "screenshots",
  "animations",
  "geckolib",
  "filesystem",
  "painter",
] as const;
export type CapabilityId = (typeof CAPABILITY_IDS)[number];
export const capabilitiesSchema = z.array(z.enum(CAPABILITY_IDS));

/** 语义化版本解析 (仅解析前 3 段) */
export function parseSemverParts(v: string): [number, number, number] {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  if (!m) return [0, 0, 0];
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export const MIN_BLOCKBENCH_VERSION = "5.1.0";

export function isBlockbenchSupported(version: string): boolean {
  const [a, b, c] = parseSemverParts(version);
  const [A, B, C] = parseSemverParts(MIN_BLOCKBENCH_VERSION);
  if (a !== A) return a > A;
  if (b !== B) return b > B;
  return c >= C;
}
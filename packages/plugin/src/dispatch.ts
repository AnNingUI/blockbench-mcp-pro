/** 工具分发:参数校验 → 处理器 → 统一响应信封 */
import { TOOL_SPECS } from "@bbmcp/shared";
import { CommandError, toErrorPayload } from "./errors.js";
import { statusTools } from "./tools/status.js";
import { projectTools } from "./tools/project.js";
import { geometryTools } from "./tools/geometry.js";
import { generatorTools } from "./tools/generators.js";
import { paintTools } from "./tools/paint.js";
import { animationTools } from "./tools/animation.js";
import { qualityTools } from "./tools/quality.js";
import { viewTools } from "./tools/views.js";
import { referenceTools } from "./tools/reference.js";
import { reviewTools } from "./tools/review.js";
import { coverageTools } from "./tools/coverage.js";

export type ToolHandler = (args: any) => unknown | Promise<unknown>;

export const handlers: Record<string, ToolHandler> = {
  ...statusTools,
  ...projectTools,
  ...geometryTools,
  ...generatorTools,
  ...paintTools,
  ...animationTools,
  ...qualityTools,
  ...viewTools,
  ...referenceTools,
  ...reviewTools,
  ...coverageTools,
};

/** 有些 MCP 客户端会把结构化参数序列化成 JSON 字符串;这里把它们解开 */
export function coerceArguments(value: unknown, depth = 0): unknown {
  if (depth > 12) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        return coerceArguments(JSON.parse(trimmed), depth + 1);
      } catch {
        return value;
      }
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => coerceArguments(item, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = coerceArguments(item, depth + 1);
    return out;
  }
  return value;
}

export type ToolEnvelope = {
  ok: boolean;
  summary: string;
  result?: unknown;
  error?: ReturnType<typeof toErrorPayload>;
};

/** 校验并执行一个工具,永远返回信封(不抛) */
export async function runTool(name: string, rawArgs: unknown): Promise<ToolEnvelope> {
  const spec = TOOL_SPECS[name];
  if (!spec) {
    const error = toErrorPayload(
      new CommandError(
        "E_UNSUPPORTED_COMMAND",
        `Unknown tool: ${name}. Call tools/list for the supported set.`,
      ),
    );
    return { ok: false, summary: error.message, error };
  }
  const handler = handlers[name];
  if (!handler) {
    const error = toErrorPayload(
      new CommandError("E_UNSUPPORTED_COMMAND", `Tool "${name}" has no implementation.`),
    );
    return { ok: false, summary: error.message, error };
  }
  const coerced = coerceArguments(rawArgs ?? {});
  const parsed = spec.params.safeParse(coerced);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    const error = toErrorPayload(
      new CommandError("E_INVALID_PARAM", `Invalid parameters for ${name} — ${issues}`, parsed.error.flatten()),
    );
    return { ok: false, summary: error.message, error };
  }
  try {
    const result = await handler(parsed.data);
    return { ok: true, summary: `OK: ${name}`, result: result ?? null };
  } catch (err) {
    const error = toErrorPayload(err);
    return { ok: false, summary: error.message, error };
  }
}

export function registeredToolNames(): string[] {
  return Object.keys(TOOL_SPECS).filter((name) => Boolean(handlers[name]));
}
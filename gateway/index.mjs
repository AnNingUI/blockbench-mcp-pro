#!/usr/bin/env node
/**
 * stdio ⇄ HTTP 网关
 *
 * 给只有 stdio 的 MCP 客户端(Claude Desktop / Claude Code / pi 的 stdio 模式)用:
 * 它把 stdio 上的 JSON-RPC 原样转发给插件内的 HTTP MCP 端点。
 * 零依赖纯转发 —— 工具实现只有一份(在插件里)。
 *
 * 环境变量:
 *   BBMCP_URL        默认 http://127.0.0.1:39742/mcp
 *   BBMCP_TOKEN      必填;Blockbench ▸ Settings ▸ General ▸ MCP Access Token
 *   BBMCP_TIMEOUT_MS 单次请求超时(默认 180000)
 *   BBMCP_QUIET=1    不往 stderr 打日志
 */
import process from "node:process";
import { pathToFileURL } from "node:url";

export const DEFAULT_GATEWAY_URL = "http://127.0.0.1:39742/mcp";

export function resolveGatewayConfig(env = process.env) {
  return {
    url: env.BBMCP_URL || DEFAULT_GATEWAY_URL,
    token: env.BBMCP_TOKEN || "",
    timeoutMs: Number(env.BBMCP_TIMEOUT_MS || 180_000),
    quiet: env.BBMCP_QUIET === "1",
  };
}

/**
 * 启动 stdin/stdout 上的 MCP 转发。返回句柄(forward/write),流结束会自动退出。
 * 也可以作为模块导入:gateway/index.mjs 被 import 时只导出 API,不自动运行。
 */
export function startGateway(config = resolveGatewayConfig(), streams = {}) {
  const out = streams.stdout ?? process.stdout;
  const err = streams.stderr ?? process.stderr;
  const input = streams.stdin ?? process.stdin;
  const log = (...args) => {
    if (!config.quiet) err.write(`[bbmcp-gateway] ${args.join(" ")}\n`);
  };
  const write = (message) => out.write(`${JSON.stringify(message)}\n`);

  const forward = async (message) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetch(config.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
        },
        body: JSON.stringify(message),
        signal: controller.signal,
      });
      if (response.status === 202 || response.status === 204) return null;
      const text = await response.text();
      if (!text) return null;
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        return {
          jsonrpc: "2.0",
          id: message?.id ?? null,
          error: { code: -32603, message: `Bad gateway response: ${text.slice(0, 200)}` },
        };
      }
      // 插件在鉴权等失败时返回的是 {error:"..."} 而非 JSON-RPC,这里转成合法响应
      if (!parsed || typeof parsed !== "object" || parsed.jsonrpc === undefined) {
        const detail = (parsed && typeof parsed === "object" && parsed.error) || `HTTP ${response.status}`;
        return {
          jsonrpc: "2.0",
          id: message?.id ?? null,
          error: { code: -32000, message: String(detail) },
        };
      }
      return parsed;
    } catch (error) {
      const reason =
        error?.name === "AbortError"
          ? `timed out after ${config.timeoutMs}ms`
          : `${error?.message ?? error}`;
      return {
        jsonrpc: "2.0",
        id: message?.id ?? null,
        error: {
          code: -32000,
          message: `Cannot reach Blockbench on ${config.url} (${reason}). Is Blockbench open with the Blockbench MCP plugin running?`,
        },
      };
    } finally {
      clearTimeout(timer);
    }
  };

  const healthCheck = async () => {
    try {
      const response = await fetch(config.url.replace(/\/mcp$/, "/health"));
      const body = await response.json();
      log(`connected: ${body.server} ${body.version} → ${body.mcp ?? config.url}`);
      if (!config.token) log("WARNING: BBMCP_TOKEN is not set — the plugin will answer 401.");
    } catch {
      log(`not reachable yet: ${config.url} (starting anyway; each call retries)`);
    }
  };

  let buffer = "";
  input.setEncoding?.("utf8");
  input.on("data", (chunk) => {
    buffer += chunk;
    let index = buffer.indexOf("\n");
    while (index >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      index = buffer.indexOf("\n");
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
        continue;
      }
      void forward(message).then((result) => {
        if (result) write(result);
      });
    }
  });
  input.on("end", () => process.exit(0));

  void healthCheck();
  return { forward, write, config };
}

// 直接运行(gateway/index.mjs 或 dist/gateway.mjs)时启动;被 import 时只导出 API
const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) startGateway();

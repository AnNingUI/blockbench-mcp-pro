#!/usr/bin/env node
/**
 * stdio ⇄ HTTP 网关
 *
 * 给只有 stdio 的 MCP 客户端(Claude Desktop / Claude Code 等)用:
 * 它把 stdio 上的 JSON-RPC 原样转发给插件内的 HTTP MCP 端点。
 * 零依赖,纯转发 —— 工具实现只有一份(在插件里)。
 *
 * 环境变量:
 *   BBMCP_URL    默认 http://127.0.0.1:39742/mcp
 *   BBMCP_TOKEN  必填;Blockbench ▸ Settings ▸ General ▸ MCP Access Token
 *   BBMCP_TIMEOUT_MS  单次请求超时(默认 180000)
 */
import process from "node:process";

const URL_ = process.env.BBMCP_URL || "http://127.0.0.1:39742/mcp";
const TOKEN = process.env.BBMCP_TOKEN || "";
const TIMEOUT = Number(process.env.BBMCP_TIMEOUT_MS || 180_000);

const log = (...args) => process.stderr.write(`[bbmcp-gateway] ${args.join(" ")}\n`);

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function forward(message) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const response = await fetch(URL_, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
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
      const detail =
        (parsed && typeof parsed === "object" && parsed.error) || `HTTP ${response.status}`;
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
        ? `timed out after ${TIMEOUT}ms`
        : `${error?.message ?? error}`;
    return {
      jsonrpc: "2.0",
      id: message?.id ?? null,
      error: {
        code: -32000,
        message: `Cannot reach Blockbench on ${URL_} (${reason}). Is Blockbench open with the Blockbench MCP plugin running?`,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

async function healthCheck() {
  try {
    const response = await fetch(URL_.replace(/\/mcp$/, "/health"));
    const body = await response.json();
    log(`connected: ${body.server} ${body.version} on port ${body.mcp ?? URL_}`);
    if (!TOKEN) log("WARNING: BBMCP_TOKEN is not set — the plugin will answer 401.");
  } catch {
    log(`not reachable yet: ${URL_} (starting anyway; tools will retry per call)`);
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
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
process.stdin.on("end", () => process.exit(0));

void healthCheck();

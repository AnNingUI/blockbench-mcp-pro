/**
 * 网关(stdin/stdout ⇄ HTTP)集成测试:
 * 1. 用真实插件 HTTP MCP 服务端(mock Blockbench 宿主)驱动网关,验证工具的 stdio 通道
 * 2. 错误 token 时返回合法的 JSON-RPC 错误而不是原始 HTTP 体
 *   node --test test/stdio.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const gatewayPath = path.join(here, "..", "index.mjs");
const pluginDist = path.join(here, "..", "..", "packages", "plugin", "dist", "testing.mjs");
const mockPath = path.join(here, "..", "..", "packages", "plugin", "test", "mock-blockbench.mjs");

const mock = (await import(pathToFileURL(mockPath).href)).installMockBlockbench();
const api = await import(pathToFileURL(pluginDist).href);

const PORT = 46100 + Math.floor(Math.random() * 400);
const TOKEN = "gateway-test-token-0987654321";

const server = api.startHttpServer({
  port: PORT,
  secret: TOKEN,
  autostart: true,
  allowExecuteScript: false,
});
await new Promise((resolve) => setTimeout(resolve, 150));

/** 启动网关并写一行 JSON,等一行 JSON 回来 */
function startGateway(token = TOKEN) {
  const child = spawn(process.execPath, [gatewayPath], {
    env: {
      ...process.env,
      BBMCP_URL: `http://127.0.0.1:${PORT}/mcp`,
      BBMCP_TOKEN: token,
      BBMCP_TIMEOUT_MS: "10000",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const responses = [];
  const waiters = [];
  let buffer = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let index = buffer.indexOf("\n");
    while (index >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      index = buffer.indexOf("\n");
      if (!line) continue;
      const parsed = JSON.parse(line);
      const waiter = waiters.shift();
      if (waiter) waiter(parsed);
      else responses.push(parsed);
    }
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => (stderr += chunk));
  return {
    child,
    send: (message) => child.stdin.write(`${JSON.stringify(message)}\n`),
    next: (timeoutMs = 8000) =>
      new Promise((resolve, reject) => {
        if (responses.length) return resolve(responses.shift());
        const timer = setTimeout(() => reject(new Error(`gateway timed out. stderr: ${stderr}`)), timeoutMs);
        waiters.push((value) => {
          clearTimeout(timer);
          resolve(value);
        });
      }),
    stderr: () => stderr,
    stop: () => child.kill(),
  };
}

test.after(() => {
  server.stop();
});

test("stdio gateway forwards the full MCP handshake and tool calls", async () => {
  mock.reset();
  const gateway = startGateway();
  try {
    gateway.send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", clientInfo: { name: "stdio-test", version: "1" } },
    });
    const init = await gateway.next();
    assert.equal(init.id, 1);
    assert.equal(init.result.serverInfo.name, "blockbench-mcp-pro");

    gateway.send({ jsonrpc: "2.0", method: "notifications/initialized" });
    gateway.send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const list = await gateway.next();
    assert.equal(list.id, 2);
    assert.ok(list.result.tools.length >= 60);

    gateway.send({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "health", arguments: {} },
    });
    const health = await gateway.next();
    const payload = JSON.parse(health.result.content[0].text);
    assert.equal(payload.ok, true);
    assert.equal(payload.result.plugin_version, "1.0.0");

    gateway.send({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "create_project", arguments: { format: "bedrock", texture_width: 64, texture_height: 64 } },
    });
    const created = await gateway.next();
    const createdPayload = JSON.parse(created.result.content[0].text);
    assert.equal(createdPayload.ok, true, JSON.stringify(createdPayload));
    assert.equal(createdPayload.result.format, "bedrock");

    gateway.send({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "scaffold_biped", arguments: { texture_size: 64 } },
    });
    const scaffold = await gateway.next();
    const scaffoldPayload = JSON.parse(scaffold.result.content[0].text);
    assert.equal(scaffoldPayload.ok, true);
    assert.ok(scaffoldPayload.result.created.length >= 13);

    gateway.send({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "check_model", arguments: {} } });
    const check = await gateway.next();
    const checkPayload = JSON.parse(check.result.content[0].text);
    assert.equal(checkPayload.ok, true);
    assert.equal(checkPayload.result.summary.errors, 0, JSON.stringify(checkPayload.result.findings));

    gateway.send({ jsonrpc: "2.0", id: 7, method: "resources/read", params: { uri: "blockbench-guide://modeling" } });
    const resource = await gateway.next();
    assert.match(resource.result.contents[0].text, /Modeling/i);
  } finally {
    gateway.stop();
  }
});

test("a bad token becomes a clean JSON-RPC error", async () => {
  const gateway = startGateway("wrong-token");
  try {
    gateway.send({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const response = await gateway.next();
    assert.equal(response.id, 1);
    assert.equal(response.result, undefined);
    assert.equal(response.error.code, -32000);
    assert.match(response.error.message, /Unauthorized|Bearer/);
  } finally {
    gateway.stop();
  }
});

test("an unreachable plugin produces an actionable error, not a hang", async () => {
  const child = spawn(process.execPath, [gatewayPath], {
    env: { ...process.env, BBMCP_URL: "http://127.0.0.1:46999/mcp", BBMCP_TOKEN: "x", BBMCP_TIMEOUT_MS: "3000" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const response = await new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => reject(new Error("no response")), 15000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const index = buffer.indexOf("\n");
      if (index >= 0) {
        clearTimeout(timer);
        resolve(JSON.parse(buffer.slice(0, index)));
      }
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/list" })}\n`);
  });
  child.kill();
  assert.equal(response.error.code, -32000);
  assert.match(response.error.message, /Cannot reach Blockbench|Blockbench/);
});

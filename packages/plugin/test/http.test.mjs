/**
 * HTTP 传输层集成测试 —— 起一个真的 net 服务器,用 fetch / 原始 socket 走完整 MCP JSON-RPC。
 *   pnpm --filter @anningui/blockbench-mcp test
 */
import { test, expect, afterAll } from "vitest";
import net from "node:net";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CRLF = String.fromCharCode(13, 10);

/** 原始 socket 请求 —— fetch 禁止伪造 Host 头,所以 DNS-rebinding 用例手写 HTTP */
function rawRequest(port, requestLine, headers, body = "") {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1", () => {
      const head = [requestLine, ...headers, `Content-Length: ${Buffer.byteLength(body)}`, "", ""].join(CRLF);
      socket.write(head + body);
    });
    let data = "";
    socket.on("data", (chunk) => (data += chunk.toString()));
    socket.on("end", () => resolve(data));
    socket.on("error", reject);
    socket.setTimeout(5000, () => {
      socket.destroy();
      resolve(data);
    });
  });
}

// 注意:本文件后面有 const URL,会遮蔽全局 URL,所以这里用 fileURLToPath
const pkgVersion = JSON.parse(
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"),
).version;

const mock = (await import("./mock-blockbench.mjs")).installMockBlockbench();
const api = await import("../dist/testing.mjs");

const PORT = 45100 + Math.floor(Math.random() * 400);
const TOKEN = "test-secret-token-1234567890";
const URL = `http://127.0.0.1:${PORT}/mcp`;

const server = api.startHttpServer({
  port: PORT,
  secret: TOKEN,
  autostart: true,
  allowExecuteScript: false,
});

await new Promise((resolve) => setTimeout(resolve, 150));

afterAll(() => server.stop());

const post = (body, headers = {}) =>
  fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}`, ...headers },
    body: JSON.stringify(body),
  });

test("GET /health is reachable and advertises the auth model", async () => {
  const response = await fetch(`http://127.0.0.1:${PORT}/health`);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.ok).toBe(true);
  expect(body.server).toBe("blockbench-mcp-pro");
  expect(body.auth).toMatch(/Bearer/);
  expect(body.mcp).toBe(`http://127.0.0.1:${PORT}/mcp`);
});

test("requests without the token are rejected", async () => {
  const response = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  expect(response.status).toBe(401);
  expect((await response.json()).error).toMatch(/Unauthorized/);
});

test("requests with a wrong token are rejected", async () => {
  const response = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { Authorization: "Bearer nope" });
  expect(response.status).toBe(401);
});

test("browser-style requests (Origin header) are refused", async () => {
  const response = await post(
    { jsonrpc: "2.0", id: 1, method: "tools/list" },
    { Origin: "https://evil.example" },
  );
  expect(response.status).toBe(403);
});

test("DNS-rebinding style Host headers are refused", async () => {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  const refused = await rawRequest(
    PORT,
    "POST /mcp HTTP/1.1",
    ["Host: attacker.example", "Content-Type: application/json", `Authorization: Bearer ${TOKEN}`],
    body,
  );
  expect(refused).toMatch(/^HTTP\/1\.1 403/);
  expect(refused).toMatch(/Host must be 127/);
  const allowed = await rawRequest(
    PORT,
    "POST /mcp HTTP/1.1",
    ["Host: 127.0.0.1", "Content-Type: application/json", `Authorization: Bearer ${TOKEN}`],
    body,
  );
  expect(allowed).toMatch(/^HTTP\/1\.1 200/);
  expect(allowed).toMatch(/"tools"/);
});

test("chunked request bodies get a clear 411 instead of a confusing parse error", async () => {
  const response = await rawRequest(
    PORT,
    "POST /mcp HTTP/1.1",
    [
      "Host: 127.0.0.1",
      "Content-Type: application/json",
      "Transfer-Encoding: chunked",
      `Authorization: Bearer ${TOKEN}`,
    ],
    ["0", "", ""].join(CRLF),
  );
  expect(response).toMatch(/^HTTP\/1\.1 411/);
  expect(response).toMatch(/Chunked request bodies are not supported/);
});

test("non-JSON bodies are refused", async () => {
  const response = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain", Authorization: `Bearer ${TOKEN}` },
    body: "hello",
  });
  expect(response.status).toBe(415);
});

test("unknown routes 404 with a hint", async () => {
  const response = await fetch(`http://127.0.0.1:${PORT}/nope`);
  expect(response.status).toBe(404);
  expect((await response.json()).error).toMatch(/\/mcp/);
});

test("initialize returns the server identity, session id and instructions", async () => {
  const response = await post({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2024-11-05", clientInfo: { name: "test", version: "1" } },
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("mcp-session-id")).toBeTruthy();
  const body = await response.json();
  expect(body.result.serverInfo.name).toBe("blockbench-mcp-pro");
  expect(Object.keys(body.result.capabilities).sort()).toEqual(["prompts", "resources", "tools"]);
  expect(body.result.instructions).toMatch(/health|get_guide/);
});

test("tools/list exposes every catalogue entry with a JSON schema", async () => {
  const response = await post({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const body = await response.json();
  const tools = body.result.tools;
  expect(tools.length >= 60, `tools ${tools.length}`).toBeTruthy();
  const health = tools.find((tool) => tool.name === "health");
  expect(health.inputSchema.type).toBe("object");
  const grid = tools.find((tool) => tool.name === "paint_face_grid");
  expect(grid.inputSchema.required.sort()).toEqual(["cube", "face", "palette", "rows"]);
  const reject = tools.find((tool) => tool.name === "request_review");
  expect(reject.inputSchema.required).toEqual(["question"]);
});

test("tools/call runs a tool end to end and returns an envelope", async () => {
  mock.reset();
  const response = await post({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "health", arguments: {} },
  });
  const body = await response.json();
  expect(body.result.isError).toBe(false);
  const payload = JSON.parse(body.result.content[0].text);
  expect(payload.ok).toBe(true);
  expect(payload.result.plugin_version).toBe(pkgVersion);
  expect(payload.result.capabilities.includes("geometry")).toBeTruthy();
});

test("tools/call surfaces tool errors as isError content, not a transport failure", async () => {
  const response = await post({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "which_side", arguments: { element: "nope" } },
  });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.result.isError).toBe(true);
  const payload = JSON.parse(body.result.content[0].text);
  expect(payload.ok).toBe(false);
  expect(payload.error.code).toBe("E_NOT_FOUND");
});

test("images come back as real MCP image content blocks", async () => {
  mock.reset();
  api.handlers.create_project({ format: "bedrock", texture_width: 64, texture_height: 64 });
  await api.runTool("scaffold_biped", { texture_size: 64 });
  const response = await post({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: { name: "capture_views", arguments: { views: ["north"], max_edge: 64, format: "png" } },
  });
  const body = await response.json();
  const images = body.result.content.filter((block) => block.type === "image");
  expect(images.length, JSON.stringify(body.result.content.map((c) => c.type))).toBe(1);
  expect(images[0].mimeType).toBe("image/png");
  expect(images[0].data.length > 0).toBeTruthy();
  expect(body.result.content[0].text, "the giant base64 is replaced in the text payload").toMatch(/\[image:/);
});

test("resources and prompts are exposed", async () => {
  const resources = await (await post({ jsonrpc: "2.0", id: 6, method: "resources/list" })).json();
  expect(resources.result.resources.some((r) => r.uri === "blockbench-guide://modeling")).toBeTruthy();
  const read = await (
    await post({ jsonrpc: "2.0", id: 7, method: "resources/read", params: { uri: "blockbench-guide://animation" } })
  ).json();
  expect(read.result.contents[0].text).toMatch(/Animation/i);
  const prompts = await (await post({ jsonrpc: "2.0", id: 8, method: "prompts/list" })).json();
  expect(prompts.result.prompts.some((p) => p.name === "model_from_reference")).toBeTruthy();
  const prompt = await (
    await post({
      jsonrpc: "2.0",
      id: 9,
      method: "prompts/get",
      params: { name: "model_from_reference", arguments: { format: "java_block" } },
    })
  ).json();
  expect(prompt.result.messages[0].content.text).toMatch(/java_block/);
});

test("unknown methods and bad JSON are reported as JSON-RPC errors", async () => {
  const unknown = await (await post({ jsonrpc: "2.0", id: 10, method: "nope" })).json();
  expect(unknown.error.code).toBe(-32601);
  const bad = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: "{not json",
  });
  expect(bad.status).toBe(400);
  expect((await bad.json()).error.code).toBe(-32700);
});

test("notifications get 202 and OPTIONS/DELETE are handled", async () => {
  const notification = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
  expect(notification.status).toBe(202);
  const options = await fetch(URL, { method: "OPTIONS" });
  expect(options.status).toBe(204);
  const deleted = await fetch(URL, { method: "DELETE", headers: { Authorization: `Bearer ${TOKEN}` } });
  expect(deleted.status).toBe(200);
});

test("GET /mcp explains that POST is required", async () => {
  const response = await fetch(URL, { headers: { Authorization: `Bearer ${TOKEN}` } });
  expect(response.status).toBe(405);
  expect((await response.json()).error).toMatch(/POST/);
});

test("the plugin-side server records activity for the status resource", async () => {
  const read = await (
    await post({ jsonrpc: "2.0", id: 11, method: "resources/read", params: { uri: "blockbench-mcp://activity" } })
  ).json();
  const payload = JSON.parse(read.result.contents[0].text);
  expect(payload.activity.length > 0).toBeTruthy();
  expect(payload.activity.some((entry) => entry.tool === "health")).toBeTruthy();
});

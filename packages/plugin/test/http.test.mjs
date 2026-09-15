/**
 * HTTP 传输层集成测试 —— 起一个真的 net 服务器,用 fetch / 原始 socket 走完整 MCP JSON-RPC。
 *   node --test test/http.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";

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

test.after(() => server.stop());

const post = (body, headers = {}) =>
  fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}`, ...headers },
    body: JSON.stringify(body),
  });

test("GET /health is reachable and advertises the auth model", async () => {
  const response = await fetch(`http://127.0.0.1:${PORT}/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.server, "blockbench-mcp-pro");
  assert.match(body.auth, /Bearer/);
  assert.equal(body.mcp, `http://127.0.0.1:${PORT}/mcp`);
});

test("requests without the token are rejected", async () => {
  const response = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /Unauthorized/);
});

test("requests with a wrong token are rejected", async () => {
  const response = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { Authorization: "Bearer nope" });
  assert.equal(response.status, 401);
});

test("browser-style requests (Origin header) are refused", async () => {
  const response = await post(
    { jsonrpc: "2.0", id: 1, method: "tools/list" },
    { Origin: "https://evil.example" },
  );
  assert.equal(response.status, 403);
});

test("DNS-rebinding style Host headers are refused", async () => {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  const refused = await rawRequest(
    PORT,
    "POST /mcp HTTP/1.1",
    ["Host: attacker.example", "Content-Type: application/json", `Authorization: Bearer ${TOKEN}`],
    body,
  );
  assert.match(refused, /^HTTP\/1\.1 403/);
  assert.match(refused, /Host must be 127/);
  const allowed = await rawRequest(
    PORT,
    "POST /mcp HTTP/1.1",
    ["Host: 127.0.0.1", "Content-Type: application/json", `Authorization: Bearer ${TOKEN}`],
    body,
  );
  assert.match(allowed, /^HTTP\/1\.1 200/);
  assert.match(allowed, /"tools"/);
});

test("non-JSON bodies are refused", async () => {
  const response = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain", Authorization: `Bearer ${TOKEN}` },
    body: "hello",
  });
  assert.equal(response.status, 415);
});

test("unknown routes 404 with a hint", async () => {
  const response = await fetch(`http://127.0.0.1:${PORT}/nope`);
  assert.equal(response.status, 404);
  assert.match((await response.json()).error, /\/mcp/);
});

test("initialize returns the server identity, session id and instructions", async () => {
  const response = await post({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2024-11-05", clientInfo: { name: "test", version: "1" } },
  });
  assert.equal(response.status, 200);
  assert.ok(response.headers.get("mcp-session-id"));
  const body = await response.json();
  assert.equal(body.result.serverInfo.name, "blockbench-mcp-pro");
  assert.deepEqual(Object.keys(body.result.capabilities).sort(), ["prompts", "resources", "tools"]);
  assert.match(body.result.instructions, /health|get_guide/);
});

test("tools/list exposes every catalogue entry with a JSON schema", async () => {
  const response = await post({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const body = await response.json();
  const tools = body.result.tools;
  assert.ok(tools.length >= 60, `tools ${tools.length}`);
  const health = tools.find((tool) => tool.name === "health");
  assert.equal(health.inputSchema.type, "object");
  const grid = tools.find((tool) => tool.name === "paint_face_grid");
  assert.deepEqual(grid.inputSchema.required.sort(), ["cube", "face", "palette", "rows"]);
  const reject = tools.find((tool) => tool.name === "request_review");
  assert.deepEqual(reject.inputSchema.required, ["question"]);
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
  assert.equal(body.result.isError, false);
  const payload = JSON.parse(body.result.content[0].text);
  assert.equal(payload.ok, true);
  assert.equal(payload.result.plugin_version, "1.0.0");
  assert.ok(payload.result.capabilities.includes("geometry"));
});

test("tools/call surfaces tool errors as isError content, not a transport failure", async () => {
  const response = await post({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "which_side", arguments: { element: "nope" } },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.result.isError, true);
  const payload = JSON.parse(body.result.content[0].text);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "E_NOT_FOUND");
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
  assert.equal(images.length, 1, JSON.stringify(body.result.content.map((c) => c.type)));
  assert.equal(images[0].mimeType, "image/png");
  assert.ok(images[0].data.length > 0);
  assert.match(body.result.content[0].text, /\[image:/, "the giant base64 is replaced in the text payload");
});

test("resources and prompts are exposed", async () => {
  const resources = await (await post({ jsonrpc: "2.0", id: 6, method: "resources/list" })).json();
  assert.ok(resources.result.resources.some((r) => r.uri === "blockbench-guide://modeling"));
  const read = await (
    await post({ jsonrpc: "2.0", id: 7, method: "resources/read", params: { uri: "blockbench-guide://animation" } })
  ).json();
  assert.match(read.result.contents[0].text, /Animation/i);
  const prompts = await (await post({ jsonrpc: "2.0", id: 8, method: "prompts/list" })).json();
  assert.ok(prompts.result.prompts.some((p) => p.name === "model_from_reference"));
  const prompt = await (
    await post({
      jsonrpc: "2.0",
      id: 9,
      method: "prompts/get",
      params: { name: "model_from_reference", arguments: { format: "java_block" } },
    })
  ).json();
  assert.match(prompt.result.messages[0].content.text, /java_block/);
});

test("unknown methods and bad JSON are reported as JSON-RPC errors", async () => {
  const unknown = await (await post({ jsonrpc: "2.0", id: 10, method: "nope" })).json();
  assert.equal(unknown.error.code, -32601);
  const bad = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: "{not json",
  });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, -32700);
});

test("notifications get 202 and OPTIONS/DELETE are handled", async () => {
  const notification = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(notification.status, 202);
  const options = await fetch(URL, { method: "OPTIONS" });
  assert.equal(options.status, 204);
  const deleted = await fetch(URL, { method: "DELETE", headers: { Authorization: `Bearer ${TOKEN}` } });
  assert.equal(deleted.status, 200);
});

test("GET /mcp explains that POST is required", async () => {
  const response = await fetch(URL, { headers: { Authorization: `Bearer ${TOKEN}` } });
  assert.equal(response.status, 405);
  assert.match((await response.json()).error, /POST/);
});

test("the plugin-side server records activity for the status resource", async () => {
  const read = await (
    await post({ jsonrpc: "2.0", id: 11, method: "resources/read", params: { uri: "blockbench-mcp://activity" } })
  ).json();
  const payload = JSON.parse(read.result.contents[0].text);
  assert.ok(payload.activity.length > 0);
  assert.ok(payload.activity.some((entry) => entry.tool === "health"));
});

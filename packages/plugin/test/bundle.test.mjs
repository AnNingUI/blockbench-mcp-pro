/**
 * 交付产物冒烟测试 —— 直接加载真正发给用户的单文件插件 dist/blockbench_mcp.js,
 * 调用 Blockbench 会调用的 onload,然后访问它起在回环上的 HTTP MCP 端点。
 *   node --test test/bundle.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

const mock = (await import("./mock-blockbench.mjs")).installMockBlockbench();

await import("../dist/blockbench_mcp.js");

const registered = mock.state.registered;
assert.ok(registered, "the bundle must register a Blockbench plugin");

// Blockbench 会在加载后调用 onload,这里照做之后再检查设置与令牌
registered.options.onload();
await new Promise((resolve) => setTimeout(resolve, 400));

test("the shipped bundle registers a desktop plugin with settings and menu actions", () => {
  assert.equal(registered.id, "blockbench_mcp");
  assert.equal(registered.options.variant, "desktop");
  assert.equal(registered.options.version, "1.0.0");
  assert.match(registered.options.min_version, /^5\./);
  assert.equal(typeof registered.options.onload, "function");
  assert.equal(typeof registered.options.onunload, "function");
  assert.ok(globalThis.settings.bbmcp_port, "port setting registered");
  assert.ok(globalThis.settings.bbmcp_secret, "token setting registered");
  assert.ok(globalThis.settings.bbmcp_allow_execute_script, "execute_script gate registered");
  assert.notEqual(globalThis.settings.bbmcp_secret.value, "", "a random token is generated on load");
  assert.equal(globalThis.settings.bbmcp_secret.value.length, 48, "24 random bytes as hex");
});

test("onload starts the in-process HTTP MCP server and reports a usable tool count", async () => {
  const announcement = mock.state.announcements.find((m) => /tools/.test(m));
  assert.match(announcement, /loaded — \d+ tools/);
  const port = globalThis.settings.bbmcp_port.value;
  const health = await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.json());
  assert.equal(health.ok, true);
  assert.equal(health.server, "blockbench-mcp-pro");
  assert.match(health.mcp, /\/mcp$/);

  const token = globalThis.settings.bbmcp_secret.value;
  const list = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  }).then((r) => r.json());
  assert.ok(list.result.tools.length >= 60, `tools ${list.result.tools.length}`);

  const unauth = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
  });
  assert.equal(unauth.status, 401);

  registered.options.onunload();
});

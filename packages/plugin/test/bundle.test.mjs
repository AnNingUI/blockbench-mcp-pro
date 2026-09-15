/**
 * 交付产物冒烟测试 —— 直接加载真正发给用户的单文件插件 dist/blockbench_mcp.js,
 * 调用 Blockbench 会调用的 onload,然后访问它起在回环上的 HTTP MCP 端点。
 *   pnpm --filter @anningui/blockbench-mcp test
 */
import { test, expect, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgVersion = JSON.parse(
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"),
).version;

const mock = (await import("./mock-blockbench.mjs")).installMockBlockbench();

// 随机端口:39742 可能正被真 Blockbench 上的插件占用
const PORT = 48100 + Math.floor(Math.random() * 400);

await import("../dist/blockbench_mcp.js");

const registered = mock.state.registered;
expect(registered, "the bundle must register a Blockbench plugin").toBeTruthy();

globalThis.settings.bbmcp_port.value = PORT;

// Blockbench 会在加载后调用 onload,这里照做之后再检查设置与令牌
registered.options.onload();
await new Promise((resolve) => setTimeout(resolve, 400));

test("the shipped bundle registers a desktop plugin with settings and menu actions", () => {
  expect(registered.id).toBe("blockbench_mcp");
  expect(registered.options.variant).toBe("desktop");
  expect(registered.options.version).toBe(pkgVersion);
  expect(registered.options.min_version).toMatch(/^5\./);
  expect(typeof registered.options.onload).toBe("function");
  expect(typeof registered.options.onunload).toBe("function");
  expect(globalThis.settings.bbmcp_port, "port setting registered").toBeTruthy();
  expect(globalThis.settings.bbmcp_secret, "token setting registered").toBeTruthy();
  expect(globalThis.settings.bbmcp_allow_execute_script, "execute_script gate registered").toBeTruthy();
  expect(globalThis.settings.bbmcp_secret.value, "a random token is generated on load").not.toBe("");
  expect(globalThis.settings.bbmcp_secret.value.length, "24 random bytes as hex").toBe(48);
  // 关键回归:令牌必须经 Setting.set() 写进设置存储,
  // 否则每次重载插件都换新令牌,客户端配置第二天全部失效
  expect(
    mock.state.persisted.bbmcp_secret,
    "token is persisted through Setting.set()",
  ).toBe(globalThis.settings.bbmcp_secret.value);
});

test("onload starts the in-process HTTP MCP server and reports a usable tool count", async () => {
  const announcement = mock.state.announcements.find((m) => /tools/.test(m));
  expect(announcement).toMatch(/loaded — \d+ tools/);
  const port = PORT;
  const health = await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.json());
  expect(health.ok).toBe(true);
  expect(health.server).toBe("blockbench-mcp-pro");
  expect(health.mcp).toMatch(/\/mcp$/);

  const token = globalThis.settings.bbmcp_secret.value;
  const list = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  }).then((r) => r.json());
  expect(list.result.tools.length >= 60, `tools ${list.result.tools.length}`).toBeTruthy();

  const unauth = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
  });
  expect(unauth.status).toBe(401);

  registered.options.onunload();
});

#!/usr/bin/env node
/**
 * 单次 MCP 调用小工具(命令行驱动 Blockbench MCP 用)。
 *
 *   node scripts/mcp-call.mjs health
 *   node scripts/mcp-call.mjs create_project '{"format":"bedrock","name":"mario"}'
 *   node scripts/mcp-call.mjs capture_views '{"views":["north","iso"]}' --save ./out/shots
 *
 * 令牌:--token <t> 或环境变量 BBMCP_TOKEN;都不给就用 scripts/configure-pi-mcp.mjs 的自动探测。
 * 输出:工具返回的 JSON(result / error),图片会写成 PNG(配合 --save)。
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { findToken } from "./lib/mcp-token.mjs";

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const TOOL = positional[0];
const PARAMS = positional[1] ? JSON.parse(positional[1]) : {};
const SAVE = arg("save", "");
const URL_ = arg("url", process.env.BBMCP_URL ?? "http://127.0.0.1:39742/mcp");

if (!TOOL) {
  console.error("用法: node scripts/mcp-call.mjs <tool> ['{json args}'] [--save dir] [--token t]");
  process.exit(2);
}

const token = await findToken(URL_, arg("token", ""));
if (!token) {
  console.error("❌ 没找到可用令牌(--token 或 BBMCP_TOKEN 指定;并确认 Blockbench 里的插件在运行)");
  process.exit(2);
}

const response = await fetch(URL_, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: TOOL, arguments: PARAMS } }),
});
if (response.status !== 200) {
  console.error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  process.exit(1);
}
const body = await response.json();
const payload = JSON.parse(body.result?.content?.[0]?.text ?? "{}");

if (SAVE) {
  mkdirSync(SAVE, { recursive: true });
  const images = (body.result?.content ?? []).filter((c) => c.type === "image");
  images.forEach((image, index) => {
    const file = path.join(SAVE, `${TOOL}-${Date.now()}-${index + 1}.png`);
    writeFileSync(file, Buffer.from(image.data, "base64"));
    console.log(`🖼  ${file} (${(statSync(file).size / 1024).toFixed(1)} KB)`);
  });
}

if (payload.ok === false) {
  console.error(`❌ ${payload.error?.code}: ${payload.error?.message}`);
  process.exit(1);
}
console.log(JSON.stringify(payload.result ?? payload, null, 2));

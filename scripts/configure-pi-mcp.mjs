#!/usr/bin/env node
/**
 * 把 blockbench 写进 pi 的 MCP 配置(~/.pi/agent/mcp.json)。
 * 令牌从 Blockbench 的设置存储里读 —— 免手抄,也不会写错。
 *
 * 用法:
 *   node scripts/configure-pi-mcp.mjs                 # 读令牌 + 写入 + 备份
 *   node scripts/configure-pi-mcp.mjs --dry-run       # 只看会写什么
 *   node scripts/configure-pi-mcp.mjs --token <t>     # 手动指定令牌
 *   node scripts/configure-pi-mcp.mjs --stdio         # 写成 stdio 网关形式(npx)而不是 HTTP
 *
 * 前提:插件已在 Blockbench 里加载过(否则设置存储里还没有令牌)。
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const CONFIG = arg("config", path.join(os.homedir(), ".pi", "agent", "mcp.json"));
const LEVELDB = arg("leveldb", path.join(process.env.APPDATA ?? "", "Blockbench", "Local Storage", "leveldb"));
const TOKEN_OVERRIDE = arg("token", process.env.BBMCP_TOKEN ?? "");
const TARGET_URL = arg("url", "http://127.0.0.1:39742/mcp");
const SERVER_NAME = arg("name", "blockbench");

/** 从 Blockbench 的 localStorage(Chromium leveldb)里找 bbmcp_secret */
function readTokenFromBlockbench() {
  if (TOKEN_OVERRIDE) return TOKEN_OVERRIDE;
  if (!existsSync(LEVELDB)) return "";
  const pattern = /"bbmcp_secret":\{"value":"([0-9a-f]{16,})"\}/;
  const files = readdirSync(LEVELDB)
    .filter((f) => f.endsWith(".log") || f.endsWith(".ldb"))
    .map((f) => path.join(LEVELDB, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  for (const file of files) {
    const match = pattern.exec(readFileSync(file, "latin1"));
    if (match) return match[1];
  }
  return "";
}

const token = readTokenFromBlockbench();
if (!token) {
  console.error(
    [
      "❌ 没读到令牌。可能原因:",
      "   1. 插件还没在 Blockbench 里加载过(令牌只在加载时生成)",
      "   2. 插件是旧版本(令牌没被持久化;请更新到含 Setting.set() 修复的版本)",
      `   3. 设置存储路径不对(当前:${LEVELDB},可用 --leveldb 指定)`,
      "",
      "   也可以先用 --token <MCP Access Token> 手动指定。",
    ].join("\n"),
  );
  process.exit(2);
}

const config = existsSync(CONFIG) ? JSON.parse(readFileSync(CONFIG, "utf8")) : { mcpServers: {} };
config.mcpServers = config.mcpServers ?? {};
config.mcpServers[SERVER_NAME] = has("stdio")
  ? {
      command: "npx",
      args: ["-y", "@anningui/blockbench-mcp"],
      env: { BBMCP_URL: TARGET_URL, BBMCP_TOKEN: token },
    }
  : {
      type: "http",
      url: TARGET_URL,
      headers: { Authorization: `Bearer ${token}` },
    };

if (has("dry-run")) {
  const masked = JSON.parse(JSON.stringify(config.mcpServers[SERVER_NAME]));
  if (masked.headers?.Authorization) masked.headers.Authorization = "Bearer <隐藏>";
  if (masked.env?.BBMCP_TOKEN) masked.env.BBMCP_TOKEN = "<隐藏>";
  console.log(`→ 将写入 ${CONFIG}`);
  console.log(JSON.stringify({ [SERVER_NAME]: masked }, null, 2));
  process.exit(0);
}

mkdirSync(path.dirname(CONFIG), { recursive: true });
if (existsSync(CONFIG)) copyFileSync(CONFIG, `${CONFIG}.bak`);
writeFileSync(CONFIG, `${JSON.stringify(config, null, "\t")}\n`);
console.log(`✅ 已写入 ${CONFIG}${existsSync(`${CONFIG}.bak`) ? "(备份 .bak)" : ""}`);
console.log(`   ${SERVER_NAME} → ${TARGET_URL},令牌 ${token.slice(0, 6)}…${token.slice(-4)}(${token.length} 位)`);
console.log(`   现有服务器:${Object.keys(config.mcpServers).join(", ")}`);
console.log("   在 pi 里执行 /reload 后即可使用。");

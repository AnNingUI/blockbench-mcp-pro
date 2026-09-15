/**
 * 令牌探测(共用):--token / BBMCP_TOKEN → pi 的 mcp.json → Blockbench 的 localStorage,逐个**实际验证**。
 * 只认能通过 tools/list 鉴权的那个 —— 避免历史遗留的旧令牌(插件重载会换令牌)。
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

async function works(url, token) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

function candidatesFromConfig() {
  const config = path.join(os.homedir(), ".pi", "agent", "mcp.json");
  if (!existsSync(config)) return [];
  try {
    const parsed = JSON.parse(readFileSync(config, "utf8"));
    const header = parsed?.mcpServers?.blockbench?.headers?.Authorization ?? "";
    const token = header.replace(/^Bearer\s+/i, "").trim();
    return token ? [token] : [];
  } catch {
    return [];
  }
}

function candidatesFromLeveldb() {
  const dir = path.join(process.env.APPDATA ?? "", "Blockbench", "Local Storage", "leveldb");
  if (!existsSync(dir)) return [];
  const found = new Set();
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".log") || f.endsWith(".ldb"))
    .map((f) => path.join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)) {
    const data = readFileSync(file, "latin1");
    for (const match of data.matchAll(/[0-9a-f]{48}/g)) found.add(match[0]);
  }
  return [...found];
}

/** 返回第一个能通过鉴权的令牌;找不到返回 "" */
export async function findToken(url, explicit) {
  const direct = explicit || process.env.BBMCP_TOKEN || "";
  if (direct) return direct;
  for (const token of [...candidatesFromConfig(), ...candidatesFromLeveldb()]) {
    if (await works(url, token)) return token;
  }
  return "";
}

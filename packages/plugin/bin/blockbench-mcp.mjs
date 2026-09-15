#!/usr/bin/env node
/**
 * @anningui/blockbench-mcp CLI
 *
 *   blockbench-mcp              启动 stdio ⇄ HTTP 网关(给只支持 stdio 的客户端)
 *   blockbench-mcp --http-url   打印已经起好的 HTTP MCP 地址
 *   blockbench-mcp --plugin-path 打印可直接 Load Plugin from File 的插件绝对路径
 *   blockbench-mcp --help
 *
 * 环境变量:BBMCP_URL / BBMCP_TOKEN / BBMCP_TIMEOUT_MS / BBMCP_QUIET
 */
import process from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginPath = path.resolve(here, "..", "dist", "blockbench_mcp.js");
const gatewayPath = path.resolve(here, "..", "dist", "gateway.mjs");

const HELP = `@anningui/blockbench-mcp

用法:
  blockbench-mcp                  启动 stdio MCP 网关,转发到 Blockbench 插件内的 HTTP 端点
  blockbench-mcp --http-url       打印 HTTP MCP 地址
  blockbench-mcp --plugin-path    打印插件文件路径(Blockbench ▸ File ▸ Plugins ▸ Load Plugin from File)
  blockbench-mcp --cdn-url        打印可从 URL 加载插件的 jsDelivr 地址
  blockbench-mcp --help

环境变量:
  BBMCP_URL        默认 http://127.0.0.1:39742/mcp
  BBMCP_TOKEN      Blockbench ▸ Settings ▸ General ▸ MCP Access Token(必填)
  BBMCP_TIMEOUT_MS 单次请求超时,默认 180000
  BBMCP_QUIET=1    静默 stderr 日志

接入步骤:
  1. 在 Blockbench 里加载插件(dist/blockbench_mcp.js),允许 net 权限
  2. 复制 Settings ▸ General ▸ MCP Access Token
  3. HTTP 客户端直接填 url + Authorization 头;stdio 客户端用本命令并设置 BBMCP_TOKEN
`;

const flags = new Set(process.argv.slice(2).map((arg) => arg.toLowerCase()));

if (flags.has("--help") || flags.has("-h")) {
  process.stdout.write(HELP);
} else if (flags.has("--plugin-path")) {
  process.stdout.write(`${pluginPath}\n`);
} else if (flags.has("--http-url")) {
  process.stdout.write(`${process.env.BBMCP_URL || "http://127.0.0.1:39742/mcp"}\n`);
} else if (flags.has("--cdn-url")) {
  process.stdout.write(
    "https://cdn.jsdelivr.net/npm/@anningui/blockbench-mcp/dist/blockbench_mcp.js\n",
  );
} else {
  const { startGateway } = await import(gatewayPath);
  startGateway();
}

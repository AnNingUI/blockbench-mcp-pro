/** 插件入口:注册、设置、菜单动作、生命周期 */
import { MIN_BLOCKBENCH_VERSION} from "@bbmcp/shared";
import { PLUGIN_VERSION } from "./version.js";
import { readConfig, registerSettings } from "./config.js";
import { startHttpServer, type ServerHandle } from "./http.js";
import { registeredToolNames } from "./dispatch.js";
import { session } from "./session.js";
import { toast } from "./host.js";

let server: ServerHandle | null = null;
let loadGeneration = 0;

function startServer(): void {
  if (server?.running()) {
    toast(`MCP already running on port ${server.port}`, 2000);
    return;
  }
  server?.stop();
  const config = readConfig();
  try {
    server = startHttpServer(config);
  } catch (err) {
    server = null;
    toast(`MCP start failed: ${(err as Error).message}`, 6000);
  }
}

function stopServer(): void {
  server?.stop();
  server = null;
  toast("MCP server stopped", 2000);
}

export function clientConfigSnippet(): string {
  const config = readConfig();
  return JSON.stringify(
    {
      url: `http://127.0.0.1:${config.port}/mcp`,
      headers: { Authorization: `Bearer ${config.secret}` },
    },
    null,
    2,
  );
}

function statusReport(): void {
  const config = readConfig();
  const lines = [
    `Blockbench MCP ${PLUGIN_VERSION}`,
    server?.running() ? `RUNNING  http://127.0.0.1:${server.port}/mcp` : "STOPPED",
    `Tools available: ${registeredToolNames().length}`,
    `Access token: ${config.secret}`,
    "",
    "Point your MCP client at:",
    clientConfigSnippet(),
    "",
    "stdio-only clients: run `node gateway/index.mjs` with BBMCP_TOKEN set to the token above.",
  ];
  try {
    if (typeof Dialog === "function") {
      const dialog = new Dialog({ id: "bbmcp_status", title: "Blockbench MCP status", lines });
      dialog.show();
      return;
    }
  } catch {
    /* fall through */
  }
  for (const line of lines) console.log(line);
  toast("MCP status written to the console", 3000);
}

function registerActions(): void {
  const actions = [
    { id: "bbmcp_start", name: "Start MCP Server", icon: "play_arrow", click: startServer },
    { id: "bbmcp_stop", name: "Stop MCP Server", icon: "stop", click: stopServer },
    { id: "bbmcp_status", name: "MCP Server Status / Token", icon: "info", click: statusReport },
  ];
  for (const spec of actions) {
    try {
      const action = new Action(spec.id, {
        name: spec.name,
        description: spec.name,
        icon: spec.icon,
        category: "tools",
        click: spec.click,
      });
      const menu = (globalThis as any).MenuBar?.menus?.tools;
      if (menu?.addAction) menu.addAction(action);
      else (globalThis as any).BarItems?.[spec.id] && ((globalThis as any).BarItems[spec.id] = action);
    } catch {
      // 菜单是尽力而为;注册失败也不影响 MCP 本身(设置面板与自动启动仍在)
      try {
        (globalThis as any).BarItems?.[spec.id] === undefined &&
          ((globalThis as any).BarItems[spec.id] = new Action(spec.id, {
            name: spec.name,
            icon: spec.icon,
            click: spec.click,
          }));
      } catch {
        /* ignore */
      }
    }
  }
}

// 注意:Blockbench 要求**文件名(去掉 .js)等于插件 id**。
// 产物是 dist/blockbench_mcp.js,所以这里必须是 "blockbench_mcp"。
Plugin.register("blockbench_mcp", {
  title: "Blockbench MCP",
  author: "blockbench-mcp-pro",
  description:
    "In-process Model Context Protocol server for Blockbench: modeling, procedural detail, texturing, animation, quality gates, human review and reference matching. Point any MCP client at http://127.0.0.1:<port>/mcp.",
  icon: "smart_toy",
  version: PLUGIN_VERSION,
  variant: "desktop",
  min_version: MIN_BLOCKBENCH_VERSION,
  onload() {
    loadGeneration += 1;
    const generation = loadGeneration;
    registerSettings();
    registerActions();
    const config = readConfig();
    toast(`Blockbench MCP ${PLUGIN_VERSION} loaded — ${registeredToolNames().length} tools`, 3000);
    setTimeout(() => {
      if (generation !== loadGeneration) return;
      if (config.autostart) startServer();
      else toast("MCP not started. Use Tools ▸ Start MCP Server.", 4000);
    }, 150);
  },
  onunload() {
    loadGeneration += 1;
    stopServer();
    session.scopedDirectory = null;
    session.pending.clear();
  },
  oninstall() {
    setTimeout(() => {
      statusReport();
      toast("MCP: allow network access when prompted, then Tools ▸ Start MCP Server", 8000);
    }, 500);
  },
});

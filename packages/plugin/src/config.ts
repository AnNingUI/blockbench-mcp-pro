/** 插件设置与运行时配置 */
import { DEFAULTS } from "@bbmcp/shared";

export type RuntimeConfig = {
  port: number;
  secret: string;
  autostart: boolean;
  allowExecuteScript: boolean;
};

/** 首次启动生成随机密钥 —— 修掉"默认弱口令"的弱点 */
export function ensureSecret(): string {
  const current = settings?.bbmcp_secret?.value;
  if (typeof current === "string" && current.length >= 16) return current;
  const bytes = new Uint8Array(24);
  const cryptoApi = (globalThis as any).crypto;
  if (cryptoApi?.getRandomValues) cryptoApi.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  const secret = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (settings?.bbmcp_secret) settings.bbmcp_secret.value = secret;
  return secret;
}

export function readConfig(): RuntimeConfig {
  const portRaw = settings?.bbmcp_port?.value;
  const port = typeof portRaw === "number" ? portRaw : Number(portRaw ?? DEFAULTS.mcpPort);
  return {
    port: Number.isFinite(port) ? port : DEFAULTS.mcpPort,
    secret: ensureSecret(),
    autostart: settings?.bbmcp_autostart?.value !== false,
    allowExecuteScript: Boolean(settings?.bbmcp_allow_execute_script?.value),
  };
}

export function registerSettings(): void {
  if (typeof Setting !== "function") return;
  new Setting("bbmcp_port", {
    value: DEFAULTS.mcpPort,
    category: "general",
    name: "MCP Server Port",
    description: "Loopback HTTP port for the in-process MCP server (127.0.0.1).",
    type: "number",
  });
  new Setting("bbmcp_secret", {
    value: "",
    category: "general",
    name: "MCP Access Token",
    description:
      "Bearer token every MCP client must send. Generated randomly on first load — copy it into your client config.",
    type: "text",
  });
  new Setting("bbmcp_autostart", {
    value: true,
    category: "general",
    name: "Start MCP Server on launch",
    description: "Listen for MCP clients as soon as the plugin loads.",
    type: "toggle",
  });
  new Setting("bbmcp_allow_execute_script", {
    value: false,
    category: "general",
    name: "Allow execute_script",
    description:
      "Off by default. When on, an MCP client can run arbitrary JavaScript inside Blockbench with full privileges.",
    type: "toggle",
  });
}

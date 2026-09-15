/** 插件设置与运行时配置 */
import { DEFAULTS } from "@bbmcp/shared";

export type RuntimeConfig = {
  port: number;
  secret: string;
  autostart: boolean;
  allowExecuteScript: boolean;
};

/** 令牌存在自己的 localStorage key 里(Blockbench 的 Setting 值在插件加载时还是默认值) */
const TOKEN_STORAGE_KEY = "bbmcp_secret";

function readStorage(key: string): string {
  try {
    return localStorage?.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage?.setItem(key, value);
  } catch {
    /* 存储不可用时退化为内存令牌 */
  }
}

function randomSecret(): string {
  const bytes = new Uint8Array(24);
  const cryptoApi = (globalThis as any).crypto;
  if (cryptoApi?.getRandomValues) cryptoApi.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * 令牌的单一事实源。
 *
 * 之前只写 Blockbench 的 Setting(而且还写错过),但**加载时从不读回来** ——
 * 每次 Reload 都生成新令牌,客户端配置随即失效(真机验证时在 localStorage 里发现了 3 个不同值)。
 * 现在:自己的 storage key 为准;用户在设置面板手改过就以手改的为准;都没有才生成。
 */
export function ensureSecret(): string {
  const stored = readStorage(TOKEN_STORAGE_KEY);
  const fromSetting =
    typeof settings?.bbmcp_secret?.value === "string" ? settings.bbmcp_secret.value : "";
  const userEdited = fromSetting.length >= 16 && fromSetting !== stored;

  const secret = userEdited ? fromSetting : stored.length >= 16 ? stored : randomSecret();
  if (secret !== stored) writeStorage(TOKEN_STORAGE_KEY, secret);
  // 设置面板只用于"看":直接赋 .value 不会写存储,正好(存储的真相在上一行)
  if (settings?.bbmcp_secret && fromSetting !== secret) settings.bbmcp_secret.value = secret;
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

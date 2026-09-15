/**
 * 插件内 HTTP MCP 传输(Streamable HTTP / JSON,无需额外 Node 进程)。
 * 安全模型:
 *   1. 只绑定 127.0.0.1
 *   2. 必须带 Bearer <token>(首次加载随机生成)
 *   3. 拒绝任何带 Origin 头的请求(浏览器 drive-by / CSRF)
 *   4. 拒绝非回环 Host 头(DNS rebinding)
 *   5. POST 必须是 application/json,体积上限 8MB
 */
import { PROTOCOL_NAME} from "@bbmcp/shared";
import { PLUGIN_VERSION } from "./version.js";
import { requireNodeModule, toast } from "./host.js";
import { handleMcp } from "./rpc.js";
import type { RuntimeConfig } from "./config.js";

const MAX_BODY = 8 * 1024 * 1024;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

type NetSocket = {
  on: (event: string, cb: (...args: any[]) => void) => void;
  write: (data: string) => void;
  destroy: () => void;
  setTimeout: (ms: number, cb: () => void) => void;
};

export type ServerHandle = {
  port: number;
  running: () => boolean;
  stop: () => void;
  requests: number;
};

function statusText(status: number): string {
  return (
    {
      200: "OK",
      202: "Accepted",
      204: "No Content",
      400: "Bad Request",
      401: "Unauthorized",
      403: "Forbidden",
      404: "Not Found",
      405: "Method Not Allowed",
      413: "Payload Too Large",
      415: "Unsupported Media Type",
      500: "Internal Server Error",
    } as Record<number, string>
  )[status] ?? "Error";
}

const BUSY_TIMEOUT_MS = 120_000;

function respond(
  socket: NetSocket,
  status: number,
  body?: string,
  extraHeaders: Record<string, string> = {},
): void {
  // 幂等:一个连接只回一次(超时兜底与正常响应可能同时到达)
  const tagged = socket as NetSocket & { __bbmcpReplied?: boolean };
  if (tagged.__bbmcpReplied) return;
  tagged.__bbmcpReplied = true;
  const payload = body ?? "";
  const headers = [`HTTP/1.1 ${status} ${statusText(status)}`, "Connection: close"];
  for (const [key, value] of Object.entries(extraHeaders)) headers.push(`${key}: ${value}`);
  if (body !== undefined) {
    headers.push("Content-Type: application/json; charset=utf-8");
    headers.push(`Content-Length: ${new TextEncoder().encode(payload).length}`);
  } else {
    headers.push("Content-Length: 0");
  }
  try {
    socket.write(`${headers.join("\r\n")}\r\n\r\n${payload}`);
  } finally {
    try {
      socket.destroy();
    } catch {
      /* ignore */
    }
  }
}

function authorized(headers: Record<string, string>, secret: string): boolean {
  const value = headers.authorization ?? "";
  if (value.toLowerCase().startsWith("bearer ")) return value.slice(7).trim() === secret;
  return headers["x-mcp-secret"] === secret;
}

export function startHttpServer(config: RuntimeConfig): ServerHandle {
  const net = requireNodeModule<any>("net");
  if (!net?.createServer)
    throw new Error(
      "Network access (net module) was denied. Allow it for this plugin, then Start MCP Server.",
    );

  let listening = false;
  let requests = 0;
  const handle: ServerHandle = {
    port: config.port,
    requests: 0,
    running: () => listening,
    stop: () => {
      listening = false;
      try {
        server?.close?.();
      } catch {
        /* ignore */
      }
    },
  };

  const onRequest = async (
    method: string,
    path: string,
    headers: Record<string, string>,
    body: string,
    socket: NetSocket,
  ) => {
    requests += 1;
    handle.requests = requests;
    const route = path.split("?")[0];

    if (headers.origin !== undefined) {
      respond(socket, 403, JSON.stringify({ error: "Browser requests are not accepted (Origin header present)." }));
      return;
    }
    const host = String(headers.host ?? "").toLowerCase().replace(/:\d+$/, "");
    if (host && !LOOPBACK_HOSTS.has(host)) {
      respond(socket, 403, JSON.stringify({ error: "Host must be 127.0.0.1 or localhost." }));
      return;
    }

    if (route === "/health") {
      respond(
        socket,
        200,
        JSON.stringify({
          ok: true,
          server: PROTOCOL_NAME,
          version: PLUGIN_VERSION,
          mcp: `http://127.0.0.1:${config.port}/mcp`,
          auth: "Bearer token required (Settings ▸ General ▸ MCP Access Token)",
        }),
      );
      return;
    }
    if (route !== "/mcp") {
      respond(socket, 404, JSON.stringify({ error: `Unknown route: ${route}. Use POST /mcp.` }));
      return;
    }
    if (method === "OPTIONS") {
      respond(socket, 204);
      return;
    }
    if (method === "DELETE") {
      respond(socket, 200, JSON.stringify({ ok: true }));
      return;
    }
    if (method !== "POST") {
      respond(
        socket,
        405,
        JSON.stringify({ error: "Use POST /mcp (Streamable HTTP JSON). SSE streaming is not required." }),
      );
      return;
    }
    if (!authorized(headers, config.secret)) {
      respond(
        socket,
        401,
        JSON.stringify({
          error:
            "Unauthorized: send 'Authorization: Bearer <token>'. Copy the token from Blockbench ▸ Settings ▸ General ▸ MCP Access Token.",
        }),
      );
      return;
    }
    if (!/^application\/json\s*(;|$)/i.test(headers["content-type"] ?? "")) {
      respond(socket, 415, JSON.stringify({ error: "Content-Type must be application/json." }));
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body || "{}");
    } catch {
      respond(socket, 400, JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }));
      return;
    }
    try {
      const result = await handleMcp(parsed);
      const extra: Record<string, string> = {};
      if (result.sessionId) extra["Mcp-Session-Id"] = result.sessionId;
      respond(socket, result.status, result.body, extra);
    } catch (err) {
      respond(
        socket,
        500,
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32603, message: err instanceof Error ? err.message : String(err) },
        }),
      );
    }
  };

  const server = net.createServer((socket: NetSocket) => {
    let buffer: Uint8Array = new Uint8Array(0);
    let headerEnd = -1;
    let method = "GET";
    let path = "/";
    let contentLength = 0;
    let tooLarge = false;
    const headers: Record<string, string> = {};

    socket.on("data", (chunk: any) => {
      const bytes: Uint8Array =
        chunk instanceof Uint8Array ? chunk : new TextEncoder().encode(String(chunk));
      const merged = new Uint8Array(buffer.length + bytes.length);
      merged.set(buffer, 0);
      merged.set(bytes, buffer.length);
      buffer = merged;
      if (buffer.length > MAX_BODY) {
        tooLarge = true;
        respond(socket, 413, JSON.stringify({ error: "Request body over 8MB." }));
        return;
      }
      if (headerEnd === -1) {
        const text = new TextDecoder().decode(buffer.subarray(0, Math.min(buffer.length, 8192)));
        const index = text.indexOf("\r\n\r\n");
        if (index === -1) return;
        // 头长度按字节算,并加上 "\r\n\r\n" 这 4 个字节
        headerEnd = new TextEncoder().encode(text.slice(0, index)).length + 4;
        const lines = text.slice(0, index).split("\r\n");
        const [first = "GET / HTTP/1.1"] = lines;
        const parts = first.split(" ");
        method = parts[0] ?? "GET";
        path = parts[1] ?? "/";
        for (const line of lines.slice(1)) {
          const colon = line.indexOf(":");
          if (colon <= 0) continue;
          const key = line.slice(0, colon).trim().toLowerCase();
          const value = line.slice(colon + 1).trim();
          headers[key] = value;
          if (key === "content-length") contentLength = Number(value) || 0;
        }
      }
      if (tooLarge || headerEnd === -1) return;
      // 只支持 Content-Length(绝大多数 MCP 客户端都发它);chunked 直接给出明确原因,
      // 否则客户端只会看到一个莫名的 JSON parse error
      if (/chunked/i.test(headers["transfer-encoding"] ?? "")) {
        respond(
          socket,
          411,
          JSON.stringify({
            error:
              "Chunked request bodies are not supported. Send Content-Length with the JSON body.",
          }),
        );
        return;
      }
      if (buffer.length < headerEnd + contentLength) {
        socket.setTimeout(120_000, () => socket.destroy());
        return;
      }
      const body = new TextDecoder().decode(buffer.subarray(headerEnd, headerEnd + contentLength));
      // Blockbench 的插件跑在渲染进程里:模态框(权限询问/文件对话框/未保存提示)会阻塞它,
      // 这时请求会永远挂住。给一个兜底,把原因直接告诉客户端。
      const busyTimer = setTimeout(() => {
        respond(
          socket,
          503,
          JSON.stringify({
            error:
              `Blockbench did not answer within ${BUSY_TIMEOUT_MS / 1000}s. It is probably showing a modal ` +
              "dialog (network permission, file dialog, unsaved-changes prompt) that blocks the renderer " +
              "thread. Dismiss it in Blockbench and retry.",
          }),
        );
      }, BUSY_TIMEOUT_MS);
      void onRequest(method, path, headers, body, socket)
        .catch(() => {
          respond(socket, 500, JSON.stringify({ error: "Internal error" }));
        })
        .finally(() => clearTimeout(busyTimer));
    });

    socket.on("error", () => {
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
    });
    socket.setTimeout(300_000, () => socket.destroy());
  });

  server.on("error", (err: any) => {
    listening = false;
    toast(`MCP server error: ${err?.message ?? "unknown"}`, 5000);
  });

  server.listen(config.port, "127.0.0.1", () => {
    listening = true;
    toast(`Blockbench MCP ready → http://127.0.0.1:${config.port}/mcp`, 4000);
  });

  return handle;
}

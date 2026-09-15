/** MCP JSON-RPC 层:initialize / tools / resources / prompts,并把图片变成 image 内容块 */
import {
  PROTOCOL_VERSION_MCP,
  PLUGIN_VERSION,
  PROTOCOL_NAME,
  TOOL_SPECS,
  listToolsPayload,
  resolveGuide,
  GUIDE_TOPICS,
} from "@bbmcp/shared";
import { runTool } from "./dispatch.js";
import { toErrorPayload } from "./errors.js";
import { session } from "./session.js";

type Content =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

type JsonRpcId = string | number | null;

function text(value: unknown): string {
  return typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? "(undefined)");
}

/** 把 data_url 字段抽出为 MCP image 块,并从 JSON 里去掉冗长的 base64 */
function attachImages(
  result: unknown,
): { payload: unknown; images: Content[] } {
  const images: Content[] = [];
  const strip = (value: unknown, key?: string): unknown => {
    if (typeof value === "string") {
      if (value.startsWith("data:image/")) {
        const match = /^data:([^;]+);base64,(.+)$/.exec(value);
        if (match) images.push({ type: "image", data: match[2], mimeType: match[1] });
        return `[image:${key ?? "image"}]`;
      }
      return value;
    }
    if (Array.isArray(value)) return value.map((item) => strip(item));
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, item] of Object.entries(value)) out[k] = strip(item, k);
      return out;
    }
    return value;
  };
  return { payload: strip(result), images };
}

function resourcesList() {
  return {
    resources: GUIDE_TOPICS.map((topic) => ({
      uri: `blockbench-guide://${topic}`,
      name: `guide-${topic}`,
      title: `Blockbench playbook: ${topic}`,
      description: `How to do ${topic} well in Blockbench (read before acting).`,
      mimeType: "text/markdown",
    })).concat([
      {
        uri: "blockbench-mcp://activity",
        name: "activity-log",
        title: "Recent MCP activity",
        description: "Ring buffer of the last tool calls, with timing and failures.",
        mimeType: "application/json",
      },
    ]),
  };
}

function readResource(uri: string) {
  if (uri.startsWith("blockbench-guide://")) {
    const topic = uri.replace("blockbench-guide://", "");
    const guide = resolveGuide(topic);
    return {
      contents: [{ uri, mimeType: "text/markdown", text: guide.text }],
    };
  }
  if (uri === "blockbench-mcp://activity") {
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              activity: session.activity.slice(-100),
              scoped_directory: session.scopedDirectory,
              references: session.references.length,
              open_reviews: [...session.pending.values()].filter((r) => !r.answer).length,
            },
            null,
            2,
          ),
        },
      ],
    };
  }
  return null;
}

function promptsList() {
  return {
    prompts: [
      {
        name: "model_from_reference",
        description: "Build a detailed Blockbench model that matches a reference image, using the full loop.",
        arguments: [
          { name: "reference_name", description: "Reference id/name already loaded", required: false },
          { name: "format", description: "Target format id (e.g. bedrock, java_block)", required: false },
        ],
      },
      {
        name: "polish_model",
        description: "Raise a blockout to a detailed model: audit, generators, UV pass, texture pass, review.",
        arguments: [{ name: "target", description: "prop | character | creature | hero", required: false }],
      },
    ],
  };
}

function promptMessages(name: string, args: Record<string, unknown>) {
  if (name === "model_from_reference") {
    const reference = String(args?.reference_name ?? "the loaded reference");
    const format = String(args?.format ?? "bedrock");
    return {
      description: "Reference-matched modeling loop",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Build a detailed ${format} model matching ${reference}.`,
              "1. health, get_project_summary, get_guide(modeling), get_guide(reference).",
              "2. get_reference and actually look at it.",
              "3. create_project with the right uv_mode, then scaffold the rough masses.",
              `4. compare_reference after every pass until match_percent >= 85. Use measure_model for the numbers.`,
              "5. Add real detail with add_hollow_volume / generate_array / extrude_chain / voxelize_matrix.",
              "6. audit_complexity (must not be too_primitive), then pack_box_uv, shade_model_base, paint_face_features.",
              "7. check_model + capture_views, fix what you see, then request_review before declaring it done.",
            ].join("\n"),
          },
        },
      ],
    };
  }
  const target = String(args?.target ?? "character");
  return {
    description: "Polish an existing blockout",
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: [
            `Raise the current model to a polished ${target}.`,
            "1. get_project_summary + check_model + audit_complexity to see where it stands.",
            "2. get_guide(detailing) and add layering/silhouette breakers with the generators.",
            "3. Re-run audit_complexity until it is not too_primitive.",
            "4. pack_box_uv -> shade_model_base -> paint_face_features -> audit_texture_quality.",
            "5. check_model, capture_views, then request_review.",
          ].join("\n"),
        },
      },
    ],
  };
}

export async function handleMcp(
  message: unknown,
): Promise<{ status: number; body?: string; sessionId?: string }> {
  if (Array.isArray(message)) {
    const responses: unknown[] = [];
    for (const item of message) {
      const single = await handleOne(item);
      if (single.body) responses.push(JSON.parse(single.body));
    }
    return { status: 200, body: JSON.stringify(responses) };
  }
  return handleOne(message);
}

async function handleOne(
  message: unknown,
): Promise<{ status: number; body?: string; sessionId?: string }> {
  if (!message || typeof message !== "object") {
    return {
      status: 400,
      body: JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }),
    };
  }
  const msg = message as { jsonrpc?: string; id?: JsonRpcId; method?: string; params?: any };
  const hasId = Object.prototype.hasOwnProperty.call(msg, "id");
  const id = hasId ? (msg.id as JsonRpcId) : null;
  const method = msg.method;

  if (!method) {
    return { status: 400, body: JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32600, message: "Invalid Request" } }) };
  }
  if (!hasId && method.startsWith("notifications/")) return { status: 202 };

  const ok = (result: unknown) => ({ status: 200, body: JSON.stringify({ jsonrpc: "2.0", id, result }) });

  switch (method) {
    case "initialize":
      return {
        status: 200,
        sessionId: `bbmcp-${Date.now().toString(36)}`,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: msg.params?.protocolVersion ?? PROTOCOL_VERSION_MCP,
            capabilities: { tools: {}, resources: {}, prompts: {} },
            serverInfo: { name: PROTOCOL_NAME, version: PLUGIN_VERSION },
            instructions:
              "Blockbench modeling server. Start with health, get_guide and get_project_summary. Use the generators for detail, the quality gates before texturing, and request_review before claiming work is finished.",
          },
        }),
      };
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: listToolsPayload() });
    case "tools/call": {
      const name = msg.params?.name ?? "";
      const started = Date.now();
      const envelope = await runTool(name, msg.params?.arguments);
      const { payload, images } = attachImages(envelope.result);
      const content: Content[] = [
        {
          type: "text",
          text: text({
            ok: envelope.ok,
            summary: envelope.summary,
            ...(envelope.ok ? { result: payload } : { error: envelope.error }),
          }),
        },
        ...images,
      ];
      session.activity.push({ at: started, tool: name, ok: envelope.ok, ms: Date.now() - started });
      if (session.activity.length > 200)
        session.activity.splice(0, session.activity.length - 200);
      return ok({ content, isError: !envelope.ok });
    }
    case "resources/list":
      return ok(resourcesList());
    case "resources/read": {
      const resource = readResource(String(msg.params?.uri ?? ""));
      if (!resource)
        return {
          status: 200,
          body: JSON.stringify({
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: `Unknown resource: ${msg.params?.uri}` },
          }),
        };
      return ok(resource);
    }
    case "prompts/list":
      return ok(promptsList());
    case "prompts/get": {
      const name = String(msg.params?.name ?? "");
      if (name !== "model_from_reference" && name !== "polish_model")
        return {
          status: 200,
          body: JSON.stringify({
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: `Unknown prompt: ${name}` },
          }),
        };
      return ok(promptMessages(name, (msg.params?.arguments ?? {}) as Record<string, unknown>));
    }
    default:
      return {
        status: 200,
        body: JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } }),
      };
  }
}

export function toolByName(name: string) {
  return TOOL_SPECS[name];
}

export { toErrorPayload };

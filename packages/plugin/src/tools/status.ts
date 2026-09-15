/** 状态 / 发现 / 方向 类工具 */
import {
  PROTOCOL_VERSION,
  DEFAULTS,
  PROTOCOL_NAME,
  checkSides,
  nameSide,
  resolveGuide,
  isBlockbenchSupported,
  MIN_BLOCKBENCH_VERSION,
  type CapabilityId,
} from "@bbmcp/shared";
import { PLUGIN_VERSION } from "../version.js";
import { CommandError } from "../errors.js";
import {
  currentFormatId,
  hasGeckoLib,
  listFormats,
  listTextures,
  requireNodeModule,
} from "../host.js";
import {
  findElement,
  getElements,
  orientationInfo,
  projectSummary,
  requireProject,
  resolveUvMode,
  snapshotElements,
  uvIslands,
  getElements as readElements,
} from "../bb.js";
import type { ToolHandler } from "../dispatch.js";

function probeCapabilities(): CapabilityId[] {
  const caps: CapabilityId[] = ["geometry"];
  try {
    listTextures();
    caps.push("textures");
  } catch {
    /* none */
  }
  if (typeof Screencam.screenshotPreview === "function") caps.push("screenshots");
  if ("edit" in Painter) caps.push("painter");
  if (hasGeckoLib()) caps.push("geckolib");
  if (Animation?.all) caps.push("animations");
  // 桌面端才有 scoped require;Web 版拿不到 —— 按能力探测,不猜布尔标志
  try {
    requireNodeModule("fs");
    caps.push("filesystem");
  } catch {
    /* web build */
  }
  return caps;
}

export const statusTools: Record<string, ToolHandler> = {
  health: () =>
    ({
      ok: true,
      server: PROTOCOL_NAME,
      plugin_version: PLUGIN_VERSION,
      protocol_version: PROTOCOL_VERSION,
      mcp_protocol_version: "2024-11-05",
      blockbench_version: Blockbench?.version ?? "unknown",
      blockbench_supported: isBlockbenchSupported(Blockbench?.version ?? "0.0.0"),
      min_blockbench_version: MIN_BLOCKBENCH_VERSION,
      transport: ["streamable-http (in-process)", "stdio gateway"],
      default_port: DEFAULTS.mcpPort,
      project_open: Boolean(Project),
      format: currentFormatId(),
      uv_mode: Project ? resolveUvMode() : null,
      capabilities: probeCapabilities(),
      execute_script_allowed: Boolean(settings?.bbmcp_allow_execute_script?.value),
    }) as any,

  get_guide: (args: { topic?: string }) => resolveGuide(args?.topic),

  list_formats: () => ({ formats: listFormats() }),

  get_project_summary: () => projectSummary(),

  get_elements: (args: { refs?: string[] }) => getElements(args ?? {}),

  list_textures: () => ({
    textures: listTextures().map((t) => ({
      uuid: t.uuid,
      name: t.name,
      width: t.width,
      height: t.height,
    })),
  }),

  list_animations: () => {
    requireProject();
    return {
      animations: (Animation?.all ?? []).map((animation: any) => {
        const animators = Object.values(animation.animators ?? {}) as any[];
        return {
          name: animation.name,
          length: animation.length ?? 0,
          loop: animation.loop ?? "once",
          bones: animators.length,
          keyframes: animators.reduce(
            (sum: number, a: any) =>
              sum +
              (a?.rotations?.length ?? 0) +
              (a?.position?.length ?? 0) +
              (a?.scale?.length ?? 0),
            0,
          ),
        };
      }),
    };
  },

  get_orientation: () => orientationInfo(),

  which_side: (args: { element: string }) => {
    requireProject();
    const element = findElement(args?.element);
    if (!element)
      throw new CommandError("E_NOT_FOUND", `Element not found: ${args?.element}`);
    const x = element.origin?.[0] ?? element.from?.[0] ?? 0;
    const actual = x > 0.001 ? "right" : x < -0.001 ? "left" : "center";
    const name = String(element.name ?? "");
    const named = nameSide(name);
    return {
      element: name,
      coordinate_axis: "x",
      signed_x: x,
      side: actual,
      name_says: named,
      name_agrees: named === null ? null : named === actual,
      note: "The model faces -Z, so its OWN right is +X. A front-view render is mirrored.",
    };
  },

  check_sides: () => {
    requireProject();
    return checkSides(snapshotElements());
  },
};

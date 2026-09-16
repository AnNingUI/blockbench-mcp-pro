export {
  PROTOCOL_VERSION,
  PROTOCOL_VERSION_MCP,
  DEFAULTS,
  ERROR_CODES,
  errorPayloadSchema,
  makeError,
  PROJECT_FORMATS,
  VIEW_PRESETS,
  vec3Schema,
  CAPABILITY_IDS,
  capabilitiesSchema,
  parseSemverParts,
  MIN_BLOCKBENCH_VERSION,
  isBlockbenchSupported,
} from "./protocol.js";
export type {
  ErrorCode,
  ErrorPayload,
  ProjectFormat,
  ViewPreset,
  CapabilityId,
} from "./protocol.js";

export {
  facePaintParamsSchema,
  paintGridParamsSchema,
  transformElementsParamsSchema,
  voxelizeMatrixParamsSchema,
  checkModelParamsSchema,
  captureViewsParamsSchema,
  getTextureParamsSchema,
  exportParamsSchema,
  paintOpSchema,
} from "./contracts.js";
export type {
  VoxelizeMatrixParams,
  CaptureViewsParams,
  PaintOp,
  FaceFeature,
} from "./contracts.js";

export { TOOL_SPECS, TOOL_NAMES, TOOL_GROUPS, listToolsPayload, zodToJsonSchemaSafe } from "./catalogue.js";
export type { ToolSpec } from "./catalogue.js";

export {
  GUIDE_MODELING,
  GUIDE_ORIENTATION,
  GUIDE_DETAILING,
  GUIDE_TEXTURING,
  GUIDE_ANIMATION,
  GUIDE_REVIEW,
  GUIDE_REFERENCE,
  GUIDE_VFX,
  GUIDE_TOPICS,
  resolveGuide,
} from "./guides.js";
export type { GuideTopic } from "./guides.js";

/* pure helpers (unit-testable without Blockbench) */
export * from "./pure/vec.js";
export * from "./pure/color.js";
export * from "./pure/uv.js";
export * from "./pure/generate.js";
export * from "./pure/audit.js";
export * from "./ui.js";

export const PROTOCOL_NAME = "blockbench-mcp-pro";

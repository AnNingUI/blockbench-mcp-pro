/** 插件侧测试入口:以 ESM 暴露内部实现,便于 node 中带 mock 运行 */
export { runTool, handlers, registeredToolNames, coerceArguments } from "./dispatch.js";
export { startHttpServer } from "./http.js";
export { renderCard, resolveCard, missingRequired, escapeHtml } from "./ui/card.js";
export { handleMcp } from "./rpc.js";
export { session, openReview, answerReview, waitForReview, reviewPayload } from "./session.js";
export { readConfig, registerSettings } from "./config.js";
export { TOOL_SPECS, listToolsPayload, resolveGuide } from "@bbmcp/shared";
export * as bb from "./bb.js";

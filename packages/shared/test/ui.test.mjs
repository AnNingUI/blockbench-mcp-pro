/**
 * 声明式人审卡片的纯逻辑测试:
 *   pnpm --filter @bbmcp/shared test   (先 pnpm run build)
 * 覆盖:schema 校验(白名单 + 严格模式)、卡片渲染成 HTML、choices-only → 对话框按钮、必填判定。
 */
import { test, expect } from "vitest";

import { cardComponents, CARD_COMPONENT_KINDS, GUIDE_UI } from "../dist/index.js";

const ok = (components) => cardComponents.parse(components);

test("schema:12 种组件都能通过,未知类型/坏 id 被拒", () => {
  const all = ok([
    { type: "text", text: "hi", style: "warn" },
    { type: "choices", id: "verdict", options: ["Approve", "Needs changes"] },
    { type: "multi_choice", id: "keep", options: ["hood", "lantern"], min: 1 },
    { type: "text_input", id: "name", label: "名字" },
    { type: "textarea", id: "comment", label: "意见" },
    { type: "number", id: "budget", label: "预算", min: 0, max: 500, slider: true },
    { type: "toggle", id: "flat", label: "扁平", default: true },
    { type: "select", id: "mode", label: "模式", options: ["box", "face"] },
    { type: "color", id: "accent", label: "主色", default: "#8a5a2b" },
    { type: "file", id: "ref", label: "参考图" },
    { type: "views", views: ["north", "iso"] },
    { type: "references" },
  ]);
  expect(all.length).toBe(CARD_COMPONENT_KINDS.length);

  expect(cardComponents.safeParse([{ type: "html", text: "<script>" }]).success).toBe(false);
  expect(cardComponents.safeParse([{ type: "text", text: "x", extra: 1 }]).success).toBe(false);
  expect(cardComponents.safeParse([{ type: "choices", id: "a b", options: ["x", "y"] }]).success).toBe(false);
  expect(cardComponents.safeParse([{ type: "choices", id: "v", options: ["only-one"] }]).success).toBe(false);
  expect(cardComponents.safeParse([{ type: "color", id: "c", label: "c", default: "red" }]).success).toBe(false);
});


/**
 * 声明式卡片渲染器的离线测试(纯函数,不需要真的 Blockbench;readCardValues 用 mock DOM):
 *   pnpm --filter @anningui/blockbench-mcp test   (先 pnpm run build)
 */
import { test, expect } from "vitest";

(await import("./mock-blockbench.mjs")).installMockBlockbench();
const api = await import("../dist/testing.mjs");
const { renderCard, resolveCard, missingRequired, escapeHtml } = api;
const { cardComponents } = await import("@bbmcp/shared");
const ok = (components) => cardComponents.parse(components);

test("渲染:每种控件都出对应的 HTML,文本被转义(不能注入)", () => {
  const { html, fields } = renderCard(
    ok([
      { type: "text", text: "<img src=x onerror=alert(1)>" },
      { type: "choices", id: "verdict", options: ["Approve", "Reject"] },
      { type: "multi_choice", id: "keep", options: ["hood", "lantern"] },
      { type: "text_input", id: "name", label: "名字" },
      { type: "textarea", id: "comment", label: "意见" },
      { type: "number", id: "budget", label: "预算", min: 0, max: 9 },
      { type: "toggle", id: "flat", label: "扁平" },
      { type: "select", id: "mode", label: "模式", options: ["box", "face"] },
      { type: "color", id: "accent", label: "主色" },
      { type: "file", id: "ref", label: "参考图" },
    ]),
    { dialogId: "rev-1" },
  );
  expect(html.includes("&lt;img src=x")).toBe(true);
  expect(html.includes("<img src=x")).toBe(false); // 没被转义的标签才是注入
  expect(html.includes("&quot; onmouseover&quot;")).toBe(false);
  expect(html.includes('id="rev-1__name"')).toBe(true);
  expect(html.includes('id="rev-1__comment"')).toBe(true);
  expect(html.includes('id="rev-1__budget"')).toBe(true);
  expect(html.includes('id="rev-1__mode"')).toBe(true);
  expect(html.includes('id="rev-1__accent"')).toBe(true);
  expect(html.includes('id="rev-1__ref"')).toBe(true);
  expect(html.includes('type="radio" name="verdict"')).toBe(true);
  expect(html.includes('type="checkbox" name="keep"')).toBe(true);
  expect(fields.map((field) => field.id)).toEqual([
    "verdict",
    "keep",
    "name",
    "comment",
    "budget",
    "flat",
    "mode",
    "accent",
    "ref",
  ]);
});

test("views 组件把已渲染的截图内联到卡片里", () => {
  const { html } = renderCard(ok([{ type: "views", views: ["north", "iso"] }]), {
    dialogId: "rev-2",
    images: { captures: { north: "data:image/png;base64,NNN", iso: "data:image/png;base64,III" } },
  });
  expect(html.includes("data:image/png;base64,NNN")).toBe(true);
  expect(html.includes("data:image/png;base64,III")).toBe(true);
  const empty = renderCard(ok([{ type: "views", views: ["north"] }]), { dialogId: "rev-3" });
  expect(empty.html.includes("视角截图不可用")).toBe(true);
});

test("choices-only → 对话框按钮;有别的控件时用自己的按钮", () => {
  const only = resolveCard(
    ok([
      { type: "text", text: "看一下" },
      { type: "choices", id: "v", options: ["Approve", "Needs changes"] },
    ]),
    ["X", "Y"],
  );
  expect(only.buttons).toEqual(["Approve", "Needs changes"]);
  expect(only.rest.some((component) => component.type === "choices")).toBe(false);
  expect(only.rest.some((component) => component.type === "text")).toBe(true);

  const radio = resolveCard(
    ok([{ type: "choices", id: "v", options: ["a", "b"], style: "radio" }]),
    ["Approve", "Needs changes"],
  );
  expect(radio.buttons).toEqual(["Approve", "Needs changes"]);
  expect(radio.rest.length).toBe(1);

  const many = resolveCard(
    ok([
      { type: "choices", id: "v", options: ["a", "b"] },
      { type: "number", id: "n", label: "n" },
    ]),
    ["X", "Y"],
  );
  expect(many.buttons).toEqual(["X", "Y"]);
  expect(many.rest.length).toBe(2);
});

test("必填判定:空值/空数组/空图片都算缺", () => {
  const fields = [
    { id: "name", kind: "text_input", required: true, loadAsReference: false },
    { id: "keep", kind: "multi_choice", required: true, loadAsReference: false },
    { id: "ref", kind: "file", required: false, loadAsReference: true },
    { id: "budget", kind: "number", required: false, loadAsReference: false },
  ];
  expect(missingRequired(fields, { name: "  ", keep: [], budget: 3 })).toEqual(["name", "keep"]);
  expect(missingRequired(fields, { name: "ok", keep: ["a"], ref: { data_url: "" } })).toEqual([]);
  expect(missingRequired(fields, { name: "ok", keep: ["a"], budget: null })).toEqual([]);
});

test("escaping 覆盖引号(属性值里也不能逃出去)", () => {
  expect(escapeHtml(`" onmouseover="x`)).toBe("&quot; onmouseover=&quot;x");
});

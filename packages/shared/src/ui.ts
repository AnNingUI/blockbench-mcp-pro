/**
 * 声明式人审卡片(A2UI 思路的实用子集)。
 *
 * 目标:AI 描述"要什么 UI",插件用 Blockbench 自己的对话框渲染出来,
 * 而不是把 `question + 两个按钮` 硬编码在每个工具里。
 *
 * 故意砍掉的东西(A2UI 有,这里不需要):
 * - 嵌套布局树:本插件的人审卡片都是"一列控件",布局交给渲染器
 * - 双向 RPC / action 往返:人一次性填完点确认就是答案
 * - 任意组件/代码:只有下面这份白名单,AI 只能组合,不能注入 UI
 */
import { z } from "zod";

const id = z
  .string()
  .min(1)
  .max(48)
  .regex(/^[A-Za-z0-9_]+$/, "id must be letters/digits/underscore");
const label = z.string().max(160);
const optionText = z.string().min(1).max(80);
const num = z.number().finite();

export const CARD_COMPONENT_KINDS = [
  "text",
  "choices",
  "multi_choice",
  "text_input",
  "textarea",
  "number",
  "toggle",
  "select",
  "color",
  "file",
  "views",
  "references",
] as const;
export type CardComponentKind = (typeof CARD_COMPONENT_KINDS)[number];

/** 会自动带回值(出现在 result.values 里)的组件类型 */
export const VALUE_KINDS: readonly CardComponentKind[] = [
  "choices",
  "multi_choice",
  "text_input",
  "textarea",
  "number",
  "toggle",
  "select",
  "color",
  "file",
];

export const cardComponent = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("text"),
      text: z.string().min(1).max(4000),
      style: z.enum(["body", "muted", "warn", "ok", "title"]).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("choices"),
      id,
      label: label.optional(),
      options: z.array(optionText).min(2).max(12),
      default: optionText.optional(),
      /** 单选卡如果只有它一个控件,就直接渲染成对话框按钮(一次点击 = 回答) */
      style: z.enum(["buttons", "radio"]).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("multi_choice"),
      id,
      label: label.optional(),
      options: z.array(optionText).min(2).max(32),
      default: z.array(optionText).optional(),
      min: z.number().int().min(0).max(32).optional(),
      max: z.number().int().min(1).max(32).optional(),
      required: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("text_input"),
      id,
      label,
      placeholder: z.string().max(120).optional(),
      default: z.string().max(500).optional(),
      max_length: z.number().int().min(1).max(500).optional(),
      required: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("textarea"),
      id,
      label,
      placeholder: z.string().max(200).optional(),
      default: z.string().max(4000).optional(),
      rows: z.number().int().min(1).max(24).optional(),
      required: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("number"),
      id,
      label,
      min: num.optional(),
      max: num.optional(),
      step: num.positive().optional(),
      default: num.optional(),
      /** true → 滑块(min/max 必填才好看);否则数字输入框 */
      slider: z.boolean().optional(),
      required: z.boolean().optional(),
    })
    .strict(),
  z.object({ type: z.literal("toggle"), id, label, default: z.boolean().optional() }).strict(),
  z
    .object({
      type: z.literal("select"),
      id,
      label,
      options: z.array(optionText).min(2).max(80),
      default: optionText.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("color"),
      id,
      label,
      default: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, "color must be #rrggbb")
        .optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("file"),
      id,
      label,
      accept: z.string().max(60).optional(),
      /** 默认:选中的图片自动 load_reference(参考图那类问题就只有这一种合理行为) */
      load_as_reference: z.boolean().optional(),
      required: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("views"),
      label: label.optional(),
      views: z.array(z.string().max(24)).min(1).max(7),
      animation: z.string().max(64).optional(),
      times: z.array(num).max(8).optional(),
    })
    .strict(),
  z.object({ type: z.literal("references"), label: label.optional() }).strict(),
]);
export type CardComponent = z.infer<typeof cardComponent>;

export const cardComponents = z.array(cardComponent).max(24);

/** 给 AI 的组件目录 —— 放在 guide 里,走 get_guide('ui') / read_guide_ui 资源 */
export const GUIDE_UI = `
# Human-review cards (declarative, A2UI-style)

You do not hardcode dialogs: you send a list of components and Blockbench renders them.
Pass \`components: [...]\` to ask_user / request_review. Facts and labels go in 'text';
anything you need a value for gets an id, and the answer comes back in \`values[id]\`.

Component catalog (all flat, rendered top to bottom):

| type | value returned | key props |
| --- | --- | --- |
| text | – | text, style: body\\|muted\\|warn\\|ok\\|title |
| choices | string (chosen option) | id, label?, options[2..12], default?, style: buttons\\|radio |
| multi_choice | string[] | id, label?, options[2..32], default?, min?, max?, required? |
| text_input | string | id, label, placeholder?, default?, max_length?, required? |
| textarea | string | id, label, placeholder?, default?, rows?, required? |
| number | number | id, label, min?, max?, step?, default?, slider?, required? |
| toggle | boolean | id, label, default? |
| select | string | id, label, options[2..80], default? (prefer select over choices when >6 options) |
| color | "#rrggbb" | id, label, default? |
| file | { name, data_url } | id, label, accept? (default image/*), load_as_reference? (default true → the chosen image is loaded as a reference for compare_reference) |
| views | – | views[1..7] (north/east/south/west/up/down/iso), animation?, times? — renders YOUR captures inside the card so the human judges without leaving it |
| references | – | label? — renders the reference images currently loaded |

Rules that save you re-asking:
1. Put a \`views\` component on every review card. The human must SEE the render in the card.
2. A card whose only valued component is \`choices\` renders as dialog buttons — one click answers it. Use that for approve/deny.
3. For "Needs changes" feedback always include \`{ type: "textarea", id: "comment", label: "意见" }\` (or just pass \`comment: true\`); read \`comment\` in the result.
4. Never tell the user to drag a file somewhere or to use a panel you cannot verify exists. Use \`{ type: "file" }\` and the plugin does the loading.
5. Ask for the decision you need, not a survey: 2-5 components. Numbers for budgets/scale, color for palette picks, multi_choice for "which details to keep".
6. Required fields block submit with an inline error — use \`required\` only when you truly cannot proceed without the value.
`.trim();

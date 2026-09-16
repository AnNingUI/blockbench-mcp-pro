/**
 * 声明式卡片的渲染器 + 取值器(纯函数为主,便于离线测试)。
 * 组件契约在 @bbmcp/shared 的 ui.ts;这里只管"变成 HTML"和"从 DOM 读回来"。
 */
import { VALUE_KINDS, type CardComponent, type CardComponentKind } from "@bbmcp/shared";

export type CardField = {
  id: string;
  kind: CardComponentKind;
  required: boolean;
  loadAsReference: boolean;
};

export type CardImages = {
  /** 已经渲染好的视角截图:key = 视角名或 `${view}@${time}` */
  captures?: Record<string, string>;
  /** 当前加载的参考图 */
  references?: Array<{ name: string; data_url: string }>;
};

export function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STYLE = `<style>
.bbmcp_card { display:flex; flex-direction:column; gap:6px; max-width:640px; }
.bbmcp_card .bbmcp_t { white-space:pre-wrap; }
.bbmcp_card .bbmcp_muted { opacity:.65; }
.bbmcp_card .bbmcp_warn { color:#ffb454; }
.bbmcp_card .bbmcp_ok { color:#8ec07c; }
.bbmcp_card .bbmcp_title { font-weight:bold; font-size:1.05em; margin-top:4px; }
.bbmcp_card .bbmcp_row { display:flex; align-items:center; gap:8px; }
.bbmcp_card .bbmcp_opts { display:flex; flex-direction:column; gap:2px; }
.bbmcp_card .bbmcp_opts label { display:flex; align-items:center; gap:6px; font-weight:normal; }
.bbmcp_card input[type=text], .bbmcp_card input[type=number], .bbmcp_card select,
.bbmcp_card textarea, .bbmcp_card input[type=file] { width:100%; }
.bbmcp_card textarea { min-height:64px; }
.bbmcp_card img.bbmcp_shot { max-width:200px; image-rendering:pixelated; border:1px solid #555; }
.bbmcp_card .bbmcp_grid { display:flex; flex-wrap:wrap; gap:8px; }
.bbmcp_card .bbmcp_shot_wrap { display:flex; flex-direction:column; align-items:center; gap:2px; font-size:.85em; opacity:.85; }
.bbmcp_card .bbmcp_missing { color:#cc6666; font-size:.85em; display:none; }
.bbmcp_card .bbmcp_field_missing > label { color:#cc6666; }
</style>`;

/**
 * 卡片 + 按钮的统一决策:
 * - 若唯一取值控件是 choices(且没指定 style:"radio")→ 用它的选项当对话框按钮,
 *   该控件不再重复渲染;其余组件照常渲染。
 * - 否则按钮用 fallback(调用方的 options / Approve|Needs changes)。
 */
export function resolveCard(
  components: CardComponent[],
  fallbackButtons: string[],
): { buttons: string[]; rest: CardComponent[] } {
  const chosen = cardButtonsFromChoices(components);
  if (!chosen) return { buttons: fallbackButtons, rest: components };
  const only = components.filter((component) => VALUE_KINDS.includes(component.type))[0];
  return { buttons: chosen, rest: components.filter((component) => component !== only) };
}

/** 只有 choices 一种取值控件时,直接把选项做成对话框按钮(一次点击 = 回答) */
export function cardButtonsFromChoices(components: CardComponent[]): string[] | null {
  const valued = components.filter((component) => VALUE_KINDS.includes(component.type));
  if (valued.length !== 1) return null;
  const only = valued[0];
  if (only.type !== "choices") return null;
  if (only.style === "radio") return null;
  return only.options;
}

function fieldOf(component: CardComponent): CardField | null {
  if (!VALUE_KINDS.includes(component.type)) return null;
  const anyComponent = component as { id: string; required?: boolean; load_as_reference?: boolean };
  return {
    id: anyComponent.id,
    kind: component.type,
    required: anyComponent.required === true,
    loadAsReference: anyComponent.load_as_reference !== false,
  };
}

export function renderCard(
  components: CardComponent[],
  opts: { dialogId: string; images?: CardImages },
): { html: string; fields: CardField[] } {
  const images = opts.images ?? {};
  const fields: CardField[] = [];
  const parts: string[] = [STYLE, `<div class="bbmcp_card">`];
  for (const component of components) {
    const field = fieldOf(component);
    if (field) fields.push(field);
    parts.push(renderOne(component, field, images, opts.dialogId));
  }
  parts.push(`</div>`);
  return { html: parts.join("\n"), fields };
}

function domId(dialogId: string, fieldId: string): string {
  return `${dialogId}__${fieldId}`;
}

function renderOne(
  component: CardComponent,
  field: CardField | null,
  images: CardImages,
  dialogId: string,
): string {
  switch (component.type) {
    case "text": {
      const cls =
        component.style === "title"
          ? "bbmcp_title"
          : component.style === "muted"
            ? "bbmcp_muted"
            : component.style === "warn"
              ? "bbmcp_warn"
              : component.style === "ok"
                ? "bbmcp_ok"
                : "";
      return `<div class="bbmcp_t ${cls}">${escapeHtml(component.text)}</div>`;
    }
    case "choices": {
      const name = escapeHtml(component.id);
      const label = fieldLabel(component.label);
      const options = component.options
        .map((option: string, index: number) => {
          const checked = component.default === option || (!component.default && index === 0);
          return `<label><input type="radio" name="${name}" value="${escapeHtml(option)}"${
            checked ? " checked" : ""
          }> ${escapeHtml(option)}</label>`;
        })
        .join("");
      return `<div class="bbmcp_field" data-field="${name}">${label}<div class="bbmcp_opts">${options}</div>${missingHint()}</div>`;
    }
    case "multi_choice": {
      const name = escapeHtml(component.id);
      const selected = new Set(component.default ?? []);
      const options = component.options
        .map(
          (option: string) =>
            `<label><input type="checkbox" name="${name}" value="${escapeHtml(option)}"${
              selected.has(option) ? " checked" : ""
            }> ${escapeHtml(option)}</label>`,
        )
        .join("");
      const range =
        component.min !== undefined || component.max !== undefined
          ? `<div class="bbmcp_muted">选 ${component.min ?? 0}~${component.max ?? component.options.length} 项</div>`
          : "";
      return `<div class="bbmcp_field" data-field="${name}">${fieldLabel(component.label)}${range}<div class="bbmcp_opts">${options}</div>${missingHint()}</div>`;
    }
    case "text_input": {
      const id = escapeHtml(domId(dialogId, component.id));
      return `<div class="bbmcp_field" data-field="${escapeHtml(component.id)}">${fieldLabel(component.label)}
<input type="text" id="${id}" value="${escapeHtml(component.default ?? "")}" placeholder="${escapeHtml(
        component.placeholder ?? "",
      )}"${component.max_length ? ` maxlength="${component.max_length}"` : ""}>${missingHint()}</div>`;
    }
    case "textarea": {
      const id = escapeHtml(domId(dialogId, component.id));
      return `<div class="bbmcp_field" data-field="${escapeHtml(component.id)}">${fieldLabel(component.label)}
<textarea id="${id}" rows="${component.rows ?? 4}" placeholder="${escapeHtml(
        component.placeholder ?? "",
      )}">${escapeHtml(component.default ?? "")}</textarea>${missingHint()}</div>`;
    }
    case "number": {
      const id = escapeHtml(domId(dialogId, component.id));
      const attrs = [
        component.min !== undefined ? ` min="${component.min}"` : "",
        component.max !== undefined ? ` max="${component.max}"` : "",
        component.step !== undefined ? ` step="${component.step}"` : "",
      ].join("");
      const hint =
        component.min !== undefined || component.max !== undefined
          ? `<span class="bbmcp_muted">${component.min ?? ""}~${component.max ?? ""}</span>`
          : "";
      const control = component.slider
        ? `<input type="range" id="${id}" value="${component.default ?? component.min ?? 0}"${attrs}>`
        : `<input type="number" id="${id}" value="${component.default ?? ""}"${attrs}>`;
      return `<div class="bbmcp_field" data-field="${escapeHtml(component.id)}"><div class="bbmcp_row">${fieldLabel(
        component.label,
      )}${hint}</div>${control}${missingHint()}</div>`;
    }
    case "toggle": {
      const id = escapeHtml(domId(dialogId, component.id));
      return `<div class="bbmcp_field" data-field="${escapeHtml(component.id)}"><label class="bbmcp_row"><input type="checkbox" id="${id}"${
        component.default ? " checked" : ""
      }> ${escapeHtml(component.label)}</label></div>`;
    }
    case "select": {
      const id = escapeHtml(domId(dialogId, component.id));
      const options = component.options
        .map(
          (option: string) =>
            `<option value="${escapeHtml(option)}"${component.default === option ? " selected" : ""}>${escapeHtml(
              option,
            )}</option>`,
        )
        .join("");
      return `<div class="bbmcp_field" data-field="${escapeHtml(component.id)}">${fieldLabel(component.label)}
<select id="${id}">${options}</select>${missingHint()}</div>`;
    }
    case "color": {
      const id = escapeHtml(domId(dialogId, component.id));
      return `<div class="bbmcp_field" data-field="${escapeHtml(component.id)}"><div class="bbmcp_row">${fieldLabel(
        component.label,
      )}<input type="color" id="${id}" value="${escapeHtml(component.default ?? "#8a5a2b")}"></div>${missingHint()}</div>`;
    }
    case "file": {
      const id = escapeHtml(domId(dialogId, component.id));
      return `<div class="bbmcp_field" data-field="${escapeHtml(component.id)}">${fieldLabel(component.label)}
<input type="file" id="${id}" accept="${escapeHtml(component.accept ?? "image/*")}">${missingHint()}</div>`;
    }
    case "views": {
      const wanted: string[] = [];
      for (const time of component.times?.length ? component.times : [null]) {
        for (const view of component.views) wanted.push(time === null ? view : `${view}@${time}`);
      }
      const shots = wanted
        .map((key) => {
          const dataUrl = images.captures?.[key];
          if (!dataUrl) return "";
          return `<div class="bbmcp_shot_wrap"><img class="bbmcp_shot" src="${escapeHtml(
            dataUrl,
          )}" alt="${escapeHtml(key)}"><span>${escapeHtml(key)}</span></div>`;
        })
        .filter(Boolean)
        .join("");
      if (!shots)
        return `<div class="bbmcp_t bbmcp_muted">(视角截图不可用:${
          escapeHtml(component.views.join(",")) || "?"
        })</div>`;
      return `<div class="bbmcp_field">${fieldLabel(component.label)}<div class="bbmcp_grid">${shots}</div></div>`;
    }
    case "references": {
      const refs = (images.references ?? [])
        .map(
          (reference) =>
            `<div class="bbmcp_shot_wrap"><img class="bbmcp_shot" src="${escapeHtml(
              reference.data_url,
            )}" alt="${escapeHtml(reference.name)}"><span>${escapeHtml(reference.name)}</span></div>`,
        )
        .join("");
      if (!refs) return `<div class="bbmcp_t bbmcp_muted">(还没有加载参考图)</div>`;
      return `<div class="bbmcp_field">${fieldLabel(component.label ?? "参考图")}<div class="bbmcp_grid">${refs}</div></div>`;
    }
    default:
      return "";
  }
}

function fieldLabel(label?: string): string {
  return label ? `<label>${escapeHtml(label)}</label>` : "";
}

function missingHint(): string {
  return `<div class="bbmcp_missing">这一项是必填的</div>`;
}

export type CardValues = Record<string, unknown>;

/** 从 DOM 把值读回来。file 需要异步读内容,所以整体是 async。 */
export async function readCardValues(
  dialogId: string,
  fields: CardField[],
): Promise<{ values: CardValues; file?: { name: string; dataUrl: string } }> {
  const values: CardValues = {};
  let file: { name: string; dataUrl: string } | undefined;
  for (const field of fields) {
    const elementId = `${dialogId}__${field.id}`;
    try {
      switch (field.kind) {
        case "choices":
        case "multi_choice": {
          const checked = document.querySelectorAll(`[name="${field.id}"]`);
          const picked: string[] = [];
          for (let index = 0; index < (checked?.length ?? 0); index += 1) {
            const item = checked[index];
            if (item?.checked) picked.push(String(item.value ?? ""));
          }
          values[field.id] = field.kind === "choices" ? (picked[0] ?? null) : picked;
          break;
        }
        case "toggle": {
          values[field.id] = Boolean(document.getElementById(elementId)?.checked);
          break;
        }
        case "number": {
          const raw = document.getElementById(elementId)?.value ?? "";
          const parsed = Number(raw);
          values[field.id] = Number.isFinite(parsed) ? parsed : null;
          break;
        }
        case "file": {
          const chosen = document.getElementById(elementId)?.files?.[0];
          if (chosen) {
            const dataUrl = await readFileAsDataUrl(chosen);
            values[field.id] = { name: chosen.name, data_url: dataUrl };
            if (field.loadAsReference) file = { name: chosen.name, dataUrl };
          } else values[field.id] = null;
          break;
        }
        default: {
          const raw = document.getElementById(elementId)?.value;
          values[field.id] = raw === undefined ? null : raw;
        }
      }
    } catch {
      values[field.id] = null;
    }
  }
  return { values, file };
}

function readFileAsDataUrl(file: unknown): Promise<string> {
  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    } catch {
      resolve("");
    }
  });
}

/** 必填项检查:返回缺的字段 id */
export function missingRequired(fields: CardField[], values: CardValues): string[] {
  return fields
    .filter((field) => field.required)
    .filter((field) => {
      const value = values[field.id];
      if (value === null || value === undefined) return true;
      if (typeof value === "string") return value.trim() === "";
      if (Array.isArray(value)) return value.length === 0;
      if (typeof value === "object") return !(value as { data_url?: string }).data_url;
      return false;
    })
    .map((field) => field.id);
}

/** 通用覆盖 / 设置 / 插件 / 历史 / 逃生舱 */
import { CommandError } from "../errors.js";
import { requireProject } from "../bb.js";
import type { ToolHandler } from "../dispatch.js";

function barItems(): Record<string, any> {
  const items = (BarItems ?? {}) as Record<string, any>;
  return items;
}

function settingsMap(): Record<string, any> {
  const all = (settings ?? {}) as Record<string, any>;
  return all;
}

export const coverageTools: Record<string, ToolHandler> = {
  list_actions: (args: { filter?: string }) => {
    const filter = (args?.filter ?? "").toLowerCase();
    const actions = Object.entries(barItems())
      .map(([id, item]) => ({
        id,
        name: item?.name ?? item?.title ?? id,
        description: item?.description ?? null,
        icon: item?.icon ?? null,
        category: item?.category ?? null,
        type: item?.type ?? null,
      }))
      .filter((entry) => !filter || entry.id.toLowerCase().includes(filter) || entry.name.toLowerCase().includes(filter))
      .sort((a, b) => a.id.localeCompare(b.id));
    return {
      count: actions.length,
      actions,
      note: "Run any of these with run_action {id, value}. Dedicated tools are preferred where they exist.",
    };
  },

  get_action: (args: { id: string }) => {
    const item = barItems()[args?.id];
    if (!item) throw new CommandError("E_NOT_FOUND", `Unknown action id: ${args?.id}. Use list_actions.`);
    return {
      id: args.id,
      name: item.name ?? args.id,
      description: item.description ?? null,
      icon: item.icon ?? null,
      category: item.category ?? null,
      type: item.type ?? null,
      value: item.value ?? null,
      has_click: typeof item.click === "function",
    };
  },

  run_action: (args: { id: string; value?: unknown }) => {
    const item = barItems()[args?.id];
    if (!item) throw new CommandError("E_NOT_FOUND", `Unknown action id: ${args?.id}. Use list_actions.`);
    if (typeof item.click !== "function")
      throw new CommandError("E_INVALID_PARAM", `Action "${args.id}" has no click handler.`);
    const result = args?.value === undefined ? item.click() : item.click(args.value);
    return {
      ok: true,
      id: args.id,
      result: typeof result === "boolean" || typeof result === "string" || typeof result === "number" ? result : null,
    };
  },

  select_action: (args: { refs: string[]; mode?: "replace" | "add" }) => {
    requireProject();
    try {
      if (args?.mode !== "add") unselectAll();
      for (const ref of args.refs) {
        const element =
          (Group?.all ?? []).find((g: any) => g.uuid === ref || g.name === ref) ??
          (Cube?.all ?? []).find((c: any) => c.uuid === ref || c.name === ref);
        if (!element) throw new CommandError("E_NOT_FOUND", `Element not found: ${ref}`);
        element.select?.();
      }
      Canvas.updateSelected(undefined);
      return { ok: true, selected: args.refs.length };
    } catch (err) {
      if (err instanceof CommandError) throw err;
      throw new CommandError("E_BLOCKBENCH_ERROR", "Could not change the selection in this build.");
    }
  },

  list_modes: () => {
    // 官方类型:Modes 是 Mode 类,注册表在 Modes.options,当前模式在 Modes.selected
    const modes = Modes.options as unknown as Record<string, Mode>;
    const selected = Modes.selected as unknown as Mode | undefined;
    return {
      modes: Object.entries(modes).map(([id, mode]) => ({
        id: mode?.id ?? id,
        name: mode?.name ?? id,
        active: mode === selected || (mode?.id && mode.id === selected?.id) || false,
      })),
      selected: selected?.id ?? null,
    };
  },

  set_mode: (args: { id: string }) => {
    const mode = (Modes.options as unknown as Record<string, Mode | undefined>)[args?.id];
    if (!mode) throw new CommandError("E_NOT_FOUND", `Unknown mode: ${args?.id}. Use list_modes.`);
    try {
      mode.select?.();
    } catch {
      throw new CommandError("E_BLOCKBENCH_ERROR", `Cannot switch to mode "${args.id}" in this build.`);
    }
    return { ok: true, mode: mode.id ?? args.id };
  },

  list_settings: (args: { category?: string }) => {
    const entries = Object.entries(settingsMap())
      .map(([id, setting]) => ({
        id,
        name: setting?.name ?? id,
        value: setting?.value ?? null,
        type: setting?.type ?? (typeof setting?.value === "undefined" ? "unknown" : typeof setting.value),
        category: setting?.category ?? null,
        description: setting?.description ?? null,
      }))
      .filter((entry) => !args?.category || entry.category === args.category);
    return { count: entries.length, settings: entries };
  },

  get_setting: (args: { id: string }) => {
    const setting = settingsMap()[args?.id];
    if (!setting) throw new CommandError("E_NOT_FOUND", `Unknown setting: ${args?.id}. Use list_settings.`);
    return {
      id: args.id,
      name: setting.name ?? args.id,
      value: setting.value ?? null,
      type: setting.type ?? null,
      category: setting.category ?? null,
    };
  },

  set_setting: (args: { id: string; value: unknown }) => {
    const setting = settingsMap()[args?.id];
    if (!setting) throw new CommandError("E_NOT_FOUND", `Unknown setting: ${args?.id}. Use list_settings.`);
    setting.value = args?.value;
    setting.save?.();
    return { ok: true, id: args.id, value: setting.value };
  },

  list_plugins: () => ({
    plugins: Plugins.all.map((plugin) => ({
      id: plugin.id ?? plugin.title,
      title: plugin.title ?? plugin.id,
      version: plugin.version ?? null,
      author: plugin.author ?? null,
    })),
  }),

  install_plugin: (args: { id?: string; url?: string }) => {
    const target = args?.url ?? args?.id;
    if (!target) throw new CommandError("E_INVALID_PARAM", "Pass id (a plugin store id) or url.");
    // Blockbench 没有统一的插件安装 API,只在确实存在时调用,否则让用户手动装
    const installer = (Blockbench as unknown as { installPlugin?: (target: string) => void })
      .installPlugin;
    if (typeof installer !== "function")
      throw new CommandError(
        "E_BLOCKBENCH_ERROR",
        "This Blockbench build exposes no programmatic plugin installer. Ask the user to install it from File ▸ Plugins and retry.",
      );
    installer(target);
    return {
      ok: true,
      requested: target,
      note: "If a permission dialog appears, the user must accept it before the format becomes available.",
    };
  },

  uninstall_plugin: (args: { id: string }) => {
    const plugin = Plugins.all.find(
      (entry) => entry.id === args?.id || entry.title === args?.id,
    );
    if (!plugin) throw new CommandError("E_NOT_FOUND", `Plugin not installed: ${args?.id}`);
    if (typeof plugin.uninstall !== "function")
      throw new CommandError("E_BLOCKBENCH_ERROR", "This plugin cannot be uninstalled programmatically.");
    plugin.uninstall();
    return { ok: true, uninstalled: args.id };
  },

  undo: () => {
    try {
      Undo.undo(false);
      return { ok: true, action: "undo" };
    } catch {
      throw new CommandError("E_BLOCKBENCH_ERROR", "Undo is unavailable right now.");
    }
  },

  redo: () => {
    try {
      Undo.redo(false);
      return { ok: true, action: "redo" };
    } catch {
      throw new CommandError("E_BLOCKBENCH_ERROR", "Redo is unavailable right now.");
    }
  },

  execute_script: async (args: { code: string; timeout_seconds?: number }) => {
    if (!settings?.bbmcp_allow_execute_script?.value)
      throw new CommandError(
        "E_AUTH_FAILED",
        "execute_script is disabled. The user can enable it in Settings ▸ General ▸ 'Allow execute_script'.",
      );
    if (typeof args?.code !== "string" || !args.code.trim())
      throw new CommandError("E_INVALID_PARAM", "Pass the JavaScript body in `code`.");
    const timeoutMs = Math.min((args?.timeout_seconds ?? 30) * 1000, 120_000);
    const run = new Function(
      `return (async () => {\n${args.code}\n})();`,
    ) as () => Promise<unknown>;
    const result = await Promise.race([
      run(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new CommandError("E_TIMEOUT", `Script exceeded ${timeoutMs / 1000}s.`)), timeoutMs),
      ),
    ]);
    let serialized: unknown = result;
    try {
      serialized = JSON.parse(JSON.stringify(result ?? null));
    } catch {
      serialized = String(result);
    }
    return { ok: true, result: serialized };
  },
};


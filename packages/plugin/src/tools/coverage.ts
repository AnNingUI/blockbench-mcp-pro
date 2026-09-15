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
      // 5.1.6 实测:Canvas.updateSelected 不存在,全局 updateSelection() 才是刷新入口
      (globalThis as { updateSelection?: () => void }).updateSelection?.();
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
    // 必须走 Setting.set():直接赋 .value 只改内存,Blockbench 不会保存(与令牌那个 bug 同一类);
    // 而且真 Setting 上并没有 save()
    if (typeof setting.set === "function") setting.set(args?.value);
    else setting.value = args?.value;
    return { ok: true, id: args.id, value: setting.value };
  },

  list_plugins: () => {
    // Plugins.all 同时包含"已安装"和"商店里可见但未安装"的条目(官方类型的注释也这么写)
    const describe = (plugin: Plugin) => ({
      id: plugin.id,
      title: plugin.title,
      version: plugin.version ?? null,
      author: plugin.author ?? null,
      installed: Boolean(plugin.installed),
      disabled: Boolean((plugin as { disabled?: boolean }).disabled),
    });
    const all = Plugins.all.map(describe);
    return {
      plugins: all,
      summary: {
        total: all.length,
        installed: all.filter((entry) => entry.installed).length,
        available: all.filter((entry) => !entry.installed).length,
      },
      note: "installed:true 的是已安装;其余是商店里可安装的(用 install_plugin {id} 装)。",
    };
  },

  install_plugin: async (args: { id?: string; url?: string }) => {
    const target = args?.url ?? args?.id;
    if (!target)
      throw new CommandError("E_INVALID_PARAM", "Pass id (a plugin store id, e.g. 'geckolib') or url.");

    // 商店列表可能还在加载,等一次(与官方 Plugin 类同名的 loading_promise)
    const plugins = Plugins as unknown as { all: Plugin[]; loading_promise?: Promise<unknown> };
    if (plugins.loading_promise) await plugins.loading_promise.catch(() => undefined);

    if (args?.url) {
      await new Plugin().loadFromURL(args.url, true);
      return {
        ok: true,
        source: "url",
        url: args.url,
        note: "如果 Blockbench 弹出权限/确认对话框,用户需要点同意后格式才会出现。",
      };
    }

    const plugin = Plugins.all.find((entry) => entry.id === args.id);
    if (!plugin)
      throw new CommandError(
        "E_NOT_FOUND",
        `Plugin "${args.id}" not found. Call list_plugins to see store entries (installed:false).`,
      );
    if (plugin.installed) return { ok: true, already: true, id: plugin.id, title: plugin.title };

    const installable = plugin.isInstallable?.();
    if (installable !== true && typeof installable === "string")
      throw new CommandError("E_UNSUPPORTED_FORMAT", `Cannot install "${args.id}" here: ${installable}`);

    await plugin.install();
    return {
      ok: true,
      installed: Boolean(plugin.installed),
      id: plugin.id,
      title: plugin.title,
      note: "安装完成后相关格式才会出现在 list_formats;必要时让用户重启 Blockbench。",
    };
  },

  uninstall_plugin: (args: { id: string }) => {
    const plugin = Plugins.all.find(
      (entry) => entry.id === args?.id || entry.title === args?.id,
    );
    if (!plugin) throw new CommandError("E_NOT_FOUND", `Plugin not found: ${args?.id}`);
    if (!plugin.installed)
      throw new CommandError("E_INVALID_PARAM", `Plugin is not installed: ${args?.id}`);
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
      // 返回了循环引用/Blockbench 对象时,别只丢一个 "[object Object]" —— 那是没法调试的
      serialized =
        typeof result === "object" && result !== null
          ? {
              note:
                "Return value is not JSON-serializable (circular or a Blockbench object). Return primitives (numbers, strings, arrays of plain objects).",
              keys: Object.keys(result as object).slice(0, 20),
              ctor: (result as object).constructor?.name ?? "unknown",
            }
          : String(result);
    }
    return { ok: true, result: serialized };
  },
};


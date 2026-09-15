/**
 * 插件版本号的唯一来源 = packages/plugin/package.json。
 * 构建时 rolldown 会把 JSON 内联进来,所以产物里没有运行时依赖,
 * 也不会再出现"package.json 是 1.0.1、health 却报 1.0.0"的漂移。
 */
import { version } from "../package.json" with { type: "json" };

export const PLUGIN_VERSION: string = version;

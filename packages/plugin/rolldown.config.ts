import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "rolldown";

const here = import.meta.dirname;
const repoRoot = path.resolve(here, "..", "..");
const out = (file: string) => path.join(here, "dist", file);

/**
 * 源码用 NodeNext 风格写相对导入("./host.js"),真实文件是 "./host.ts"。
 * rolldown 自带 oxc 转译 TS,但不会替你做 .js → .ts 的说明符改写,所以补这一小步。
 */
const jsExtensionToTs: Plugin = {
	name: "js-extension-to-ts",
	resolveId(source, importer) {
		if (!importer || !source.startsWith(".") || !source.endsWith(".js"))
			return null;
		const candidate = path.resolve(
			path.dirname(importer),
			`${source.slice(0, -3)}.ts`,
		);
		return existsSync(candidate) ? candidate : null;
	},
};

const base = {
	plugins: [jsExtensionToTs],
	// 工作区包只有 main 字段;neutral/node 平台必须显式声明,否则解析不到 @bbmcp/shared
	resolve: { mainFields: ["module", "main"] },
} as const;

export default defineConfig([
	// 1) Blockbench 插件:自包含单文件(IIFE),用户 Load Plugin from File 就这一个
	{
		...base,
		input: path.join(here, "src", "main.ts"),
		platform: "neutral",
		output: {
			file: out("blockbench_mcp.js"),
			format: "iife",
			name: "BlockbenchMCP",
			comments: false,
		},
	},

	// 2) 测试入口:node 里可导入的内部实现(不随 npm 包发布)
	{
		...base,
		input: path.join(here, "src", "testing.ts"),
		platform: "node",
		output: { file: out("testing.mjs"), format: "esm", comments: false },
	},

	// 3) stdio 网关:从 gateway/index.mjs 打到包里(shebang 由源文件保留)
	{
		input: path.join(repoRoot, "gateway", "index.mjs"),
		platform: "node",
		output: { file: out("gateway.mjs"), format: "esm", comments: false },
	},
]);

/**
 * 构建发布包(rolldown):
 *   1. dist/blockbench_mcp.js  —— 发给 Blockbench 的单文件插件(self-contained,无 import)
 *   2. dist/testing.mjs        —— 供 node 测试导入的内部实现(不随 npm 包发布)
 *   3. dist/gateway.mjs        —— stdio ⇄ HTTP 网关(bin 的依赖,随包发布)
 *
 * TS 由 rolldown 内置的 oxc 转换;源码里 NodeNext 风格的 "./x.js" 指向真实文件 "./x.ts",
 * 用下面的小插件把 .js 说明符改写到 .ts(发布产物中不再有裸导入,所以不影响运行时)。
 */
import { build } from "rolldown";
import { copyFile, mkdir, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, "..");
const repoRoot = path.resolve(pkgRoot, "..", "..");
const outDir = path.join(pkgRoot, "dist");
const gatewaySource = path.join(repoRoot, "gateway", "index.mjs");

await mkdir(outDir, { recursive: true });

/** "./foo.js" → "./foo.ts"(仅当 .ts 存在时) */
const jsSpecifierToTs = {
  name: "js-specifier-to-ts",
  resolveId(source, importer) {
    if (!importer || !source.startsWith(".") || !source.endsWith(".js")) return null;
    const candidate = path.resolve(path.dirname(importer), source.slice(0, -3) + ".ts");
    return existsSync(candidate) ? candidate : null;
  },
};

const shared = {
  plugins: [jsSpecifierToTs],
  // 工作区包只有 main 字段,neutral/node 平台下必须显式配置
  resolve: { mainFields: ["module", "main"] },
  logLevel: "info",
};

await build({
  ...shared,
  input: path.join(pkgRoot, "src", "main.ts"),
  platform: "neutral",
  output: {
    file: path.join(outDir, "blockbench_mcp.js"),
    format: "iife",
    name: "BlockbenchMCP",
    comments: false,
  },
});

await build({
  ...shared,
  input: path.join(pkgRoot, "src", "testing.ts"),
  platform: "node",
  output: {
    file: path.join(outDir, "testing.mjs"),
    format: "esm",
    comments: false,
  },
});

const gatewayOut = path.join(outDir, "gateway.mjs");
await copyFile(gatewaySource, gatewayOut);
await chmod(gatewayOut, 0o755).catch(() => {});
console.log(`copied gateway → ${path.relative(repoRoot, gatewayOut)}`);

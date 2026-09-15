/**
 * 打包体检 —— 确认 npm 包内容正确、CLI 可用、网关文件随包发布。
 *   pnpm --filter @anningui/blockbench-mcp test   (先 pnpm run build)
 */
import { test, expect, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, "..");
const pkg = JSON.parse(readFileSync(path.join(pkgRoot, "package.json"), "utf8"));

const cli = async (...args) => {
  const { stdout } = await run(process.execPath, [path.join(pkgRoot, "bin", "blockbench-mcp.mjs"), ...args]);
  return stdout.trim();
};

test("package metadata is publishable under the requested scope", () => {
  expect(pkg.name).toBe("@anningui/blockbench-mcp");
  expect(pkg.publishConfig.access).toBe("public");
  expect(pkg.license).toBe("MIT");
  expect(pkg.type).toBe("module");
  expect(pkg.bin["blockbench-mcp"]).toBeTruthy();
  expect(pkg.files.includes("bin")).toBeTruthy();
  expect(pkg.files.includes("dist/blockbench_mcp.js")).toBeTruthy();
  expect(pkg.files.includes("dist/gateway.mjs")).toBeTruthy();
  expect(pkg.dependencies, "everything is bundled — no runtime dependencies").toBe(undefined);
  expect(pkg.scripts.prepublishOnly.includes("build")).toBe(true);
});

test("build outputs all three artifacts the package needs", () => {
  for (const file of ["blockbench_mcp.js", "gateway.mjs", "testing.mjs"])
    expect(existsSync(path.join(pkgRoot, "dist", file)), `missing dist/${file}`).toBeTruthy();
  const plugin = readFileSync(path.join(pkgRoot, "dist", "blockbench_mcp.js"), "utf8");
  // Blockbench 按文件名推导插件 id:dist/blockbench_mcp.js ↔ Plugin.register("blockbench_mcp")
  const registeredId = /Plugin\.register\("([^"]+)"/.exec(plugin)?.[1];
  expect(registeredId, "the plugin registers itself under an id equal to the bundle file name").toBe("blockbench_mcp");
  expect(path.basename(path.join(pkgRoot, "dist", "blockbench_mcp.js"), ".js"), "Blockbench requires the file name (minus .js) to equal the plugin id").toBe(registeredId);
  const gateway = readFileSync(path.join(pkgRoot, "dist", "gateway.mjs"), "utf8");
  expect(gateway).toMatch(/startGateway/);
  expect(gateway).toMatch(/^#!\/usr\/bin\/env node/);
});

test("CLI flags answer the questions the docs promise", async () => {
  const help = await cli("--help");
  expect(help).toMatch(/--plugin-path/);
  expect(help).toMatch(/BBMCP_TOKEN/);

  const pluginPath = await cli("--plugin-path");
  expect(existsSync(pluginPath), `--plugin-path points at a real file: ${pluginPath}`).toBeTruthy();
  expect(pluginPath).toMatch(/blockbench_mcp\.js$/);

  expect(await cli("--http-url")).toBe("http://127.0.0.1:39742/mcp");
  expect(await cli("--cdn-url")).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/npm\/@anningui\/blockbench-mcp\//);
});

test("the CLI defaults to running the stdio gateway", async () => {
  // 用一个假的插件端点验证 CLI 真的把 stdin 转发出去了
  const net = await import("node:net");
  const port = 47200 + Math.floor(Math.random() * 300);
  const received = [];
  const server = net.createServer((socket) => {
    socket.on("data", (chunk) => {
      received.push(chunk.toString());
      const body = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: ["from-plugin"] } });
      socket.write(
        `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`,
      );
    });
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));

  const child = (await import("node:child_process")).spawn(
    process.execPath,
    [path.join(pkgRoot, "bin", "blockbench-mcp.mjs")],
    {
      env: {
        ...process.env,
        BBMCP_URL: `http://127.0.0.1:${port}/mcp`,
        BBMCP_TOKEN: "cli-token",
        BBMCP_QUIET: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  const response = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("CLI produced no response")), 8000);
    let buffer = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const index = buffer.indexOf("\n");
      if (index >= 0) {
        clearTimeout(timer);
        resolve(JSON.parse(buffer.slice(0, index)));
      }
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })}\n`);
  });
  child.kill();
  server.close();
  expect(response.result).toEqual({ tools: ["from-plugin"] });
  expect(received.some((request) => request.includes("Bearer cli-token")), "token forwarded").toBeTruthy();
});

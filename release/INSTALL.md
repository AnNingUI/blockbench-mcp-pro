# 安装与真机测试(3 步)

## 1. 装插件

把本目录的 `blockbench_mcp.js` 放到 Blockbench 的插件目录,然后**重启 Blockbench**:

```
%APPDATA%/Blockbench/plugins/blockbench_mcp.js
```

或 `File ▸ Plugins ▸ Load Plugin from File` → 选这个文件。

- ⚠️ **不要改文件名**:Blockbench 要求「文件名(去掉 .js)= 插件 id」,本插件 id 是 `blockbench_mcp`
- 首次会问网络权限 → 选 **Always allow for this plugin**
- 成功标志:右下角提示 `Blockbench MCP ready → http://127.0.0.1:39742/mcp`

验证:

```bash
curl http://127.0.0.1:39742/health
# {"ok":true,"server":"blockbench-mcp-pro","version":"1.0.1",...}
```

## 2. 配 MCP(令牌是随机生成的,不要用占位符)

**自动写入(推荐,会先备份 `~/.pi/agent/mcp.json.bak`)**

```bash
node scripts/configure-pi-mcp.mjs            # 从 Blockbench 的设置存储里读令牌,写入 pi 配置
node scripts/configure-pi-mcp.mjs --dry-run  # 只看会写什么
node scripts/configure-pi-mcp.mjs --stdio    # 想用 npx stdio 网关而不是 HTTP 时加这个
```

**手动方式**:令牌见 `Tools ▸ MCP Server Status / Token`,按本目录
`pi-mcp-blockbench.json` 的结构填进 `~/.pi/agent/mcp.json`。

配好后在 pi 里执行 `/reload`。

> 注意路径是 `~/.pi/agent/mcp.json`(`agent`,不是 `agents`)。
> 令牌会被持久化 —— 在 Blockbench 里 Reload 插件不会换令牌(这是 1.0.1 修的一个 bug)。

## 3. 跑真机全量测试(正式 + 边缘)

```bash
node scripts/live-test.mjs --token <MCP Access Token> --out ./out/live-test
# 或
pnpm run test:live -- --token <token>
```

它会:

1. 在 Blockbench 里新建一个 `bbmcp-live-test` 工程(不动你已有的工程 tab)
2. 依次跑 **10 组、30+ 个用例**:发现/只读、工程与几何、程序化生成器、质量门、UV 与贴图、材质通道、动画、
   渲染与参考图、覆盖类工具(action/settings/plugins/undo/execute_script)、人审门、文件与作用域、
   **边缘用例**(未知工具/未知参数/类型错误/side 矛盾/缺父级/环状父子/UV 越界/贴图输入错误/错误路径)、
   **传输层硬化**(401/403 Origin/403 Host/411 chunked/415/405/404/400)、协议(resources/prompts)、并发
3. 把每个视角的截图、UV 图、贴图放大图、参考图对比图 **PNG 落盘**
4. 写出 `out/live-test/live-report.json`(逐用例结果 + 产物清单)

**唯一需要你点一下的地方**:「作用域」那两个用例会弹出 Blockbench 权限对话框,点 **Allow this folder**
(目录就是 `--out` 指向的位置)。其余全自动;人审用例弹出的对话框会在 5 秒后自动关闭,不用管它。

退出码 0 = 全绿。

### 常用参数

| 参数 | 说明 |
|---|---|
| `--token <t>` | MCP Access Token(或环境变量 `BBMCP_TOKEN`) |
| `--out <dir>` | 产物目录,默认 `out/live-test` |
| `--scoped <dir>` | 文件用例的目录,默认同 `--out` |
| `--only <子串>` | 只跑名字匹配的用例(逗号分隔) |
| `--skip <子串>` | 跳过名字匹配的用例 |
| `--url <url>` | 覆盖端点 |

### 更快的冒烟(约 10 秒)

```bash
node scripts/live-smoke.mjs --token <token> --out ./out/live-smoke
```

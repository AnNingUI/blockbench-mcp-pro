# @anningui/blockbench-mcp

Blockbench 的 **MCP 服务器 + 插件**:95 个工具,建模 / 程序化细节 / UV 与贴图 / 动画 / 质量门 / 人审 / 参考图比对。
插件内进程 HTTP MCP(不需要额外 Node 进程)+ stdio 网关(给只支持 stdio 的客户端)。

- 宿主:Blockbench Desktop ≥ 5.1.0
- 传输:MCP 2024-11-05(Streamable HTTP / JSON),附 stdio 转发网关
- 依赖:**零运行时依赖**(zod / shared 已打进产物)
- 许可:MIT

## 1. 拿到插件文件

```bash
npx -y @anningui/blockbench-mcp --plugin-path
# → /path/to/node_modules/@anningui/blockbench-mcp/dist/blockbench_mcp.js
```

或直接从 URL 加载(无需本地安装):

```bash
npx -y @anningui/blockbench-mcp --cdn-url
# → https://cdn.jsdelivr.net/npm/@anningui/blockbench-mcp/dist/blockbench_mcp.js
```

## 2. 在 Blockbench 里加载

1. 打开 **桌面版** Blockbench → `File ▸ Plugins ▸ Load Plugin from File`(或 `Load Plugin from URL`)
2. 弹网络权限时选 **Always allow for this plugin**(要监听 `net`)
3. 右下角出现 `Blockbench MCP ready → http://127.0.0.1:39742/mcp`
4. 菜单:`Tools ▸ Start / Stop MCP Server`、`Tools ▸ MCP Server Status / Token`

## 3. 令牌

`Settings ▸ General ▸ MCP Access Token` —— **首次加载随机生成**,或点 `Tools ▸ MCP Server Status / Token` 一次看全。

## 4. 接入客户端

**HTTP 直连**(推荐):

```jsonc
{
  "mcpServers": {
    "blockbench": {
      "type": "http",
      "url": "http://127.0.0.1:39742/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

**stdio**(Claude Desktop / pi 等):

```jsonc
{
  "mcpServers": {
    "blockbench": {
      "command": "npx",
      "args": ["-y", "@anningui/blockbench-mcp"],
      "env": {
        "BBMCP_URL": "http://127.0.0.1:39742/mcp",
        "BBMCP_TOKEN": "<token>"
      }
    }
  }
}
```

## CLI

```
blockbench-mcp                 启动 stdio 网关(默认行为)
blockbench-mcp --plugin-path   打印插件文件绝对路径
blockbench-mcp --http-url      打印 HTTP MCP 地址
blockbench-mcp --cdn-url       打印 jsDelivr 插件地址
blockbench-mcp --help
```

环境变量:`BBMCP_URL`、`BBMCP_TOKEN`、`BBMCP_TIMEOUT_MS`、`BBMCP_QUIET=1`

## 先读指南,再动手

任何建模任务的第一批调用:

```
health → get_project_summary → get_guide { topic: "modeling" }
```

工具分组:状态与发现、方向(左右)、工程与文件、几何、程序化生成器、UV、纹理、动画、质量门、
渲染/视角、参考图匹配、人审门、通用覆盖(action/settings)、历史与逃生舱。

## 安全

- 只绑定 `127.0.0.1`
- 强制 `Authorization: Bearer <随机令牌>`
- 带 `Origin` 的请求一律拒绝(浏览器 drive-by);非回环 `Host` 一律拒绝(DNS rebinding)
- 文件读写只在 `propose_scoped_directory` 用户批准过的目录内
- `execute_script` 默认关闭,需在设置里显式打开

## 完整文档

安装细节、95 个工具清单、与其它五个 Blockbench MCP 项目的区别表、开发与验证方式:
**https://github.com/AnNingUI/blockbench-mcp-pro**

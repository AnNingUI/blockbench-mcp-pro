# release/ —— 可直接安装的产物

| 文件 | 说明 |
|---|---|
| `blockbench_mcp.js` | Blockbench 插件(单文件,内联 zod + 全部 95 个工具;文件名必须保持 `blockbench_mcp.js`,要与插件 id 一致) |
| `INSTALL.md` | 三步安装 + 真机测试说明 |
| `pi-mcp-blockbench.json` | pi 的 MCP 配置片段(HTTP 形式,令牌处需替换) |
| `live-test.mjs` | 真机全量测试脚本(正式 + 边缘),配合已安装的插件使用 |

安装:

```bash
# 1) 插件 → Blockbench 插件目录,然后重启 Blockbench
cp blockbench_mcp.js "$APPDATA/Blockbench/plugins/blockbench_mcp.js"

# 2) 配 MCP(自动读令牌写入,先备份)
node ../scripts/configure-pi-mcp.mjs --dry-run   # 先看
node ../scripts/configure-pi-mcp.mjs             # 再写

# 3) 全量真机测试
node live-test.mjs --token <token> --out ./out/live-test
```

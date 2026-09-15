# Blockbench MCP Pro

> 读完 `./repos/` 下五个 Blockbench MCP 项目后,把它们的优点全部吸收、缺点全部修掉,重新写的一个最完善的实现。
> **95 个工具**、**插件内进程 HTTP MCP**(无需额外 Node 进程)+ **stdio 网关** 双通道、**强制随机 Bearer 鉴权**、**文件作用域**、**全量 undo 集成**、**程序化生成器**、**质量门**、**人审门**、**参考图 IoU 比对**。

- 协议:MCP 2024-11-05(Streamable HTTP / JSON),另附 stdio 转发网关
- 宿主:Blockbench Desktop ≥ 5.1.0
- 许可:MIT(五个参考项目中两个是 GPL,本项目全部重写,不受传染)

---

## 目录

1. [为什么还要第六个](#为什么还要第六个)
2. [架构:双通道](#架构双通道)
3. [快速开始](#快速开始)
4. [工具总览(95)](#工具总览95)
5. [区别表 A:五个参考项目速览](#区别表-a五个参考项目速览)
6. [区别表 B:能力与工程质量矩阵](#区别表-b能力与工程质量矩阵)
7. [区别表 C:逐项目"吸取了什么 / 抛弃了什么"](#区别表-c逐项目吸取了什么--抛弃了什么)
   - 逐项阅读笔记见 [`docs/reference-projects.md`](docs/reference-projects.md)
8. [安全模型](#安全模型)
9. [质量门与推荐工作流](#质量门与推荐工作流)
10. [发布到 npm](#发布到-npmanninguiblockbench-mcp)
11. [接入 Blockbench](#接入-blockbench)
12. [接入 AI 客户端](#接入-ai-客户端)
13. [目录结构](#目录结构)
14. [开发与验证](#开发与验证)
15. [已知取舍](#已知取舍)

---

## 为什么还要第六个

五个项目各自解决了一段路,但没有一个把关键能力凑齐:

- **sosadly/blockbench-mcp** 有最好的"让模型真的会建模"的东西(程序化生成器、质量门、人审门、参考图比对),但它是**外置 Node 服务端 + 无鉴权的 HTTP 网桥**,插件本体是一个 7000+ 行的单文件 JS,没有 UV 布局检查、没有纹理版本控制、能往任意路径写文件。
- **SwagRee/BlockBenchMCP** 工程最扎实(zod 契约、UV 模式感知、面局部绘制、纹理 revision token、文件作用域、真实的测试),但**没有程序化生成器、没有人审门、没有参考比对、没有动画生成**,而且默认共享密钥是硬编码的 `dev-local-secret`。
- **jasonjgardner/blockbench-mcp-plugin** 工具面最大(110 个,含网格/材质/会话保活/resources/prompts),但是 **GPL-3.0**,并且带 `emulate_clicks` / `trigger_action` / `risky_eval` 这类直接点击 UI 的危险工具,**没有任何鉴权**。
- **vasyacullin-Blockbench-mcp** 的 token 握手与"万能 action 桥"很好,但同样是 **GPL**、纯 JS、无 undo 封装、无 UV/纹理检查,只有 41 个工具。
- **Golub4ik-Official-blockbench-mcp** 只有 5 个工具,却是唯一做了 monorepo + 预构建产物的,工程形态值得借鉴。

所以本项目的目标很直白:**把上面所有"优点"合到一个 MIT 项目里,并且把每一条"缺点"当作设计约束**。

---

## 架构:双通道

```
                    ┌──────────────────────────────────────────────┐
  HTTP 客户端        │  Blockbench Desktop                          │
  (Cursor / VS Code  │  ┌────────────────────────────────────────┐  │
   / Claude Code     │  │ Blockbench MCP 插件(rolldown 单文件产物) │  │
   / Cline / Ollama) │  │  · 127.0.0.1:39742/mcp  进程内 MCP 服务 │  │
        ───────────────▶  · Bearer + Origin/Host 校验               │  │
                    │  │  · dispatch → 95 个工具 → Blockbench API │  │
                    │  │  · 全部改动包在 Undo.initEdit/finishEdit │  │
                    │  └────────────────────────────────────────┘  │
  stdio 客户端        │                                              │
  (Claude Desktop)   └──────────────────────────────────────────────┘
        ───▶ gateway/index.mjs ───(HTTP + Bearer)──▶ 上面同一个端点
             (零依赖 stdio ⇄ HTTP 转发,工具实现只有一份)
```

- **主通道:插件内进程 HTTP MCP。** 装一个插件、指向 URL 即可,不需要额外的 Node 适配器进程,关掉 Blockbench 就等于关掉 MCP。
- **兼容通道:stdio 网关。** 只有 stdio 的客户端(Claude Desktop 等)用 `gateway/index.mjs` 转发。**工具实现不在网关里**,网关只是 stdio ⇄ HTTP 的管道,所以两条通道的能力永远一致。

---

## 快速开始

### 1. 构建插件

```bash
npm install
npm run build          # rolldown 打包
# 产物:packages/plugin/dist/blockbench_mcp.js(单文件插件)
#      packages/plugin/dist/gateway.mjs(stdio 网关)
```

### 2. 在 Blockbench 里加载

1. 打开 **Blockbench 桌面版** → `File ▸ Plugins ▸ Load Plugin from File` → 选 `packages/plugin/dist/blockbench_mcp.js`
   > ⚠️ Blockbench 要求**文件名(去掉 `.js`)等于 `Plugin.register()` 里的插件 id**。
   > 本项目的产物是 `blockbench_mcp.js`、id 是 `blockbench_mcp`,两者必须一致;
   > 改文件名会让它加载失败并提示 "确保插件的基本文件名与 Plugin.register() 中定义的插件ID匹配"。
   > `packages/plugin/test/package.test.mjs` 里有断言守住这条。
2. 首次会请求 **network(net)权限** → 选 **Always allow for this plugin**
3. 插件自动启动服务,右下角提示 `Blockbench MCP ready → http://127.0.0.1:39742/mcp`
4. 菜单:`Tools ▸ Start / Stop MCP Server`、`Tools ▸ MCP Server Status / Token`

### 3. 拿到访问令牌

`Settings ▸ General ▸ MCP Access Token`(首次加载时**随机生成**,不是默认口令),或点 `Tools ▸ MCP Server Status / Token` 一次看全状态 + 可直接粘贴的客户端配置。

### 4. 接入客户端

**Cursor / VS Code(`.cursor/mcp.json` / `.vscode/mcp.json`)**

```json
{
  "mcpServers": {
    "blockbench": {
      "url": "http://127.0.0.1:39742/mcp",
      "headers": { "Authorization": "Bearer <你的令牌>" }
    }
  }
}
```

**Claude Code**

```bash
claude mcp add blockbench --transport http http://127.0.0.1:39742/mcp \
  --header "Authorization: Bearer <你的令牌>"
```

**Claude Desktop(只支持 stdio → 用网关)**

```jsonc
{
  "mcpServers": {
    "blockbench": {
      "command": "node",
      "args": ["/绝对路径/blockbench-mcp-pro/gateway/index.mjs"],
      "env": {
        "BBMCP_URL": "http://127.0.0.1:39742/mcp",
        "BBMCP_TOKEN": "<你的令牌>"
      }
    }
  }
}
```

**mcp-remote / Ollama / Cline 等** 只要能发 HTTP + 自定义头,都指向同一个 URL。

### 5. 先读指南,再动手

任何建模任务的第一批调用应该是:

```
health → get_project_summary → get_guide { topic: "modeling" }
```

---

## 工具总览(95)

| 组 | 数量 | 工具 |
|---|---|---|
| 状态与发现 | 7 | `health`, `get_guide`, `list_formats`, `get_project_summary`, `get_elements`, `list_textures`, `list_animations` |
| 方向(左右) | 3 | `get_orientation`, `which_side`, `check_sides` |
| 工程与文件 | 5 | `create_project`, `set_project_meta`, `save_project`, `export_model`, `propose_scoped_directory` |
| 几何 | 12 | `apply_geometry_batch`, `update_elements`, `delete_elements`, `transform_elements`, `mirror_elements`, `array_cubes`, `radial_array_cubes`, `duplicate_hierarchy`, `create_limb`, `scaffold_biped`, `measure_model`, `audit_symmetry` |
| 程序化生成器 | 5 | `voxelize_matrix`, `add_hollow_volume`, `generate_array`, `extrude_chain`, `add_wing` |
| UV | 7 | `auto_uv_cubes`, `pack_box_uv`, `get_uv_layout`, `get_uv_map`, `set_face_uv`, `transform_uv_islands`, `resize_texture` |
| 纹理 | 21 | `ensure_texture`, `assign_texture`, `get_texture`, `get_texture_revision`, `shade_model_base`, `paint_face_features`, `paint_pixel_batch`, `paint_face_grid`, `get_face_grid`, `edit_texture_pixels`, `replace_texture_color`, `copy_face_pixels`, `flood_fill_texture`, `transform_texture_region`, `analyze_texture_palette`, `get_texture_region`, `audit_texture_quality`, `import_texture_png`, `export_texture_png`, `ensure_material_set`, `audit_material_set` |
| 动画 | 6 | `upsert_animation`, `generate_animation`, `inspect_animation`, `transform_animation_keys`, `delete_animation`, `set_timeline_time` |
| 质量门 | 3 | `check_model`, `audit_complexity`, `check_rig` |
| 渲染/视角 | 3 | `capture_views`, `analyze_view_silhouette`, `set_camera_angle` |
| 参考图匹配 | 5 | `load_reference`, `list_references`, `get_reference`, `clear_references`, `compare_reference` |
| 人审门 | 3 | `ask_user`, `request_review`, `wait_review` |
| 通用覆盖 | 12 | `list_actions`, `get_action`, `run_action`, `select_action`, `list_modes`, `set_mode`, `list_settings`, `get_setting`, `set_setting`, `list_plugins`, `install_plugin`, `uninstall_plugin` |
| 历史与逃生舱 | 3 | `undo`, `redo`, `execute_script`(默认关闭) |

除工具外还实现了 MCP 的另外两类能力:

- **resources**:`blockbench-guide://<topic>`(8 篇 playbook)、`blockbench-mcp://activity`(调用日志 + 当前作用域/参考图/待审卡片)
- **prompts**:`model_from_reference`、`polish_model`

---

## 区别表 A:五个参考项目速览

| 项目 | 传输 | 语言/构建 | 鉴权 | 工具数 | 许可 | 一句话 |
|---|---|---|---|---|---|---|
| `sosadly/blockbench-mcp` | Node stdio 服务端 + 插件内 HTTP 网桥(8787) | TS + 单文件 JS 插件 | 仅 Origin/Host/Content-Type 校验,**无令牌** | 71 | MIT | 最"会建模",但网桥无鉴权、无 UV/纹理版本控制 |
| `SwagRee/BlockBenchMCP` | **纯插件内进程 HTTP MCP**(39741) | TS + esbuild + zod 契约 | Bearer(默认 `dev-local-secret`) | 58 | MIT | 工程最扎实,但缺生成器/人审/参考比对 |
| `jasonjgardner/blockbench-mcp-plugin` | 插件内 Streamable HTTP(3000/bb-mcp) | Bun + TS | **无** | 110(含 12 Hytale) | **GPL-3.0** | 工具面最广 + 会话保活/resources,但有 UI 点击类危险工具 |
| `vasyacullin-Blockbench-mcp` | Node stdio + 自研 TCP/NDJSON 网桥(19888) | 纯 JS | **token 握手**(防 CSRF) | 41 | **GPL-3.0** | action 桥 + execute_script 覆盖全,但无 undo/UV 检查 |
| `Golub4ik-Official-blockbench-mcp` | Node stdio + Socket.IO(9999) | TS + pnpm monorepo | 无 | ~5 | ISC | 工程形态(monorepo/预构建产物)值得借鉴,工具极少 |
| **本项目 `blockbench-mcp-pro`** | **插件内 HTTP MCP + stdio 网关(双通道)** | **TS + rolldown + zod 契约,全纯函数可测** | **随机 Bearer + Origin/Host/Content-Type 校验 + 文件作用域** | **95** | **MIT** | 上述优点的合集,并把每条缺点当成设计约束 |

---

## 区别表 B:能力与工程质量矩阵

图例:✅ 有且完整 · 🟡 有但薄弱/需自己补 · ❌ 没有

| 能力 / 工程点 | sosadly | SwagRee | jasonjgardner | vasyacullin | Golub4ik | **本项目** |
|---|---|---|---|---|---|---|
| 免额外 Node 进程(纯插件) | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| stdio 客户端可用 | ✅ | ❌ | ❌ | ✅ | ✅ | ✅(**网关**) |
| 传输 Token 鉴权 | ❌ | 🟡(弱默认口令) | ❌ | 🟡(需手抄令牌) | ❌ | ✅(随机生成) |
| 防浏览器 drive-by(Origin/Host) | ✅ | ❌ | ❌ | 🟡(握手) | ❌ | ✅ |
| 文件读写在用户批准目录内 | ❌ | ✅ | 🟡 | ❌ | ❌ | ✅ |
| 全量 Undo 集成(单步可撤销) | 🟡 | ✅ | 🟡 | ❌ | ❌ | ✅ |
| zod 参数契约 / 未知参数硬报错 | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| 双端共用的工具目录(单一事实源) | ❌ | ✅ | 🟡 | ❌ | 🟡 | ✅ |
| UV 模式感知(box / face) | 🟡 | ✅ | 🟡 | ❌ | ❌ | ✅ |
| UV 布局机检(越界/重叠/密度/翻转) | ❌ | ✅ | 🟡 | ❌ | ❌ | ✅ |
| 面局部绘制(尊重旋转/翻转) | ✅ | ✅ | 🟡 | ❌ | ❌ | ✅ |
| 纹理 revision token(防过期覆盖) | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| 程序化生成器(体素/壳体/阵列/骨链/翼) | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 质量门(check_model / 复杂度 / 左右 / 骨架) | ✅ | 🟡(仅 check_model) | ❌ | ❌ | ❌ | ✅ |
| 人审门(阻塞式确认 + pending 轮询) | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 参考图 IoU 比对 + 合成对比图 | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 动画基础循环生成(9 种) | ✅ | ❌ | 🟡 | ❌ | ❌ | ✅ |
| 万能 action 桥(list/run action) | ❌ | ❌(明确非目标) | 🟡(UI 点击) | ✅ | ❌ | ✅(不含 UI 点击) |
| settings / modes 读写 | ❌ | ❌ | 🟡 | ✅ | ❌ | ✅ |
| MCP resources / prompts | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| 会话管理 / 保活 | ❌ | 🟡(session id) | ✅(SSE keepalive) | ❌ | ❌ | 🟡(session id,无 SSE) |
| 逃生舱 execute_script | ✅(默认开) | ❌(明确非目标) | ✅ | ✅ | ❌ | ✅(**默认关**) |
| 危险 UI 点击类工具 | ❌ | ❌ | ⚠️(emulate_clicks/risky_eval) | ❌ | ❌ | ❌(故意不做) |
| 自动化测试 | 🟡(工具目录) | ✅(协议+宿主 mock) | ❌(无) | 🟡 | ❌ | ✅(**95 个** Vitest,含交付产物/真实 HTTP/stdio) |
| 许可 | MIT | MIT | **GPL-3.0** | **GPL-3.0** | ISC | **MIT** |

---

## 区别表 C:逐项目"吸取了什么 / 抛弃了什么"

### 1. `sosadly/blockbench-mcp`

**吸取**
- 程序化生成器:`voxelize_matrix`、`add_hollow_volume`、`generate_array`、`extrude_chain`、`add_wing`(全部重写为 shared 包里的纯函数,可单测)
- 质量门:`audit_complexity`(方块预算 / 单体巨块 / 分层 / 微细节密度)、`check_model`、`check_sides`、`check_rig`
- 人审门:`request_review` / `ask_user` / `wait_review` 的 **pending + 轮询** 设计(解决 MCP 单次请求超时与分钟级人审的矛盾)
- 参考图匹配:`compare_reference` 的 IoU + 缺失/多余质量百分比 + 合成对比图
- 方向权威:模型面朝 `-Z`、自身右侧 `+X`、前视图镜像陷阱、旋转符号表,以及 `side:"left"|"right"` **参数级拒绝**
- 指南式工具:`get_guide` 的建模/细节/方向/绑定/贴图/动画/审查/参考八篇 playbook
- 参数强制转换:把客户端发来的 JSON 字符串解开(`coerceArguments`)
- 细节:面局部绘制(`paint_face_features`)与整面底色光照(`shade_model_base`)

**抛弃**
- ❌ HTTP 网桥无令牌 → 改为**随机生成 Bearer 并强制校验**
- ❌ 能写任意路径 → 改为 **propose_scoped_directory 批准目录 + 路径越界拒绝**
- ❌ 单文件 7000+ 行插件、无类型、无契约 → 改为 **TS + zod 契约 + 多个聚焦模块**
- ❌ 无 UV 布局机检 / 无纹理版本控制 → 补齐 `get_uv_layout` 与 revision token
- ❌ `execute_script` 默认开启 → 改为**默认关闭**,设置里显式打开
- ❌ 需要外置 Node 服务端才能用 → 主通道改为**插件内进程**,外置只作为可选的 stdio 网关

### 2. `SwagRee/BlockBenchMCP`

**吸取**
- **插件内进程 HTTP MCP**(不需要第二个进程)——本项目的主通道
- zod 契约 + 未知参数硬报错 + 统一响应信封 `{ok, summary, result, error}` + 结构化错误码 `E_*`
- UV 模式解析(box / face,含 `java_block` 必须 face 的校验)与 `pack_box_uv` / `get_uv_layout` / `get_uv_map` / `transform_uv_islands`
- 面空间映射(尊重面旋转与 UV 翻转)与 `paint_face_grid` / `get_face_grid` 的精确像素往返
- **纹理 revision token**(FNV-1a 内容哈希 + `expected_revision` 乐观并发)
- `propose_scoped_directory` **文件作用域**安全模型
- 离屏多视角截图(`Screencam.NoAAPreview`,不动用户相机)+ 轮廓分析
- Undo 端口封装(`initEdit` / `cancelEdit` 回滚 / `finishEdit` 纳入新建元素)
- `ensure_material_set` / `audit_material_set` 的 PBR 通道一致性检查
- 测试用宿主 mock 的思路

**抛弃**
- ❌ 默认共享密钥 `dev-local-secret` → 改为**首次加载随机生成 24 字节令牌**
- ❌ 没有程序化生成器 → 补齐 5 个生成器
- ❌ 没有人审门 / 参考比对 → 补齐
- ❌ 没有动画生成(只有 upsert/inspect/transform)→ 补齐 9 种基础循环
- ❌ 没有左右方向权威与参数级 side 拒绝 → 补齐
- ❌ 没有 `execute_script` 逃生舱 → 补上但**默认关闭**
- ❌ 无 resources / prompts → 补齐
- ❌ 单 POST 无 session → 返回 `Mcp-Session-Id` 便于客户端做会话区分

### 3. `jasonjgardner/blockbench-mcp-plugin`

**吸取**
- 插件内 **Streamable HTTP** 形态与 `initialize` 返回 `instructions` 的做法
- **MCP resources + prompts**(本项目做了 8 篇 guide resource + 2 个 prompt)
- 插件内 UI 呈现:状态栏/对话框式的状态与令牌展示
- 声明式工具规格(名称 + 描述 + 参数 + 注解)与"每个工具都要有实现"的纪律(本项目用测试断言)

**抛弃**
- ❌ **GPL-3.0** → 本项目全部重写为 MIT
- ❌ `emulate_clicks` / `trigger_action` / `risky_eval` 这类模拟点击/任意求值的工具 → **不做**;需要覆盖时用 `list_actions` + `run_action`(命令级,不是鼠标级)
- ❌ 无鉴权 → 强制 Bearer + Origin/Host 校验
- ❌ 没有测试 → 95 个自动化测试(Vitest)
- ❌ 工具名与参数风格不统一 → 统一为动词_名词 + zod 契约

### 4. `vasyacullin-Blockbench-mcp`

**吸取**
- **token 握手拦截浏览器 drive-by** 的思路(本项目在 HTTP 层用 Origin/Host/令牌三道校验达到同样效果)
- **万能 action 桥**:`list_actions` / `get_action` / `run_action` + `select_action`,用命令级覆盖补足专用工具之外的功能
- `list_modes` / `set_mode`、`list_settings` / `get_setting` / `set_setting` 的宿主能力透出
- 默认端口/主机/超时环境变量化的配置思路(本项目改为插件设置 + 网关环境变量)

**抛弃**
- ❌ **GPL-3.0** → MIT 重写
- ❌ 纯 JS、无类型、无契约 → TS + zod
- ❌ 无 undo 封装 → 所有写操作进 `withUndo`
- ❌ 无 UV/纹理检查、无质量门 → 补齐
- ❌ 令牌要用户手抄且格式自定义 → 令牌进设置面板,客户端配置可直接复制
- ❌ 自研 TCP/NDJSON 协议(非标准)→ 改用标准 MCP over HTTP,stdio 交给标准网关

### 5. `Golub4ik-Official-blockbench-mcp`

**吸取**
- monorepo 形态(shared / plugin / gateway 三个包,职责清晰)
- 预构建产物随代码一起交付(本项目 `npm run build` 产出单文件插件 + 网关,无运行时依赖需要用户安装)
- 简单直白的 README 安装步骤(本项目在 README 里给出逐客户端配置片段)

**抛弃**
- ❌ 只有 5 个工具 → 95 个
- ❌ Socket.IO 传输(额外依赖 + 无标准 MCP)→ 标准 HTTP MCP + stdio 网关
- ❌ 无鉴权、无 undo、无质量门 → 全部补齐
- ❌ 无测试 → 95 个(Vitest)

---

## 发布到 npm(`@anningui/blockbench-mcp`)

包名已按你的命名空间配好:`packages/plugin/package.json` 里 `name = "@anningui/blockbench-mcp"`,
`publishConfig.access = "public"`(scoped 包首次发布必须显式 public)。

### 一次性准备

```bash
npm login                # 登录 npmjs 账号(需要拥有 anningui 这个 scope/组织)
npm whoami               # 确认身份
```

registry 已经固定在仓库根的 `.npmrc`,不依赖你机器的全局配置:

```ini
# .npmrc
registry=https://registry.npmjs.org/
access=public            # scoped 包默认私有,这里显式公开
```

`packages/plugin/package.json` 里也写了 `publishConfig: { access: "public", registry: "https://registry.npmjs.org/" }`,
所以即使换机器/换工具,发布目标也不会跑偏。校验:

```bash
pnpm config get registry        # → https://registry.npmjs.org/
```

### ⚠️ 不要在仓库根目录跑 `npm publish`

npm 在 workspace 根目录执行 publish 时,会把**根包 + 所有非 private 的 workspace 一起发**,
而且 `npm publish --prefix packages/plugin` 里的 `--prefix` 对 publish **无效**(只影响 `npm run`)。
踩过一次的现场:根包 `blockbench-mcp-pro@1.0.0` 被误发到 registry,而真正的插件包没发出去。

护栏(已配置):

| 包 | 状态 |
|---|---|
| 根 `blockbench-mcp-pro` | `private: true` |
| `@bbmcp/shared` | `private: true` |
| `@bbmcp/gateway` | `private: true` |
| `@anningui/blockbench-mcp` | **唯一可发布**(`publishConfig.access: public`) |

根脚本 `pnpm run publish` 已经写成 `cd packages/plugin && npm publish --access public`,
只会在插件目录里发布。

### 下架 / 弃用

```bash
# 1) 先看线上有什么
npm view <pkg> versions
npm view <pkg> time.created time.modified       # 判断是否还在 72 小时窗口内

# 2) 删掉某个版本(72 小时内;需要 --force;-dry-run 先预演)
npm unpublish <pkg>@<version> --force
npm unpublish <pkg>@<version> --force --dry-run

# 3) 整个包下架(仅剩一个版本、且没有别人依赖时)
npm unpublish <pkg> --force

# 4) 过了 72 小时就只能"弃用"而不是删除
npm deprecate <pkg>@<version> "误发布,请改用 @anningui/blockbench-mcp"
```

规则(npm 官方限制,不是本项目加的):

| 规则 | 说明 |
|---|---|
| 72 小时 | 发布时间超过 72 小时的版本**不能** `unpublish`,只能 `deprecate` |
| 无依赖者 | 被别的包依赖时不能下架 |
| 24 小时冷却 | 同名同版本下架后,短时间内不能再用同一个版本号发(改版本号即可绕过) |
| 权限 | 需要包的 owner/maintainer 身份;开了 2FA 要 `--otp=123456` |
| 下架 ≠ 撤回 | 下架不影响已装到本地 `node_modules` 的副本;`npm i` 缓存也可能命中旧的 |

### 每个版本的发布流程

```bash
cd blockbench-mcp-pro
npm run build            # rolldown 构建 → packages/plugin/dist/{blockbench_mcp.js,gateway.mjs}
npm run typecheck        # 可选的类型检查
npm run pack:check       # npm pack --dry-run,确认 tarball 内容
npm run publish          # = npm publish -w @anningui/blockbench-mcp --access public
```

版本号用 `npm version patch|minor|major -w @anningui/blockbench-mcp` 升(会自动改 package.json)。

### 包里有什么

`files` 白名单只放运行必需的东西(构建脚本、源码、测试都不会进 tarball):

| 文件 | 用途 |
|---|---|
| `dist/blockbench_mcp.js` | **给 Blockbench 的单文件插件**(self-contained,含 zod 与全部工具) |
| `dist/gateway.mjs` | stdio ⇄ HTTP 网关(bin 的实现) |
| `bin/blockbench-mcp.mjs` | CLI:`--plugin-path` / `--http-url` / `--cdn-url` / `--help`,不带参数时启动网关 |
| `README.md`、`LICENSE` | — |

包**没有任何 dependencies**(全部在构建时打进产物),用户 `npx` 不需要额外安装。

### 发布后用户可以这样装

```bash
npm i -g @anningui/blockbench-mcp     # 或直接用 npx
blockbench-mcp --plugin-path          # 打印插件绝对路径
```

不需要 clone 仓库就能拿到 Blockbench 插件。

---

## 接入 Blockbench

### 方式 1:本地文件(最常用)

```bash
npx -y @anningui/blockbench-mcp --plugin-path
# → /path/to/node_modules/@anningui/blockbench-mcp/dist/blockbench_mcp.js
```

1. Blockbench 桌面版 → `File ▸ Plugins ▸ Load Plugin from File` → 选上面那个文件
2. 弹网络权限时选 **Always allow for this plugin**(网关要监听 `net`)
3. 右下角出现 `Blockbench MCP ready → http://127.0.0.1:39742/mcp` 即成功
4. `Tools ▸ Start / Stop MCP Server`、`Tools ▸ MCP Server Status / Token` 可随时启停与取令牌

### 方式 2:从 URL 加载(不用装包)

发布到 npm 后,jsDelivr 会直接提供文件:

```
https://cdn.jsdelivr.net/npm/@anningui/blockbench-mcp/dist/blockbench_mcp.js
```

Blockbench → `File ▸ Plugins ▸ Load Plugin from URL` → 粘贴上面的地址。
(`npx -y @anningui/blockbench-mcp --cdn-url` 会打印它。)

### 拿令牌

`Settings ▸ General ▸ MCP Access Token`,或 `Tools ▸ MCP Server Status / Token` 一次看到
状态 + 令牌 + 可直接粘贴的客户端配置。**首次加载随机生成**,不是默认口令。

验证服务是否活着:

```bash
curl http://127.0.0.1:39742/health
# {"ok":true,"server":"blockbench-mcp-pro",...}
```

---

## 接入 AI 客户端

通用规则:**能发 HTTP 的客户端直接用 URL + Bearer 头;只能 stdio 的客户端用 bin 转发。**

| 客户端 | 传输 | 配置要点 |
|---|---|---|
| **pi**(pi-mcp-adapter) | HTTP 或 stdio | 见下面两段,写进 `~/.pi/agent/mcp.json` |
| Cursor | HTTP | `.cursor/mcp.json` 里 `url` + `headers.Authorization` |
| VS Code / Copilot | HTTP | `.vscode/mcp.json` 里 `url` + `headers` |
| Claude Code | HTTP | `claude mcp add ... --transport http <url> --header "Authorization: Bearer <token>"` |
| Claude Desktop | stdio(仅支持 stdio) | `command: node` + `args: [<gateway.mjs>]` + `env.BBMCP_TOKEN` |
| Cline / mcp-remote / Ollama | HTTP | 填 URL 与自定义头 |

### pi(你当前使用的,pi-mcp-adapter)

> 注意:adapter 读取的路径是 **`~/.pi/agent/mcp.json`**(`agent`,不是 `agents`)。
> 它也读项目级 `.mcp.json`、`~/.config/mcp/mcp.json`、`~/.agents/mcp.json`,
> 优先级:后者覆盖前者,`.pi/mcp.json` 最高。改完在 pi 里执行 `/reload`。

**推荐:HTTP 直连**(少一个进程,工具直接可用)

编辑 `~/.pi/agent/mcp.json`,在 `mcpServers` 里加:

```json
{
  "mcpServers": {
    "blockbench": {
      "type": "http",
      "url": "http://127.0.0.1:39742/mcp",
      "headers": {
        "Authorization": "Bearer <Blockbench 里的 MCP Access Token>"
      }
    }
  }
}
```

**可选:stdio 网关**(客户端只给 command/args 时用)

```json
{
  "mcpServers": {
    "blockbench": {
      "command": "npx",
      "args": ["-y", "@anningui/blockbench-mcp"],
      "env": {
        "BBMCP_URL": "http://127.0.0.1:39742/mcp",
        "BBMCP_TOKEN": "<Blockbench 里的 MCP Access Token>"
      }
    }
  }
}
```

本地开发(没发布 npm 时)把 command/args 换成本地脚本:

```json
{ "command": "node", "args": ["D:/Dev-Project/t/blockbench-mcp-research/blockbench-mcp-pro/gateway/index.mjs"],
  "env": { "BBMCP_TOKEN": "<token>" } }
```

**在 pi 里验证**

1. 重启 pi(或 `/reload`),执行 `/mcp` 应能看到 `blockbench`
2. 问它:「调用 blockbench 的 health」→ 应返回 `plugin_version`、`capabilities`、`uv_mode`
3. pi 的 adapter 是工具按需发现(search → describe → call),所以典型对话是:
   `mcp({search:"blockbench 建模"})` → `mcp({tool:"apply_geometry_batch", args:{...}})`

**给模型的操作提示(可直接粘进 pi 的提示或 skill):**

```
Blockbench 相关任务先调 health → get_project_summary → get_guide(topic:"modeling")。
细节用 add_hollow_volume / generate_array / extrude_chain / voxelize_matrix / add_wing。
贴图前必须 audit_complexity 不再是 too_primitive,并且 check_model 0 error。
贴图流程:pack_box_uv → shade_model_base → paint_face_features → audit_texture_quality。
动画用 generate_animation,然后 set_timeline_time + capture_views 看一眼。
有参考图就 compare_reference 迭代到 match_percent >= 85。
声明"做完了"之前先 request_review;pending 和超时都不算通过。
```

### Cursor / VS Code

```jsonc
// .cursor/mcp.json 或 .vscode/mcp.json
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

### Claude Code

```bash
claude mcp add blockbench --transport http http://127.0.0.1:39742/mcp   --header "Authorization: Bearer <token>"
```

### Claude Desktop(无 HTTP 支持 → 走网关)

```jsonc
{
  "mcpServers": {
    "blockbench": {
      "command": "node",
      "args": ["<你的项目路径>/blockbench-mcp-pro/gateway/index.mjs"],
      "env": { "BBMCP_URL": "http://127.0.0.1:39742/mcp", "BBMCP_TOKEN": "<token>" }
    }
  }
}
```

### 排错

| 现象 | 原因 / 处理 |
|---|---|
| `401 Unauthorized` | 令牌不对或没带 `Authorization: Bearer <token>`;从 `Tools ▸ MCP Server Status / Token` 重取 |
| `Cannot reach Blockbench on ...` | Blockbench 没开 / 插件没加载 / 服务停了(`Tools ▸ Start MCP Server`) |
| 浏览器 / 网页工具报 403 | 有意为之:带 `Origin` 的请求一律拒绝,避免网页 drive-by |
| 端口被占用 | `Settings ▸ General ▸ MCP Server Port` 换端口,并同步改客户端 `BBMCP_URL` |
| 工具里出现 `E_SCOPE_DENIED` | 需先调 `propose_scoped_directory` 并在 Blockbench 里点 Allow |
| 工具里出现 `E_AUTH_FAILED`(execute_script) | 该工具默认关闭,去 `Settings ▸ General ▸ Allow execute_script` 打开 |


---

## 安全模型

| 层 | 措施 | 修掉了谁的弱点 |
|---|---|---|
| 网络 | 只绑定 `127.0.0.1` | 全部 |
| 鉴权 | 首次加载随机生成 24 字节令牌,`Authorization: Bearer <token>` 强制校验;`x-mcp-secret` 亦接受 | sosadly(无令牌)、jasonjgardner(无鉴权)、SwagRee(弱默认口令) |
| CSRF / drive-by | 带 `Origin` 头的请求一律 403;`Host` 非回环一律 403(DNS rebinding) | SwagRee、jasonjgardner、Golub4ik |
| 请求体 | 仅 `application/json`,上限 8MB | — |
| 文件系统 | 读写必须落在 `propose_scoped_directory` 用户批准过的目录内,越界路径直接拒绝 | sosadly(任意路径)、vasyacullin、Golub4ik |
| 代码执行 | `execute_script` 默认关闭,需用户在设置里显式打开,且有超时上限 | sosadly(默认开) |
| 危险 UI 自动化 | 不提供 `emulate_clicks` / `trigger_action` / `risky_eval` | jasonjgardner |
| 信任边界 | README 明说:MCP 客户端(含被提示注入的模型)可调用全部工具;`execute_script` 打开后拥有 Blockbench 全权限 | 全部 |

---

## 质量门与推荐工作流

```
health ─ get_project_summary ─ get_guide(modeling)
   │
create_project ─ scaffold_biped / apply_geometry_batch        ← 主形体
   │
add_hollow_volume / generate_array / extrude_chain / add_wing / voxelize_matrix  ← 真细节
   │
audit_complexity  ← 必须不再是 too_primitive
check_model       ← 必须 0 error(z-fighting / 空组 / 未贴图面 / 越界 UV)
check_sides       ← 左右名字与坐标必须一致
check_rig         ← 3 段肢体、无游离 cube
   │
pack_box_uv ─ get_uv_layout(out_of_bounds=0) ─ shade_model_base ─ paint_face_features
   │                                    └─ get_texture_revision → expected_revision
audit_texture_quality ─ check_model
   │
generate_animation ─ set_timeline_time ─ capture_views        ← 看一眼再改
   │
compare_reference ≥ 85(有参考图时)
   │
request_review → 用户点 Approve 才算完成(pending / 超时都不算)
```

---

## 目录结构

```
blockbench-mcp-pro/
├── docs/reference-projects.md   # 五个参考项目的逐项阅读笔记
├── packages/
│   ├── shared/       # 协议常量、zod 工具目录、8 篇 playbook、全部纯逻辑
│   │   ├── src/pure/ #   vec / color / uv / generate / audit —— 无宿主依赖,可单测
│   │   └── test/     #   30 个纯逻辑测试
│   └── plugin/       # Blockbench 插件
│       ├── src/host.ts     # 宿主端口(undo/纹理/画布/格式/截图/对话框)
│       ├── src/bb.ts       # 元素与工程读写 + 批量落地 + side 守卫
│       ├── src/session.ts  # 文件作用域 / 参考图 / 待审卡片 / 活动日志
│       ├── src/http.ts     # net 上的 HTTP + 鉴权 + Origin/Host 校验
│       ├── src/rpc.ts      # MCP JSON-RPC + resources + prompts + 图片内容块
│       ├── src/dispatch.ts # 校验 → 执行 → 统一信封
│       ├── src/tools/      # 按域拆分的 95 个工具
│       ├── types.d.ts      # 宿主类型:官方 blockbench-types + 少量浏览器 API 补齐(无 any 全局)
│       ├── bin/            # npm bin:blockbench-mcp(网关 + --plugin-path/--cdn-url)
│       ├── build/           # rolldown.config.ts + 它自己的 tsconfig(types: node)
│       ├── test/           # 宿主 mock + 分发/HTTP/产物/打包 测试
│       └── dist/blockbench_mcp.js  # 交付给用户的单文件插件
└── gateway/          # stdio ⇄ HTTP 零依赖网关(+ 3 个测试)
```

---

## 真机验证(需要 Blockbench)

**先说清楚自动化测试的边界**:`pnpm test` 里的 95 个测试跑的是**纯逻辑 + 我写的 mock 宿主**
(假的 `Cube`/`Group`/`Texture`/`Codecs`,假的截图 data URL)。它验证的是
参数校验、批次语义、UV 打包数学、审计规则、HTTP/鉴权/MCP 协议、交付产物能否加载,
**不验证**真 Blockbench 的 `mapAutoUV`、`Texture.edit`、undo 行为、离屏渲染、权限对话框与文件导出。
所以 mock 测试**不会**产出 `.bbmodel` 之类的模型文件。

要真跑一遍并拿到真实产物,用 `scripts/live-smoke.mjs`:它对着**正在运行的 Blockbench** 里的插件
走完整流程并把结果落盘。

```bash
# 1) 在 Blockbench 里加载插件(或把 dist/blockbench_mcp.js 放进 Blockbench 的 plugins 目录后重启)
#    File ▸ Plugins ▸ Load Plugin from File → packages/plugin/dist/blockbench_mcp.js
#    允许 net 权限,等到提示 "Blockbench MCP ready"

# 2) 跑真机冒烟(令牌见 Tools ▸ MCP Server Status / Token)
pnpm run smoke:live -- --token <MCP Access Token> --out ./out/live-smoke

# 或
BBMCP_TOKEN=<token> node scripts/live-smoke.mjs
```

它会依次执行并**断言**:health → create_project → apply_geometry_batch(side 守卫) →
add_hollow_volume / generate_array / extrude_chain → check_model / check_sides / check_rig / audit_complexity
→ ensure_texture → pack_box_uv → get_uv_layout(越界/重叠必须为 0)→ shade_model_base →
paint_face_features → audit_texture_quality → generate_animation(双腿对侧相位)→ set_timeline_time →
capture_views(**PNG 落盘**)→ analyze_view_silhouette → propose_scoped_directory →
`save_project`(**真 .bbmodel**)→ `export_model`(**真 .geo.json**)。

产物(默认 `out/live-smoke/`):

| 文件 | 说明 |
|---|---|
| `view-*.png` | 真渲染的多视角截图 |
| `smoke.bbmodel` | 真工程文件,可直接拖回 Blockbench |
| `smoke.geo.json` | 用当前格式 codec 导出的几何 JSON |
| `report.json` | 本次运行的摘要(版本/尺寸/UV 统计/动画名) |

常用参数:`--no-blocks`(只做基础形体)、`--no-save`(不弹权限对话框)、`--views north,east,iso`、`--url`、`--out`。

## 开发与验证

npm 与 pnpm 都支持(仓库里提交的是 `pnpm-lock.yaml`;用 npm 时它会自己生成 `package-lock.json`):

```bash
# npm
npm install
npm run verify          # build → typecheck → test

# pnpm(本仓库用 pnpm 开发)
pnpm install
pnpm run verify
```

**pnpm 的两个必要配置**(已写进 `pnpm-workspace.yaml`,否则会踩坑):

| 配置 | 为什么必须 |
|---|---|
| `packages: [packages/*, gateway]` + `linkWorkspacePackages: true` | pnpm 不认 package.json 的 `"workspaces"` 字段;没有这个文件,`@bbmcp/shared` 会被当成外部依赖去 registry 找 → `ERR_PNPM_FETCH_404` |
| `strictDepBuilds: false` | pnpm 11 默认 `true`:任何"被忽略的构建脚本"都会直接中断安装(`ERR_PNPM_IGNORED_BUILDS`)。我们对 `electron`(blockbench-types 的依赖)是**有意忽略**的,只取它的 `.d.ts` |

安装时看到这一段是预期的、无害的:

```
Ignored build scripts: electron@40.10.6.
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
```

> 根脚本用 `npm --prefix <dir> run …` 而不是 `npm run -w <name>`,这样 npm 与 pnpm 两种 node_modules 布局下都能跑。

- `pnpm run build` — shared(tsc)+ `rolldown -c build/rolldown.config.ts`(插件/测试入口/网关三份产物)
- `npm run typecheck` — 三个包的 TS 检查(strict)
- `pnpm test` — **95 个测试**,Vitest 并行跑,**全套约 3 秒**:

测试跑在 **Vitest**(`vitest run`,每个测试文件独立进程 + 全局 mock 隔离),文件之间并行,整套约 3 秒。

| 套件 | 数量 | 验证内容 |
|---|---|---|
| `packages/shared/test/pure.test.mjs` | 30 | 向量/旋转、颜色、UV 映射与翻转、shelf 打包不重叠、体素化/壳体/阵列/骨链/翼、check_model、复杂度门、左右门、骨架门、测量、轮廓 IoU、revision 哈希、面质检、工具目录完整性 |
| `packages/plugin/test/dispatch.test.mjs` | 39(慢,约 30s) | 用 mock 宿主**真实执行**每个工具:批量几何单步 undo、side 拒绝、生成器落地、pack UV 不重叠、面局部绘制的像素往返(revision 一致)、过期 revision 被拒、贴图质检、动画生成的对侧相位、审查 pending→回答、参考图比对、action 桥、设置/插件/历史 |
| `packages/plugin/test/http.test.mjs` | 17 | **真实 net 服务器 + fetch/原始 socket**:无令牌 401、错令牌 401、Origin 403、Host(DNS rebinding)403、非 JSON 415、initialize/session id、tools/list schema、tools/call 信封、图片内容块、resources/prompts、JSON-RPC 错误码、202/204/405 |
| `packages/plugin/test/package.test.mjs` | 4 | **打包体检**:文件名 ↔ 插件 id 必须一致(Blockbench 硬性要求)、CLI 各开关、CLI 真的把 stdio 转成 HTTP(踩过坑,故加断言) |
| `packages/plugin/test/bundle.test.mjs` | 2(快) | **直接加载交付产物** `dist/blockbench_mcp.js`,调用 Blockbench 会调的 `onload`,再访问它真的起在回环上的端点(令牌随机生成、401、tools/list) |
| `gateway/test/stdio.test.mjs` | 3 | stdio 网关对着**真实插件 HTTP 服务端**跑通 initialize → tools/list → tools/call → resources/read;错令牌与不可达都返回合法 JSON-RPC 错误 |

调试插件时可只跑单个套件,例如:

```bash
# 最快的一次冒烟(约 1s):确认交付产物能加载、能起服务、CLI 可用
pnpm --filter @anningui/blockbench-mcp exec vitest run test/bundle.test.mjs test/package.test.mjs
```

---

## 类型来源

插件的宿主类型来自官方 **`blockbench-types`**(devDependency),不是手写 any:

```jsonc
// packages/plugin/tsconfig.json
"types": ["blockbench-types"],   // Cube / Group / Texture / Animation / Preview / Undo / Canvas /
                                 // Project / Format(s) / BarItems / Modes / Dialog / Action /
                                 // Codecs / Settings / Plugin(s) / newProject ... 全部是真类型
"strict": true, "noImplicitAny": true
```

插件包里有**两个 tsconfig**,因为两类文件的类型环境完全不同:

| 配置 | 覆盖 | types |
|---|---|---|
| `packages/plugin/tsconfig.json` | `src/**`(跑在 Blockbench 渲染进程里) | `blockbench-types`(无 node、无 DOM) |
| `packages/plugin/build/tsconfig.json` | `build/rolldown.config.ts`(跑在 Node 里) | `node` |

`pnpm run typecheck` 会把两个都跑一遍。构建配置刻意放在**独立目录** `build/`:
TS server 是按"离文件最近的 `tsconfig.json`"给文件归项目的,`tsconfig.node.json` 这种命名配置
除非被 solution 引用否则不会被采用,所以用目录隔离最稳。

`packages/plugin/types.d.ts` 只补两类官方包没有的东西:

1. `require`(桌面端 scoped 模块)+ `Plugin.register` / `new Animation()` 两个**只有类型没有值**的运行时入口(类型仍取自官方包,例如动画片段用官方的 `_Animation`)
2. 极简浏览器 API —— 本项目刻意不引 `lib.dom`(Blockbench 的 `Animation`/`Image` 与 DOM 同名),只声明用到的那几个成员

> `blockbench-types` 依赖 `electron`,npm 安装时会去下 Electron 二进制。CI/离线环境用
> `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install` 跳过(类型不受影响);pnpm 侧见 `pnpm-workspace.yaml` 的 `ignoredBuiltDependencies`。

**three.js 不是本项目的依赖,也不会被下载。**

| 视角 | three 会被下载吗 | 说明 |
|---|---|---|
| 使用者(从 npm 装) | **不会** | 发布包 `dependencies` 为空。实测:`npm i` 后 `node_modules/` 里只有 `@anningui/blockbench-mcp`,tarball 88.8 KB |
| 贡献者(克隆本仓库) | **不会**(经 override) | `blockbench-types → wintersky → three` 只是 dev 传递依赖;pnpm overrides 把它指向仓库内的空壳 `stubs/three`,干净安装体积 119 MB → **91 MB** |
| 运行时 | — | three 由 Blockbench 自己提供,插件只调用它递过来的对象 |

插件代码不引用 `THREE`,产物里 0 处 three;唯一碰到相机的地方(`captureView` 的正交相机)用本地结构类型
`OrthoCamera` 收窄,连 three 的**类型**也不依赖 —— 所以空壳替代不会影响类型检查。

> 为什么不干脆去掉 `blockbench-types`?那就要回到手写类型(即 `any` 全局),得不偿失。
> 空壳只影响 wintersky 的**运行时**(我们从没执行过它),`.d.ts` 一个不缺。

这套类型当场抓出了 5 个真实 API 错误:`Canvas.updateSelection`(应为 `updateSelected`)、
`Settings.add`(应为 `new Setting(id, data)`)、`Timeline.setAnimation`(应为 `animation.select()`)、
`Texture.setDataURL`(不存在)、`Screencam.NoAAPreview.resize`(不存在,尺寸由 `screenshotPreview` 的 options 决定)。

## 已知取舍

诚实列出为了保持"少而正确"而故意没做的东西,以及升级路径:

1. **人审卡片的 UI 用的是宿主原生对话框**(可带图片行),不是 sosadly 那种自定义面板。升级路径:换成一个常驻面板,带缩略图、评论框与活动日志。当前的 **pending + wait_review 轮询协议已经是最终形态**,换 UI 不影响工具契约。
2. **不做网格(mesh)编辑、骨骼权重、PBR 材质实例**这类 jasonjgardner 有的能力——它们需要一整套顶点级工具,和"方块建模"主线是两条产品线。需要时用 `execute_script` 或 `run_action` 过渡。
3. **没有 SSE 流式响应**:插件内是单次 JSON POST,足够所有主流 HTTP MCP 客户端;标准 SSE 会显著增加插件里的 HTTP 实现复杂度。stdio 客户端走网关。
4. **`install_plugin` 依赖宿主是否暴露安装 API**;不暴露时返回明确提示让用户手动安装(而不是假装成功)。
5. **`mapAutoUV` / 截图 / 对话框等宿主 API 在测试里的 mock 只覆盖被用到的子集**;真机行为以 Blockbench 5.1+ 为准,`health` 会报告 `blockbench_supported`。

## License

MIT — 本项目为独立重写,未复制任何 GPL 项目代码。

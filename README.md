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
8. [安全模型](#安全模型)
9. [质量门与推荐工作流](#质量门与推荐工作流)
10. [目录结构](#目录结构)
11. [开发与验证](#开发与验证)
12. [已知取舍](#已知取舍)

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
   / Claude Code     │  │ Blockbench MCP 插件(单文件 esbuild 产物)│  │
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
npm run build
# 产物:packages/plugin/dist/blockbench_mcp.js
```

### 2. 在 Blockbench 里加载

1. 打开 **Blockbench 桌面版** → `File ▸ Plugins ▸ Load Plugin from File` → 选 `packages/plugin/dist/blockbench_mcp.js`
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
| **本项目 `blockbench-mcp-pro`** | **插件内 HTTP MCP + stdio 网关(双通道)** | **TS + esbuild + zod 契约,全纯函数可测** | **随机 Bearer + Origin/Host/Content-Type 校验 + 文件作用域** | **95** | **MIT** | 上述优点的合集,并把每条缺点当成设计约束 |

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
| 自动化测试 | 🟡(工具目录) | ✅(协议+宿主 mock) | ❌(无) | 🟡 | ❌ | ✅(**91 个**,含交付产物/真实 HTTP/stdio) |
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
- ❌ 没有测试 → 91 个自动化测试
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
- ❌ 无测试 → 91 个

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
│       ├── test/           # 宿主 mock + 39 分发测试 + 17 HTTP 测试 + 2 产物冒烟测试
│       └── dist/blockbench_mcp.js  # 交付给用户的单文件插件
└── gateway/          # stdio ⇄ HTTP 零依赖网关(+ 3 个测试)
```

---

## 开发与验证

```bash
npm install
npm run verify     # build → typecheck → test(一步跑完全部)
```

- `npm run build` — 编译 shared(tsc)、插件(esbuild 单文件 + 测试用 ESM)、网关语法检查
- `npm run typecheck` — 三个包的 TS 检查(strict)
- `npm test` — **91 个测试**:

| 套件 | 数量 | 验证内容 |
|---|---|---|
| `packages/shared/test/pure.test.mjs` | 30 | 向量/旋转、颜色、UV 映射与翻转、shelf 打包不重叠、体素化/壳体/阵列/骨链/翼、check_model、复杂度门、左右门、骨架门、测量、轮廓 IoU、revision 哈希、面质检、工具目录完整性 |
| `packages/plugin/test/dispatch.test.mjs` | 39 | 用 mock 宿主**真实执行**每个工具:批量几何单步 undo、side 拒绝、生成器落地、pack UV 不重叠、面局部绘制的像素往返(revision 一致)、过期 revision 被拒、贴图质检、动画生成的对侧相位、审查 pending→回答、参考图比对、action 桥、设置/插件/历史 |
| `packages/plugin/test/http.test.mjs` | 17 | **真实 net 服务器 + fetch/原始 socket**:无令牌 401、错令牌 401、Origin 403、Host(DNS rebinding)403、非 JSON 415、initialize/session id、tools/list schema、tools/call 信封、图片内容块、resources/prompts、JSON-RPC 错误码、202/204/405 |
| `packages/plugin/test/bundle.test.mjs` | 2 | **直接加载交付产物** `dist/blockbench_mcp.js`,调用 Blockbench 会调的 `onload`,再访问它真的起在回环上的端点(令牌随机生成、401、tools/list) |
| `gateway/test/stdio.test.mjs` | 3 | stdio 网关对着**真实插件 HTTP 服务端**跑通 initialize → tools/list → tools/call → resources/read;错令牌与不可达都返回合法 JSON-RPC 错误 |

调试插件时可只跑单个套件,例如:

```bash
npm run build -w @bbmcp/plugin && node --test packages/plugin/test/dispatch.test.mjs
```

---

## 已知取舍

诚实列出为了保持"少而正确"而故意没做的东西,以及升级路径:

1. **人审卡片的 UI 用的是宿主原生对话框**(可带图片行),不是 sosadly 那种自定义面板。升级路径:换成一个常驻面板,带缩略图、评论框与活动日志。当前的 **pending + wait_review 轮询协议已经是最终形态**,换 UI 不影响工具契约。
2. **不做网格(mesh)编辑、骨骼权重、PBR 材质实例**这类 jasonjgardner 有的能力——它们需要一整套顶点级工具,和"方块建模"主线是两条产品线。需要时用 `execute_script` 或 `run_action` 过渡。
3. **没有 SSE 流式响应**:插件内是单次 JSON POST,足够所有主流 HTTP MCP 客户端;标准 SSE 会显著增加插件里的 HTTP 实现复杂度。stdio 客户端走网关。
4. **`install_plugin` 依赖宿主是否暴露安装 API**;不暴露时返回明确提示让用户手动安装(而不是假装成功)。
5. **`mapAutoUV` / 截图 / 对话框等宿主 API 在测试里的 mock 只覆盖被用到的子集**;真机行为以 Blockbench 5.1+ 为准,`health` 会报告 `blockbench_supported`。

## License

MIT — 本项目为独立重写,未复制任何 GPL 项目代码。

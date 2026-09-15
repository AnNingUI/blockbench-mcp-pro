# 五个参考项目的逐项分析

这份文档记录实际读到的内容(README + 源码),后面 README 里的三张区别表就是从这里得出的。

---

## 1. `repos/blockbench-mcp` — sosadly(MIT,71 工具)

**结构**:`src/{index,client,tools}.ts`(外置 Node stdio MCP 服务端)+ `plugin/blockbench_mcp.js`(约 7250 行单文件桥接插件,HTTP `127.0.0.1:8787`)+ `test/*.test.js`。

**读到的关键实现**
- `plugin/blockbench_mcp.js`:`commands` 对象把每个 action 映射到 Blockbench API;`checkRequest()` 明确拒绝带 `Origin` 的请求、非回环 `Host`(防 DNS rebinding)、非 JSON body;`MAX_BODY` 上限。
- 生成器:`voxelizeMatrix`(字符矩阵→cube,`merge_adjacent` 合并行)、`add_hollow_volume`(六面壳体 + `open_faces` + cavity 返回)、`generate_array`(linear/radial/grid + jitter + size_decay + `depth_stagger` 抗 z-fighting)、`extrude_chain`(可选每段一根骨,返回 tip)、`add_wing`(arm→forearm→手指骨 + 连续膜)。
- 质量门:`auditComplexity`(方块预算 prop/character/hero、monolith 占比、micro 密度、bone depth、`ready_for_texturing`)、`checkModel`、`checkSides`、`checkRig`(两段肢体判为不可动画、pivot 远离关节)。
- 人审门:`request_review` / `ask_user` 返回 `pending:true` + `review_id`,`wait_review(review_id)` 轮询,配合插件内 "MCP Copilot" 面板(Approve / Needs changes + 评论)。这是解决"MCP 单次请求超时 vs 分钟级人审"的正确设计。
- 参考匹配:`compare_reference` 渲染模型 + 参考图 → 轮廓 IoU + `aspect_delta_pct` + `ref_only_pct`(缺的质量)/`model_only_pct`(多的质量)+ `[reference | model | overlay]` 合成图。
- 方向权威:`get_orientation` / `which_side` / `check_sides` + `add_cube`/`add_group` 的 `side:"left"|"right"` 参数级拒绝;前视图镜像说明。
- `coerceArgs()`:把客户端发成字符串的数组/对象/JSON 文本解开。

**判断**
- ✅ 最"会建模"的一个:生成器 + 质量门 + 人审 + 参考比对,四件套齐全。
- ❌ 桥接无令牌(只靠 Origin/Host 挡住浏览器,挡不住本机其他程序);`execute_script` 默认开;保存可写任意路径;插件是巨型单文件、无类型、无契约;无 UV 布局机检、无纹理版本控制;必须额外跑一个 Node 进程。

**本项目吸收**:全部生成器与质量门(重写为纯函数)、人审 pending/轮询协议、参考比对、方向体系、playbook、参数强制转换。
**本项目修掉**:随机 Bearer + 文件作用域 + `execute_script` 默认关 + TS/zod 拆分 + UV 布局与 revision + 进程内主通道。

---

## 2. `repos/BlockBenchMCP` — SwagRee(MIT,58 指令 + health)

**结构**:npm workspaces `packages/shared`(zod 契约 + guides + 测试)+ `packages/plugin`(esbuild 打成单文件 IIFE 插件,插件内进程起 HTTP MCP,默认 39741)。

**读到的关键实现**
- `packages/plugin/src/mcp/{net,http-server,rpc,server}.ts`:用宿主授予的 `net` 模块手写 HTTP,只支持 `POST /mcp` 单次 JSON-RPC(明确拒绝 SSE),`Bearer` 校验(支持 `x-mcp-secret`),`initialize/tools/list/tools/call/resources`(无 prompts),并把结果里的 `data_url` 抽成 MCP image 内容块。
- `src/host/*`:端口化封装 —— `undo-port`(5.1 正确的 `initEdit/finishEdit/cancelEdit`,把新建元素并进 finish、失败回滚)、`texture-port`、`canvas-port`、`format-port`、`preview-port`(离屏 `Screencam.NoAAPreview` 多视角截图,不动用户相机)、`node-modules`。
- `src/paint/*`:UV 模式解析(box/face,`java_block` 必须 face)、`planUvPack` 式 shelf 打包、`getUvLayout`(越界/重叠/密度/翻转/rotation)、`getUvMap` 标注预览、**面空间映射**(尊重面 `rotation` 与 UV 翻转)→ `paint_face_grid` / `get_face_grid` 精确像素往返、`texture-revision`(FNV-1a 内容哈希 + `expected_revision` 乐观并发)、`texture-quality`(调色板过量/弱底色/孤立像素/玻璃边缘)、`material-set`(base/emissive/normal/specular 一致性)。
- `src/commands/scope-export.ts`:**`propose_scoped_directory`** + `scopedTarget()` 路径越界拒绝,`save_project` / `export_model` / PNG IO 全在此作用域内。
- `src/geometry/*`:`transform_elements`(相对平移/缩放/绕 pivot 旋转,**非均匀缩放旋转体直接拒绝**,避免剪切)、`array_cubes`/`radial_array_cubes`、`duplicate_hierarchy`、`measure_model`(层级与旋转感知)、`audit_symmetry`、`create_limb`、`scaffold_biped`(真实关节 pivot + 按 UV 模式打包 + 返回 `check_model`)。
- 测试:`shared` 侧协议/契约测试 + 插件侧 desktop-host mock 回归;`test:e2e` 用 python 脚本对真实 Blockbench 跑一遍。

**判断**
- ✅ 工程质量最高:契约、验证、UV/纹理精度、作用域安全、undo、真实测试。
- ❌ 没有程序化生成器;没有人审门/参考比对;动画只有 upsert/inspect/transform,没有基础循环生成;默认密钥硬编码 `dev-local-secret`;没有 `execute_script`;没有 resources/prompts。

**本项目吸收**:进程内 HTTP MCP 形态、zod 契约与统一信封/错误码、UV 模式与 UV 全套、面局部绘制与网格往返、revision token、作用域目录、离屏截图与轮廓分析、undo 端口、材质通道检查。
**本项目修掉**:随机令牌、补生成器/人审/参考比对/动画生成/方向门、resources+prompts、门控逃生舱。

---

## 3. `repos/blockbench-mcp-plugin` — jasonjgardner(GPL-3.0,110 工具)

**结构**:Bun 构建;`lib/factories.ts`(声明式工具/资源/prompt 规格 + 注册)、`lib/sessions.ts`(会话管理 + ping/超时)、`server/net.ts`(手写 HTTP + `WebStandardStreamableHTTPServerTransport` + TCP/SSE keepalive)、`server/tools/*`(project/cubes/element/mesh/armature/paint/texture/uv/animation/display/material-instances/history/export/import/ui/hytale)、`server/resources/*`、`server/prompts/*`、`ui/*`(面板、状态栏、工具测试对话框)。

**读到的关键实现**
- `initialize` 只允许创建会话;session id + `Mcp-Session-Id`;30 分钟不活跃超时 + 30s MCP ping + SSE 心跳。
- 工具面极大:网格(球/柱/挤出/刀/合并顶点/细分)、骨骼权重、PBR 材质实例、显示变换(display)、撤销/重做/存档点、相机、绘制工具(渐变/笔刷/填充/形状)、贴图分组/图层、`from_geo_json`。
- 有 `resources`/`prompts`/`annotations`(readOnlyHint/destructiveHint)。
- ⚠️ 同时有 `emulate_clicks` / `trigger_action` / `risky_eval`。

**判断**
- ✅ 工具面最广;resources/prompts 与声明式规格值得学;会话保活考虑得最细。
- ❌ GPL-3.0;无鉴权;`emulate_clicks`/`risky_eval` 属于危险面;`"test": "echo Error: no test specified && exit 1"`(无测试)。

**本项目吸收**:Streamable HTTP 形态 + `initialize.instructions`、resources(8 篇 guide + 活动日志)、prompts(2 个)、声明式工具规格与"每个工具必须有实现"的测试断言、状态展示对话框。
**本项目修掉**:MIT 重写、强制鉴权、不做 UI 点击类工具(改用命令级 `list_actions`/`run_action`)、91 个测试。

---

## 4. `repos/vasyacullin-Blockbench-mcp` — deadzi(GPL-3.0,41 工具)

**结构**:`mcp/server`(Node stdio MCP,`tools.js` 41 个工具 + `bridge-client.js`)+ `mcp/plugin/blockbench_mcp_bridge.js`(插件内 TCP/NDJSON 服务端,19888)。

**读到的关键实现**
- **token 握手**:每个连接第一行必须是 `{"type":"auth","token":...}`,否则断开 —— 浏览器跨域请求必然先发 HTTP 前导,解析失败即被丢弃,从而关掉 drive-by/CSRF 面。令牌存在 `localStorage`,由 `MCP Bridge: Status` 展示。
- **万能 action 桥**:`bb_list_actions`(枚举全部 BarItem)/`bb_get_action`/`bb_run_action`(带 `value` 支持 toggle/select/slider)+ `bb_select` + `bb_set_mode` + settings 读写,配 `bb_execute_script` 达到"UI 全覆盖"。
- 工具集:add_cube/add_group/add_mesh/edit/delete/duplicate/set_parent、贴图(fill/rect/pixels/get/apply/set_face_uv/auto_uv/get_uv)、动画(create/list/select/add_keyframe/set_timeline_time)、render_view(单视角)。

**判断**
- ✅ 安全握手思路清晰;action 桥 + settings 是最省力的"覆盖长尾"方案;`execute_script` 在文档里明确了权限风险。
- ❌ GPL;纯 JS 无类型;无 undo 封装;无 UV 布局检查/纹理版本;无质量门/生成器/人审/参考比对;令牌要用户手抄;自研 TCP/NDJSON(非标准 MCP 传输)。

**本项目吸收**:令牌拦截 drive-by 的思路(落在 HTTP 的 Origin/Host/令牌三校验)、action 桥与 settings/modes、门控的 `execute_script`。
**本项目修掉**:MIT、TS+zod、undo 封装、UV/纹理/质量门全补齐、令牌免手抄(设置面板 + 可复制配置)、标准 MCP over HTTP。

---

## 5. `repos/Golub4ik-Official-blockbench-mcp` — (ISC,~5 工具)

**结构**:pnpm workspaces `apps/mcp-plugin`(Socket.IO 客户端插件)+ `apps/mcp-server`(stdio MCP)+ `packages/shared`(类型);changesets 发布,GitHub Release 附带预构建 `mcp_socketio_plugin.js`。

**读到的关键实现**
- Socket.IO 常驻连接(9999),插件侧有 "MCP Commands" 面板显示命令历史与连接状态;工具只有 hello / get_project_info / list_elements / add_cube / remove_element。
- README 把"从发布页下载预构建插件"作为零构建路径。

**判断**
- ✅ 唯一做了 monorepo + 预构建产物交付的项目,README 安装步骤清楚。
- ❌ 工具只有 5 个;Socket.IO 额外依赖且非标准 MCP 传输;无鉴权/undo/质量门/测试。

**本项目吸收**:monorepo(shared/plugin/gateway)、预构建产物作为交付物、逐客户端配置片段式 README。
**本项目修掉**:标准 HTTP MCP + stdio 网关、95 个工具、鉴权/undo/质量门/91 测试。

---

## 横向结论

| 维度 | 最好的那个 | 本项目怎么做 |
|---|---|---|
| MCP 传输形态 | SwagRee / jasonjgardner(插件内进程) | 插件内进程 HTTP MCP 作主通道 + 零依赖 stdio 网关作兼容通道 |
| 让模型真的会建模 | sosadly(生成器 + 质量门 + 人审 + 参考比对) | 全部吸收,并改为可单测纯函数 |
| 工程质量 | SwagRee(契约/UV/作用域/undo/测试) | 全部吸收,并补齐它缺的生成器与人审 |
| 安全 | vasyacullin(握手)+ sosadly(Origin/Host)+ SwagRee(作用域) | 三者合并:随机 Bearer + Origin/Host/CT 校验 + 作用域 + 门控脚本 |
| 覆盖长尾 | vasyacullin(action 桥)+ jasonjgardner(resources/prompts) | 两者都做,但拒绝 UI 点击类危险工具 |
| 测试 | SwagRee(宿主 mock) | 91 个:纯逻辑 + 分发 + 真实 HTTP + 交付产物冒烟 + stdio 网关 |
| 许可 | MIT / ISC | MIT,全部重写,不含 GPL 代码 |

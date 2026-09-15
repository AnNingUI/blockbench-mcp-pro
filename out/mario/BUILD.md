# 马里奥风格化模型 — 真机建模记录

全部通过 pi 里的 Blockbench MCP(`tools/call`)在 **Blockbench 5.1.6 + 插件 1.0.1** 上完成,
每一步都跑了质量门并按渲染结果迭代。

## 参数文件

| 文件 | 内容 |
|---|---|
| `base.json` | 8 根骨 + 17 个 cube 的初版 blockout |
| `details1.json` | 细节层 1:肩带 / 领子 / 裤脚 / 鬓角 / 手套口(9 个 cube) |
| `moustache.json` / `fix1-moustache.json` | 胡子(字符矩阵体素化) |
| `shade.json` | 8 条区域上色规则 |
| `face-paint.json` → `face-paint3.json` | 脸部绘制(眼睛 / 眉毛 / 帽子正面的 M)的迭代 |
| `fix1-geometry.json` | 第一轮比例修正(头放大 / 鼻子 / 帽子) |

## 调用序列(可复现)

```bash
M="node scripts/mcp-call.mjs"

# 1) 先读指南,再建工程
$M get_guide '{"topic":"detailing"}'
$M create_project '{"format":"bedrock","name":"mario","texture_width":64,"texture_height":64}'

# 2) blockout + 细节层
$M apply_geometry_batch "$(cat out/mario/base.json)"
$M apply_geometry_batch "$(cat out/mario/details1.json)"
$M voxelize_matrix "$(cat out/mario/fix1-moustache.json)"     # 胡子:像素画 → cube
$M generate_array '{"mode":"linear","count":2,"element_size":[1.4,1.4,0.9],
  "start":[-1.7,12.4,-4.3],"end":[1.7,12.4,-4.3],"anchor":"center",
  "name_prefix":"button","parent":"body"}'                     # 扣子

# 3) 质量门(每次改完都跑)
$M check_model            # errors 0
$M check_sides            # 不符 0 / 缺配对 0
$M audit_complexity '{"target":"prop"}'   # acceptable,0 monolithic
$M measure_model          # 17.2 × 33.4 × 14.8,宽高比 0.515

# 4) UV 与贴图
$M ensure_texture '{"name":"mario_skin","width":64,"height":64,"fill":"#f2b184"}'
$M pack_box_uv '{"padding":1}'            # 30 cubes → 64×256 图集,越界 0 / 意外重叠 0
$M shade_model_base "$(cat out/mario/shade.json)"   # 区域规则上色 180 面
$M paint_face_features "$(cat out/mario/face-paint3.json)"  # 眼睛 + 帽子 M
$M audit_texture_quality                  # errors 0

# 5) 看结果(关键步骤:模型自己看截图,而不是靠断言)
$M capture_views '{"views":["north","iso","east","south"],"max_edge":512,"format":"png"}' --save out/mario
$M analyze_view_silhouette '{"views":["north","east","iso"],"max_edge":256}'

# 6) 人审门(弹 Blockbench 对话框,等用户点按钮)
$M request_review '{"question":"比例和细节可以接受吗?","views":["north","iso"],
  "wait_seconds":25,"timeout_seconds":600}'
$M wait_review '{"review_id":"<上一步返回的 id>","wait_seconds":25}'
```

## 迭代依据(每次都先看渲染图)

| 轮次 | 我看到的 | 改动 |
|---|---|---|
| 1 | 头太小、帽子过大;胡子糊住鼻子;脸上有圈深色边框像面具 | 头 8→10 宽 / 8.5→9 高;鼻子抬高放大;胡子压扁下移 |
| 2 | 头太长(下巴一大片空);胡子偏细偏下 | 头高 9→8;胡子 2 行 10 宽贴到鼻子下方;去掉下巴阴影 |
| 3 | 侧脸鬓角太厚,像戴头盔 | 鬓角收薄;后发上移;鼻子加宽 |

## 这个模型暴露出的真 bug(全部已修 + 加断言)

1. `update_elements` 的 group 校验写反 → **任何 cube 的 resize 都被拒**(第 2 轮的头部放大直接撞上)
2. 组名 `root` 与 Blockbench 工程根哨兵冲突 → `parent:"root"` 挂到工程根,root 组空掉(EMPTY_GROUP)
3. `side` 守卫用最小角判断过严 → 跨中线的 cube(靴子)被误判到另一侧
4. (上一轮全量测试已修)`withUndo` 删掉空数组 → undo 撤不掉新建元素
5. (上一轮)`array_cubes` 源 cube 的 parent 是活对象时崩溃
6. (上一轮)`select_action` 调用了不存在的 `Canvas.updateSelected`

> 结论:mock 测试能保证"参数校验/数学/协议",但**只有真正用来做东西**才会撞上
> resize 方向、组名哨兵、side 守卫这类"接口语义"问题。

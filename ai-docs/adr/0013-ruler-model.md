# ADR-0013：尺子模型——形状 = 画布上的辅助对象，不是笔（supersede ADR-0005 §2/§3、ADR-0006 §5/§6）

> created 20260909 · 作者 Claude Fable 5.1（claude-fable-5-1）
> 状态：**已决定 · v0.14.7 落地（真机未验）**；两个分叉待 user 讨论（§待讨论）。策划稿（现状 .h + 提案 .h）= `ai-docs/20260909-ruler-model-proposal.md`。

## 背景

形状笔（ADR-0005）是顶栏笔位的子工具，入口 = 长按笔位叫出 `#brushToolbar` 再点「形状」。user 2026-09-09 看真机截图：
「形状笔放的位置 ux 非常不合理，这也是最两难的一个设计问题, think outside the box and propose 5 ideas」。五案（尺子 / 左栏一次性钮 / 响应式第五动词 /
形状进笔架 / 硬件通道）→ user：「形状笔同意 1，用左栏放在笔架按钮下面，左栏应该 context smart sense 不要暴露不必要的东西。同意形状笔不是笔而是辅助」
→ 策划稿五个分叉默认 → user：「先做，45 我需要讨论下，但你先做」。

两难的根：ADR-0012 理由栏 user 原话「你要么是形状笔和橡皮，要么是画笔和橡皮」——形状笔↔橡皮是最高频来回，但顶栏没位置（SE2）、子工具入口不可见。

## 决定

1. **形状是尺，不是笔**。尺 = per-doc 的辅助对象（`desk.ruler`，跟画走），不落像素。任何像素笔（画笔 / 橡皮 / 手指族——`ruler.ts RULER_ROLES`）
   的徒手笔迹在 `input.ts _move` 的唯一切口过尺投影后再进引擎：**橡皮也吸尺**，来回消失。真笔压、真 taper、真间距全是那支笔自己的（尺不碰笔）。
2. **五种尺**（`ruler.ts Ruler`）：平行线尺（拖一下定方向；约束 = 15° / 透视下吸 VP 射线）· 透视尺（= 透视框本身：笔从起点朝首段最近的 VP 族走，
   一笔锁一族；零放置）· 椭圆尺（画一圈拟合，ADR-0005 §4 哲学不变；约束 = 正圆圆心拖半径；存 doc 系闭合 polyline）· 矩形尺（视口相对 AABB；
   透视下 = 作业平面四边形）· 格线尺（nu×nv，头身比）。
3. **入口 = 左栏笔架钮正下方的尺钮**：tap = 有尺 → 开/关吸附，无尺 → 进放置态；长按 = 放置；S 键 = tap。**左栏 context smart sense**：
   dial 件（笔架钮 / 两滑条 / 尺钮）只在能画的工具或放置态出现，吸管在 transient 藏——按动词派生显隐，不用 disabled 灰掉。
4. **放置态** = transient `rulerPlace`（同 perspEdit 形制）：DOM 捕获层 `#rulerPlaceLayer` 吃画布拖拽；尺子条 `#rulerToolbar`（工厂）=
   尺种下拉 · 约束 · 格线行列 · 透视四件（模式 / 平面 / 编辑消失点 / 显示 gizmo，从形状条搬来）· 清尺 · ✓。**无手柄，重拖即换**；✓ / 切工具 = 收起、吸附开。
5. **透视框本来就是一把尺**：ADR-0006 的 VP 编辑手柄 / 逐拖 undo / doc 变换 remap / 奇点护栏全部原样留（`persp-edit.ts` 不动）；只把绘图态 gizmo 的
   显示门从 `current() === "shapeBrush"` 换成 ruler-ui 注入的谓词。
6. **顶栏**：笔位只剩自由手（无子工具、无小三角）；`#brushToolbar`、`#shapeToolbarStack`、五个形状菜单、`shape-brush.ts` 引擎（484 行）+
   733 行测试整段删。engine-registry 像素笔角色 4 → 3。

## 推翻了什么（原文，供不再 re-litigate）

- ADR-0005 §2「形状笔是笔，不是带 gizmo 的可编辑对象（user：笔是我们的第一公民，选区是 staff，不太需要其他的实体）……没有 adjusting 态、手柄、确认按钮」；
  §3「恒压 0.5、不记录笔压……强制无视 taper……共享 brush 笔架」。→ 尺是对象（但无手柄）、笔压 taper 归笔。
- ADR-0006 §5「参考线画在图层上……不是 snap 参考线也不是 gizmo」；§6「形状笔无持久 gizmo 的初心」。→ 格线尺 = overlay + 吸附，不落像素。
- ADR-0012 §2「笔 = paint 族，子工具 freehand / shape」→ 笔位单子工具。
- 不推翻：ADR-0005 §1（否决手势识别自动 snap——尺是显式放置）、ADR-0006 的透视数学与 VP 编辑、`CONTEXT.md`「VP 是画的属性跟 ora 走」（尺同理）。

## 持久化（user「先做」= 同意）

`desk.ruler = { on, kind, constrain, geo, gridNu, gridNv }`（per-doc `editor-state.json`）；`desk.shapeBrush.*` 删除（老 doc 的 stale 键 mergeInto 静默忽略）。
doc 裁切 / 翻转 / 旋转 / 缩放 / 偏移经 `remapDeskRuler`（desk 直写，与 persp 同点挂钩）。

## 待讨论（user「45 我需要讨论下」）

- **Q4 谁吸尺**：现 `RULER_ROLES = draw / erase / filterBrush`（画笔 / 橡皮 / 手指族）。选区笔不走 input 的像素笔切口（lasso role 里借 brush 引擎），
  要吸尺得另开一个钩子。总账 #64。
- **Q5 像素画模式**：投影点进像素笔后落整数像素，不再保证 Bresenham 整数圆锥；`pixel-conic.ts` 与其测试暂留（未被引用），user 拍板后删或做「描尺」命令。总账 #65。

## 已知余量（本 ADR 记着，不是 bug）

- 放置不进 undo（重拖即换；doc 变换 undo 后尺不随同回退——与 persp T4d 之前同款；要的话仿 PerspComponent 加 RulerComponent ≈ 60 行）。
- 放置态捕获层吃掉全部指针：两指缩放 / 平移在放置态暂不透传（放置态短暂；要透传参照 `.crop-overlay` 只捕获 handle 的做法）。
- 引擎平滑在尺开时直通（tau=0，尺就是平滑器）——曲线尺上的手抖直接可见；user 手感裁决。
- 图标：库里无「尺子」，左栏尺钮用「尺」字 stopgap（`tools/bake-stopgap-glyphs.py`），已登记 `../20260708 SVG Icons/TODO.md`。
- 版本号：尺子是新功能纪元，按家规该 bump minor（0.15.0）并先问「要不要把 v0.14.x push prod」；本次先 patch v0.14.7，等 user 一句话。

## 参考

- 策划稿 `ai-docs/20260909-ruler-model-proposal.md`（现状 .h / 提案 .h / 五分叉 / 体重）
- 纯几何 `src/ruler.ts`（+ `test/ruler.test.mjs`）；app 层 `src/ruler-ui.ts`；切口 `src/input.ts _beginStroke/_move`；overlay `src/board.ts _drawGuides`
- ADR-0005、ADR-0006、ADR-0012；journal `journal/20260905 v0.13 feedbacks.md`（ADR-0012 理由栏原话）

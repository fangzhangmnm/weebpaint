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

## 待讨论（user「45 我需要讨论下」→ Q4 / Q5 都已决，见下）

- ~~Q4 谁吸尺~~ **已决（v0.14.9）**：user「你之前不是选区笔也想做吗」→ 按原提案全员：`RULER_ROLES = draw / erase / filterBrush / selPen`。
  选区笔在 input 的选区笔起笔/落点处另有同款钩子（伪 role "selPen"；像素链尺的像素经 extendStroke 直通喂 buffered 笔，抬笔 disc 光栅落在链上）。
- ~~Q5 像素画模式~~ **已决（v0.14.8）**：user「B 同意，必须用整数的像素算法，不然像素画场景就是废」→ 像素画模式下尺子 = **整数像素链投影器**
  （`ruler.ts pixelGuide`：直线 Bresenham / 轴对齐椭圆 midpoint / 任意四边形内切圆 Zingl conic（`pixel-conic.ts` 继续活着）/ 矩形周界 / 格线逐段），
  投影 = 链上最近像素，上次到这次之间的链像素按序经 `StrokeSession.stampPixels` 落点，每像素恰好一次（本笔 seen-set），永不走弦。
  椭圆尺放置时记外接 quad（透视下 = 平面方框的像）供 conic 用；老档无 quad 退化成 polyline 逐段 Bresenham。

## 修订 2026-09-09 ②：拖画模式（v0.14.9）

user：「像素笔圆和矩形，网格应该是拖动啊，还是你再加一个普通笔也可以用的拖动模式看谁舒服？」→ 加，两者并存，user 上手比。
- `desk.ruler.use = "trace" | "drag"`（per-doc，默认描尺；条上 `#rulerUseDrag` 一键切，透视尺恒描尺）。
- 拖画 = 旧形状笔的手势活在尺子模型里：同一套放置几何，拖一下 / 画一圈 → **整形一次落笔、不留尺**，留在放置态继续拖下一个；预览 = 橙色草稿，
  像素画模式连要落的格都画出来（`GuideOverlay.pixels`）。
- 落笔走 `input.drawShape`：正常 stroke 事务（当前笔 / 层 / 选区 / 锁α / 橡皮 mode 与手绘同源，一个 undo 整点）。像素画 = `shapePixels` 整数像素集
  经 `stampPixels` 每像素一次（格线交叉去重）；普通笔 = `shapePolylines` 逐段驱动引擎，**恒压 0.5**（机械绘制，ADR-0005 §3 的拖画语义保留；
  描尺才是真笔压），多段 StampCollect 合并一次 GPU commit（单令牌墙：一个 session）。只对画笔 / 橡皮工具；手指族在拖画下不落笔（状态行提示）。

## 已知余量（本 ADR 记着，不是 bug）

- 放置不进 undo（重拖即换；doc 变换 undo 后尺不随同回退——与 persp T4d 之前同款；要的话仿 PerspComponent 加 RulerComponent ≈ 60 行）。
- 放置态捕获层吃掉全部指针：两指缩放 / 平移在放置态暂不透传（放置态短暂；要透传参照 `.crop-overlay` 只捕获 handle 的做法）。
- 引擎平滑在尺开时直通（tau=0，尺就是平滑器）——曲线尺上的手抖直接可见；user 手感裁决。
- 图标：库里无「尺子」，左栏尺钮用「尺」字 stopgap（`tools/bake-stopgap-glyphs.py`），已登记 `../20260708 SVG Icons/TODO.md`。
- 版本号：user 2026-09-09「不是新功能，只是 ui 整理罢了」→ 走 patch（v0.14.7），不 bump minor。

## 参考

- 策划稿 `ai-docs/20260909-ruler-model-proposal.md`（现状 .h / 提案 .h / 五分叉 / 体重）
- 纯几何 `src/ruler.ts`（+ `test/ruler.test.mjs`）；app 层 `src/ruler-ui.ts`；切口 `src/input.ts _beginStroke/_move`；overlay `src/board.ts _drawGuides`
- ADR-0005、ADR-0006、ADR-0012；journal `journal/20260905 v0.13 feedbacks.md`（ADR-0012 理由栏原话）

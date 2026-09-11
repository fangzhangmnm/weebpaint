# ADR-0013：尺子模型——形状 = 画布上的辅助对象，不是笔（supersede ADR-0005 §2/§3、ADR-0006 §5/§6）

> created 20260909 · 作者 Claude Fable 5.1（claude-fable-5-1）
> 状态：**已决定 · v0.14.7 落地 → 2026-09-10 真机打回 → 修订 ③ v0.14.11 重落（真机未验）**。策划稿（现状 .h + 提案 .h）= `ai-docs/20260909-ruler-model-proposal.md`。
> ⚠ 读法：§决定 3/4/6 的「左栏尺钮 / 放置态 rulerPlace / 捕获层 / 左栏 context smart sense」已被 **§修订 ③** 整体推翻，以修订 ③ 为准。

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

## 修订 2026-09-10 ③：几何 = 任何工具都能开的修饰模式；入口 A；拖画默认；放置态 / 捕获层 / 左栏钮全撤（v0.14.11，Claude Fable 5.1）

user 真机打回 09-09 版（原话，2026-09-10）：「几何笔移到左栏之后退化严重。其实只是一个 ui refactor，交互逻辑不应该大变的。好好的比一下之前的行为，现在是各种 bug，ui 还玩消失」
「左边栏太拥挤了。不应该有那个尺按钮。笔架按钮也撤了吧」「上次重构确实是变成一个模式而不是一个动词，但是其实行为应该和之前差不多。因为之前的行为也就是复制了一份画笔，
然后加上了这个 extension。现在是要把这个 extension 抽出来，然后我希望画笔，橡皮，套索，选区笔，甚至手指，都能享受得到」「没有预览，我们旧版本的是用不着预览」
「如果 geometry engine related 脚本突然不见了，其他地方只要最小的修复程序也能跑」「入口候选：先试试 A 吧，用几天看看」。

与 09-09 版逐条对比（退化点 → 修法）：

| 09-09 版（v0.14.7–9） | 退化 | 修订 ③ |
|---|---|---|
| 入口 = 左栏尺钮（tap 语义随状态变 / 长按放置） | 左栏 5 件太挤；tap 语义看不见 | **入口 A**：几何条 = 上下文条区的固定尾位（右对齐 chip，有别的动词条就挂它下面一行）；关 = 一颗 chip，开 = 全条；S 键开关 |
| 左栏 context smart sense（不能画就藏笔架钮 / 滑条 / 尺钮） | 「ui 玩消失」 | 撤：左栏 = 两滑条 + 吸管，永远在；笔架钮 / 尺钮撤（笔架 = 再点当前动词；笔刷设置 = 笔架表编辑钮） |
| 默认描尺（放尺 → ✓ → 之后每笔都吸尺） | 「交互逻辑大变」：画笔莫名只画直线 | 默认**拖画**（旧形状笔手势）；留尺是条上的第二用法 |
| 放置态 = transient + DOM 捕获层吃全部指针 | 双指缩放 / 两指 undo 失效；见过笔的设备**手掌也能放尺**；Ctrl+Z 退放置态而不是撤销 | 撤：放尺 = 几何修饰模式下的一笔正常手势（正常指针管线：手势接管 = cancel、掌触 / 单指规则 / pointercancel 自愈同其他工具） |
| 拖画 = 抬手 `input.drawShape` 一次落笔 + 橙色草稿预览 | 与旧形状笔「真笔触实时重合成」不同；草稿是发明 | 撤 drawShape / 草稿：**decorator 每个输入事件批从头重驱内引擎**，笔触本身就是预览（旧 ShapeBrushEngine 的本质，内引擎从私有改注入） |
| 只有画笔 / 橡皮能拖画 | 手指 / 选区笔享受不到 | 画笔 / 橡皮（BrushEngine）/ 手指族（FilterBrushEngine，shadow 每帧 restore 重揉）/ 选区笔（借 brush，形的色带进选区）全部能拖画；套索自由手 = 二期（另一节律，见总账 #68） |
| 选透视尺自动开二点透视 + ✓ 强制吸附开 | 之后每笔吸 VP | 吸尺开关显式（[吸尺] 钮，有尺才露）；切到拖画 = 吸尺关 |
| 换文档时放置态半模态残留 | 卡在 transient | 无 transient，无此问题 |

**窄接口（user「怎么样抽象出窄接口」）**：`input.ts` 只多两个可选 provider，**不 import 任何几何脚本**——
① `setRulerGuideProvider`（09-09 已有）= 描尺逐点投影；② `setStrokeShaper`（新）= `{ mode(role): "drag"|"trace"|null; wrap(io): ShapedStroke }`，
起笔在三处（像素笔 / 滤镜笔 / 选区笔）各问一次，拖画时把内引擎包成满足 `StrokeEngine` 事务面的 decorator（`src/shape-stroke.ts`，纯、node 直测），
StrokeSession 当它是引擎；`io` = 调用方给的 `beginInner(x,y)` / `reset()`（buffered 只需 cancel；shadow 要 restore 替身）/ `inPlace` / `pixel` / `box`。
可拔性：删 `ruler.ts` / `shape-stroke.ts` / `ruler-ui.ts` → 只需去掉 `app.ts` 三行 + `workbench-state.remapDeskRuler` 一行改 no-op，程序照跑。

**状态**：`desk.ruler.use = "off" | "drag" | "trace"`（几何修饰模式；per-doc；默认 off——09-09 只有 drag|trace 默认 trace，老 dev doc 会以「几何开着」打开，条上一键关）；
`on` = 吸尺开关（有尺才有意义）。几何条显隐借套索条先例：几何开 → 全条；几何关但有尺 → [chip][吸尺][清]；都无 → 只一颗 chip。

**留尺流程**：几何开 + 留尺开 → 拖一下 = 放尺（overlay 立刻显示，就是尺本身，不是预览）、吸尺自动开 → 关几何 → 任何在册工具沿尺走（Shift = 本笔旁路）。
透视尺（kind=persp）无形可放：留尺下 = 透视框本身当尺（选中即吸）；拖画下 = 直线吸向最近 VP（旧「直线 + 吸向消失点」）。

**删**：`rulerPlace` transient、`#rulerPlaceLayer`、左栏 `#leftRuler` / 笔架钮、`dialReactive.transient/rulerOn/rulerPlacing`、`rulerTap/rulerLongpress/enterRulerPlace/exitRulerPlace/syncRulerUi`、
`input.drawShape/currentBrushPixelMode`、`GuideOverlay.pixels`；toolbar 不再 import ruler-ui（几何条自己听 `wp:modechange` 重定位）。
**图标**：`shapes`（chip）；`ruler`「尺」stopgap 改义 = 留尺钮；新烤 `ruler-snap`「吸」stopgap = 吸尺钮（TODO.md 已登记）。

## 已知余量（修订 ③ 后仍记着，不是 bug）

- 手指族拖画 = 每个输入事件批 restore 替身 + 沿形重揉：大形 / 大笔会慢（旧像素形状笔同款成本模型），真机不行再上 rAF 节流。
- 套索自由手不拖画（二期，#68）：矩形 / 椭圆子工具本来就是几何，差的只是透视四边形 / 格线 / 直线。
- 09-09 的余量里「放置态捕获层吃两指缩放」「Ctrl+Z 退放置态」随 transient 一起消失；「放置不进 undo」「尺开时引擎平滑直通」仍在。

## 已知余量（09-09 原文，本 ADR 记着，不是 bug）

- 放置不进 undo（重拖即换；doc 变换 undo 后尺不随同回退——与 persp T4d 之前同款；要的话仿 PerspComponent 加 RulerComponent ≈ 60 行）。
- 放置态捕获层吃掉全部指针：两指缩放 / 平移在放置态暂不透传（放置态短暂；要透传参照 `.crop-overlay` 只捕获 handle 的做法）。
- 引擎平滑在尺开时直通（tau=0，尺就是平滑器）——曲线尺上的手抖直接可见；user 手感裁决。
- 图标：库里无「尺子」，左栏尺钮用「尺」字 stopgap（`tools/bake-stopgap-glyphs.py`），已登记 `../20260708 SVG Icons/TODO.md`。
- 版本号：user 2026-09-09「不是新功能，只是 ui 整理罢了」→ 走 patch（v0.14.7），不 bump minor。

## 参考

- 策划稿 `ai-docs/20260909-ruler-model-proposal.md`（现状 .h / 提案 .h / 五分叉 / 体重）
- 纯几何 `src/ruler.ts`（+ `test/ruler.test.mjs`）；app 层 `src/ruler-ui.ts`；切口 `src/input.ts _beginStroke/_move`；overlay `src/board.ts _drawGuides`
- ADR-0005、ADR-0006、ADR-0012；journal `journal/20260905 v0.13 feedbacks.md`（ADR-0012 理由栏原话）

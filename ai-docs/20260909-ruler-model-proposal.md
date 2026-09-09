# 尺子模型策划：形状 = 画布上的辅助对象，不是笔（现状 .h + 提案 .h + 分叉）

> 作者：Claude Fable 5.1（claude-fable-5-1）· created 20260909 · as-of dev v0.14.7 · 状态：**已落地 v0.14.7（user「先做，45 我需要讨论下」）**；ADR = `adr/0013-ruler-model.md`；Q4/Q5 待讨论（总账 #64/#65）。
> 出处（user 2026-09-09 原话）：「形状笔放的位置 ux 非常不合理，这也是最两难的一个设计问题, think outside the box and propose 5 ideas」→ 五案 →
> 「形状笔同意 1，用左栏放在笔架按钮下面，左栏应该 context smart sense 不要暴露不必要的东西。同意形状笔不是笔而是辅助」。
> 家规：重构策划附「现状 .h + 提案 .h」；实现中形状变了回写 §2。本稿是 ADR-0013 的草案底稿（§0）；user 说「没问题」后立 ADR、开工。

## 0. 一句话 + 它推翻了什么

**形状（直线 / 矩形 / 圆·弧 / 格线 / 透视）从「一种笔」变成「画布上的一把尺」：任何像素笔——画笔、橡皮、手指族、选区笔——的徒手笔迹沿尺走；
尺是 per-doc 的辅助对象，不是笔，不落像素。** 对标 Clip Studio 尺子 / Krita assistants / Procreate drawing guide。

- 解掉的两难：形状笔↔橡皮是最高频来回（ADR-0012 理由栏 user 原话「你要么是形状笔和橡皮，要么是画笔和橡皮」）——尺子模型下**橡皮也吸尺**，
  来回消失；顶栏不再需要形状位（SE2 溢出与「长按叫出笔条」的不合理入口一起消失）。
- 推翻：ADR-0005 §2「形状笔是笔，不是带 gizmo 的可编辑对象（user：笔是我们的第一公民，选区是 staff，不太需要其他的实体）……没有 adjusting 态、手柄、确认按钮」
  与 §3「恒压 0.5、无视 taper、共享笔架」；ADR-0006 §5「参考线画在图层上，不是 snap 参考线也不是 gizmo」、§6「形状笔无持久 gizmo 的初心」。
  推翻的理由是本体论（user 2026-09-09「形状笔不是笔而是辅助」），不是技术。
- 不推翻：ADR-0005 §1 否决「手势识别自动 snap」（尺是显式放置，不是猜）；ADR-0006 的透视框数学（奇点护栏、平面度量、VP 编辑手柄 + 逐拖 undo）——**透视框本来就是一把尺**，
  只是今天只有形状笔读它（`persp-edit.ts:431` 只在 shapeBrush 显 gizmo）；`CONTEXT.md` 「VP 是画的属性，跟 ora 走」→ 尺子同理，归文档不归设备。

## 1. 现状 .h（api/ 现值 v0.14.6，节选）

```ts
// api/src/shape-brush.d.ts —— 484 行独立 stroke 引擎：一个 shape = 一个 stroke，每帧 _resynth 重驱动私有 BrushEngine；恒压 0.5、taper 归零
export type ShapeSubTool = "line" | "rect" | "circle" | "grid";
export interface GridConfig { nu: number; nv: number; border: boolean }
export declare class ShapeBrushEngine {
  setSubTool / getSubTool / setConstrain / setConstrainFor / setConstrainInvert / setGridConfig / getGridConfig;
  setViewportRotProvider(fn: (() => number) | null): void;  setPerspProvider(fn: (() => PerspConfig | null) | null): void;
  beginStroke(layer, settings, x, y, _pressure, mode?, _smooth?, _t?); extendStroke(x, y, _pressure, _t?); endStroke(): StampCollect | null;
  cancelStroke(): void; collectStamps(): StampCollect | null; flushDirty(): Rect4 | null;   // 与 BrushEngine 同签名，pixelMode 每帧 restoreFromSnapshot
}
// api/src/shape-geometry.d.ts —— 纯几何（保留；尺子的投影核就在这）
export declare function snapLineEnd(x0, y0, x, y, stepRad?): Pt;                 // 15° 射线吸附 = 直线尺投影核
export declare function rectCorners(p0, p1, rot, constrain): [Pt, Pt, Pt, Pt];
export declare function fitEllipse(pts: Pt[], rot, constrain): EllipseFit | null; // max 范数 AABB / winding / Kasa（ADR-0005 §4 哲学）
// api/src/perspective-frame.d.ts —— 纯几何（保留）
export declare function snapDirections(cfg: PerspConfig, from: Pt): Pt[];  export declare function snapToDirections(x0, y0, x, y, dirs: Pt[]): Pt;   // = 透视尺投影核
export declare function configFromModeState(g: PerspModeState): PerspConfig | null;  export declare function metricCirclePolyline(m, drag, n): Pt[];
// src/engine-registry.ts:44   shapeBrush: { engineKey:"shapeBrush", coalesceLatest:true, usesResolvedBrush:true, finalize:true, historyType:"stroke" }
// src/pointer-route.ts       toolToRole("shapeBrush") / effectiveTool alt→picker / strokeMode E-hold
// src/input.ts:788-816       像素笔 _move：inputSmooth（非 rawToEngine 才走）→ :808 screenToDoc → :813 _activeStroke.extend(dx, dy, pressure, ts)   ← 唯一切口
//                            :1004 rawToEngine = buffered || role === "shapeBrush"；:1007 _resolveSmooth → 引擎侧 stroke-smoother {tau, deadzone}
// src/edit-mode.ts:50        shapeBrush 行；:65 perspEdit（transient，onToolSwitch:"apply"）
// src/toolbar.ts:95-160,839-963  形状条（#shapeToolbarStack：子工具 4 钮 / 变体菜单 / 格线 stepper / 透视模式槽 / 平面行 / VP 编辑 / gizmo 开关）≈ 190 行
// src/workbench-state.ts:184 desk.shapeBrush { sub, constrainLine/Rect/Circle, gridNu/Nv/Border }；:187 desk.persp（保留）
// src/persp-edit.ts:431      gizmo provider 门：!_active && (!showGizmo || current() !== "shapeBrush") → null
// src/ui/left-dial.ts:19-42  LeftDialOpts（getPickIcon 是唯一「按 context 派生」钩子，现为常量 "eyedropper"）；左栏无任何按工具显隐
// src/common/verbs.ts:21     brush: [freehand, shape]；#brushToolbar = 长按笔位叫出的 [自由手|形状] 条（修订 ③）
```

## 2. 提案 .h（pin 住的契约）

```ts
// src/ruler.ts —— 纯几何 + 尺子数据（零 DOM，node 直测）
export type RulerKind = "parallel" | "persp" | "ellipse" | "rect" | "grid";
export type Ruler =
  | { kind: "parallel"; angle: number }                                   // 文档系弧度。放置：拖一下定方向（约束开 = 15° 吸附 / 透视下吸 VP 射线）
  | { kind: "persp" }                                                     // 几何 = desk.persp（透视框本身当尺）；无自有状态；框 off 时不可选
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number; rot: number }   // 放置：徒手画一圈 → fitEllipse（ADR-0005 §4 哲学不变）；约束 = 正圆
  | { kind: "rect"; corners: [Pt, Pt, Pt, Pt] }                            // 放置：拖 AABB（视口相对；透视下 = 作业平面上的四边形 _quad）；约束 = 正方
  | { kind: "grid"; corners: [Pt, Pt, Pt, Pt]; nu: number; nv: number };   // 头身比 / 构图格：overlay 显示，笔吸最近格线
/** 每笔一个：parallel/persp 在 begin 锁方向（起点 + 首段方向选最近 VP 族）；ellipse/rect/grid = 最近点投影。 */
export interface StrokeGuide { begin(x0: number, y0: number): void; project(x: number, y: number): Pt }
export function guideFor(r: Ruler, frame: PerspConfig | null, constrainInvert: boolean): StrokeGuide;
export function placeFromDrag(kind: "parallel" | "rect" | "grid", p0: Pt, p1: Pt, o: { constrain: boolean; frame: PerspConfig | null; rot: number; grid?: { nu; nv } }): Ruler;
export function placeFromLoop(pts: Pt[], o: { constrain: boolean; rot: number }): Ruler | null;   // ellipse
export function remapRulerForDocTransform(r: Ruler, f: DocTransform): Ruler;                       // 裁切/缩放/翻转跟着走（同 persp）
export function rulerOverlay(r: Ruler, frame: PerspConfig | null, view: ViewInfo): OverlayPath[];  // 给 board 画 gizmo；透视尺复用现有 PerspGizmoData

// desk（per-doc editor-state.json，**新持久化字段，需 user 点头**）
//   ruler: { on: boolean; kind: RulerKind; geo: Ruler | null; constrain: boolean } ；删除 desk.shapeBrush.*（sub/constrain*/grid*）
//   undo：放置 = 一个 history 步（同 PerspComponent「recorded」）；on/off 不进 undo（工具态）

// src/input.ts:808 切口（一行）：const g = this._strokeGuide; if (g) ({ x: dx, y: dy } = g.project(dx, dy));
//   _beginStroke：ruler.on 且 role 是像素笔 → g = guideFor(...); g.begin(x0, y0)；且 _resolveSmooth → { tau: 0, deadzone: 0 }
//   （尺就是平滑器：引擎 EMA 会把投影点拉离曲线尺——形状笔时代 tau=0 直通的同一条路）。真笔压、真 taper 原样进引擎（§5 Q3）。
// src/edit-mode.ts：删 shapeBrush 行；加 rulerPlace（transient，同 perspEdit 形制：画布拖 = 放尺，✓ / 切工具 = apply）
// src/engine-registry.ts：删 shapeBrush（像素笔角色 4 → 3）；pointer-route 同步
// src/ruler-ui.ts（app 层，greenfield）：尺子条（#rulerToolbar，工厂造）= [种类下拉 ▾][约束][透视模式 ▾ / 平面 / 编辑消失点 / 显示消失点] | [开/关] ✓
//   旧 #shapeToolbarStack 整段删；透视四件原样搬进来（persp-edit 不动）
// src/ui/left-dial.ts：LeftDialOpts += getRuler(): { visible: boolean; on: boolean; kind: RulerKind } ；onRulerTap(); onRulerLongpress()
//   左栏 context smart sense（§3.4 表）：尺钮只在像素笔动词下出现；有尺 → tap = 开/关吸附，长按 = 尺子条（放置/换种类）；无尺 → tap = 尺子条
// src/common/verbs.ts：brush: [freehand]（小三角随之消失）；#brushToolbar 删；S 键 = 尺子开/关（原 shapeBrush）
// persp-edit.ts:431 门：shapeBrush → ruler.on && kind === "persp"（或 showGizmo）
```

### 2.5 落地差异（v0.14.7 回写，家规：实现中形状变了回写 §2）

- `Ruler` 的椭圆尺存 **doc 系闭合 polyline `pts`**（不存 cx/cy/rx/ry/rot/onPlane）：一份表示吃掉全部透视分支，projection = 最近线段；`RulerParallel` 多一个 `anchor`（只给 overlay 定位）。
- `placeFromDrag(kind, p0, p1, o, grid?)` / `placeFromLoop(pts, o)`；`StrokeGuide.begin` 返回吸后的起点；`guideFor(r, frame)` 不收 constrainInvert（Shift 改为「本笔旁路尺」，放置时 Shift = 反转约束）。
- `rulerOverlay` 改名 `rulerSegments(r, docW, docH)`；board 侧 `GuideOverlay { segments, style: active|dim|draft }` + `setGuideProvider`；透视尺走 persp-edit gizmo（`setPerspGizmoLiveGate` 注入门）。
- 放置**不进 undo**（§3.3 原写「放置 = 一步 undo」，改：重拖即换，省 RulerComponent；记 ADR-0013 余量）。
- `LeftDialOpts += getDialVisible / getPickVisible / getRuler / onRulerTap / onRulerLongpress`；`dialReactive += transient / rulerOn / rulerPlacing`。
- `input.ts`：`setRulerGuideProvider(fn)`、`shiftDown`；S 键派 `wp:ruler-tap`（不 import ruler-ui，防环）。edit-mode `rulerPlace` ctrlZ = abort-transient。
- 选区笔不在切口内（lasso role 借 brush 引擎）→ Q4 待讨论（总账 #64）；pixel-conic.ts 暂留（Q5，#65）。

## 3. 行为

### 3.1 一笔怎么走
落笔 → `guide.begin(x0,y0)`（parallel：线 = 过起点、方向 = 尺的 angle；persp：首段 ≥ 8px 后选最近 VP 族，线 = 过起点的该族射线；ellipse/rect/grid：无起点依赖）→
每个点 `project` → 引擎照常吃（压感、taper、间距、混色全是那支笔自己的）。live == commit 不变（投影在引擎之前，ADR-0009 确定性不碰）。
橡皮 = 同路径（mode erase）；手指族 = 同路径（沿尺揉边）；选区笔 = 同路径。套索徒手（非像素笔）不吸。

### 3.2 放置
左栏尺钮（或长按）→ 尺子条 + `rulerPlace` 透明态：画布上拖（parallel/rect/grid）或画一圈（ellipse）→ 尺出现在 overlay（实时）；再拖 = 换掉（§5 Q2 默认无手柄）；
✓ 或切工具 = 收起条，吸附开。透视尺不用放置：条里开透视模式即是（VP 编辑仍走 perspEdit）。overlay 常显（淡），关吸附时更淡；gallery/导出永不出现。

### 3.3 持久化 / 变换
`desk.ruler` 跟画走（同 `desk.persp`），裁切/缩放/翻转经 `remapRulerForDocTransform`（doc-ops 7 个 remap 点各加一行）；放置 = 一步 undo。

### 3.4 左栏 context smart sense（user「不要暴露不必要的东西」）——按动词派生显隐，不按 disabled 灰掉

| 左栏件 | 笔 / 橡皮 / 手指族 | 套索 / 油漆桶 | transient（变换/裁切/调整） |
|---|---|---|---|
| 笔架钮 | 显 | 选区笔子模式才显（现状） | 隐 |
| 粗细 / 不透明 dial | 显 | 选区笔才显（现状 canDraw） | 隐 |
| 吸管 | 显 | 显（填色取样） | 隐 |
| **尺钮（新，笔架钮下）** | **显**；有尺 = 开/关态可见 | 隐 | 隐 |

（现状：左栏零显隐逻辑，只有两条 dial 的 `:disabled`；`getPickIcon` 是设计好但没用上的 context 钩子。这张表就是那条钩子的推广。）

### 3.5 顶栏
`笔 · 橡皮 · 手指 · 套索` 不变，笔位没有子工具了（小三角消失、长按无事）。`#brushToolbar` 删。快捷键 S = 尺开/关。

## 4. 体重变化（承诺）

删：`shape-brush.ts` 484 + toolbar 形状段 ≈190 + index.html 形状栈/五个菜单 ≈60 + `test/shape-brush.test.mjs` 733 + `pixel-conic.test` 88 ≈ **−1550**。
增：`ruler.ts` ≈250 + `ruler-ui.ts` ≈220 + left-dial 尺钮 ≈40 + 测试 ≈250 ≈ **+760**。净 ≈ **−800 行**。`shape-geometry` / `perspective-frame` / `persp-edit` 三个纯模块原样留。

## 5. 分叉（默认已选；user 只需对不同意的说一句）

- **Q1 种类与分期**：默认 MVP = 平行线尺 + 透视尺 + 椭圆尺（覆盖 ADR-0005 背景两个场景：大头圆底、建筑透视线）；矩形 / 格线第二批同轮补齐。
- **Q2 放置后可调？** 默认**无手柄**：重拖即换（透视点照旧走 perspEdit 手柄）。备选 = 复用 PerspComponent/persp-edit 形制给每种尺加手柄（多 ≈150 行、多一个常驻 gizmo）。
- **Q3 尺上的笔压**：默认**真笔压 + 真 taper**（笔是笔、尺是尺；要机械均匀线选 -fixed 变体）。备选 = 沿旧 ADR-0005 §3 恒 0.5 无 taper（一个 flag）。
- **Q4 谁吸尺**：默认**全部像素笔**（画笔 / 橡皮 / 手指族 / 选区笔）。备选 = 只画笔 + 橡皮。
- **Q5 像素画模式**：默认圆尺/矩形尺只保证「投影点落到整数像素」，不再保证 Bresenham 整数圆锥（`pixel-conic` 退役；ADR-0006 §4 的数学留在 shape-geometry 里备用）。备选 = 保留一条「描尺」命令把尺烤成像素精确一笔（等真缺再立案）。
- **持久化同意**：`desk.ruler` 新字段 + 删 `desk.shapeBrush`（per-doc，跟画走）。家规：改持久化结构先同意。
- **图标**：库里没有「尺子」图标 → 实施时中文「尺」烤轮廓 stopgap + `20260708 SVG Icons/TODO.md` 登记（会在报告里显式报）。

## 6. 分期

1. `ruler.ts` 纯几何 + 测试（投影核复用 snapLineEnd / snapToDirections / fitEllipse；新增点到椭圆最近点、点到四边形最近边）。
2. 切口：input.ts 一行 + rulerPlace 透明态 + overlay provider + desk.ruler（persp remap 同款）。
3. UI：左栏尺钮（context 表）+ 尺子条（工厂）+ 透视四件搬家 + 删形状栈 / 删 brush 子工具 / S 键。
4. 删引擎：shape-brush.ts、engine-registry/pointer-route 行、旧测试；探针 verb-toolbar 重写；.h 重打；ADR-0013 落档、ADR-0005/0006 标 supersede。

## 7. 不做 / 已否决别再提

- 不做手势识别自动 snap（ADR-0005 §1）；不做 3D grid、grid 最小间距护栏（ADR-0006 弃案）；不做把尺存设备态（CONTEXT.md：归画）。
- 不做「形状 = 笔架 preset」「第五动词」「硬件通道」——2026-09-09 五案中 user 选了尺子，其余四案不再提。
- 尺子不落像素（想要像素参考线 = 用它当尺画一笔）。

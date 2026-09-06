# 曲线 + 色带深模块提案（anim-curve / color-ramp / 两张编辑器皮）

> 作者：Claude Fable 5（claude-fable-5）· 2026-08-30 · 讨论轮产物，未动码
> as-of v0.12.10 / 2026-08-30 · 状态：~~提案待 user 说「没问题」~~ → **四批全部落地 dev v0.13.5–v0.13.7（2026-09-05，user「可以把曲线做一下吗，以及那一轮讨论的其他东西也看一下」）**。
> 实现中形状与提案的差异回写在 **§6**（edited by Claude Fable 5.1 2026-09-05）；§2 保留为当时 pin 的契约，现值以 `api/` 为准。

## 0. 本轮拍板（2026-08-30 user 原话，只记这一轮）

| 议题 | user 原话 | 落成 |
|---|---|---|
| 对标 | 「我们还是对齐，因为这个确实是很重要的肌肉记忆」「用unity一定要把手」 | Unity AnimationCurve 模型：key + 切线把手 + 逐 key 切线模式 |
| 增删点 | 「23其实我倾向于实体按钮，可能类似另外一个agent在做的小窗的overlay按钮」 | ＋/🗑 实体 overlay 钮（参考窗 gizmo 语言），不做双击加点、不做拖出删 |
| 渲染 | 「用svg赞」 | SVG DOM 元素，不用 canvas |
| ramp 默认 | 「srgb」 | 平滑模式默认 sRGB 直插 + Linear；OKLab/Ease/Constant 为选项 |
| HSB | 「hsv里面自然饱和度一直很煤气灯，我后来用的都是普通的，把那个当默认吧」「hsv也先回滚回来」 | `satMode` 默认 `vibrance` → `linear`（v132 的「默认自然」回滚） |
| ramp 用途 | 「我想旧夏音色稿转二分……皮肤色+红色肉色阴影来做第一遍二分」→ a) 渐变映射 | 头一个消费者 = 渐变映射调整（gradient map） |
| 预设 | 「预设先park」 | 数据形状可序列化即可，不做预设库 |
| 压感 | 「压感同意用anim-curve」 | 第二消费者 = 笔刷压感曲线（批 4，动笔刷 JSON） |
| Live2D | 「很久很久以后可能要做live2d……是否应该用同一个anim curve」 | 同一模块；数学层按无界 t + wrap 设计，时间轴只是另一张编辑器皮 |

旧原话（出处 journal）：0820「v0.1时代的算法债：曲线完全不能用。非常funky。重做，对标Unity的animation curve，或者ps的体验」；0723「曲线的弯曲都觉得很难看，会有各种突变」；0530「曲线不是折线！」。

## 1. 现状 .h（api/ 现值，v0.12.10）

```ts
// api/src/backend/filters/curves-kernel.d.ts
export type CurvePoint = [number, number];               // [x 0..255, y 0..255]
export interface CurvesParams extends FilterParams { active: string; comp: CurvePoint[]; r: CurvePoint[]; g: CurvePoint[]; b: CurvePoint[]; a: CurvePoint[]; }
export declare function buildCurveLut(points: CurvePoint[]): Uint8Array;   // Catmull-Rom 切线 + Hermite，无钳制，clamp8
export declare const CurvesKernel: FilterKernel;

// api/src/backend/filters/kernel.d.ts
export interface FilterKernel { id; defaults(); bleedRadius(params); bake(src, dst, params, mask, w, h): void }

// api/src/ui/drag-value.d.ts（复用，不改）
export declare function attachDragValue(el, opts: { getValue(): {x,y}; onDrag(x,y,fine); onCommit?(); fineGain? }): DragValueHandle;
export declare function dragBegin / dragMove(...)   // 纯状态机（abs / shift 相对细调）

// api/src/ui/ramp-slider.d.ts（复用，不改；它的 gradient 只是 CSS 提示，不是 ramp 编辑器）
export declare function makeRampSlider(o: RampSliderOpts): RampSliderHandle;
```

`src/plugins/curves.ts`（170 行 canvas UI，`hiddenInMenu=true`）整块作废重写。

## 2. 提案 .h（pin 住的接口；实现中形状变了要回写这里）

### 2.1 `src/common/anim-curve.ts` —— 一维关键帧函数（零 DOM，backend/ui/brush 三方共用）

```ts
export type TangentMode = "clampedAuto" | "auto" | "free" | "flat" | "linear" | "constant";
export type WrapMode = "clamp" | "loop" | "pingPong";

export interface Keyframe {
  t: number; v: number;
  inTan: number; outTan: number;          // 斜率 dv/dt；auto 系由 refreshTangents 重算，free 由把手写入
  inMode: TangentMode; outMode: TangentMode;
  broken: boolean;                        // false = 两侧联动（Unity smooth）；true = 左右独立
  inWeight?: number; outWeight?: number;  // 预留 Unity weightedMode；v1 evaluate 忽略（缺省 ≡ 非加权）
}
export interface AnimCurve { keys: Keyframe[]; preWrap: WrapMode; postWrap: WrapMode }   // keys 恒按 t 升序、t 互异

export function makeCurve(pts: Array<{ t: number; v: number } & Partial<Keyframe>>, wrap?: WrapMode): AnimCurve;
export function identityCurve(): AnimCurve;           // (0,0)–(1,1) linear
export function cloneCurve(c: AnimCurve): AnimCurve;
export function evaluate(c: AnimCurve, t: number): number;
export function bakeLut(c: AnimCurve, n: number, domain?: [number, number]): Float32Array;
export function bakeLut8(c: AnimCurve): Uint8Array;    // 256 项：t=x/255 → round(v·255) clamp8；curves-kernel 消费

export function refreshTangents(c: AnimCurve): void;  // 每 key 按 in/outMode 重算切线；free 不动
export function insertKey(c: AnimCurve, t: number, v?: number): number;   // v 缺省 = evaluate(t)（插入不改形状）；同 t 覆盖；返回 index
export function removeKey(c: AnimCurve, i: number): void;
export function moveKey(c: AnimCurve, i: number, t: number, v: number, o?: { lockT?: boolean }): number;  // 越过邻居自动重排（Unity）；返回新 index
export function setTangentMode(c: AnimCurve, i: number, mode: TangentMode, side: "in" | "out" | "both"): void;
export function setTangent(c: AnimCurve, i: number, side: "in" | "out", slope: number): void;   // 把手拖动 → 该侧变 free；!broken 时镜像另一侧
export function setBroken(c: AnimCurve, i: number, broken: boolean): void;
```

语义（对齐 Unity，闭源无法逐位对拍，只对齐行为）：
- **段插值** = 三次 Hermite，`h00·v0 + h10·Δt·m0 + h01·v1 + h11·Δt·m1`（现 kernel 同式）。任一侧为 `constant` → 该段恒取左 key 值（阶跃）。
- **auto** = Catmull-Rom 中心差分（现 kernel 的做法）；端点单边斜率。
- **clampedAuto** = auto 切线再做 Fritsch–Carlson 限幅：邻居两侧割线异号（极值点）→ 0；同号 → |m| ≤ 3·min(|割线|)。**保证不过冲、不出台阶**——这就是 0723「各种突变」的解药。新 key 默认 clampedAuto。
- **linear** = 该侧切线 = 到该侧邻居的割线；**flat** = 0；**free** = 把手写入的值。
- 非 broken 时任一侧被设置（模式或斜率）→ 镜像到另一侧；auto/clampedAuto 隐含非 broken。
- **外推**：t < 首 key / t > 末 key 按 pre/postWrap；v1 只实现 clamp（loop/pingPong 留 Live2D 轮，接口先站住）。
- 数值域不做钳制（调整曲线由 bakeLut8 clamp8；压感由消费方 clamp01）。

### 2.2 `src/common/color-ramp.ts` —— 色带（同骨架换值域）

```ts
export type RampInterp = "linear" | "constant" | "ease";     // v1；bspline/cardinal 后补
export type RampSpace  = "srgb" | "oklab";                   // v1；hsv 后补（要 hue 方向旋钮，先不做）
export interface RampStop { t: number; rgba: [number, number, number, number] }   // 0..255 ×4，与像素字节同域
export interface ColorRamp { stops: RampStop[]; interp: RampInterp; space: RampSpace }   // stops 按 t 升序

export function makeRamp(stops: RampStop[], interp?: RampInterp, space?: RampSpace): ColorRamp;
export function grayRamp(): ColorRamp;                       // 黑→白 = 渐变映射的恒等默认
export function evaluateRamp(r: ColorRamp, t: number): [number, number, number, number];
export function bakeRampLut(r: ColorRamp): Uint8ClampedArray; // 256×RGBA
export function insertStop(r: ColorRamp, t: number, rgba?: RampStop["rgba"]): number;   // 缺省色 = evaluateRamp(t)
export function removeStop(r: ColorRamp, i: number): void;
export function moveStop(r: ColorRamp, i: number, t: number): number;    // 可越过邻居，重排（Blender）
export function setStopColor(r: ColorRamp, i: number, rgba: RampStop["rgba"]): void;
export function flipRamp(r: ColorRamp): void;
```

语义：
- **constant** = 左色标持有到下一色标（Blender 语义）。二分实战：`[0: 红肉影] [θ: 皮肤色]`，拖第二个色标 = 拖阈值；色空间不参与。
- **linear** = 相邻色标间直插；**ease** = smoothstep 过渡。sRGB 直插 = 行业默认（Blender/Unity/PS），OKLab 走 `common/color-dist.ts` 的 `srgbToOklab`（需补 `oklabToSrgb`，同文件）。alpha 恒线性插。
- 首色标前 / 末色标后 = 端色。

### 2.3 kernel / 插件

```ts
// backend/filters/curves-kernel.ts（改）
export interface CurvesParams extends FilterParams { active: "comp"|"r"|"g"|"b"|"a"; comp: AnimCurve; r: AnimCurve; g: AnimCurve; b: AnimCurve; a: AnimCurve }
// bake 不变：lutR[lutComp[src]]… 只是 LUT 来源换 bakeLut8(curve)。buildCurveLut(points) 删。

// backend/filters/gradient-map-kernel.ts（新）
export interface GradientMapParams extends FilterParams { ramp: ColorRamp }
// bake：luma = 0.2126R+0.7152G+0.0722B（与 hsb-kernel 同式）→ lut[luma] 取 RGB；alpha = 原样（ramp alpha v1 不参与）。per-pixel，bleedRadius 0。

// plugins/curves.ts（重写）：通道 tab（保留）+ makeCurveEditor + 切线模式行；hiddenInMenu 撤。
// plugins/gradient-map.ts（新）：category adjustment / modes region / body = makeRampEditor。
```

### 2.4 `src/ui/curve-editor.ts` —— 曲线编辑器皮（SVG）

```ts
export interface CurveEditorOpts {
  curve: AnimCurve;                    // 引用持有，原地改（宿主的 params 就是它）
  lockEndpointsT?: boolean;            // 调整曲线/压感 = true：首尾 key t 钉 0/1 且不可删；时间轴皮 = false
  showIdentity?: boolean;              // 对角参考线
  accent?: string;                     // 曲线色（通道色）
  fmt?: (t: number, v: number) => string;   // 选中 key 读数（调整曲线显示 0..255）
  onInput(): void;                     // 形状每变一次（宿主 rAF 预览）
  onCommit(): void;                    // 一次手势结束（历史合并点）
}
export interface CurveEditorHandle { el: HTMLElement; setCurve(c: AnimCurve): void; redraw(): void; selected(): number; dispose(): void }
export function makeCurveEditor(o: CurveEditorOpts): CurveEditorHandle;
```

行为规格：
- **画布**：`<svg viewBox>` 数据坐标（y 翻转），`vector-effect: non-scaling-stroke`；网格 4×4；曲线 = evaluate 采样 256 点 path；颜色全走 CSS 变量（`--ink/--line/--bg-soft/--accent`），随主题。面板 380px 宽 → 编辑区约 348×348。
- **key**：圆点（触屏命中半径 ≥ 22px CSS）；tap = 选中；拖 = 移动（t 与 v 同时，drag-value 核：绝对跟手 + shift 细调）；越过邻居 → 重排继续拖（Unity）；`lockEndpointsT` 时首尾只动 v。
- **把手**：只在选中 key 露出（Unity）；两根定长 40px 线 + 圆钮，方向 = 切线斜率（按显示纵横比换算）；拖钮 = `setTangent`（该侧变 free，非 broken 镜像）。
- **overlay 实体钮**（参考窗 gizmo 语言：右上角、24px、半透明、触屏闲置淡 .35、悬停设备离窗全隐进窗即现）：
  - ＋（图标 `new`）：在「选中 key 与右邻」中点插 key，v = evaluate（形状不变），并选中它；无选中 → 最大间隔中点。
  - 🗑（图标 `trash-can`）：删选中 key；`lockEndpointsT` 端点时置灰。
- **切线模式行**（编辑区下方，走 `makeSelectRow` 家族标准件）：`Clamped Auto / Auto / Free / Flat / Linear / Constant` 作用于选中 key；「断开」checkbox = broken。
- **复位**：文字钮「复位」→ identityCurve（PS「默认」习惯）。不加图标。
- **键盘**（桌面）：方向键微调选中 key（调整曲线 1/255，Shift ×10 = PS）；Delete 删。
- 本轮**不做**：双击加点、拖出删、加权把手、pan/zoom、PS 铅笔模式。

### 2.5 `src/ui/ramp-editor.ts` —— 色带编辑器皮

```ts
export interface RampEditorOpts {
  ramp: ColorRamp;
  getForeground(): [number, number, number, number];   // 「取前景色」钮的来源
  onInput(): void; onCommit(): void;
}
export interface RampEditorHandle { el: HTMLElement; setRamp(r: ColorRamp): void; redraw(): void; selected(): number; dispose(): void }
export function makeRampEditor(o: RampEditorOpts): RampEditorHandle;
```

行为规格：
- **色带条**：div，背景 = 由 `bakeRampLut` 生成的 256 段 CSS `linear-gradient`（任何色空间/插值都精确显示，constant 的硬边也对）。
- **色标**：条下小旗（Blender 形制），tap 选中，1D 拖动（drag-value；可越过邻居重排）。
- **overlay ＋/🗑** 同曲线编辑器（＋ = 选中与右邻中点插入，颜色 = evaluateRamp）。
- **行**：「插值」select（Linear/Constant/Ease，默认 Linear）· 「色彩空间」select（sRGB/OKLab，默认 sRGB）· 文字钮「翻转」·「取前景色」（把选中色标设为当前前景色——二分实战：先在色轮/色卡取皮肤色，再点色标、点取色）。
- 色轮内嵌（`mountColorWheel` 挂载器存在，技术上可行）= v1 之后再议；v1 先「取前景色」零新管线。

## 3. 落地批次（全部 app 层 = greenfield；每批 dev push + 重打 api/）

| 批 | 内容 | 验证 |
|---|---|---|
| 0 | `hsb-kernel.ts` defaults `satMode: "linear"`（一行） | 现有测试 |
| 1 | `common/anim-curve.ts` + `test/anim-curve.test.mjs`（登记进 `test/run.mjs`） | 契约测：identity LUT 逐字节 `lut[x]==x`；clampedAuto 单调数据出单调 LUT、极值点切线 0；constant 段阶跃；insertKey 不改形状（前后 LUT 相等）；moveKey 越邻居重排；linear/flat 切线值；wrap clamp |
| 2 | `ui/curve-editor.ts` + `plugins/curves.ts` 重写 + kernel 换源 + `hiddenInMenu` 撤 + CSS + i18n | dom-shim 测：选中/插入/删除/端点锁；`npm run smoke` 加一条真浏览器拖 key + 拖把手用例（参考窗那套 playwright 夹具） |
| 3 | `common/color-ramp.ts`（+ `oklabToSrgb`）+ `ui/ramp-editor.ts` + `gradient-map-kernel.ts` + `plugins/gradient-map.ts` + i18n | 契约测：constant 左持有、二分两色标 LUT 精确、sRGB/OKLab 端点回归原色、flip；smoke 拖色标 |
| 4 | 压感：`ResolvedBrush.pressureCurve?: AnimCurve`（笔刷 JSON 新顶层键，与旧 `size/flow.pressureCurve` 数字字段不同层级、迁移代码不碰它）；`brush.ts` 两处 `pow(p, gamma)` → 描边 begin 时烤 256 LUT 查表（热路径零 evaluate）；缺省无字段 = 走原 gamma 路径（零迁移）；`brush-config-view.ts` pressureGamma 行 → 曲线编辑器 | 单测 LUT 等价 gamma；手感真机批 |

真机批：批 2/3 各加一条到 `ai-docs/20260827-device-test-batch.md`（iPad 拖 key/把手/色标）。

## 4. 明确不做 / park

- 预设库（user park）；加权切线（数据预留、UI 不露）；HSV 色空间；B-spline/Cardinal 插值；时间轴皮（无界 t、多曲线、pan/zoom、loop/pingPong 外推）留 Live2D 纪元；双击加点、拖出删（本轮拍板实体钮）。
- **新增图标需求：无**（复用 `new`、`trash-can`；复位/翻转/取前景色走文字钮）。

## 5. 风险点

- `common/` 入册两个纯数学模块不碰 `backend/algorithms` 的「像素算法需 consent」条——它们不是像素算法；渐变映射 kernel 与现有 hsb/curves kernel 同形（per-pixel LUT）。
- 批 4 动笔刷持久化形状（新增可选字段）——user 本轮已口头同意，落地时再报一次字段名。
- OKLab 反变换要补代码（`color-dist.ts` 只有正向），端点回归原色靠测试锁。

## 6. 落地回写（2026-09-05，Claude Fable 5.1；对照 §2/§3，形状变了的地方）

| 批 | 落地版本 | 与提案的差异 / 备注 |
|---|---|---|
| 0 | v0.13.5 | 照提案：`hsb-kernel` defaults `satMode: "linear"`。 |
| 1 | v0.13.5 | `common/anim-curve.ts`：§2.1 全部 + 新增 `sanitizeCurve(raw)`（读持久化/MCP 参数用）、`cloneCurve`/`curveEquals`、`TANGENT_MODES`/`DEFAULT_TANGENT_MODE`；`removeKey` 返回 boolean 且至少留 1 key；`moveKey` 返回新 index。**insertKey「不改形状」松成「新点落在原曲线上，auto 邻居切线随之重算（Unity AddKey 同）」**——测试锁 S 曲线 LUT 偏差 ≤4/255、恒等曲线逐字节不变。wrap `loop`/`pingPong` 顺手实现（各 3 行 + 测试），不只是接口站住。 |
| 2 | v0.13.5 | `ui/curve-editor.ts`：§2.4 全部（把手 40px 定长、drag-value rel 状态机 shift 细调、＋🗑、切线模式行 + 断开 + 复位、方向键/Delete）。**＋🗑 落左上角而非右上角**：(1,1) 是恒等曲线的末端键，右上会盖住键（截图实测）。键/把手是 HTML 元素（CSS px 命中面），只有曲线/网格/把手线是 SVG。handle 多两个方法 `select(i)`、opts 多 `keyStep`。`curves-kernel` `CurvesParams` 通道曲线 = `AnimCurve`，`curveOf()` 兼容旧 `[x,y][]` 点表（MCP 回放）。`hiddenInMenu` 撤。真浏览器探针 `tools/probes/curve-editor.mjs`。 |
| 3 | v0.13.6 | `common/color-ramp.ts`：§2.2 全部 + `sanitizeRamp`/`cloneRamp`/`hexToRgba8`/`rgba8ToCss`/`RAMP_INTERPS`/`RAMP_SPACES`；`color-dist.ts` +`oklabToSrgb`（往返 ≤1/255 测试锁）。`gradient-map-kernel` id=`gradientMap`，`FILTER_KERNELS` 封闭集 6→7。`ui/ramp-editor.ts`：**＋🗑 不 overlay 在条上**（条 36px 高、渐变就是内容，盖起点色=遮内容，截图实测）→ 放读数行右侧；其余照 §2.5（256 段硬边 CSS 渐变、小旗色标、插值/色彩空间 select、翻转、取前景色）。「取前景色」读口 = `filters.ts setFilterForegroundColorProvider`（filters-adjust init 注入 `state.color`，插件不 import app 层）。探针 `tools/probes/gradient-map.mjs`。 |
| 4 | v0.13.7 | 新模块 `common/pressure-curve.ts`：`makePressureShaper({pressureGamma, pressureCurve})` → 有合法曲线烤 256 Float32 LUT 线性插值查表，否则 `p^gamma`（同旧引擎地板 0.01）；`curveFromGamma(g)` 5 key 采样（g=1 精确恒等）。消费者 = `backend/brush.ts`（StrokeState.pShape，`_stepFor`/`_stampParams` 两处 pow 换掉）+ `plugins/smudge-engine.ts`（手指也吃）。**笔刷 JSON 新顶层可选键 `pressureCurve: AnimCurve`**（`Brush`/`BrushPreset`/`ResolvedBrush.pressureCurve: AnimCurve|null`/`BrushDraft`/`makeBrush` 缺省不写键/`brush-io` 导出）；旧 `size.pressureCurve`/`flow.pressureCurve` 数字字段与迁移代码不碰。**UI 不是直接把 gamma 行换成编辑器，而是 opt-in**：笔设置「高级」保留 pressureGamma 滑条 + 「改用曲线」钮（起点 = 现 gamma 采样）；有曲线时编辑器替代滑条 + 「改回 gamma」钮（删键→引擎回落 gamma）。理由：不静默迁移任何旧笔（出厂笔 JSON 形状不变、`builtin-brushes.test` 逐字段契约不动）。探针 `tools/probes/pressure-curve.mjs`。 |

未做（照 §4 park）：预设库、加权切线 UI、HSV 色空间、B-spline/Cardinal、时间轴皮（pan/zoom）、双击加点/拖出删、色轮内嵌 ramp 编辑器。


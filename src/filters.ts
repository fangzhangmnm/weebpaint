// v131 (user：「Filter 抽象成接口，插件可以使用」)
// v132 (user：「pre-alpha 不怕 refactor，所有 color adjustment 做成第一方默认安装的插件」)
//
// Filter 平台：base contract + registry + 共享 helper。
// 第一方插件在 src/plugins/，import 自己注册。
// 后期下载插件：fetch script → new Function / dynamic import → 同样调 registerFilter
//
// ============= Filter 契约 =============
// 一个 Filter = 一个 ES class，全 static：
//
//   static id           : 唯一 string（菜单 / history 用）
//   static title        : 中文显示名
//   static category     : "adjustment" / "artist" / "liquify" / ...（菜单分组，预留）
//                          v132 都是 "adjustment"，未来 "artist" plug-in 走插件下载
//   static modes        : ["region"] / ["region","brush"] / ["brush"]
//                          region = 整层 / 选区一次性烤
//                          brush  = 笔刷输入（每 stamp 触发，按 brushAlpha 局部混合）—— v132+
//   static bleedRadius(params) : 输出一个像素最多读输入 ±N 邻域（non-local 用）
//                                per-pixel filter 返 0
//                                brush 模式 runtime 用它 padding stamp bbox（region 不需要）
//   static defaults()   : 返参数初始值对象
//   static buildBody(container, state, onChange) :
//     在 container 里建 DOM。改 state.params 后调 onChange() 触发预览。
//     插件可放任何 UI——slider、色环、canvas、color ramp 等。
//   static bake(srcData, dstData, params, mask, w, h) :
//     纯函数 src→dst（同尺寸）。mask=null 时全图，mask = gray8 Uint8Array（v0.4.6：
//     Selection.materializeMaskRegion 窄读口产物），mask[i] < 128 时该像素 passthrough。
//
// ============= 插件加载（future）=============
// window.WeebPaint.registerFilter(MyFilterClass) — 暴露在 app.js 末尾
// onFilterRegistered(fn) — 监听新 filter，菜单自动加入口
// 下载插件接口：[ai-docs/20260528-backlog.md] AI 远程 / 本地 WASM 段落

// registry 原语共享自 registry.js（candidate 2：filter 与 exporter 同一道接缝）。
import { makeRegistry } from "./registry.ts";
import { makeRampSlider } from "./ui/ramp-slider.ts";
import { createSelectField } from "./ui/select-field.ts";   // 2026-09-02 C6 下拉标准件

// ============= Filter 契约（TS 化）=============
// 一个 Filter = 一个全 static 的 ES class。下面是其类型契约——消费侧
// （filters-adjust.ts、plugins/*）依赖此形状。runtime brush 方法
// （各插件自己注入：模糊/锐化 plugins/wash-brush.ts、手指 plugins/smudge.ts、液化 plugins/liquify.ts）是可选的。
// C8：region filter 的纯计算面（bake/defaults/bleedRadius）析出 backend/filters/（filter 档口
// 的 kernel 域）——FilterParams/clamp8 的 SSoT 在那边，这里 re-export 保存量 import 路径。

export type { FilterParams } from "./backend/filters/kernel.ts";
import type { FilterParams } from "./backend/filters/kernel.ts";
export { clamp8 } from "./backend/filters/kernel.ts";

// region filter bake：纯函数 src→dst（同尺寸）。mask=null 全图。
export interface Filter {
  id: string;
  title: string;
  category?: string;
  modes?: string[];
  bleedRadius?(params: FilterParams): number;
  defaults?(): FilterParams;
  buildBody?(container: HTMLElement, state: unknown, onChange: () => void): void;
  // 2026-09-05：面板关闭 / 重置重建前的收口钩（注销 color target、dispose 编辑器等）。没副作用的插件不用实现。
  disposeBody?(state: unknown): void;
  // 2026-09-06：声明即让调整浮窗可整窗拖大；收 body 可用尺寸（px）自己撑内容（曲线滤镜把绘图区贴满）。
  onBodyResize?(state: unknown, avail: { w: number; h: number }): void;
  // 能力声明（2026-08-28）：active 是图层组时，本 filter 能不能一次吃下整组的叶？
  //   true  = beginBrushStroke 会收到组内全部叶（含隐藏），自负「所有叶同待遇」的语义（液化=共享位移场）。
  //   缺省/false = 只吃单叶；input 侧照旧硬拒组（st.groupNoDraw）。
  //   色彩类 filter（wash-brush）**不该**声明 true——逐叶 blur 再合成 ≠ 合成后 blur，
  //   那是另一种语义，要做得先设计，不能靠这个开关顺手拿到。
  supportsLayerGroup?: boolean;
  // 预览宿声明（2026-09-18，区域程序提案 §3.3 ②）：描边期写靶住哪。
  //   缺省 "shadow" = CPU 替身叶（StrokeShadow；液化现状）；"region" = GPU 驻留的 RegionStroke（手指 / 模糊 / 锐化），
  //   input._beginFilterBrush 据此建 StrokeSession。声明 "region" 的 filter 收到的 targets[0] 是 RegionStroke。
  strokePreview?: "shadow" | "region";
  // region 预览要不要起笔快照 W₀（wash 类要：滤波从起笔原像素算；手指不要）。缺省 false。
  strokeSnapshot?: boolean;
  bake(
    srcData: Uint8ClampedArray,
    dstData: Uint8ClampedArray,
    params: FilterParams,
    mask: Uint8Array | null,
    w: number,
    h: number,
  ): void;
  // runtime brush 方法（插件注入；state 对契约不透明）。
  // targets = 写靶列表（单叶恒 [target]；组液化 = 组内全部叶各一个）——见 supportsLayerGroup。
  beginBrushStroke?(
    targets: readonly StrokeTarget[],
    params: FilterParams,
    brushSettings: BrushSettings,
    selection: BrushSelection | null,
    x: number,
    y: number,
    p: number,
  ): unknown;
  extendBrushStamp?(state: unknown, x: number, y: number, p: number): void;
  endBrushStroke?(state: unknown): void;
  cancelBrushStroke?(state: unknown): void;
  flushDirty?(state: unknown): DirtyRect | null;
}

// StrokeTarget = 一笔期间的像素写靶（2026-09-18 改名，user「反正别叫Layer, brushlayer也改名，如果语义一样那么改一样的名字」）：
//   运行时是 StrokeShadow 替身（C6）或 GPU 驻留的 RegionStroke，**不是图层树节点**。原 BrushLayer（filters）与
//   SmudgeLayer（smudge-engine）语义相同，合并为一个，字段取并集：doc 尺寸 + 内容框 + 字节读写口。
export interface StrokeTarget {
  docW: number;
  docH: number;
  bboxX: number;
  bboxY: number;
  bboxW: number;
  bboxH: number;
  getImageData(docX: number, docY: number, w: number, h: number): ImageData;
  putImageData(docX: number, docY: number, img: ImageData): void;
}

export interface BrushSettings {
  size: number;
  spacingValue?: number;
  hardness?: number;
  flow?: number;
  opacity?: number;
  // 2026-09-05（手指）：实际传入的是 ResolvedBrush（input.getResolvedBrush），下面几项它都有；
  //   声明成可选让插件不必 cast 整个对象。spacing = 直径比例（ResolvedBrush 字段名；spacingValue 是旧名）。
  spacing?: number;
  sizeCoeff?: number;
  flowCoeff?: number;
  opaCoeff?: number;
  pressureGamma?: number;
  pressureCurve?: unknown;   // 2026-09-05 可选压感曲线（ResolvedBrush.pressureCurve；插件经 sanitizeCurve 读）
  color?: string;
}

export interface BrushSelection {
  bboxX: number;
  bboxY: number;
  materializeMaskRegion(x0: number, y0: number, w: number, h: number): Uint8Array;   // gray8 窄读口（selection.ts）
}

export type DirtyRect = [number, number, number, number];


const _reg = makeRegistry<Filter>({ name: "filter" });

export function registerFilter(FilterClass: Filter): void {
  if (!FilterClass || !FilterClass.id) {
    throw new Error("Filter must have a static id");
  }
  _reg.register(FilterClass);
}

export function getFilter(id: string): Filter | null {
  return _reg.get(id);
}

export function listFilters(): Filter[] {
  return _reg.list();
}

// 监听新 filter 注册；菜单 lazy 渲染 / 插件加载后自动出现入口
export function onFilterRegistered(fn: (item: Filter) => void): () => void {
  return _reg.onRegistered(fn);
}

// ============= 共享 helper =============

// 一行 slider row：label + 滑块 + 数字
//   onChange(key, value) 在 input 时触发
//   fmt(value) 可选格式化数字显示
//   gradient 可选 CSS background（color ramp slider）
// v0.7.8：内部从原生 range 换 ui/ramp-slider 深模块（自绘 track+thumb，drag-value 拖动核）——
//   全部 adjust 滑块一次性获得 shift 细调（指针动、值慢动）；签名/返回不变，消费者零改动。
export interface SliderRowOpts {
  fmt?: (value: number) => string;
  gradient?: string;
}

export function makeSliderRow(
  label: string,
  key: string,
  min: number,
  max: number,
  step: number,
  init: number,
  onChange: (key: string, value: number) => void,
  opts: SliderRowOpts = {},
): HTMLLabelElement {
  return makeRampSlider({
    label, min, max, step, value: init,
    fmt: opts.fmt, gradient: opts.gradient,
    onInput: (v) => onChange(key, v),
  }).el;
}

export function makeSectionTitle(text: string): HTMLDivElement {
  const d = document.createElement("div");
  d.className = "adjust-section-title";
  d.textContent = text;
  return d;
}

// ============= 色彩类滤镜笔间距地板 =============
// 2026-09-18：wash 笔行为搬 GPU 区域程序（plugins/wash-brush.ts）；旧 CPU 分块实现最后形态 = git 4bb35dd。这里只剩常数。
/** 色彩类滤镜笔（模糊/锐化）的间距地板：wash 合成后间距只影响 mask 边缘平滑度，10% 足够；再小 = 白烧 dab。 */
export const COLOR_BRUSH_MIN_SPACING = 0.1;

// 给插件 / 自定义 UI 用：返回一个 `<select>` row
export interface SelectOption {
  value: string;
  label: string;
}

export function makeSelectRow(
  label: string,
  key: string,
  options: SelectOption[],
  init: string,
  onChange: (key: string, value: string) => void,
): HTMLLabelElement {
  const wrap = document.createElement("label");
  wrap.className = "brush-slider-row";
  wrap.innerHTML = `<span class="brush-slider-label">${label}</span>`;
  // 2026-09-02 C6：select-field 标准件（原生 <select> 退役）；值受控在闭包里
  let cur = init;
  const f = createSelectField({
    className: "generic-sheet-input",
    items: () => options.map((o) => ({ value: o.value, label: o.label })),
    value: () => cur,
    onChange: (v) => { cur = v; onChange(key, v); },
  });
  f.el.style.flex = "1";
  wrap.appendChild(f.el);
  wrap.insertAdjacentHTML("beforeend", `<span class="brush-slider-value" style="min-width:0"></span>`);
  return wrap;
}

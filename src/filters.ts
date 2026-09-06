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
// （attachColorBrushBehavior 注入）是可选的。
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
  // 能力声明（2026-08-28）：active 是图层组时，本 filter 能不能一次吃下整组的叶？
  //   true  = beginBrushStroke 会收到组内全部叶（含隐藏），自负「所有叶同待遇」的语义（液化=共享位移场）。
  //   缺省/false = 只吃单叶；input 侧照旧硬拒组（st.groupNoDraw）。
  //   色彩类 filter（attachColorBrushBehavior）**不该**声明 true——逐叶 blur 再合成 ≠ 合成后 blur，
  //   那是另一种语义，要做得先设计，不能靠这个开关顺手拿到。
  supportsLayerGroup?: boolean;
  bake(
    srcData: Uint8ClampedArray,
    dstData: Uint8ClampedArray,
    params: FilterParams,
    mask: Uint8Array | null,
    w: number,
    h: number,
  ): void;
  // attachColorBrushBehavior 注入的 runtime brush 方法（color-brush 类 filter）。
  // layers = 写靶叶列表（单叶恒 [leaf]；组液化 = 组内全部叶）——见 supportsLayerGroup。
  beginBrushStroke?(
    layers: readonly BrushLayer[],
    params: FilterParams,
    brushSettings: BrushSettings,
    selection: BrushSelection | null,
    x: number,
    y: number,
    p: number,
  ): ColorBrushState;
  extendBrushStamp?(state: ColorBrushState, x: number, y: number, p: number): void;
  endBrushStroke?(state: ColorBrushState): void;
  flushDirty?(state: ColorBrushState): DirtyRect | null;
}

// color-brush 行为操作的层读写面（ViewLeaf/StrokeShadow 同形——C6 起引擎写靶可能是替身叶）。
export interface BrushLayer {
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

// 单 stroke 的可变状态（beginBrushStroke 返回，后续方法读写）。
// 2026-09-06 wash 幂等改造（user「模糊笔 wash idempotent 同意」；议程 §E）：不再逐 dab 烤+混回（重叠 dab = 叠加滤波，
//   间距同时决定强度与成本），改成「dab 只累积覆盖 mask，flush 时对扫过区域**从起笔原像素**算一次滤波，按 max 覆盖合成」——
//   一笔之内来回描不再越描越糊，强度与间距解耦，成本从 O(dab 数) 降到 O(面积/帧)。
export interface ColorBrushTile {
  x0: number; y0: number; w: number; h: number;
  orig: Uint8ClampedArray;      // 起笔时该 tile 的原像素（首次触及时从写靶读一次；写靶是 shadow 替身，起笔即快照）
  cov: Float32Array;            // 覆盖 0..1（wash：max）
  sel: Uint8Array | null;       // 选区 gray8（懒物化）
}
export interface ColorBrushState {
  layer: BrushLayer;
  params: FilterParams;
  brushSettings: BrushSettings;
  selection: BrushSelection | null;
  FilterClass: Filter;
  lastX: number;
  lastY: number;
  pendingDist: number;
  dirty: DirtyRect | null;
  pending: Array<{ cx: number; cy: number; R: number; a: number }>;   // 自上次 flush 以来的 dab
  tiles: Map<string, ColorBrushTile>;
  dabs: number;                 // 撒过的 dab 总数（测试观测间距地板用）
}

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

// ============= 「色彩转换」brush 模式 helper =============
//
// blur / sharpen / 未来 mosaic-brush / color-shift-brush 这种 "src → dst" 类 filter
// 共用一套 brush 行为：spacing 控的 stamp 序列 + 圆形 stamp alpha + 选区 mask + blend
//
// Filter 用法：
//   class BlurFilter {
//     static bake(...) { ... }
//     static bleedRadius(p) { ... }
//   }
//   attachColorBrushBehavior(BlurFilter);
//   // 之后 BlurFilter.beginBrushStroke/extendBrushStamp/endBrushStroke/flushDirty 都有了
//
// 跟 liquify（位移场）那种 filter 不同；位移场 filter 自己写完整 brush 方法。
/** 色彩类滤镜笔（模糊/锐化）的间距地板：wash 合成后间距只影响 mask 边缘平滑度，10% 足够；再小 = 白烧 dab。 */
export const COLOR_BRUSH_MIN_SPACING = 0.1;
const CB_TILE = 256;

export function attachColorBrushBehavior(FilterClass: Filter): void {
  FilterClass.beginBrushStroke = function(layers: readonly BrushLayer[], params: FilterParams, brushSettings: BrushSettings, selection: BrushSelection | null, x: number, y: number, p: number): ColorBrushState {
    // 色彩类 filter 是单叶语义（见 Filter.supportsLayerGroup 注释）——多叶传进来 = 上游路由错了，
    // 响亮拒绝而不是静默只处理第一叶（家规：不许静默吞）。
    if (layers.length !== 1) {
      throw new Error(`Filter ${FilterClass.id}: color-brush behavior is single-leaf (got ${layers.length} targets)`);
    }
    const layer = layers[0];
    const state: ColorBrushState = {
      layer, params, brushSettings, selection, FilterClass,
      lastX: x, lastY: y, pendingDist: 0, dirty: null,
      pending: [], tiles: new Map(), dabs: 0,
    };
    _cbPushDab(state, x, y, p);
    return state;
  };
  FilterClass.extendBrushStamp = function(state: ColorBrushState, x: number, y: number, p: number): void {
    const dx = x - state.lastX, dy = y - state.lastY;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0) return;
    const bs = state.brushSettings;
    const R = Math.max(2, bs.size / 2);
    // 2026-09-05（user「模糊也改，都统一」）：读 ResolvedBrush.spacing（旧 spacingValue 兜底）；
    //   同日晚 user 反悔「有模糊的话改回10%」「模糊锐化自己的地板同意」→ 地板 COLOR_BRUSH_MIN_SPACING。
    //   2026-09-06 wash 幂等后间距只管 mask 边缘，与强度解耦（议程 §E）。
    const presetSpacing = (typeof bs.spacing === "number" && bs.spacing > 0) ? bs.spacing : (bs.spacingValue || 0.06);
    const spacingFrac = Math.max(COLOR_BRUSH_MIN_SPACING, presetSpacing);
    const spacingPx = Math.max(1, R * 2 * spacingFrac);
    state.pendingDist += dist;
    if (state.pendingDist < spacingPx) {
      state.lastX = x; state.lastY = y;
      return;
    }
    const ux = dx / dist, uy = dy / dist;
    let placedDist = spacingPx - (state.pendingDist - dist);
    while (placedDist <= dist) {
      _cbPushDab(state, state.lastX + ux * placedDist, state.lastY + uy * placedDist, p);
      placedDist += spacingPx;
    }
    state.pendingDist = dist - (placedDist - spacingPx);
    state.lastX = x; state.lastY = y;
  };
  // 抬笔：把还没 flush 的 dab 合成掉（StrokeSession.end 在 endStroke 之后不再 flush，直接 commit 替身叶）
  FilterClass.endBrushStroke = function(state: ColorBrushState): void { _cbComposite(state); };
  FilterClass.flushDirty = function(state: ColorBrushState): DirtyRect | null {
    _cbComposite(state);
    const d = state.dirty;
    state.dirty = null;
    return d;
  };
}

function _cbPushDab(state: ColorBrushState, cx: number, cy: number, pressure: number): void {
  const bs = state.brushSettings;
  const R = Math.max(2, bs.size / 2 * (pressure ?? 1));
  const flow = Math.max(0, Math.min(1, bs.flow ?? bs.opacity ?? 1));
  if (flow <= 0) return;
  state.pending.push({ cx, cy, R, a: flow });
  state.dabs++;
}

function _cbTile(state: ColorBrushState, tx: number, ty: number): ColorBrushTile | null {
  const key = tx + "," + ty;
  let t = state.tiles.get(key);
  if (t) return t;
  const L = state.layer;
  const x0 = Math.max(tx * CB_TILE, L.bboxX), y0 = Math.max(ty * CB_TILE, L.bboxY);
  const x1 = Math.min((tx + 1) * CB_TILE, L.bboxX + L.bboxW), y1 = Math.min((ty + 1) * CB_TILE, L.bboxY + L.bboxH);
  if (x1 <= x0 || y1 <= y0) return null;
  const w = x1 - x0, h = y1 - y0;
  t = { x0, y0, w, h, orig: new Uint8ClampedArray(L.getImageData(x0, y0, w, h).data), cov: new Float32Array(w * h), sel: null };
  if (state.selection) t.sel = state.selection.materializeMaskRegion(x0, y0, w, h);
  state.tiles.set(key, t);
  return t;
}

/** 把 pending dab 合成掉：① 覆盖 mask 取 max；② 扫过区域从原像素算一次滤波；③ out = lerp(orig, filtered, cov)（premult）。 */
function _cbComposite(state: ColorBrushState): void {
  const dabs = state.pending;
  if (!dabs.length) return;
  state.pending = [];
  const { layer, FilterClass, params, brushSettings } = state;
  const hardness = brushSettings.hardness ?? 0.6;
  const lx0 = layer.bboxX, ly0 = layer.bboxY, lx1 = lx0 + layer.bboxW, ly1 = ly0 + layer.bboxH;
  // ① 覆盖：逐 dab 在其覆盖的 tile 上 cov = max(cov, stampA·flow·sel)
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const d of dabs) {
    const sx0 = Math.max(Math.floor(d.cx - d.R), lx0), sy0 = Math.max(Math.floor(d.cy - d.R), ly0);
    const sx1 = Math.min(Math.ceil(d.cx + d.R), lx1), sy1 = Math.min(Math.ceil(d.cy + d.R), ly1);
    if (sx1 <= sx0 || sy1 <= sy0) continue;
    bx0 = Math.min(bx0, sx0); by0 = Math.min(by0, sy0); bx1 = Math.max(bx1, sx1); by1 = Math.max(by1, sy1);
    const innerR = d.R * hardness;
    for (let ty = Math.floor(sy0 / CB_TILE); ty * CB_TILE < sy1; ty++) {
      for (let tx = Math.floor(sx0 / CB_TILE); tx * CB_TILE < sx1; tx++) {
        const t = _cbTile(state, tx, ty);
        if (!t) continue;
        const px0 = Math.max(sx0, t.x0), py0 = Math.max(sy0, t.y0), px1 = Math.min(sx1, t.x0 + t.w), py1 = Math.min(sy1, t.y0 + t.h);
        for (let py = py0; py < py1; py++) {
          for (let px = px0; px < px1; px++) {
            const dist = Math.hypot(px + 0.5 - d.cx, py + 0.5 - d.cy);
            if (dist > d.R) continue;
            let stampA = 1;
            if (dist > innerR) { const u = (dist - innerR) / (d.R - innerR); stampA = 1 - u * u * (3 - 2 * u); }
            let a = stampA * d.a;
            const q = (py - t.y0) * t.w + (px - t.x0);
            if (t.sel) a *= t.sel[q] / 255;
            if (a > t.cov[q]) t.cov[q] = a;
          }
        }
      }
    }
  }
  if (!(bx1 > bx0 && by1 > by0)) return;
  // ② 扫过区域（+bleed）从原像素拼一块 src，算一次滤波
  const bleed = FilterClass.bleedRadius ? FilterClass.bleedRadius(params) : 0;
  const ex0 = Math.max(lx0, bx0 - bleed), ey0 = Math.max(ly0, by0 - bleed);
  const ex1 = Math.min(lx1, bx1 + bleed), ey1 = Math.min(ly1, by1 + bleed);
  const ew = ex1 - ex0, eh = ey1 - ey0;
  const src = new Uint8ClampedArray(ew * eh * 4);
  const cov = new Float32Array(ew * eh);
  for (let ty = Math.floor(ey0 / CB_TILE); ty * CB_TILE < ey1; ty++) {
    for (let tx = Math.floor(ex0 / CB_TILE); tx * CB_TILE < ex1; tx++) {
      const t = _cbTile(state, tx, ty);
      if (!t) continue;
      const px0 = Math.max(ex0, t.x0), py0 = Math.max(ey0, t.y0), px1 = Math.min(ex1, t.x0 + t.w), py1 = Math.min(ey1, t.y0 + t.h);
      for (let py = py0; py < py1; py++) {
        const so = ((py - t.y0) * t.w + (px0 - t.x0)) * 4, so1 = so + (px1 - px0) * 4;
        const dOff = ((py - ey0) * ew + (px0 - ex0)) * 4;
        src.set(t.orig.subarray(so, so1), dOff);
        const co = (py - t.y0) * t.w + (px0 - t.x0);
        cov.set(t.cov.subarray(co, co + (px1 - px0)), (py - ey0) * ew + (px0 - ex0));
      }
    }
  }
  const dst = new Uint8ClampedArray(ew * eh * 4);
  FilterClass.bake(src, dst, params, null, ew, eh);
  // ③ 只写回 dab 覆盖的 bbox（bleed 环只是滤波输入）：out = lerp(orig, filtered, cov)，premult 权重（黑边病根同款防线）
  const bw = bx1 - bx0, bh = by1 - by0;
  const out = new ImageData(bw, bh);
  const od = out.data;
  for (let j = 0; j < bh; j++) {
    for (let i = 0; i < bw; i++) {
      const ex = bx0 + i - ex0, ey = by0 + j - ey0;
      const q = ey * ew + ex, so = q * 4, oo = (j * bw + i) * 4;
      const a = cov[q];
      if (a <= 0) { od[oo] = src[so]; od[oo + 1] = src[so + 1]; od[oo + 2] = src[so + 2]; od[oo + 3] = src[so + 3]; continue; }
      const la = src[so + 3] / 255, fa = dst[so + 3] / 255;
      const na = la * (1 - a) + fa * a;
      if (na <= 0) { od[oo] = 0; od[oo + 1] = 0; od[oo + 2] = 0; od[oo + 3] = 0; continue; }
      const wl = (la * (1 - a)) / na, wf = (fa * a) / na;
      od[oo]     = src[so]     * wl + dst[so]     * wf;
      od[oo + 1] = src[so + 1] * wl + dst[so + 1] * wf;
      od[oo + 2] = src[so + 2] * wl + dst[so + 2] * wf;
      od[oo + 3] = na * 255;
    }
  }
  layer.putImageData(bx0, by0, out);
  const d = state.dirty;
  if (!d) state.dirty = [bx0, by0, bx1, by1];
  else { d[0] = Math.min(d[0], bx0); d[1] = Math.min(d[1], by0); d[2] = Math.max(d[2], bx1); d[3] = Math.max(d[3], by1); }
}

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

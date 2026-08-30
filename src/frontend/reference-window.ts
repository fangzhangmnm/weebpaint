// <wp-reference-window> —— 参考图浮动小窗，家族 web component 约定试点（C9）。
// 约定全文见 ai-docs/20260810-family-web-component-convention.md。要点：
//   - 组件自带 chrome（shadow DOM：样式/图标/手势），宿主 store 零知识——不 import desk/i18n/backend。
//   - 入向 = 属性/property 下灌（**程序性 set 不发事件**，同原生 <input>.value 语义）；
//     出向 = CustomEvent（只有**用户交互**发：pan/pinch/wheel/拖窗/resize/菜单/翻页/删除/吸色）。
//     宿主对回声事件做值比较（RO 在程序性改动后也会 fire）——见 side-windows.ts 适配层。
//   - 主题 = CSS 变量穿透（--bg/--ink/--line/--radius/--shadow/--z-window/--void/--void-dot，
//     全带 fallback，裸挂也能看）；文案 = slot（empty，宿主 light DOM 走自家 i18n）+ labels property。
//   - 图标烤进 shadow（<use href="#id"> 不穿 shadow 边界），源=家族 sprite（20260708 SVG Icons），
//     对账 id：folder / cloud / picture-in-picture / x / plus / chevron-left / chevron-right /
//     clipboard-paste / trash-can（后五个如库里缺 → 已按纪律登记该仓 TODO.md）。
//   - live 镜像的**合成知识在宿主**（backend/doc-render）：宿主 set 一次 liveProvider 端口。
//
// ══ 0830 整改批（spec=ai-docs/20260830-reference-window-rework-spec.md，user 逐条拍板）══
//   borderless：标题栏退役；常驻件只剩 ＋（菜单+拖把）/ 角 grip / N>1 时 ‹ › chip（闲置淡出）。
//   多参考：单窗翻页模型（items[]，每项自带 vp；live=其中一页）。
//   长按=吸色（恒开，吸色钮/开关门退役——窗内不能画，长按无歧义）；双击=适应（显式钮退役）。
//   放大 nearest（scale≥2 关 smoothing，像素画 friendly）；底=void+点阵（屏幕空间，对齐主画布）。
//
// 手势数学仍走 common/pointer-gesture（与主画布同一套三角）。

import { pinchScaleRot, solveAnchorTranslation } from "../common/pointer-gesture.ts";
import type { GestureViewport } from "../common/pointer-gesture.ts";

export type RefViewport = GestureViewport;
export interface RefPanelRect { left: number; top: number; width: number; height: number; }
// bitmap 源：鸭子 union（只用 .close?.()/.width/.height/drawImage）。
export type RefBitmapSource = (ImageBitmap | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas) & { close?: () => void };
export type RefLiveSource = HTMLCanvasElement | OffscreenCanvas | ImageBitmap;
export interface RefLabels {
  load?: string; paste?: string; cloud?: string; live?: string;
  del?: string; delConfirm?: string; closeWin?: string;
  prev?: string; next?: string; menu?: string; resize?: string; resizeAria?: string;
}
// 多参考 item（组件运行时形；持久化映射在宿主 side-windows）。vp=null → 首次显示时 fit。
export type RefItem =
  | { kind: "image"; bitmap: RefBitmapSource; blob: Blob | null; vp: RefViewport | null }
  | { kind: "live"; vp: RefViewport | null };

const REF_LONG_PRESS_MS = 450;                // 长按吸色延迟（对齐 input.ts）
const REF_LONG_PRESS_CANCEL_SQ = 64;          // 8px²：长按期间移动超此 → 取消，回 pan
const LIVE_THROTTLE_MS = 300;                 // S9：live 全量合成节流；到期 timer 补帧收尾
const PLUS_DRAG_SLOP = 6;                     // ＋ 拖把：位移超此 = 拖窗，未超 = 点开菜单
const IDLE_DIM_MS = 2500;                     // 闲置淡出（.35 透明度）
const NEAREST_MIN_SCALE = 2;                  // 放大 nearest 阈值（像素画 friendly；与编辑器手感对齐可调）
// WeebPaint 布局事实（组件自有默认；宿主布局大改时同步这里）：
const SPAWN_LEFT = 112, SPAWN_TOP = 104;      // v112/v267：默认避开 topbar(56)+左栏(80)+iPad 状态栏
const CLAMP_MIN_LEFT = 96, CLAMP_MIN_TOP = 96;   // v268b：旧持久化位置钳进安全区
const DRAG_TOP_FLOOR = 60;                    // 拖窗 top 地板=出血区（v0.4.11，同 layers-panel）
const MIN_EDGE = 96;                          // 丝薄：最小边（user 0830「最小宽度也需要能非常小」）

interface PanelDragState { id: number; sx: number; sy: number; ol: number; ot: number; moved: boolean; }
interface ResizeDragState { id: number; sx: number; sy: number; w0: number; h0: number; }
interface GestureStartState { midX: number; midY: number; dist: number; angle: number; vp: RefViewport; }
interface PointerPos { x: number; y: number; }

// 图标：家族 sprite 烤入（id 注记 = 对账 key）。stroke 属性同 sprite 头（1.7/round/round）。
const SVG_ATTRS = `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;
const ICON_FOLDER = `<svg ${SVG_ATTRS}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`;
const ICON_PIP = `<svg ${SVG_ATTRS}><rect x="3" y="4" width="18" height="14" rx="2"/><rect x="12" y="10" width="7" height="5" rx="1"/></svg>`;
const ICON_X = `<svg ${SVG_ATTRS}><path d="M6.5 6.5 L17.5 17.5 M17.5 6.5 L6.5 17.5"/></svg>`;
const ICON_CLOUD = `<svg ${SVG_ATTRS}><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>`;   // sprite#cloud
const ICON_PLUS = `<svg ${SVG_ATTRS}><path d="M12 5v14M5 12h14"/></svg>`;                                  // sprite#plus 对账
const ICON_CHEV_L = `<svg ${SVG_ATTRS}><path d="M14.5 5.5 L8 12 L14.5 18.5"/></svg>`;
const ICON_CHEV_R = `<svg ${SVG_ATTRS}><path d="M9.5 5.5 L16 12 L9.5 18.5"/></svg>`;
const ICON_PASTE = `<svg ${SVG_ATTRS}><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4a3 3 0 0 1 6 0"/></svg>`;   // 剪贴板
const ICON_TRASH = `<svg ${SVG_ATTRS}><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l1 13h9l1-13"/></svg>`;      // sprite#trash-can 对账

// chrome 全 overlay（borderless）：窗体只有 1px 边框+阴影当边界 affordance（无边界在同款点阵底上
// 根本看不见窗在哪），内容满铺。
const TEMPLATE = `<style>
:host {
  position: fixed;
  top: 60px; left: 16px;
  display: block;
  width: 280px; height: 320px;
  min-width: ${MIN_EDGE}px; min-height: ${MIN_EDGE}px;
  resize: both;              /* 桌面鼠标拖右下角；touch 走 .grip */
  overflow: hidden;
  border: 1px solid var(--line, #3c4043);
  border-radius: var(--radius, 10px);
  box-shadow: var(--shadow, 0 8px 24px rgba(0, 0, 0, 0.4));
  z-index: var(--z-window, 100);
  -webkit-tap-highlight-color: transparent;
  font-size: 13px;
  /* 底=editor 画布 void 同款（user 0830）：--void/--void-dot 穿透 shadow；24px 网格 / r1.25px 软边。
     attachment:fixed = 屏幕空间（拖窗点不动，浮在同一张桌布上）；y 相位补偿对齐 GL 网格原点
     （画布左下 vs 视口左上），宿主 board resize 时写 --void-grid-phase-y（= 视口高 mod 24px）。 */
  background-color: var(--void, #e6e2d6);
  background-image: radial-gradient(circle, var(--void-dot, #cec8b8) 1.25px, transparent 2px);
  background-size: 24px 24px;
  background-attachment: fixed;
  background-position: 0 var(--void-grid-phase-y, 0px);
}
:host(:not([open])) { display: none; }
canvas {
  position: absolute; inset: 0; display: block;
  width: 100%; height: 100%;
  touch-action: none; cursor: grab;
}
canvas:active { cursor: grabbing; }
:host([pick]) canvas, :host([pick]) canvas:active { cursor: crosshair; }
.plus {
  position: absolute; top: 4px; right: 4px; z-index: 3;
  width: 30px; height: 30px; padding: 0; border: none; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--bg, #202124) 72%, transparent);
  color: var(--ink, #e8eaed); cursor: grab;
  touch-action: none; user-select: none; -webkit-user-select: none;
  transition: opacity 0.35s;
}
.plus svg { width: 18px; height: 18px; pointer-events: none; }
.plus:hover { background: color-mix(in srgb, var(--bg, #202124) 90%, transparent); }
.grip {
  position: absolute; right: 2px; bottom: 2px; width: 22px; height: 22px;
  cursor: nwse-resize; touch-action: none; z-index: 2;
  color: var(--ink-soft, #9aa0a6); opacity: 0.55;
  transition: opacity 0.35s;
}
.grip:hover { opacity: 1; }
.grip::after {
  content: ""; position: absolute; inset: 3px;
  background: repeating-linear-gradient(-45deg, currentColor 0 1.6px, transparent 1.6px 5px);
  clip-path: polygon(100% 0, 100% 100%, 0 100%);
}
.chips {
  position: absolute; left: 50%; bottom: 4px; transform: translateX(-50%); z-index: 2;
  display: flex; align-items: center; gap: 2px;
  background: color-mix(in srgb, var(--bg, #202124) 72%, transparent);
  border-radius: 12px; padding: 1px 4px;
  color: var(--ink, #e8eaed);
  transition: opacity 0.35s;
}
.chips.hidden { display: none; }
.chip { background: transparent; border: none; color: inherit; padding: 2px; cursor: pointer; display: flex; }
.chip svg { width: 14px; height: 14px; }
.chip-count { font-size: 11px; min-width: 26px; text-align: center; color: var(--ink-soft, #9aa0a6); }
:host(.idle) .plus, :host(.idle) .grip, :host(.idle) .chips { opacity: 0.35; }
.menu {
  position: absolute; top: 38px; right: 4px; z-index: 4;
  min-width: 170px; padding: 4px;
  background: var(--bg, #202124);
  border: 1px solid var(--line, #3c4043);
  border-radius: 8px;
  box-shadow: var(--shadow, 0 8px 24px rgba(0, 0, 0, 0.4));
  display: flex; flex-direction: column;
}
.menu.hidden { display: none; }
.menu hr { border: none; border-top: 1px solid var(--line, #3c4043); margin: 4px 2px; }
.mi {
  display: flex; align-items: center; gap: 8px;
  background: transparent; border: none; color: var(--ink, #e8eaed);
  padding: 7px 8px; border-radius: 6px; cursor: pointer;
  font: inherit; text-align: left;
}
.mi svg { width: 16px; height: 16px; flex: none; color: var(--ink-soft, #9aa0a6); }
.mi:hover { background: color-mix(in srgb, var(--ink, #e8eaed) 8%, transparent); }
.mi.hidden { display: none; }
.mi[data-arm="1"] { color: #e2574c; }
.mi[data-arm="1"] svg { color: #e2574c; }
.empty {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; text-align: center; color: var(--ink-soft, #9aa0a6);
  pointer-events: none; padding: 12px; font-size: 12px;
}
.empty.hidden { display: none; }
.empty ::slotted(*), .empty p { margin: 0; }
</style>
<canvas></canvas>
<div class="empty"><slot name="empty"><p>＋ 导入参考图</p></slot></div>
<button class="plus" part="plus" type="button" aria-haspopup="true">${ICON_PLUS}</button>
<div class="grip" part="grip"></div>
<div class="chips hidden">
  <button class="chip" data-page="-1" type="button">${ICON_CHEV_L}</button>
  <span class="chip-count">1/1</span>
  <button class="chip" data-page="1" type="button">${ICON_CHEV_R}</button>
</div>
<div class="menu hidden" role="menu">
  <button class="mi" data-mi="load" type="button" role="menuitem">${ICON_FOLDER}<span></span></button>
  <button class="mi" data-mi="paste" type="button" role="menuitem">${ICON_PASTE}<span></span></button>
  <button class="mi" data-mi="cloud" type="button" role="menuitem">${ICON_CLOUD}<span></span></button>
  <button class="mi" data-mi="live" type="button" role="menuitem">${ICON_PIP}<span></span></button>
  <hr>
  <button class="mi" data-mi="delete" type="button" role="menuitem">${ICON_TRASH}<span></span></button>
  <button class="mi" data-mi="close" type="button" role="menuitem">${ICON_X}<span></span></button>
</div>`;

export class WpReferenceWindow extends HTMLElement {
  static get observedAttributes() { return ["open", "no-cloud"]; }   // no-cloud：宿主云功能关 → 藏云盘选图项

  // 宿主端口：live 合成 provider（一次性 set；组件在当前页 kind=live 时消费）。null = 合成不可用保上帧。
  liveProvider: (() => RefLiveSource | null) | null = null;

  private _canvas: HTMLCanvasElement;
  private _cctx: CanvasRenderingContext2D;
  private _emptyEl: HTMLElement;
  private _plusEl: HTMLButtonElement;
  private _menuEl: HTMLElement;
  private _chipsEl: HTMLElement;
  private _chipCountEl: HTMLElement;
  private _delItemEl: HTMLButtonElement;

  // ---- 多参考模型 ----
  private _items: RefItem[] = [];
  private _index = 0;
  private _labels: RefLabels = {};

  private _liveSource: RefLiveSource | null = null;
  private _liveDirty = false;
  private _lastLiveComposeT: number | undefined;
  private _liveThrottle: ReturnType<typeof setTimeout> | null = null;

  private _vp: RefViewport = { tx: 0, ty: 0, scale: 1, rot: 0 };
  private _raf: number | null = null;
  private _panelDrag: PanelDragState | null = null;
  private _resizeDrag: ResizeDragState | null = null;
  private _pointers = new Map<number, PointerPos>();
  private _gestureStart: GestureStartState | null = null;
  private _picking = false;
  private _longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private _lpStart: PointerPos | null = null;
  private _lpEvent: PointerEvent | null = null;
  private _idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = TEMPLATE;
    this._canvas = root.querySelector("canvas")!;
    this._emptyEl = root.querySelector(".empty")!;
    this._plusEl = root.querySelector(".plus")!;
    this._menuEl = root.querySelector(".menu")!;
    this._chipsEl = root.querySelector(".chips")!;
    this._chipCountEl = root.querySelector(".chip-count")!;
    this._delItemEl = root.querySelector('[data-mi="delete"]')!;
    this._cctx = this._canvas.getContext("2d")!;
    this._bind(root);
  }

  // ---- 属性面（入向；程序性 set 不发事件）----
  get open(): boolean { return this.hasAttribute("open"); }
  set open(v: boolean) { this.toggleAttribute("open", !!v); }
  attributeChangedCallback(name: string, oldV: string | null, newV: string | null) {
    if (name === "no-cloud") {
      this._menuEl.querySelector('[data-mi="cloud"]')!.classList.toggle("hidden", newV != null);
      return;
    }
    if (name === "open" && oldV !== newV && newV != null) this._afterShow();
  }
  close() { this.open = false; }   // 程序性关（不发事件）

  get live(): boolean { return this._items[this._index]?.kind === "live"; }
  isLive(): boolean { return this.live; }

  get viewport(): RefViewport { return { ...this._vp }; }
  set viewport(v: RefViewport | null | undefined) {
    if (!v) return;
    if (Number.isFinite(v.tx)) this._vp.tx = v.tx;
    if (Number.isFinite(v.ty)) this._vp.ty = v.ty;
    if (Number.isFinite(v.scale)) this._vp.scale = v.scale;
    if (Number.isFinite(v.rot)) this._vp.rot = v.rot;
    const cur = this._items[this._index];
    if (cur) cur.vp = { ...this._vp };
    this._invalidate();
  }

  get rect(): RefPanelRect {
    const r = this.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }
  set rect(o: Partial<RefPanelRect> | null | undefined) {
    if (o && o.left != null && o.top != null) {
      // v268b：旧的(或越界的)持久化位置钳进安全区（iPad 顶部日期栏 + 左侧工具栏）
      this.style.left = Math.max(CLAMP_MIN_LEFT, o.left) + "px";
      this.style.top = Math.max(CLAMP_MIN_TOP, o.top) + "px";
      if (o.width) this.style.width = o.width + "px";
      if (o.height) this.style.height = o.height + "px";
    } else if (!this.style.left || !this.style.top) {
      this.style.left = SPAWN_LEFT + "px";
      this.style.top = SPAWN_TOP + "px";
    }
  }

  set labels(l: RefLabels) {
    this._labels = { ...this._labels, ...l };
    const setText = (mi: string, text?: string) => {
      const b = this._menuEl.querySelector(`[data-mi="${mi}"] span`) as HTMLElement | null;
      if (b && text) b.textContent = text;
    };
    setText("load", l.load); setText("paste", l.paste); setText("cloud", l.cloud);
    setText("live", l.live); setText("delete", l.del); setText("close", l.closeWin);
    const setTitle = (sel: string, title?: string, aria?: string) => {
      const b = this.shadowRoot!.querySelector(sel) as HTMLElement | null;
      if (!b) return;
      if (title) b.title = title;
      if (aria || title) b.setAttribute("aria-label", aria || title!);
    };
    setTitle(".plus", l.menu);
    setTitle('[data-page="-1"]', l.prev);
    setTitle('[data-page="1"]', l.next);
    setTitle(".grip", l.resize, l.resizeAria);
  }

  // ---- 多参考内容 API（宿主灌注；程序性，不发事件）----
  /** 整表替换（load 恢复用）。旧 image bitmap 全部释放。 */
  setItems(items: RefItem[], index = 0) {
    for (const it of this._items) if (it.kind === "image") it.bitmap.close?.();
    this._items = items.slice();
    this._index = Math.max(0, Math.min(items.length - 1, index));
    this._loadCurrentVp({ fitIfMissing: true });
    this._afterItemsChanged();
  }
  /** 追加一张图并翻到它（导入漏斗尾）。 */
  addImage(bitmap: RefBitmapSource, blob: Blob | null) {
    this._saveCurrentVp();
    this._items.push({ kind: "image", bitmap, blob, vp: null });
    this._index = this._items.length - 1;
    this._loadCurrentVp({ fitIfMissing: true });
    this._afterItemsChanged();
  }
  /** 画布镜像页：已有 → 翻过去；没有 → 追加并翻到（liveProvider 缺席 = no-op）。 */
  showLive() {
    if (!this.liveProvider) return;
    const i = this._items.findIndex((it) => it.kind === "live");
    this._saveCurrentVp();
    if (i >= 0) this._index = i;
    else { this._items.push({ kind: "live", vp: null }); this._index = this._items.length - 1; }
    this._liveDirty = true;
    this._loadCurrentVp({ fitIfMissing: true });
    this._afterItemsChanged();
  }
  /** 清空（换画/重置）。 */
  clearAll() {
    for (const it of this._items) if (it.kind === "image") it.bitmap.close?.();
    this._items = [];
    this._index = 0;
    this._stopLiveTimer();
    this._afterItemsChanged();
  }
  /** 宿主读走全部状态（desk 同步 + 保存收集）。当前页 vp 先回写。 */
  getRefState(): { index: number; items: Array<{ kind: "image"; blob: Blob | null; vp: RefViewport | null } | { kind: "live"; vp: RefViewport | null }> } {
    this._saveCurrentVp();
    return {
      index: this._index,
      items: this._items.map((it) => it.kind === "image"
        ? { kind: "image" as const, blob: it.blob, vp: it.vp ? { ...it.vp } : null }
        : { kind: "live" as const, vp: it.vp ? { ...it.vp } : null }),
    };
  }
  get itemCount(): number { return this._items.length; }

  fitToPanel() {
    const src = this._sourceSize();
    if (!src) return;
    const bw = this._canvas.width / (window.devicePixelRatio || 1);
    const bh = this._canvas.height / (window.devicePixelRatio || 1);
    if (src.w <= 0 || src.h <= 0 || bw <= 0 || bh <= 0) return;
    const s = Math.min(bw / src.w, bh / src.h) * 0.95;
    this._vp = { tx: bw / 2, ty: bh / 2, scale: s, rot: 0 };
    this._saveCurrentVp();
    this._emitViewport();   // 状态真变（双击适应/载图自适应）→ 宿主该持久化；非属性回灌
    this._invalidate();
  }

  // 宿主在 doc 像素/结构变化时调（组件不监听宿主全局事件）。真合成在 _render 里按脏标+节流做。
  markLiveDirty() {
    if (!this.live) return;
    this._liveDirty = true;
    this._invalidate();
  }

  // ---- 出向事件 ----
  private _emit(name: string, detail?: unknown) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }
  private _emitViewport() { this._emit("viewportchange", { ...this._vp }); }
  private _emitRect() { this._emit("rectchange", this.rect); }
  private _emitItems() { this._emit("itemschange", { index: this._index, count: this._items.length }); }

  // ---- 内部：item 切换 ----
  private _saveCurrentVp() {
    const cur = this._items[this._index];
    if (cur) cur.vp = { ...this._vp };
  }
  private _loadCurrentVp(opts: { fitIfMissing: boolean }) {
    const cur = this._items[this._index];
    if (!cur) return;
    if (cur.vp) this._vp = { ...cur.vp };
    else if (opts.fitIfMissing) {
      // 画布可能还没 size（窗未开）：先置单位 vp，_afterShow/_render 前再 fit
      this._vp = { tx: 0, ty: 0, scale: 1, rot: 0 };
      queueMicrotask(() => { if (!this._items[this._index]?.vp) this.fitToPanelSilent(); });
    }
  }
  /** fit 但不发事件（程序性初始适应；用户双击走 fitToPanel）。 */
  fitToPanelSilent() {
    const src = this._sourceSize();
    if (!src) return;
    const bw = this._canvas.width / (window.devicePixelRatio || 1);
    const bh = this._canvas.height / (window.devicePixelRatio || 1);
    if (src.w <= 0 || src.h <= 0 || bw <= 0 || bh <= 0) return;
    const s = Math.min(bw / src.w, bh / src.h) * 0.95;
    this._vp = { tx: bw / 2, ty: bh / 2, scale: s, rot: 0 };
    this._saveCurrentVp();
    this._invalidate();
  }
  private _page(delta: number) {
    if (this._items.length < 2) return;
    this._saveCurrentVp();
    this._index = (this._index + delta + this._items.length) % this._items.length;
    if (this._items[this._index].kind === "live") this._liveDirty = true;
    this._loadCurrentVp({ fitIfMissing: true });
    this._afterItemsChanged();
    this._emitItems();   // 用户翻页 → 宿主持久化 index
  }
  private _deleteCurrent() {
    const cur = this._items[this._index];
    if (!cur) return;
    if (cur.kind === "image") cur.bitmap.close?.();
    this._items.splice(this._index, 1);
    this._index = Math.max(0, Math.min(this._index, this._items.length - 1));
    if (this._items[this._index]?.kind === "live") this._liveDirty = true;
    this._loadCurrentVp({ fitIfMissing: true });
    this._afterItemsChanged();
    this._emitItems();   // 用户删除 → 宿主持久化
  }
  private _afterItemsChanged() {
    if (!this.live) this._stopLiveTimer();
    this._updateEmptyHint();
    this._updateChips();
    this._invalidate();
  }
  private _updateChips() {
    const n = this._items.length;
    this._chipsEl.classList.toggle("hidden", n < 2);
    if (n >= 2) this._chipCountEl.textContent = `${this._index + 1}/${n}`;
  }
  private _sourceSize(): { w: number; h: number } | null {
    const cur = this._items[this._index];
    if (!cur) return null;
    if (cur.kind === "live") {
      if (!this._liveSource && this.liveProvider) { this._liveSource = this.liveProvider(); this._lastLiveComposeT = performance.now(); }
      return this._liveSource ? { w: this._liveSource.width, h: this._liveSource.height } : null;
    }
    return { w: cur.bitmap.width, h: cur.bitmap.height };
  }

  // ---- 内部：显示/绑定 ----
  private _afterShow() {
    if (!this.style.left || !this.style.top) {
      this.style.left = SPAWN_LEFT + "px";
      this.style.top = SPAWN_TOP + "px";
    }
    this._resizeCanvasToBody();
    this._updateEmptyHint();
    this._updateChips();
    if (this.live) this._liveDirty = true;   // 重新打开 = 默认重画一次
    // 窗关着时灌入的 item 没法 fit（canvas 零尺寸）→ 开窗补一次静默适应
    if (this._items[this._index] && !this._items[this._index].vp) this.fitToPanelSilent();
    this._pokeIdle();
    this._invalidate();
  }

  private _bind(root: ShadowRoot) {
    // ＋ = 菜单 + 拖把（chat-head 形制）：按住超 slop = 拖窗；松手未超 = toggle 菜单。
    this._plusEl.addEventListener("pointerdown", (e) => {
      const r = this.getBoundingClientRect();
      this._panelDrag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ol: r.left, ot: r.top, moved: false };
      try { this._plusEl.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
    });
    this._plusEl.addEventListener("pointermove", (e) => {
      const d = this._panelDrag;
      if (!d || e.pointerId !== d.id) return;
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < PLUS_DRAG_SLOP) return;
      d.moved = true;
      const w = this.offsetWidth, h = this.offsetHeight;
      const left = clamp(d.ol + (e.clientX - d.sx), 0, window.innerWidth - w);
      const top = clamp(d.ot + (e.clientY - d.sy), DRAG_TOP_FLOOR, window.innerHeight - h);
      this.style.left = left + "px";
      this.style.top = top + "px";
      this._emitRect();
    });
    this._plusEl.addEventListener("pointerup", (e) => {
      const d = this._panelDrag;
      if (!d || e.pointerId !== d.id) return;
      try { this._plusEl.releasePointerCapture(e.pointerId); } catch {}
      this._panelDrag = null;
      if (!d.moved) this._toggleMenu();
    });
    this._plusEl.addEventListener("pointercancel", () => { this._panelDrag = null; });

    // 菜单项
    this._menuEl.addEventListener("click", (e) => {
      const b = (e.target as Element).closest("[data-mi]") as HTMLElement | null;
      if (!b) return;
      const mi = b.dataset.mi!;
      if (mi === "delete") {
        // 二段确认（防误碰，user 0830）：第一下 arm（文案换 delConfirm 变红），第二下才删。
        if (this._delItemEl.dataset.arm !== "1") {
          this._delItemEl.dataset.arm = "1";
          const span = this._delItemEl.querySelector("span")!;
          span.textContent = this._labels.delConfirm || span.textContent;
          return;
        }
        this._closeMenu();
        this._deleteCurrent();
        return;
      }
      this._closeMenu();
      if (mi === "load") this._emit("requestload");
      else if (mi === "paste") this._emit("requestpaste");
      else if (mi === "cloud") this._emit("requestcloudload");
      else if (mi === "live") { this.showLive(); this._emitItems(); }
      else if (mi === "close") { this.open = false; this._emit("openchange", { open: false }); }
    });
    // 点别处关菜单（shadow 内 canvas/chips pointerdown；菜单开着时吞第一击）
    root.addEventListener("pointerdown", (e) => {
      this._pokeIdle();
      if (this._menuEl.classList.contains("hidden")) return;
      if ((e.target as Element).closest?.(".menu, .plus")) return;
      this._closeMenu();
      e.stopPropagation(); e.preventDefault();
    }, { capture: true });
    root.addEventListener("pointermove", () => this._pokeIdle(), { capture: true, passive: true });

    // 翻页 chips
    this._chipsEl.addEventListener("click", (e) => {
      const b = (e.target as Element).closest("[data-page]") as HTMLElement | null;
      if (b) this._page(parseInt(b.dataset.page!, 10));
    });

    // v134 touch resize 手柄（CSS resize:both 只支持鼠标）
    const grip = root.querySelector(".grip") as HTMLElement;
    grip.addEventListener("pointerdown", (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      try { grip.setPointerCapture(e.pointerId); } catch {}
      const r = this.getBoundingClientRect();
      this._resizeDrag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, w0: r.width, h0: r.height };
    });
    grip.addEventListener("pointermove", (e: PointerEvent) => {
      if (!this._resizeDrag || e.pointerId !== this._resizeDrag.id) return;
      const w = Math.max(MIN_EDGE, Math.min(window.innerWidth - 40, this._resizeDrag.w0 + (e.clientX - this._resizeDrag.sx)));
      const h = Math.max(MIN_EDGE, Math.min(window.innerHeight - 80, this._resizeDrag.h0 + (e.clientY - this._resizeDrag.sy)));
      this.style.width = w + "px";
      this.style.height = h + "px";
      this._emitRect();
    });
    const endResize = (e: PointerEvent) => {
      if (this._resizeDrag && e.pointerId === this._resizeDrag.id) {
        try { grip.releasePointerCapture(e.pointerId); } catch {}
        this._resizeDrag = null;
      }
    };
    grip.addEventListener("pointerup", endResize);
    grip.addEventListener("pointercancel", endResize);

    // 内部画布手势（pan / pinch / rotate / wheel / 双击适应 / 吸色）
    this._canvas.addEventListener("pointerdown", (e) => this._onDown(e), { passive: false });
    this._canvas.addEventListener("pointermove", (e) => this._onMove(e), { passive: false });
    this._canvas.addEventListener("pointerup", (e) => this._onUp(e), { passive: false });
    this._canvas.addEventListener("pointercancel", (e) => this._onUp(e), { passive: false });
    this._canvas.addEventListener("wheel", (e) => this._onWheel(e), { passive: false });
    this._canvas.addEventListener("dblclick", () => this.fitToPanel());

    // 窗口大小变 → 重画。v216：canvas.width 赋值立即清空画布——同步 _render 而非 rAF defer，
    // 避免 resize 时 1 帧空白闪屏。rectchange 在这里也发（桌面 CSS resize:both 没有拖 handle 事件，
    // RO 是唯一出口）；程序性 rect 下灌产生的回声由宿主值比较吸收。
    const ro = new ResizeObserver(() => {
      this._resizeCanvasToBody();
      if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
      this._render();
      this._emitRect();
    });
    ro.observe(this);
  }

  private _toggleMenu() {
    const opening = this._menuEl.classList.contains("hidden");
    this._menuEl.classList.toggle("hidden", !opening);
    this._resetDeleteArm();
    // 删除项：没有可删的页时藏
    this._delItemEl.classList.toggle("hidden", this._items.length === 0);
  }
  private _closeMenu() {
    this._menuEl.classList.add("hidden");
    this._resetDeleteArm();
  }
  private _resetDeleteArm() {
    if (this._delItemEl.dataset.arm === "1") {
      delete this._delItemEl.dataset.arm;
      const span = this._delItemEl.querySelector("span")!;
      if (this._labels.del) span.textContent = this._labels.del;
    }
  }
  private _pokeIdle() {
    this.classList.remove("idle");
    if (this._idleTimer) clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(() => { this.classList.add("idle"); }, IDLE_DIM_MS);
  }

  private _onDown(e: PointerEvent) {
    try { this._canvas.setPointerCapture?.(e.pointerId); } catch {}
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // 吸色：pick 属性（吸管工具态）→ 立即吸；touch 长按 → 恒吸色（0830：吸色钮/设置门退役，
    //   窗内不能画长按无歧义，与画布长按吸色肌肉记忆同构）
    if (this._pointers.size === 1) {
      if (this.hasAttribute("pick")) { this._beginPick(e); e.preventDefault(); return; }
      if (e.pointerType === "touch") {
        this._lpStart = { x: e.clientX, y: e.clientY };
        this._lpEvent = e;
        this._longPressTimer = setTimeout(() => {
          this._longPressTimer = null;
          if (this._lpEvent) this._beginPick(this._lpEvent);
        }, REF_LONG_PRESS_MS);
      }
    }
    if (this._pointers.size === 2) {
      // 第二指进来 → 取消吸色/长按，进 gesture
      this._cancelLongPress();
      this._endPick();
      const arr = [...this._pointers.values()];
      const dx = arr[1].x - arr[0].x, dy = arr[1].y - arr[0].y;
      this._gestureStart = {
        midX: (arr[0].x + arr[1].x) / 2,
        midY: (arr[0].y + arr[1].y) / 2,
        dist: Math.hypot(dx, dy) || 1,
        angle: Math.atan2(dy, dx),
        vp: { ...this._vp },
      };
    }
    e.preventDefault();
  }
  private _onMove(e: PointerEvent) {
    const p = this._pointers.get(e.pointerId);
    if (!p) return;
    const px = p.x, py = p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (this._longPressTimer && this._lpStart) {
      const ddx = e.clientX - this._lpStart.x, ddy = e.clientY - this._lpStart.y;
      if (ddx * ddx + ddy * ddy > REF_LONG_PRESS_CANCEL_SQ) this._cancelLongPress();
    }
    if (this._picking && this._pointers.size === 1) {
      this._pickAt(e.clientX, e.clientY);
      e.preventDefault();
      return;
    }
    if (this._pointers.size === 1) {
      this._vp.tx += (e.clientX - px);
      this._vp.ty += (e.clientY - py);
      this._saveCurrentVp();
      this._emitViewport();
      this._invalidate();
    } else if (this._pointers.size >= 2 && this._gestureStart) {
      const arr = [...this._pointers.values()];
      const dx = arr[1].x - arr[0].x, dy = arr[1].y - arr[0].y;
      const dist = Math.hypot(dx, dy) || 1;
      const midX = (arr[0].x + arr[1].x) / 2;
      const midY = (arr[0].y + arr[1].y) / 2;
      const angle = Math.atan2(dy, dx);
      const g = this._gestureStart;
      // 共享 scale/rot + anchor 解（image-origin 约定）：起手按住的 image 点保持在当前两指中点
      const { scale, rot } = pinchScaleRot(g, dist, angle, 0.02, 50);
      const rect = this._canvas.getBoundingClientRect();
      const ip = screenToImg(g.midX - rect.left, g.midY - rect.top, g.vp);
      const t = solveAnchorTranslation(ip, scale, rot, midX - rect.left, midY - rect.top);
      this._vp = { tx: t.tx, ty: t.ty, scale, rot };
      this._saveCurrentVp();
      this._emitViewport();
      this._invalidate();
    }
    e.preventDefault();
  }
  private _onUp(e: PointerEvent) {
    this._pointers.delete(e.pointerId);
    this._cancelLongPress();
    if (this._pointers.size === 0) this._endPick();
    if (this._pointers.size < 2) this._gestureStart = null;
    e.preventDefault?.();
  }
  private _onWheel(e: WheelEvent) {
    e.preventDefault();
    const rect = this._canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const ip = screenToImg(sx, sy, this._vp);
    const factor = e.ctrlKey || e.metaKey ? Math.exp(-e.deltaY * 0.01) : Math.exp(-e.deltaY * 0.005);
    const newScale = clamp(this._vp.scale * factor, 0.02, 50);
    const t = solveAnchorTranslation(ip, newScale, this._vp.rot, sx, sy);
    this._vp.tx = t.tx; this._vp.ty = t.ty; this._vp.scale = newScale;
    this._saveCurrentVp();
    this._emitViewport();
    this._invalidate();
  }

  // ---- 吸色（v154；宿主拿事件接主吸色 setColor + pin）----
  private _cancelLongPress() {
    if (this._longPressTimer) { clearTimeout(this._longPressTimer); this._longPressTimer = null; }
    this._lpStart = null;
    this._lpEvent = null;
  }
  private _beginPick(e: PointerEvent) {
    this._picking = true;
    this._cancelLongPress();
    this._emit("colorpickstart");
    this._pickAt(e.clientX, e.clientY);
  }
  private _endPick() {
    if (!this._picking) return;
    this._picking = false;
    this._emit("colorpickend");
  }
  // 读自家 canvas 像素（所见即所吸）。透明区 hex=null（宿主收 pin）。半透明合成到白底。
  private _pickAt(clientX: number, clientY: number) {
    const rect = this._canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    let px = Math.round((clientX - rect.left) * dpr);
    let py = Math.round((clientY - rect.top) * dpr);
    px = Math.max(0, Math.min(this._canvas.width - 1, px));
    py = Math.max(0, Math.min(this._canvas.height - 1, py));
    let d;
    try { d = this._cctx.getImageData(px, py, 1, 1).data; } catch { return; }
    let r = d[0], g = d[1], b = d[2]; const a = d[3];
    if (a === 0) { this._emit("colorpick", { hex: null, screenX: clientX, screenY: clientY }); return; }
    if (a < 255) { const f = a / 255; r = Math.round(r * f + 255 * (1 - f)); g = Math.round(g * f + 255 * (1 - f)); b = Math.round(b * f + 255 * (1 - f)); }
    const hex = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
    this._emit("colorpick", { hex, screenX: clientX, screenY: clientY });
  }

  // ---- 渲染 ----
  private _resizeCanvasToBody() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.clientWidth;
    const h = this.clientHeight;
    if (w <= 0 || h <= 0) return;
    this._canvas.width = Math.round(w * dpr);
    this._canvas.height = Math.round(h * dpr);
    this._canvas.style.width = w + "px";
    this._canvas.style.height = h + "px";
  }
  private _invalidate() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = null;
      this._render();
    });
  }
  private _stopLiveTimer() {
    this._liveSource = null;
    this._liveDirty = false;
    if (this._liveThrottle != null) { clearTimeout(this._liveThrottle); this._liveThrottle = null; }
  }
  // live 合成：只在脏标真起时问 provider；节流内保留脏标等 timer 补帧（S9）。
  private _recomposeLive(): boolean {
    if (!this.liveProvider) return true;
    const now = performance.now();
    const since = now - (this._lastLiveComposeT ?? -Infinity);
    if (since < LIVE_THROTTLE_MS) {
      if (this._liveThrottle == null) {
        this._liveThrottle = setTimeout(() => { this._liveThrottle = null; this._invalidate(); }, LIVE_THROTTLE_MS + 20 - since);
      }
      return false;
    }
    const src = this.liveProvider();
    if (!src) return true;   // 合成不可用（GL lost）→ 保留上帧（丢脏标，避免空转）
    this._lastLiveComposeT = now;
    this._liveSource = src;
    return true;
  }
  private _render() {
    const cur = this._items[this._index];
    if (cur?.kind === "live" && this._liveDirty) {
      if (this._recomposeLive()) this._liveDirty = false;
    }
    const dpr = window.devicePixelRatio || 1;
    const W = this._canvas.width, H = this._canvas.height;
    const ctx = this._cctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    let source: RefBitmapSource | RefLiveSource | null = null;
    if (cur?.kind === "live") {
      if (!this._liveSource) this._recomposeLive();   // 首帧（节流窗自己排 timer 补）
      source = this._liveSource;
    } else if (cur) source = cur.bitmap;
    if (!source) return;
    // 底不 canvas 自画：clearRect 透底，:host 的 void+点阵 CSS 从图外与图的透明部分透出（对齐 editor）。
    // 放大 nearest（0830 像素画 friendly）：scale≥2 关平滑走硬像素；缩小保持平滑防摩尔纹。
    const nearest = this._vp.scale >= NEAREST_MIN_SCALE;
    ctx.imageSmoothingEnabled = !nearest;
    if (!nearest) ctx.imageSmoothingQuality = "high";
    // viewport：tx/ty 是 CSS 像素，要 × dpr；scale/rot 不动
    const v = this._vp;
    const c = Math.cos(v.rot), s = Math.sin(v.rot);
    ctx.setTransform(
      v.scale * c * dpr, v.scale * s * dpr,
      -v.scale * s * dpr, v.scale * c * dpr,
      v.tx * dpr, v.ty * dpr,
    );
    ctx.drawImage(source as CanvasImageSource, -source.width / 2, -source.height / 2);
  }

  private _updateEmptyHint() {
    this._emptyEl.classList.toggle("hidden", this._items.length > 0);
  }
}

function clamp(x: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, x)); }

// 屏幕→图像坐标逆变换（anchor-preserving 用）。正变换：screen = R(rot)·S(scale)·img + (tx,ty)
function screenToImg(sx: number, sy: number, vp: RefViewport) {
  const c = Math.cos(-vp.rot), s = Math.sin(-vp.rot);
  const dx = sx - vp.tx, dy = sy - vp.ty;
  return { x: (dx * c - dy * s) / vp.scale, y: (dx * s + dy * c) / vp.scale };
}

export const WP_REFERENCE_WINDOW_TAG = "wp-reference-window";
if (!customElements.get(WP_REFERENCE_WINDOW_TAG)) {
  customElements.define(WP_REFERENCE_WINDOW_TAG, WpReferenceWindow);
}

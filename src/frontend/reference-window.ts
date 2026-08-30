// <wp-reference-window> —— 参考图浮动小窗，家族 web component 约定试点（C9）。
// 约定全文见 ai-docs/20260810-family-web-component-convention.md。要点：
//   - 组件自带 chrome（shadow DOM：样式/图标/手势），宿主 store 零知识——不 import desk/i18n/backend。
//   - 入向 = 属性/property 下灌（**程序性 set 不发事件**，同原生 <input>.value 语义）；
//     出向 = CustomEvent（只有**用户交互**发：pan/pinch/wheel/拖窗/resize/菜单/翻页/删除/吸色）。
//     宿主对回声事件做值比较（RO 在程序性改动后也会 fire）——见 side-windows.ts 适配层。
//   - 主题 = CSS 变量穿透（--bg/--ink/--line/--radius/--shadow/--z-window/--void/--void-dot，
//     全带 fallback，裸挂也能看）；文案 = slot（empty，宿主 light DOM 走自家 i18n）+ labels property。
//   - 图标烤进 shadow（<use href="#id"> 不穿 shadow 边界），源=家族 sprite（20260708 SVG Icons），
//     对账 id：folder / cloud / picture-in-picture / x / new(＋) / paste / trash-can（库原几何烤入）；
//     库缺的两件 = chips 裸 chevron 左右 + 1:1 像素，stopgap 自绘，2026-08-30 登记该仓 TODO.md 待画。
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
  load?: string; paste?: string; cloud?: string; live?: string; oneToOne?: string;
  del?: string; delConfirm?: string; closeWin?: string;
  prev?: string; next?: string; menu?: string; move?: string; resize?: string; resizeAria?: string;
}
// 多参考 item（组件运行时形；持久化映射在宿主 side-windows）。vp=null → 首次显示时 fit。
export type RefItem =
  | { kind: "image"; bitmap: RefBitmapSource; blob: Blob | null; vp: RefViewport | null }
  | { kind: "live"; vp: RefViewport | null };

const REF_LONG_PRESS_MS = 450;                // 长按吸色延迟（对齐 input.ts）
const REF_LONG_PRESS_CANCEL_SQ = 64;          // 8px²：长按期间移动超此 → 取消，回 pan
const LIVE_THROTTLE_MS = 300;                 // S9：live 全量合成节流；到期 timer 补帧收尾
const IDLE_DIM_MS = 2500;                     // 闲置淡出（.35 透明度）
const NEAREST_MIN_SCALE = 2;                  // 放大 nearest 阈值（像素画 friendly；与编辑器手感对齐可调）
// 缩放护栏（user 0830）：放大顶 50×；缩小只护到「眼睛能看到」——长边显示 ≥16px 即可
//   （user 会故意缩很小看像素图标效果，别护过头）。平移护栏 = 图的 bbox 与画布保 ≥24px 重叠（找得回来）。
const MAX_SCALE = 50;
const MIN_VISIBLE_PX = 16;
const PAN_KEEP_PX = 24;
// WeebPaint 布局事实（组件自有默认；宿主布局大改时同步这里）：
const SPAWN_LEFT = 112, SPAWN_TOP = 104;      // v112/v267：默认避开 topbar(56)+左栏(80)+iPad 状态栏
const CLAMP_MIN_LEFT = 96, CLAMP_MIN_TOP = 96;   // v268b：旧持久化位置钳进安全区
const DRAG_TOP_FLOOR = 60;                    // 拖窗 top 地板=出血区（v0.4.11，同 layers-panel）
const MIN_EDGE = 96;                          // 丝薄：最小边（user 0830「最小宽度也需要能非常小」）

interface PanelDragState { id: number; sx: number; sy: number; ol: number; ot: number; moved: boolean; }
interface ResizeDragState { id: number; sx: number; sy: number; w0: number; h0: number; }
interface GestureStartState { midX: number; midY: number; dist: number; angle: number; vp: RefViewport; }
interface PointerPos { x: number; y: number; }

// ══ 图标：零手抄（user 0830「svg 风格从 svg icons 取作 SSoT，不要在别处乱塞」）══
// <use href="#id"> 穿不过 shadow 边界，此前的做法是把几何烤进组件——一烤就漂（手画 chevron/1:1 事故）。
// 现在：构造时从宿主文档的内联 sprite（assets/icons.svg + icons-local.svg，皆图标库提取物/烤字 stopgap）
// **clone `<symbol>` 内容**进 shadow；文档里没这个 id → 按库协议出虚线占位（icon-missing 同形），
// 且 test/reference-icons.test.mjs 逐 id 对 index.html 守着——组件里不存在任何自绘几何。
export const REF_ICON_IDS = {
  folder: "folder", paste: "paste", cloud: "cloud", pip: "picture-in-picture", oneToOne: "one-to-one",
  trash: "trash-can", x: "x", plus: "new", prev: "chevron-left", next: "chevron-right",
} as const;
function iconMarkup(id: string): string {
  const sym = (typeof document !== "undefined") ? document.querySelector(`svg symbol[id="${id}"]`) : null;
  if (!sym) {
    // icon-missing 占位（库协议同形：虚线方框），不静默空白
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 2" aria-hidden="true" data-icon-missing="${id}"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`;
  }
  const attrs = ["viewBox", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"]
    .map((a) => { const v = sym.getAttribute(a); return v != null ? `${a}="${v}"` : ""; })
    .filter(Boolean).join(" ");
  return `<svg ${attrs} aria-hidden="true" data-icon="${id}">${sym.innerHTML}</svg>`;
}

// chrome 全 overlay（borderless）：窗体只有 1px 边框+阴影当边界 affordance（无边界在同款点阵底上
// 根本看不见窗在哪），内容满铺。模板在构造时刻生成（图标从宿主 sprite clone，见 iconMarkup）。
function buildTemplate(): string { return `<style>
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
/* gizmo 尺寸 = 家族浮窗标准件（user 0830「按 Layers 的大小来」）：把手 22×22 满铺（同 styles.css
   .float-panel-resize 的双斜纹渐变），＋ 28，chips 14px 图标。 */
.plus {
  position: absolute; top: 4px; right: 4px; z-index: 3;
  width: 28px; height: 28px; padding: 0; border: none; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--bg, #202124) 72%, transparent);
  color: var(--ink, #e8eaed); cursor: pointer;   /* 纯菜单钮（0830 user：＋兼拖把很奇怪，拖归左上角点阵把手） */
  user-select: none; -webkit-user-select: none;
  transition: opacity 0.35s;
}
.plus svg { width: 16px; height: 16px; pointer-events: none; }
.plus:hover { background: color-mix(in srgb, var(--bg, #202124) 90%, transparent); }
/* 拖动把手（user 0830「左上角加一点小点一样的拖动区域…三角形布局，没有按钮式高亮，参考 resize」）：
   与右下 resize 把手同形制同尺寸——点阵裁成左上三角、无底无框，只靠 opacity 呼吸。gizmo 纹理非 icon。 */
.move {
  position: absolute; left: 0; top: 0; width: 22px; height: 22px; z-index: 3;
  cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none;
  color: var(--ink-soft, #9aa0a6); opacity: 0.55;
  border-top-left-radius: inherit;
  transition: opacity 0.35s;
}
.move:hover { opacity: 1; }
.move:active { cursor: grabbing; }
.move::after {
  content: ""; position: absolute; inset: 3px;
  background-image: radial-gradient(circle, currentColor 1.1px, transparent 1.6px);
  background-size: 4px 4px;
  clip-path: polygon(0 0, 100% 0, 0 100%);
}
/* resize 把手 = styles.css .float-panel-resize 原样（家族标准件：22 满铺双斜纹渐变） */
.grip {
  position: absolute; right: 0; bottom: 0; width: 22px; height: 22px;
  cursor: nwse-resize; touch-action: none; z-index: 2;
  opacity: 0.55;
  background: linear-gradient(135deg,
    transparent 0 45%, var(--ink-soft, #9aa0a6) 45% 52%,
    transparent 52% 66%, var(--ink-soft, #9aa0a6) 66% 73%,
    transparent 73%);
  border-bottom-right-radius: inherit;
  transition: opacity 0.35s;
}
.grip:hover { opacity: 1; }
.chips {
  position: absolute; left: 50%; bottom: 4px; transform: translateX(-50%); z-index: 2;
  display: flex; align-items: center; gap: 2px;
  background: color-mix(in srgb, var(--bg, #202124) 72%, transparent);
  border-radius: 12px; padding: 1px 4px;
  color: var(--ink, #e8eaed);
  cursor: default;   /* 计数文本不出 I-beam；按钮各自 pointer */
  transition: opacity 0.35s;
}
.chips.hidden { display: none; }
.chip { background: transparent; border: none; color: inherit; padding: 2px; cursor: pointer; display: flex; }
.chip svg { width: 14px; height: 14px; }
.chip-count { font-size: 11px; min-width: 26px; text-align: center; color: var(--ink-soft, #9aa0a6); }
/* gizmo 显隐两档（user 0830「鼠标移走时 gizmos 都隐藏」；「12.12 iPad 看起来还行不干扰」→ 触屏档维持）：
   .away = 能悬停的设备指针离窗 → 全隐（进窗即现）；.idle = 闲置 2.5s 淡至 .35（触屏无悬停只有这档，
   全隐会让 chips 变盲操作）。菜单弹层不在其列。 */
:host(.idle) .plus, :host(.idle) .grip, :host(.idle) .chips, :host(.idle) .move { opacity: 0.35; }
:host(.away) .plus, :host(.away) .grip, :host(.away) .chips, :host(.away) .move { opacity: 0; }
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
<div class="move" part="move"></div>
<button class="plus" part="plus" type="button" aria-haspopup="true">${iconMarkup(REF_ICON_IDS.plus)}</button>
<div class="grip" part="grip"></div>
<div class="chips hidden">
  <button class="chip" data-page="-1" type="button">${iconMarkup(REF_ICON_IDS.prev)}</button>
  <span class="chip-count">1/1</span>
  <button class="chip" data-page="1" type="button">${iconMarkup(REF_ICON_IDS.next)}</button>
</div>
<div class="menu hidden" role="menu">
  <button class="mi" data-mi="load" type="button" role="menuitem">${iconMarkup(REF_ICON_IDS.folder)}<span></span></button>
  <button class="mi" data-mi="paste" type="button" role="menuitem">${iconMarkup(REF_ICON_IDS.paste)}<span></span></button>
  <button class="mi" data-mi="cloud" type="button" role="menuitem">${iconMarkup(REF_ICON_IDS.cloud)}<span></span></button>
  <button class="mi" data-mi="live" type="button" role="menuitem">${iconMarkup(REF_ICON_IDS.pip)}<span></span></button>
  <button class="mi" data-mi="onetoone" type="button" role="menuitem">${iconMarkup(REF_ICON_IDS.oneToOne)}<span></span></button>
  <hr>
  <button class="mi" data-mi="delete" type="button" role="menuitem">${iconMarkup(REF_ICON_IDS.trash)}<span></span></button>
  <button class="mi" data-mi="close" type="button" role="menuitem">${iconMarkup(REF_ICON_IDS.x)}<span></span></button>
</div>`; }

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
    // 视口护栏（user 0830 反馈）：浏览器窗口 resize 后小窗可能整个落屏外——钳回。这不是宿主 app
    //   事件（组件约定禁的是 wp:*），是组件对自身定位环境的自理；修正后 emitRect 让宿主持久化真值。
    window.addEventListener?.("resize", () => {
      if (!this.open) return;
      if (this._clampIntoViewport()) this._emitRect();
    });
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = buildTemplate();
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
      this._clampIntoViewport();   // 越界持久化（大屏存小屏开）：右/下边同样钳回（未 open 时 _afterShow 兜）
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
    setText("live", l.live); setText("onetoone", l.oneToOne); setText("delete", l.del); setText("close", l.closeWin);
    const setTitle = (sel: string, title?: string, aria?: string) => {
      const b = this.shadowRoot!.querySelector(sel) as HTMLElement | null;
      if (!b) return;
      if (title) b.title = title;
      if (aria || title) b.setAttribute("aria-label", aria || title!);
    };
    setTitle(".plus", l.menu);
    setTitle(".move", l.move);
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

  /** 1:1 像素（user 0830）：1 图像素 = 1 **设备**像素（像素图标真面目；scale=1/dpr）、摆正（rot=0）、
   *  当前画布中心的图点保持锚定。菜单项触发 = 用户交互 → 发事件。 */
  oneToOne() {
    const src = this._sourceSize();
    if (!src) return;
    const dpr = window.devicePixelRatio || 1;
    const bw = this._canvas.width / dpr, bh = this._canvas.height / dpr;
    const ip = screenToImg(bw / 2, bh / 2, this._vp);   // 锚：当前在画布中心的图点
    const scale = 1 / dpr;
    const t = solveAnchorTranslation(ip, scale, 0, bw / 2, bh / 2);
    this._vp = { tx: t.tx, ty: t.ty, scale, rot: 0 };
    this._containVp();
    this._saveCurrentVp();
    this._emitViewport();
    this._invalidate();
  }

  // 缩放界限：放大顶 MAX_SCALE；缩小到长边显示 ≥ MIN_VISIBLE_PX 即止（小图不设限到 1:1 之上）。
  private _scaleBounds(): { lo: number; hi: number } {
    const src = this._sourceSize();
    const lo = src ? Math.min(1, MIN_VISIBLE_PX / Math.max(src.w, src.h)) : 0.02;
    return { lo, hi: MAX_SCALE };
  }
  // 平移护栏：图的（旋转后）bbox 与画布保 ≥keep 重叠——图永远找得回来；keep 对小图/小窗自适应收缩。
  private _containVp() {
    const src = this._sourceSize();
    if (!src) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = this._canvas.width / dpr, ch = this._canvas.height / dpr;
    if (!(cw > 0) || !(ch > 0)) return;
    const v = this._vp;
    const c = Math.abs(Math.cos(v.rot)), s = Math.abs(Math.sin(v.rot));
    const halfW = ((src.w * c + src.h * s) / 2) * v.scale;
    const halfH = ((src.w * s + src.h * c) / 2) * v.scale;
    const keepX = Math.min(PAN_KEEP_PX, halfW, cw / 2);
    const keepY = Math.min(PAN_KEEP_PX, halfH, ch / 2);
    v.tx = clamp(v.tx, keepX - halfW, cw - keepX + halfW);
    v.ty = clamp(v.ty, keepY - halfH, ch - keepY + halfH);
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
    this._clampIntoViewport();   // 开窗即钳（restore 的越界位置在 display:none 期钳不了）
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
    // ＋ = 纯菜单钮（0830：兼拖把「很奇怪」→ 拖归左上角点阵把手 .move）
    this._plusEl.addEventListener("click", () => this._toggleMenu());
    // 拖动把手（左上角点阵）：拖整窗，钳在视口内
    const move = root.querySelector(".move") as HTMLElement;
    move.addEventListener("pointerdown", (e) => {
      const r = this.getBoundingClientRect();
      this._panelDrag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ol: r.left, ot: r.top, moved: false };
      try { move.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
    });
    move.addEventListener("pointermove", (e) => {
      const d = this._panelDrag;
      if (!d || e.pointerId !== d.id) return;
      d.moved = true;
      const w = this.offsetWidth, h = this.offsetHeight;
      const left = clamp(d.ol + (e.clientX - d.sx), 0, window.innerWidth - w);
      const top = clamp(d.ot + (e.clientY - d.sy), DRAG_TOP_FLOOR, window.innerHeight - h);
      this.style.left = left + "px";
      this.style.top = top + "px";
      this._emitRect();
    });
    const endMove = (e: PointerEvent) => {
      if (this._panelDrag && e.pointerId === this._panelDrag.id) {
        try { move.releasePointerCapture(e.pointerId); } catch {}
        this._panelDrag = null;
      }
    };
    move.addEventListener("pointerup", endMove);
    move.addEventListener("pointercancel", endMove);

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
      else if (mi === "onetoone") this.oneToOne();
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
    // 能悬停的设备（鼠标 / 带悬停的笔；iPad 触屏主指针 = hover:none 走 idle 档）：指针离窗全隐、进窗即现。
    //   拖窗/resize/手势进行中不隐（capture 期指针可能在窗外）。
    const hoverCapable = typeof matchMedia === "function" && matchMedia("(hover: hover)").matches;
    if (hoverCapable) {
      this.addEventListener("pointerenter", () => this.classList.remove("away"));
      this.addEventListener("pointerleave", () => {
        if (this._panelDrag || this._resizeDrag || this._pointers.size > 0) return;
        this.classList.add("away");
      });
    }

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
      this._clampIntoViewport();   // native CSS resize:both 没有 handle 事件可钳 → 这里兜（幂等收敛）
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
      this._containVp();
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
      const b = this._scaleBounds();
      const { scale, rot } = pinchScaleRot(g, dist, angle, b.lo, b.hi);
      const rect = this._canvas.getBoundingClientRect();
      const ip = screenToImg(g.midX - rect.left, g.midY - rect.top, g.vp);
      const t = solveAnchorTranslation(ip, scale, rot, midX - rect.left, midY - rect.top);
      this._vp = { tx: t.tx, ty: t.ty, scale, rot };
      this._containVp();
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
    const b = this._scaleBounds();
    const newScale = clamp(this._vp.scale * factor, b.lo, b.hi);
    const t = solveAnchorTranslation(ip, newScale, this._vp.rot, sx, sy);
    this._vp.tx = t.tx; this._vp.ty = t.ty; this._vp.scale = newScale;
    this._containVp();
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

  /** 视口护栏：尺寸不超视口预算、位置不落屏外（拖已自钳；这里兜 restore/open/浏览器窗口 resize/
   *  native CSS resize 四条路）。返回是否有修正。 */
  private _clampIntoViewport(): boolean {
    const vw = window.innerWidth, vh = window.innerHeight;
    if (!(vw > 0) || !(vh > 0)) return false;
    let w = this.offsetWidth, h = this.offsetHeight;
    if (!(w > 0) || !(h > 0)) return false;   // display:none（未 open）：开窗时 _afterShow 再钳
    let changed = false;
    const maxW = Math.max(MIN_EDGE, vw - 8), maxH = Math.max(MIN_EDGE, vh - DRAG_TOP_FLOOR - 8);
    if (w > maxW) { w = maxW; this.style.width = w + "px"; changed = true; }
    if (h > maxH) { h = maxH; this.style.height = h + "px"; changed = true; }
    const r = this.getBoundingClientRect();
    const left = clamp(r.left, 0, vw - w);
    const top = clamp(r.top, DRAG_TOP_FLOOR, vh - h);
    if (Math.abs(left - r.left) > 0.5) { this.style.left = left + "px"; changed = true; }
    if (Math.abs(top - r.top) > 0.5) { this.style.top = top + "px"; changed = true; }
    return changed;
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

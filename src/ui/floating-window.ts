// FloatingWindow —— 浮窗深模块：「一个浮动 UI 面的整个生命周期」只此一处。
// created 2026-09-02 by Claude Fable 5.1（UI 纪元 C2；考古报告 ai-docs/reports/20260902-ui-epoch-recurring-mistakes.html）。
//
// 吸掉什么（此前一个浮窗横跨 4 个 module + 每窗各抄一份）：
//   · surfaces.ts（window band 内 z 栈归一化，v232）→ 内化；
//   · transient-panels 的「按 mode 抑制/复原」id 白名单 → 每窗自述 `transient.keepDuring`；
//   · panel-gizmo 的拖/缩把手接线 → 注册时一并挂（panel-gizmo 仍是内部原语，纯几何可测）；
//   · 每窗各自手写的「视口钳制 + 出血区地板 + 恢复持久化位置」→ open / restore / 拖 / resize / 旋转五条路同一函数。
//
// 出血区（T3，返工 6+1 次）的定案（2026-09-02 查证，见文末「出处」）：
//   iPadOS 26 窗口模式下 env(safe-area-inset-*) 对 PWA 失效、左上角有窗口控制钮盖内容；iOS 18+ 横屏顶边有
//   **未被 env() 上报的触摸死区**；iPadOS 15 起顶部中央多任务钮不计入安全区；没有任何 web API 报出死区高度。
//   → 手填常数（曾在 9 处写着 60）注定反复翻车。规则改为**运行时量**：拖把地板 = app 自己顶栏(#topBar)的
//   下缘 + FLOOR_GAP（顶栏能点，它下面就能点；顶栏本身由 CSS env() 摆，跟系统走），再加一条硬底线
//   safeTop + TOP_DEAD_ZONE_MIN（顶栏不可见时兜底，24px ≥ 社区建议的 20px 缓冲）。
//
// 不管什么：互斥（panel-state，另一根轴：笔架 sheet/菜单也在里面）；内容与开关的业务语义（谁来决定开）。
// 可见性用 .hidden 类（与全仓现状一致；C5 换原语时只改这一处 = 本模块存在的意义）。

import { attachPanelDrag, attachPanelResize, clampPanelPos, clampSize, type GizmoHandle, type PanelPos } from "./panel-gizmo.ts";
import { safeAreaTop } from "../anchored-popup.ts";

export type { PanelPos } from "./panel-gizmo.ts";

export const TOP_DEAD_ZONE_MIN = 24;   // 顶边触摸死区硬底线（iOS 18+ 横屏死区未被 env() 上报，社区建议 ≥20px）
export const FLOOR_GAP = 4;            // 顶栏下缘到拖把的间距
export const EDGE_MARGIN = 8;          // 尺寸钳制时离视口右/下边距

/** 拖把地板（纯函数）：max(安全区 + 死区底线, 顶栏下缘 + 间距)。topBarBottom=null → 顶栏不可见。 */
export function computeTopFloor(safeTop: number, topBarBottom: number | null): number {
  const base = safeTop + TOP_DEAD_ZONE_MIN;
  return topBarBottom != null ? Math.max(base, topBarBottom + FLOOR_GAP) : base;
}

let _topBarEl: HTMLElement | null | undefined;
function _topBarBottom(): number | null {
  if (_topBarEl === undefined) _topBarEl = (typeof document !== "undefined" ? document.getElementById("topBar") : null) ?? null;
  const el = _topBarEl;
  if (!el || el.classList.contains("hidden")) return null;
  const r = el.getBoundingClientRect();
  return r.height > 0 ? r.bottom : null;
}
/** 当前拖把地板（每次现量：旋转 / 顶栏显隐 / safe-area 变了都准）。 */
export function floatingTopFloor(): number {
  let safe = 0;
  try { safe = safeAreaTop(); } catch { safe = 0; }
  return computeTopFloor(safe, _topBarBottom());
}

export interface FloatingWindowSpec {
  id: string;
  /** 拖把（标题栏）。缺省 = 不可拖（组件自己拖，如参考窗）。 */
  head?: HTMLElement | null;
  /** 拖把上哪些目标不起拖（关闭钮等）。 */
  ignoreDragOn?: (target: Element) => boolean;
  /** 每次拖动落点（已钳；module 已写 left/top）——消费者只管持久化。 */
  onMove?: (pos: PanelPos) => void;
  resize?: {
    grip: HTMLElement | null;
    min: { w: number; h: number };
    axis?: "both" | "x";
    /** 起拖时量尺寸（图层窗的 h = 列表高——语义归消费者）；缺省 = 面板 offset 尺寸。 */
    getSize?: () => { w: number; h: number };
    /** 自定义落地（缺省 = module 写 style.width[/height]）。给了它，module 不碰 style。 */
    apply?: (size: { w: number; h: number }) => void;
  };
  /** transient（transform/crop/adjust-color）期间的去留：缺省 = 从不被抑制；给了 = 只在 keepDuring 内的 mode 留下。 */
  transient?: { keepDuring: string[] };
  /** open/close 的回声（aria-pressed 等）。抑制/复原**不**触发。 */
  onOpenChange?: (open: boolean) => void;
  /** 视口变了（旋转/resize）时的回调，带当前地板——给自己钳制的组件（参考窗）用。 */
  onViewport?: (floor: number) => void;
  /** 面板 hidden 时量不到尺寸的兜底（restore 钳制用）。 */
  fallbackSize?: { w: number; h: number };
}

export interface FloatingWindowHandle {
  readonly el: HTMLElement;
  readonly id: string;
  open(): void;
  close(): void;
  toggle(force?: boolean): boolean;
  isOpen(): boolean;
  raise(): void;
  /** 钳进视口（拖把不进出血区、不出屏）。hidden 时 no-op。 */
  clamp(): void;
  /** 应用持久化几何：null = 回 CSS 默认位（清 inline）。带 width/height 时按 resize 规则写尺寸。 */
  restore(pos: (PanelPos & { width?: number; height?: number }) | null): void;
  dispose(): void;
}

interface Entry {
  el: HTMLElement; spec: FloatingWindowSpec; handle: FloatingWindowHandle;
  drag: GizmoHandle | null; resize: GizmoHandle | null;
  suppressed: boolean;
  onRaisePointerDown: (e: Event) => void;
}

const _stack: Entry[] = [];   // z 序：末位最高
let _base = 0;
function _zBase(): number {
  if (!_base) {
    let v = NaN;
    try { v = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--z-window"), 10); } catch { /* shim */ }
    _base = Number.isFinite(v) && v > 0 ? v : 100;
  }
  return _base;
}
function _normalizeZ() {
  const b = _zBase();
  _stack.forEach((en, idx) => { en.el.style.zIndex = String(b + idx); });
}
function _raise(en: Entry) {
  const i = _stack.indexOf(en);
  if (i >= 0) _stack.splice(i, 1);
  _stack.push(en);
  _normalizeZ();
}
const _isHidden = (el: HTMLElement) => el.classList.contains("hidden");
const _vw = () => window.innerWidth, _vh = () => window.innerHeight;

function _sizeOf(en: Entry, hint?: { width?: number; height?: number }): { w: number; h: number } {
  const fb = en.spec.fallbackSize ?? { w: 264, h: 240 };
  return { w: en.el.offsetWidth || hint?.width || fb.w, h: en.el.offsetHeight || hint?.height || fb.h };
}
function _writePos(en: Entry, pos: PanelPos) {
  en.el.style.left = pos.left + "px";
  en.el.style.right = "auto";
  en.el.style.top = pos.top + "px";
}
function _clampEntry(en: Entry, force = false) {
  if (!force && _isHidden(en.el)) return;
  const vw = _vw(), vh = _vh();
  if (!(vw > 0) || !(vh > 0)) return;
  let { w, h } = _sizeOf(en);
  const floor = floatingTopFloor();
  // 可缩放的窗：尺寸先不超视口预算（大屏存小屏开）
  if (en.spec.resize && !en.spec.resize.apply) {
    const maxW = Math.max(en.spec.resize.min.w, vw - EDGE_MARGIN);
    const maxH = Math.max(en.spec.resize.min.h, vh - floor - EDGE_MARGIN);
    if (w > maxW) { w = maxW; en.el.style.width = w + "px"; }
    if (en.spec.resize.axis !== "x" && h > maxH) { h = maxH; en.el.style.height = h + "px"; }
  }
  const r = en.el.getBoundingClientRect();
  const cur = { left: r.left, top: r.top };
  const next = clampPanelPos(cur, { w, h }, { w: vw, h: vh }, floor);
  if (Math.abs(next.left - cur.left) > 0.5 || Math.abs(next.top - cur.top) > 0.5) _writePos(en, next);
}

// 视口变（旋转 / Split View / 桌面拉窗）→ 全部开着的窗重钳 + 通知自钳组件。合帧。
//   用 window.innerHeight 不用 visualViewport：iOS 软键盘只改 visualViewport，跟着它钳会把面板推来推去（0828「面板抖」）。
let _vpRaf = 0;
let _vpListening = false;
function _onViewport() {
  if (_vpRaf) return;
  _vpRaf = requestAnimationFrame(() => {
    _vpRaf = 0;
    const floor = floatingTopFloor();
    for (const en of _stack) {
      _clampEntry(en);
      en.spec.onViewport?.(floor);
    }
  });
}
function _ensureViewportListener() {
  if (_vpListening || typeof window === "undefined" || !window.addEventListener) return;
  _vpListening = true;
  window.addEventListener("resize", _onViewport);
  window.addEventListener("orientationchange", _onViewport);
}
/** 测试/外部显式触发一次全量重钳（与视口事件同路）。 */
export function clampAllFloatingWindows(): void {
  const floor = floatingTopFloor();
  for (const en of _stack) { _clampEntry(en); en.spec.onViewport?.(floor); }
}

export function registerFloatingWindow(el: HTMLElement, spec: FloatingWindowSpec): FloatingWindowHandle {
  const existing = _stack.find((e) => e.el === el);
  if (existing) existing.handle.dispose();
  const en: Entry = { el, spec, handle: null as unknown as FloatingWindowHandle, drag: null, resize: null, suppressed: false, onRaisePointerDown: () => _raise(en) };
  const handle: FloatingWindowHandle = {
    el, id: spec.id,
    isOpen: () => !_isHidden(el),
    open() {
      el.classList.remove("hidden");
      en.suppressed = false;
      _raise(en);
      _clampEntry(en);                       // 兜底回屏：无论坐标从哪条路粘上来，开窗的瞬间必须在视口内
      spec.onOpenChange?.(true);
    },
    close() {
      el.classList.add("hidden");
      en.suppressed = false;
      spec.onOpenChange?.(false);
    },
    toggle(force?: boolean) {
      const show = force === true ? true : force === false ? false : _isHidden(el);
      if (show) handle.open(); else handle.close();
      return show;
    },
    raise: () => _raise(en),
    clamp: () => _clampEntry(en),
    restore(pos) {
      if (!pos) {
        // 回 CSS 默认位：上一张画的出屏坐标粘在单例 DOM 内联样式上会污染此后每张画（0828 实锤）
        el.style.left = ""; el.style.right = ""; el.style.top = ""; el.style.width = ""; el.style.height = "";
        return;
      }
      if (spec.resize) {
        if (pos.width) el.style.width = clampSize(pos.width, spec.resize.min.w, Math.max(spec.resize.min.w, _vw() - 24)) + "px";
        if (pos.height && spec.resize.axis !== "x" && !spec.resize.apply) el.style.height = clampSize(pos.height, spec.resize.min.h, Math.max(spec.resize.min.h, _vh() - floatingTopFloor() - EDGE_MARGIN)) + "px";
      }
      const size = _sizeOf(en, pos);
      _writePos(en, clampPanelPos({ left: pos.left, top: pos.top }, size, { w: _vw(), h: _vh() }, floatingTopFloor()));
    },
    dispose() {
      en.drag?.dispose(); en.resize?.dispose();
      el.removeEventListener("pointerdown", en.onRaisePointerDown, true);
      const i = _stack.indexOf(en);
      if (i >= 0) _stack.splice(i, 1);
      _normalizeZ();
    },
  };
  en.handle = handle;
  // 进栈底（首次真正置顶发生在 open）+ 点窗即置顶
  _stack.unshift(en);
  _normalizeZ();
  el.addEventListener("pointerdown", en.onRaisePointerDown, true);
  if (spec.head) {
    en.drag = attachPanelDrag(el, spec.head, {
      ignore: spec.ignoreDragOn,
      topFloor: floatingTopFloor,
      onMove: (pos) => { _writePos(en, pos); spec.onMove?.(pos); },
    });
  }
  const grip = spec.resize?.grip;
  if (spec.resize && grip) {
    const rs = spec.resize;
    en.resize = attachPanelResize(el, grip, {
      getSize: rs.getSize ?? (() => ({ w: el.offsetWidth, h: el.offsetHeight })),
      min: rs.min,
      max: () => { const r = el.getBoundingClientRect(); return { w: _vw() - r.left - EDGE_MARGIN, h: rs.axis === "x" ? Infinity : _vh() - r.top - EDGE_MARGIN }; },
      onResize: (s) => {
        if (rs.apply) { rs.apply(s); return; }
        el.style.width = s.w + "px";
        if (rs.axis !== "x") el.style.height = s.h + "px";
      },
    });
  }
  _ensureViewportListener();
  return handle;
}

/** 按元素找句柄（老调用方 _bringPanelTop(el) 的适配）。 */
export function floatingWindowOf(el: HTMLElement | null): FloatingWindowHandle | null {
  if (!el) return null;
  return _stack.find((e) => e.el === el)?.handle ?? null;
}
export function raiseFloatingWindow(el: HTMLElement | null): void { floatingWindowOf(el)?.raise(); }

// ---- transient 抑制（transform / crop / adjust-color）：每窗自述去留，module 记谁被藏了 ----
// user（v116）：「transient 的时候有些窗口应该暂时 hide... 大部分窗口都是准模态的，而不是一直留在画布上」
export function suppressFloatingForTransient(mode: string): void {
  restoreFloatingAfterTransient();   // 防递归（transition 间套用）：先复原再藏
  for (const en of _stack) {
    const t = en.spec.transient;
    if (!t || t.keepDuring.includes(mode)) continue;
    if (_isHidden(en.el)) continue;
    en.el.classList.add("hidden");
    en.suppressed = true;
  }
}
export function restoreFloatingAfterTransient(): void {
  for (const en of _stack) {
    if (!en.suppressed) continue;
    en.el.classList.remove("hidden");
    en.suppressed = false;
  }
}

/** 诊断：当前栈（id 按 z 升序）。 */
export function floatingWindowStack(): string[] { return _stack.map((e) => e.spec.id); }

// 出处（2026-09-02 查证）：
//   · dev.to/reinhart1010「PWA in iPadOS 26 is a joke」（iPadOS 26.0 实测：env(safe-area-inset-*) 窗口模式失效、窗口控制钮盖内容、顶部黑边）
//   · gist fozzedout/iphone-pwa-game-guide（iOS 18+ 横屏顶边触摸死区，env() 仍报 0，建议 ≥20px 缓冲）
//   · developer.apple.com/forums/thread/691862（iPadOS 15 多任务钮不计入安全区，无官方尺寸）
//   · developer.apple.com/forums/thread/789178（iPadOS 26 窗口控制钮位置无 API 报出；原生建议开状态栏让它并进去）

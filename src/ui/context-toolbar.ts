// ContextToolbar —— 上下文工具条深模块：登记表（C4，2026-09-02）+ **DOM 工厂**（UI 抽象轮 U1，2026-09-06）。
// created 2026-09-02 by Claude Fable 5.1（UI 纪元 C4）；2026-09-06 升级为工厂（user「ui/context-toolbar 从登记表升级为 DOM 工厂深模块 同意」；
//   ADR-0012；策划 = ai-docs/20260906-ui-abstraction-round-proposal.md §2.1）。
//
// 考古：六条顶栏条各写各皮——套索/形状/吸色/透视 = .lasso-toolbar-stack（y=50 h=38 居中），滤镜笔/裁切 = .crop-toolbar（y=56 h=44 偏左）
//   → user 2026-09-05「smudge 笔刷工具条位置不对」。本模块给一个统一的 chrome：**复用 .lasso-toolbar-stack / .lasso-toolbar 那套皮**
//   （不再发明第三种），由 spec 生成 DOM；放不下的尾项折进「…」（popup-menu compact）——「…」是工具条自带功能（user 拍板）。
// 两条路并存一轮：mountContextToolbar(spec)（滤镜笔条已迁）与 registerContextToolbar(el)（index.html 静态条：套索/形状/吸色/透视/裁切，
//   只登记不生成；内容迁 spec 另批）。让位高度查询 contextToolbarBottom() 语义不变。
// 显隐仍由各 owner 按 EditMode 派生（本模块只给 show/hide），不做互斥策略。

import { createSelectField, type SelectField, type SelectItem, type SelectFace } from "./select-field.ts";
import { makeRampSlider, type RampSliderHandle } from "./ramp-slider.ts";
import { togglePopupMenu, type PopupMenuItem } from "./popup-menu.ts";
import { iconHtml, slotCaretHtml, type IconName } from "./icon.ts";

// ---- 登记表（C4 原样）----
const _registry = new Map<string, HTMLElement>();
const _factory = new Set<string>();   // 工厂 mount 的条（叠放时由工厂写 top）；静态条只登记、位置归 CSS

/** owner 在 init 时登记（幂等）。静态条用；工厂 mount 自动登记。
 *  2026-09-11：静态条的显隐（owner 自己 toggle .hidden）用 MutationObserver 接进叠放重排——不靠 owner 记得通知、不吃事件监听顺序。 */
export function registerContextToolbar(el: HTMLElement | null): void {
  if (!el) return;
  const id = el.id || `anon-${_registry.size}`;
  if (_registry.has(id)) return;
  _registry.set(id, el);
  if (typeof MutationObserver === "function") new MutationObserver(scheduleRelayout).observe(el, { attributes: true, attributeFilter: ["class"] });
}
/** 已登记 id（测试/诊断）。 */
export function contextToolbarIds(): string[] { return [..._registry.keys()]; }
/** 可见顶栏条的最大 bottom（anchored-popup belowToolbars 用）；无可见 = 0。 */
export function contextToolbarBottom(): number {
  let bottom = 0;
  for (const el of _registry.values()) {
    if (el.classList.contains("hidden")) continue;
    const r = el.getBoundingClientRect();
    if (r.height > 0) bottom = Math.max(bottom, r.bottom);
  }
  return bottom;
}

// ---- 叠放（2026-09-11）----
// 多条同时可见（几何条 + 动词条）时谁挂谁下面，以前是 owner 自己量别人的 bottom 写 top（ruler-ui contextToolbarBottomExcept）——
//   量的时刻在别人的 modechange 监听之前就成了「空出来一大堆白」（user 2026-09-11：「几何对齐还会不小心变成右对齐，然后换 context 的时候
//   会突然空出来一大堆白」）。改成工厂统一在下一帧重排：静态条钉 CSS 位当锚，工厂条按登记顺序挂到「之前所有可见条」的下缘（gap 4）；
//   只有一条可见时 top 归 CSS（居中同位，无右对齐特例）。任何一条 show/hide/换内容/resize 都触发；一个 owner 都不再算 top。
let _relayoutRaf = 0;
function scheduleRelayout(): void {
  if (_relayoutRaf || typeof requestAnimationFrame !== "function") return;
  _relayoutRaf = requestAnimationFrame(() => { _relayoutRaf = 0; relayoutContextToolbars(); });
}
/** 立即重排一次（测试/探针用；运行时走 scheduleRelayout 合帧）。 */
export function relayoutContextToolbars(): void {
  const visible = (el: HTMLElement) => !el.classList.contains("hidden");
  let bottom = 0;
  for (const [id, el] of _registry) {
    if (_factory.has(id) || !visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height > 0) bottom = Math.max(bottom, r.bottom);
  }
  for (const [id, el] of _registry) {
    if (!_factory.has(id) || !visible(el)) continue;
    el.style.top = bottom > 0 ? `${Math.round(bottom) + 4}px` : "";
    const r = el.getBoundingClientRect();
    if (r.height > 0) bottom = Math.max(bottom, r.bottom);
  }
}

// ---- 工厂 ----

export type ToolbarItem =
  | { kind: "title"; text: string }
  | { kind: "sep" }
  | { kind: "button"; id: string; icon: IconName; title: string; pressed?: () => boolean; disabled?: () => boolean; onClick(): void;
      /** 角上小三角 = 有变体菜单：已选中再点 / 长按 → popup-menu（形状变体槽语义，v0.6.25）。 */
      variants?: { items: () => PopupMenuItem[]; onPick(id: string): void };
      /** 溢出时的折叠优先级（大 = 先折）；缺省按位置（越靠右越先折）。 */
      foldPriority?: number;
      /** 钉住：永不折进「…」（这条工具条的身份件，如手指位子工具下拉）。折完所有可折项仍放不下 → 行自身横滚兜底。2026-09-09 */
      pin?: boolean }
  | { kind: "select"; id: string; items: () => SelectItem[]; value: () => string; onChange(v: string): void; title?: string; foldPriority?: number; pin?: boolean;
      /** 钮面档（ui/select-field）：工具条缺省 "short"（定宽缩写，英文不撑条）；"icon" = 只图标（手指位子工具，六项同一只手指）。2026-09-11 */
      face?: SelectFace }
  | { kind: "slider"; id: string; label: string; min: number; max: number; step: number; value: () => number; fmt?: (v: number) => string; onInput(v: number): void }
  | { kind: "custom"; id: string; mount(host: HTMLElement): () => void };

export interface ContextToolbarSpec {
  id: string;                 // 也是 DOM id（探针/测试/让位登记）
  rows: ToolbarItem[][];      // 多行（套索 = 两行）；每行独立溢出
  ariaLabel?: string;
}
export interface ContextToolbarHandle {
  el: HTMLElement;
  show(): void; hide(): void; isVisible(): boolean;
  refresh(): void;                          // 受控值重画（pressed/disabled/select/slider）
  replaceRows(rows: ToolbarItem[][]): void; // 同 id 换内容（滤镜笔切 variant）
  dispose(): void;
}

const LONG_PRESS_MS = 450;   // 与 input.ts 画布长按同值（v0.6.27 小三角统一语义：长按 ≈450ms 开菜单）
const LONG_PRESS_CANCEL_PX = 8;

interface Rendered {
  row: HTMLElement;
  items: ToolbarItem[];
  els: Map<ToolbarItem, HTMLElement>;
  folded: ToolbarItem[];
  moreBtn: HTMLButtonElement | null;
  selects: Map<ToolbarItem, SelectField>;
  sliders: Map<ToolbarItem, RampSliderHandle>;
  disposers: Array<() => void>;
}

function isFoldable(it: ToolbarItem): boolean { return (it.kind === "button" || it.kind === "select") && !it.pin; }
function foldPriority(it: ToolbarItem, idx: number): number {
  const p = (it as { foldPriority?: number }).foldPriority;
  return p != null ? p : idx;   // 缺省：越靠右越先折
}

/** 建一条上下文工具条：chrome 复用 .lasso-toolbar-stack（固定顶栏下缘、居中、宽 ≤ 视口−24）；行内放不下 → 尾项折进「…」。 */
export function mountContextToolbar(spec: ContextToolbarSpec): ContextToolbarHandle {
  const el = document.createElement("div");
  el.className = "lasso-toolbar-stack ct-toolbar hidden";
  el.id = spec.id;
  el.setAttribute("role", "toolbar");
  if (spec.ariaLabel) el.setAttribute("aria-label", spec.ariaLabel);
  document.body.appendChild(el);
  _registry.set(spec.id, el);
  _factory.add(spec.id);

  let rendered: Rendered[] = [];
  let rows = spec.rows;

  function buildItem(r: Rendered, it: ToolbarItem): HTMLElement {
    switch (it.kind) {
      case "title": {
        const s = document.createElement("span");
        s.className = "ct-title";
        s.textContent = it.text;
        return s;
      }
      case "sep": {
        const s = document.createElement("span");
        s.className = "ct-sep";
        s.setAttribute("aria-hidden", "true");
        s.textContent = "|";
        return s;
      }
      case "button": {
        const b = document.createElement("button");
        b.type = "button";
        b.id = it.id;
        b.className = "lasso-tool-btn lasso-tool-icon" + (it.variants ? " lasso-slot" : "");
        b.title = it.title;
        b.setAttribute("aria-label", it.title);
        b.innerHTML = iconHtml(it.icon) + (it.variants ? slotCaretHtml() : "");
        const openVariants = () => {
          if (!it.variants) return;
          togglePopupMenu<string>({ anchor: b, variant: "compact", band: "menu", align: "left", offsetY: 6, items: it.variants.items, onPick: (id) => { it.variants!.onPick(id); refresh(); } });
        };
        let lpTimer: ReturnType<typeof setTimeout> | null = null, lpFired = false, lpX = 0, lpY = 0;
        const clearLp = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } };
        if (it.variants) {
          b.addEventListener("pointerdown", (e) => { lpFired = false; lpX = e.clientX; lpY = e.clientY; clearLp(); lpTimer = setTimeout(() => { lpFired = true; openVariants(); }, LONG_PRESS_MS); });
          b.addEventListener("pointermove", (e) => { if (lpTimer && Math.hypot(e.clientX - lpX, e.clientY - lpY) > LONG_PRESS_CANCEL_PX) clearLp(); });
          b.addEventListener("pointerup", clearLp); b.addEventListener("pointercancel", clearLp); b.addEventListener("pointerleave", clearLp);
          b.addEventListener("contextmenu", (e) => { e.preventDefault(); openVariants(); });
        }
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          if (lpFired) { lpFired = false; return; }   // 长按已开菜单 → 吞掉随后的 click
          if (it.variants && it.pressed?.()) { openVariants(); return; }   // 已选中再点 = 开变体菜单
          it.onClick();
          refresh();
        });
        return b;
      }
      case "select": {
        const f = createSelectField({ id: it.id, className: "lasso-tool-btn ct-select", face: it.face ?? "short", items: it.items, value: it.value, onChange: (v) => { it.onChange(v); refresh(); } });
        if (it.title) f.el.title = it.title;
        r.selects.set(it, f);
        r.disposers.push(() => f.dispose());
        return f.el;
      }
      case "slider": {
        const wrap = document.createElement("span");
        wrap.className = "lasso-tol-inline fb-inline-slider";
        wrap.id = it.id;
        wrap.title = it.label;
        const h = makeRampSlider({ label: it.label, min: it.min, max: it.max, step: it.step, value: it.value(), fmt: it.fmt, onInput: it.onInput });
        wrap.appendChild(h.el);
        r.sliders.set(it, h);
        r.disposers.push(() => h.dispose());
        return wrap;
      }
      case "custom": {
        const host = document.createElement("span");
        host.className = "ct-custom";
        host.id = it.id;
        r.disposers.push(it.mount(host));
        return host;
      }
    }
  }

  function buildRow(items: ToolbarItem[]): Rendered {
    const row = document.createElement("div");
    row.className = "lasso-toolbar";
    row.hidden = items.length === 0;   // 空行不画药丸（空一长条守卫，2026-09-11）
    const r: Rendered = { row, items, els: new Map(), folded: [], moreBtn: null, selects: new Map(), sliders: new Map(), disposers: [] };
    for (const it of items) {
      const node = buildItem(r, it);
      r.els.set(it, node);
      row.appendChild(node);
    }
    return r;
  }

  function moreMenuItems(r: Rendered): PopupMenuItem[] {
    const out: PopupMenuItem[] = [];
    for (const it of r.folded) {
      if (it.kind === "button") out.push({ id: `b:${it.id}`, label: it.title, icon: it.icon, checked: it.pressed?.() ?? false, disabled: it.disabled?.() ?? false });
      else if (it.kind === "select") {
        out.push({ id: `h:${it.id}`, label: it.title || it.id, header: true });
        const cur = it.value();
        for (const o of it.items()) out.push({ id: `s:${it.id}:${o.value}`, label: o.label, checked: o.value === cur, disabled: o.disabled });
      }
    }
    return out;
  }
  function onMorePick(r: Rendered, id: string): void {
    if (id.startsWith("b:")) {
      const it = r.folded.find((x) => x.kind === "button" && `b:${x.id}` === id);
      if (it && it.kind === "button") it.onClick();
    } else if (id.startsWith("s:")) {
      const [, sid, ...rest] = id.split(":");
      const it = r.folded.find((x) => x.kind === "select" && x.id === sid);
      if (it && it.kind === "select") it.onChange(rest.join(":"));
    }
    refresh();
  }

  /** 折叠：行溢出时把可折项（按优先级）挪进「…」，直到放下；先全展开再算（视口变宽能回来）。 */
  function fold(r: Rendered): void {
    // 展开
    for (const it of r.folded) { const n = r.els.get(it); if (n) { n.hidden = false; } }
    r.folded = [];
    if (r.moreBtn) { r.moreBtn.remove(); r.moreBtn = null; }
    const order = r.items.map((it, i) => ({ it, i })).filter(({ it }) => isFoldable(it)).sort((a, b) => foldPriority(b.it, b.i) - foldPriority(a.it, a.i));
    const fits = () => r.row.scrollWidth <= r.row.clientWidth + 1;
    if (fits() || order.length === 0) return;
    r.moreBtn = document.createElement("button");
    r.moreBtn.type = "button";
    r.moreBtn.className = "lasso-tool-btn lasso-tool-icon ct-more";
    r.moreBtn.title = "…";
    r.moreBtn.innerHTML = iconHtml("more");
    r.moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePopupMenu<string>({ anchor: r.moreBtn!, variant: "compact", band: "menu", align: "right", offsetY: 6, items: () => moreMenuItems(r), onPick: (id) => onMorePick(r, id) });
    });
    r.row.appendChild(r.moreBtn);
    for (const { it } of order) {
      const n = r.els.get(it);
      if (n) n.hidden = true;
      r.folded.push(it);
      if (fits()) break;
    }
  }
  function foldAll(): void { for (const r of rendered) fold(r); }

  const hasContent = () => rows.some((r) => r.length > 0);
  function render(): void {
    for (const r of rendered) { r.disposers.forEach((d) => d()); r.row.remove(); }
    rendered = rows.map(buildRow);
    for (const r of rendered) el.appendChild(r.row);
    if (!hasContent()) el.classList.add("hidden");   // 没内容 = 没这条（show() 也不露空条）
    refresh();
    scheduleRelayout();
  }

  function refresh(): void {
    for (const r of rendered) {
      for (const it of r.items) {
        const n = r.els.get(it);
        if (!n) continue;
        if (it.kind === "button") {
          if (it.pressed) n.setAttribute("aria-pressed", it.pressed() ? "true" : "false");
          (n as HTMLButtonElement).disabled = it.disabled?.() ?? false;
        } else if (it.kind === "select") r.selects.get(it)?.refresh();
        else if (it.kind === "slider") r.sliders.get(it)?.set(it.value());
      }
    }
    if (!el.classList.contains("hidden")) requestAnimationFrame(foldAll);
  }

  const onResize = () => { if (!el.classList.contains("hidden")) { foldAll(); scheduleRelayout(); } };
  window.addEventListener("resize", onResize);

  render();

  return {
    el,
    show() { if (!hasContent()) { el.classList.add("hidden"); return; } el.classList.remove("hidden"); refresh(); scheduleRelayout(); },
    hide() { el.classList.add("hidden"); scheduleRelayout(); },
    isVisible: () => !el.classList.contains("hidden"),
    refresh,
    replaceRows(next) { rows = next; render(); },
    dispose() {
      window.removeEventListener("resize", onResize);
      for (const r of rendered) r.disposers.forEach((d) => d());
      el.remove();
      _registry.delete(spec.id);
      _factory.delete(spec.id);
      scheduleRelayout();
    },
  };
}

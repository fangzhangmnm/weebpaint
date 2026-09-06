// subtool-slot —— 顶栏动词位的子工具长按标准件（ADR-0012；UI 抽象轮 U3）。created 2026-09-06 by Claude Fable 5.1
//
// 钮面图标 = 当前子工具；角上小三角（复用 .lasso-slot-caret 形制，≥2 个子工具才画）；
// 单击 = onTap（选中动词 / 已选中再点由宿主决定，如开笔架）；**长按 ≈450ms** / 右键 / 触屏 contextmenu = 弹子工具菜单（popup-menu compact，带勾选）。
// 考古：v0.6.26–0.6.30 顶栏组槽 + 长按曾上过真机，v0.6.31 回滚（user「长按真机难受」）。这次 user 2026-09-06「小三角是一个大胆的尝试，随时有可能
//   回滚。但是放心大胆去做。不要怕」——本模块是独立标准件，回滚 = 不 attach。与画布长按吸色（input.ts 450ms）是两套监听，互不干扰。

import { togglePopupMenu, type PopupMenuItem } from "./popup-menu.ts";

export interface SubTool { id: string; icon: string; title: string }
export interface SubToolSlotOpts {
  el: HTMLButtonElement;           // 顶栏那颗 .tool 钮（内含 <svg><use>）
  tools: () => SubTool[];
  current: () => string;
  onTap(): void;
  onPick(id: string): void;
  longPressMs?: number;            // 缺省 450
}
export interface SubToolSlotHandle { refresh(): void; openMenu(): void; dispose(): void }

const CARET_SVG = '<svg class="tool-caret" viewBox="0 0 8 8" aria-hidden="true"><path d="M7.2 2.8 V7.2 H2.8 Z" fill="currentColor" stroke="none"/></svg>';
const CANCEL_PX = 8;

export function attachSubToolSlot(o: SubToolSlotOpts): SubToolSlotHandle {
  const el = o.el;
  const ms = o.longPressMs ?? 450;
  el.classList.add("tool-slot");
  const use = el.querySelector("use");
  let caret: HTMLElement | null = null;

  function refresh(): void {
    const tools = o.tools();
    const cur = tools.find((t) => t.id === o.current()) ?? tools[0];
    if (cur && use) use.setAttribute("href", `#${cur.icon}`);
    if (cur) { el.title = cur.title; el.setAttribute("aria-label", cur.title); }
    const multi = tools.length >= 2;
    if (multi && !caret) { el.insertAdjacentHTML("beforeend", CARET_SVG); caret = el.querySelector(".tool-caret"); }
    if (!multi && caret) { caret.remove(); caret = null; }
    el.setAttribute("aria-haspopup", multi ? "menu" : "false");
  }

  function openMenu(): void {
    const items = (): PopupMenuItem[] => o.tools().map((t) => ({ id: t.id, label: t.title, icon: t.icon, checked: t.id === o.current() }));
    togglePopupMenu<string>({ anchor: el, variant: "compact", band: "menu", align: "left", offsetY: 6, items, onPick: (id) => { o.onPick(id); refresh(); } });
  }

  let timer: ReturnType<typeof setTimeout> | null = null, fired = false, x0 = 0, y0 = 0;
  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const down = (e: PointerEvent) => {
    if (o.tools().length < 2) return;
    fired = false; x0 = e.clientX; y0 = e.clientY; clear();
    timer = setTimeout(() => { fired = true; openMenu(); }, ms);
  };
  const move = (e: PointerEvent) => { if (timer && Math.hypot(e.clientX - x0, e.clientY - y0) > CANCEL_PX) clear(); };
  const up = () => clear();
  const click = (e: MouseEvent) => {
    if (fired) { fired = false; e.stopPropagation(); e.preventDefault(); return; }   // 长按已开菜单 → 吞掉随后的 click
    o.onTap();
  };
  const ctx = (e: Event) => { if (o.tools().length >= 2) { e.preventDefault(); openMenu(); } };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  el.addEventListener("pointerleave", up);
  el.addEventListener("click", click);
  el.addEventListener("contextmenu", ctx);
  refresh();
  return {
    refresh, openMenu,
    dispose() {
      clear();
      el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); el.removeEventListener("pointerleave", up);
      el.removeEventListener("click", click); el.removeEventListener("contextmenu", ctx);
      caret?.remove(); caret = null;
      el.classList.remove("tool-slot");
    },
  };
}

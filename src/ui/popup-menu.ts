// 弹出菜单深模块——「锚定 + 挂 body + z band + 关闭纪律」一站式。created 2026-09-02 by Claude Fable 5.1.
//
// 为什么要它（user 2026-07-25 点名「与组槽下拉/⋯菜单/tile 菜单一起收成 popover 深模块（open/close/锚定/z 一站式）」；
//   2026-09-02「reference 的目录被窗口裁剪…老错误又犯…一锤子买卖顺手把 menu 的深模块做了」）：
//   菜单只要是**某个容器的子节点**，就会撞上两类结构性 bug——① 容器 overflow:hidden 把它裁掉
//   （参考窗 shadow 内 .menu 复发的正是这个）；② 容器自成 stacking context，菜单困在容器的 z 里，
//   被别的浮窗盖住（surfaces 深模块治的那一族）。根治只有一条路：菜单节点**挂 document.body**，
//   z 走 band 表（styles.css --z-*），坐标走 anchored-popup（全仓唯一定位入口）。本模块把这条路封装死，
//   消费者只描述「锚在谁下面、有哪些项、选了怎么办」，不碰 DOM/坐标/z。
//
// 两个 adapter = 真 seam（UI 纪元 C1，2026-09-02）：
//   · **现建**（openPopupMenu）：items 函数现算 → module 建节点（参考窗 ＋ 菜单、主题/语言/词库下拉）；
//   · **收养**（openAdoptedPopup）：内容仍是 index.html 里的静态节点（汉堡主菜单 / 图库三 popup / 调整 popup /
//     图层 ＋ / 套索·形状组槽 ×13），生命周期归 module——外点关 / Escape / 定位 / 栈 / 显隐一处，消费者的
//     15 份外点关手抄与 _transientMenus 由此退役。
//
// 关闭纪律（内建）：点外面关（capture 相，可选吞掉那一击）、Escape 关最上层、**栈**（开新的会关掉所有
//   「不包含新锚」的旧菜单——主菜单里再弹主题下拉，主菜单留着；点别处两层一起关）、视口 resize 重定位、
//   锚按钮再点一下 = toggle。shadow DOM 友好：外点判定用 composedPath（锚可以在 shadow 里，如参考窗的 ＋）。
//
// 形态：list（.menu-item 行，带前缀图标，与汉堡菜单同款）/ compact（药丸行，主题/语言下拉旧观感）。
// 图标 = sprite id（<use>，菜单在 light DOM 所以直接引用得到）。
// 二段确认之类「选了但别关」：onPick 返回 "keep"，随后 handle.refresh() 重绘（items 是函数，开/刷新时现算）。

import { positionPopup } from "../anchored-popup.ts";
import { iconHtml } from "./icon.ts";

export type PopupBand = "menu" | "popover" | "modal";
export type PopupVariant = "list" | "compact";

export interface PopupMenuItem<Id extends string = string> {
  id: Id;
  label: string;
  icon?: string;            // sprite symbol id
  hidden?: boolean;
  disabled?: boolean;
  danger?: boolean;         // 红字（删除 / 二段确认 armed）
  checked?: boolean;        // 单选态（compact 用 aria-pressed；list 用 aria-checked）
  separatorBefore?: boolean;
  header?: boolean;         // 分组标题行（不可点；select-field 的 optgroup）
}

/** 现建 / 收养共用的锚定与关闭选项。 */
export interface PopupAnchorOpts {
  anchor: HTMLElement;
  align?: "left" | "right";          // 默认 right（对齐锚右缘）
  offsetY?: number;                  // 默认 4
  belowToolbars?: boolean;           // 让到所有可见顶栏条以下（调整 popup）
  edgeMargin?: number;
  /** z band：现建默认 menu；收养默认 "css"（保留节点自己的 CSS z）。菜单内再弹 = popover；sheet(modal) 内 = modal。 */
  band?: PopupBand | "css";
  swallowOutsideTap?: boolean;       // 关菜单的那一击是否吞掉（默认透传）
  onClose?: () => void;
  ariaLabel?: string;
}

export interface PopupMenuOpts<Id extends string = string> extends PopupAnchorOpts {
  items: () => PopupMenuItem<Id>[];
  /** 返回 "keep" = 选了但菜单不关（随后请 refresh）。 */
  onPick: (id: Id, item: PopupMenuItem<Id>) => void | "keep";
  variant?: PopupVariant;            // 默认 list
}

export interface AdoptedPopupOpts extends PopupAnchorOpts {
  /** 节点原本嵌在某容器里（backdrop-filter / overflow 会困住它）→ 收养时搬到 body（一次性）。 */
  mountToBody?: boolean;
  /** 不重定位（节点由 CSS 钉死）——只要外点关/Escape/栈。 */
  position?: "anchor" | "css";
}

export interface PopupMenuHandle {
  close(): void;
  /** 现建：重绘 items + 重定位；收养：重定位。 */
  refresh(): void;
  readonly isOpen: boolean;
  readonly el: HTMLElement;
  readonly anchor: HTMLElement;
}

// ---- 栈（末位最上）----
const _open: PopupMenuHandle[] = [];

/** 最上层的 popup（没有 = null）。 */
export function currentPopupMenu(): PopupMenuHandle | null { return _open[_open.length - 1] ?? null; }
/** 全关（下笔 / 切页等外部时机用）。 */
export function closePopupMenu(): void { for (const h of [..._open]) h.close(); }
export const closeAllPopupMenus = closePopupMenu;
/** 关某个节点的 popup（不在栈里 → 只确保它 hidden；老调用方「menu.classList.add("hidden")」的替身）。 */
export function closePopupMenuOf(el: HTMLElement | null): void {
  if (!el) return;
  const h = _open.find((x) => x.el === el);
  if (h) h.close(); else el.classList.add("hidden");
}
export function isPopupOpen(el: HTMLElement | null): boolean { return !!el && _open.some((x) => x.el === el); }

/** 锚按钮 toggle 语义：同一锚已开 → 关并返回 null；否则开。 */
export function togglePopupMenu<Id extends string>(opts: PopupMenuOpts<Id>): PopupMenuHandle | null {
  const cur = _open.find((x) => x.anchor === opts.anchor);
  if (cur) { cur.close(); return null; }
  return openPopupMenu(opts);
}
export function toggleAdoptedPopup(el: HTMLElement, opts: AdoptedPopupOpts): PopupMenuHandle | null {
  const cur = _open.find((x) => x.el === el);
  if (cur) { cur.close(); return null; }
  return openAdoptedPopup(el, opts);
}

export function openPopupMenu<Id extends string>(opts: PopupMenuOpts<Id>): PopupMenuHandle {
  const variant: PopupVariant = opts.variant ?? "list";
  const band = opts.band ?? "menu";
  const el = document.createElement("div");
  el.className = (variant === "compact" ? "lasso-icon-menu lasso-icon-list " : "menu-panel ")
    + `popup-menu popup-menu--${variant}` + (band === "css" ? "" : ` band-${band}`);
  el.setAttribute("role", "menu");
  const render = () => {
    const items = opts.items().filter((it) => !it.hidden);
    const anyIcon = variant === "list" && items.some((it) => !!it.icon);
    let html = "";
    for (const it of items) {
      if (it.separatorBefore) html += `<hr class="popup-menu-sep">`;
      if (it.header) { html += `<div class="popup-menu-group">${escapeHtml(it.label)}</div>`; continue; }
      const cls = variant === "compact"
        ? "lasso-tool-btn popup-menu-item"
        : "menu-item popup-menu-item" + (anyIcon ? " menu-item-with-icon" : "") + (it.danger ? " danger" : "");
      const role = it.checked != null ? "menuitemradio" : "menuitem";
      const checkAttr = it.checked != null
        ? (variant === "compact" ? ` aria-pressed="${it.checked}"` : ` aria-checked="${it.checked}"`)
        : "";
      const icon = variant === "list" && anyIcon
        ? (it.icon ? iconHtml(it.icon) : `<span class="menu-item-icon-blank"></span>`)
        : "";
      html += `<button type="button" class="${cls}" role="${role}" data-id="${escapeHtml(it.id)}"${checkAttr}${it.disabled ? " disabled" : ""}>`
        + icon + `<span class="menu-item-label">${escapeHtml(it.label)}</span></button>`;
    }
    el.innerHTML = html;
  };
  render();
  document.body.appendChild(el);
  const handle = _mount(el, opts, {
    reposition: true,
    onRefresh: render,
    onClosed: () => el.remove(),
  });
  el.addEventListener("click", (e) => {
    const b = (e.target as Element).closest("[data-id]") as HTMLButtonElement | null;
    if (!b || b.disabled) return;
    e.stopPropagation();
    const id = b.dataset.id as Id;
    const item = opts.items().find((it) => it.id === id);
    if (!item) return;
    const r = opts.onPick(id, item);
    if (r === "keep") { if (handle.isOpen) handle.refresh(); return; }
    handle.close();
  });
  return handle;
}

/** 收养静态节点：显示 + 锚定 + 栈 + 外点关/Escape；关 = 加 hidden（节点留在 DOM，内容仍是 index.html 的）。 */
export function openAdoptedPopup(el: HTMLElement, opts: AdoptedPopupOpts): PopupMenuHandle {
  const cur = _open.find((x) => x.el === el);
  if (cur) { cur.refresh(); return cur; }
  if (opts.mountToBody && el.parentElement !== document.body) document.body.appendChild(el);
  const band = opts.band ?? "css";
  if (band !== "css") el.classList.add("popup-menu", `band-${band}`);
  el.classList.remove("hidden");
  return _mount(el, opts, {
    reposition: (opts.position ?? "anchor") === "anchor",
    onClosed: () => { el.classList.add("hidden"); },
  });
}

interface MountHooks { reposition: boolean; onRefresh?: () => void; onClosed: () => void }

function _mount(el: HTMLElement, opts: PopupAnchorOpts, hooks: MountHooks): PopupMenuHandle {
  // 栈纪律：关掉所有「不包含新锚」的旧菜单（父菜单留着；同级换菜单）。
  for (const h of [..._open]) if (!h.el.contains(opts.anchor) && h.el !== el) h.close();
  if (opts.ariaLabel) el.setAttribute("aria-label", opts.ariaLabel);
  let open = true;
  const position = () => {
    if (!hooks.reposition) return;
    positionPopup(el, {
      anchor: opts.anchor, align: opts.align ?? "right", offsetY: opts.offsetY ?? 4,
      belowToolbars: opts.belowToolbars, edgeMargin: opts.edgeMargin, clampViewport: true,
    });
  };
  const onDocPointerDown = (e: PointerEvent) => {
    const path = e.composedPath();
    if (path.includes(el) || path.includes(opts.anchor)) return;
    handle.close();
    if (opts.swallowOutsideTap) { e.stopPropagation(); e.preventDefault(); }
  };
  const onKey = (e: KeyboardEvent) => {
    if (currentPopupMenu() !== handle) return;   // 只有最上层响应键盘
    if (e.key === "Escape") { e.preventDefault(); handle.close(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const btns = [...el.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
      if (!btns.length) return;
      const i = btns.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === "ArrowDown" ? (i + 1) % btns.length : (i - 1 + btns.length) % btns.length;
      btns[next].focus();
      e.preventDefault();
    }
  };
  const onResize = () => { if (open) position(); };
  const handle: PopupMenuHandle = {
    get isOpen() { return open; },
    el, anchor: opts.anchor,
    refresh() { if (!open) return; hooks.onRefresh?.(); position(); },
    close() {
      if (!open) return;
      open = false;
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onResize);
      const i = _open.indexOf(handle);
      if (i >= 0) _open.splice(i, 1);
      hooks.onClosed();
      opts.onClose?.();
    },
  };
  position();
  // 监听延后到本轮事件之后挂：打开菜单的那一击（pointerdown→click）不能反过来把它关掉。
  setTimeout(() => {
    if (!open) return;
    document.addEventListener("pointerdown", onDocPointerDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onResize);
  }, 0);
  _open.push(handle);
  return handle;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

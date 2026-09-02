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
// 关闭纪律（内建，消费者不用再各写一份）：点外面关（capture 相，可选吞掉那一击）、Escape 关、
//   同一时刻只有一个 popup-menu（开新的自动关旧的）、视口 resize 重定位、锚按钮再点一下 = toggle。
//   shadow DOM 友好：外点判定用 composedPath（锚可以在 shadow 里，如参考窗的 ＋）。
//
// 两种形态：list（.menu-item 行，带前缀图标，与汉堡菜单同款）/ compact（药丸行，主题/语言下拉旧观感）。
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
}

export interface PopupMenuOpts<Id extends string = string> {
  anchor: HTMLElement;
  items: () => PopupMenuItem<Id>[];
  /** 返回 "keep" = 选了但菜单不关（随后请 refresh）。 */
  onPick: (id: Id, item: PopupMenuItem<Id>) => void | "keep";
  onClose?: () => void;
  align?: "left" | "right";          // 默认 right（对齐锚右缘）
  offsetY?: number;                  // 默认 4
  band?: PopupBand;                  // 默认 menu；菜单内再弹 = popover；sheet(modal) 内 = modal
  variant?: PopupVariant;            // 默认 list
  swallowOutsideTap?: boolean;       // 关菜单的那一击是否吞掉（默认透传）
  ariaLabel?: string;
}

export interface PopupMenuHandle {
  close(): void;
  refresh(): void;
  readonly isOpen: boolean;
  readonly el: HTMLElement;
  readonly anchor: HTMLElement;
}

let _current: PopupMenuHandle | null = null;

/** 当前开着的 popup-menu（没有 = null）。 */
export function currentPopupMenu(): PopupMenuHandle | null { return _current; }
/** 关掉当前开着的（下笔 / 切页等外部时机用）。 */
export function closePopupMenu(): void { _current?.close(); }

/** 锚按钮 toggle 语义：同一锚已开 → 关并返回 null；否则开。 */
export function togglePopupMenu<Id extends string>(opts: PopupMenuOpts<Id>): PopupMenuHandle | null {
  if (_current && _current.anchor === opts.anchor) { _current.close(); return null; }
  return openPopupMenu(opts);
}

export function openPopupMenu<Id extends string>(opts: PopupMenuOpts<Id>): PopupMenuHandle {
  _current?.close();
  const variant: PopupVariant = opts.variant ?? "list";
  const band: PopupBand = opts.band ?? "menu";
  const el = document.createElement("div");
  el.className = (variant === "compact" ? "lasso-icon-menu lasso-icon-list " : "menu-panel ")
    + `popup-menu popup-menu--${variant} band-${band}`;
  el.setAttribute("role", "menu");
  if (opts.ariaLabel) el.setAttribute("aria-label", opts.ariaLabel);
  let open = true;

  const render = () => {
    const items = opts.items().filter((it) => !it.hidden);
    const anyIcon = variant === "list" && items.some((it) => !!it.icon);
    let html = "";
    for (const it of items) {
      if (it.separatorBefore) html += `<hr class="popup-menu-sep">`;
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
      html += `<button type="button" class="${cls}" role="${role}" data-id="${escapeAttr(it.id)}"${checkAttr}${it.disabled ? " disabled" : ""}>`
        + icon + `<span class="menu-item-label">${escapeHtml(it.label)}</span></button>`;
    }
    el.innerHTML = html;
  };
  const position = () => positionPopup(el, { anchor: opts.anchor, align: opts.align ?? "right", offsetY: opts.offsetY ?? 4, clampViewport: true });

  const onDocPointerDown = (e: PointerEvent) => {
    const path = e.composedPath();
    if (path.includes(el) || path.includes(opts.anchor)) return;
    handle.close();
    if (opts.swallowOutsideTap) { e.stopPropagation(); e.preventDefault(); }
  };
  const onKey = (e: KeyboardEvent) => {
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

  el.addEventListener("click", (e) => {
    const b = (e.target as Element).closest("[data-id]") as HTMLButtonElement | null;
    if (!b || b.disabled) return;
    e.stopPropagation();
    const id = b.dataset.id as Id;
    const item = opts.items().find((it) => it.id === id);
    if (!item) return;
    const r = opts.onPick(id, item);
    if (r === "keep") { if (open) handle.refresh(); return; }
    handle.close();
  });

  const handle: PopupMenuHandle = {
    get isOpen() { return open; },
    el,
    anchor: opts.anchor,
    refresh() { if (!open) return; render(); position(); },
    close() {
      if (!open) return;
      open = false;
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onResize);
      el.remove();
      if (_current === handle) _current = null;
      opts.onClose?.();
    },
  };

  render();
  document.body.appendChild(el);
  position();
  // 监听延后到本轮事件之后挂：打开菜单的那一击（pointerdown→click）不能反过来把它关掉。
  setTimeout(() => {
    if (!open) return;
    document.addEventListener("pointerdown", onDocPointerDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onResize);
  }, 0);
  _current = handle;
  return handle;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
function escapeAttr(s: string): string { return escapeHtml(s); }

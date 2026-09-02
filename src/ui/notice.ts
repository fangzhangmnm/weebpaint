// Notice —— 反馈面深模块：toast / 错误横幅 / 恢复横幅 / 离线横幅只有**一条栈、一个样式、一个 z band、一条让位规则**。
// created 2026-09-02 by Claude Fable 5.1（UI 纪元 C7；user 2026-09-02「toast 好像也有两个不同配色的版本了」
//   「toast, busy overlay, 红线区问题对话框，这些的 z order 很容易出红线事故，考古好好反省一下」）。
//
// 反省（考古，出处见 ai-docs/reports/20260902-ui-epoch-recurring-mistakes.html「反馈面 z-order 红线反省」）：
//   · 07-22 v0.4.11 真机 0.2：gate(520) < busy(540) → 冲突/「云端有新版本」决策面被 busy 遮罩盖死——**红线**
//     （冲突必 surface）；修法 = 翻 band（gate 540 > busy 520）。
//   · 08-19：busy 期粘贴弹出大图确认 sheet(500) 被 busy(520) 盖住 → await 永不 resolve → 死锁；修法 = sheets.ts 响亮 throw。
//   · 08-21：busy 遮罩挡不住 window keydown / 原生 paste（QA）→ 逐处 isBusyActive 守卫。
//   · v0.9.4：错误横幅顶部通栏压 iPad 无框顶栏 → 挪底部浮卡（inline cssText z 9999）；08-29 离线横幅又钉回 top:0
//     踩回同一课（gallery-manage-ui 自陈）→ 08-30 迁 .toast；09-02 压感 toast 第三份 .toast + 两份 inline 横幅并存。
//   · 未爆雷：错误横幅 z 9999 高于 gate(540)，且与 sheet 同为底部锚定——一条同步错误横幅正好在冲突 gate 弹出时
//     出现，就盖住 keep/pull/branch 按钮。
//   根因一句话：反馈面是**角色**（锁 / 决策 / 通知），代码里却是**逐元素手填的 z 数字 + 各自 inline 样式 +
//   两条互不知情的底部栈**。
//
// 规则（本模块结构性保证）：
//   ① 所有通知类反馈面（toast/横幅）进同一个 #noticeStack，z = --z-notice（在 busy 之上：忙的时候错误也要看得见；
//      在 popout/dev/error(bootstrap) 之下）。z 数字只在 styles.css band 表，这里零 inline z。
//   ② **让位**：任何模态/gate 开着（.backdrop / .sync-gate-backdrop 非 hidden）→ 整条栈停靠顶部（顶栏之下），
//      永远不盖决策 sheet 的底部按钮行。sheet 模块开合时调 relayoutNotices()。
//   ③ 同 id 更新原地；多条纵向堆叠；样式 = .toast 标准件 + level 色（neutral/info=ink、warning=琥珀、error=红）。
//   ④ 不管 busy 本身与 sheet（那是 C3 Sheet 系统的事）；也不管 bundle 加载前的 index.html 内联 #__errBar 早期兜底。

import { iconHtml } from "./icon.ts";
import { floatingTopFloor } from "./floating-window.ts";

export type NoticeLevel = "neutral" | "info" | "warning" | "error";
export interface NoticeAction { label: string; onClick: () => void; primary?: boolean }
export interface NoticeOpts {
  id?: string;                 // 同 id → 原地更新（不重复堆）
  level?: NoticeLevel;         // 默认 neutral
  text: string;
  actions?: NoticeAction[];
  dismissible?: boolean;       // 默认 true：右侧 ✕
  dismissLabel?: string;       // ✕ 的 aria-label（消费者给 i18n 文案）
  tapToDismiss?: boolean;      // 默认 true：点 toast 空白处也关（按钮除外）
  autoHideMs?: number;
  onDismiss?: () => void;      // 用户主动关（✕ / 点空白）时回调；程序性 close 不触发
  ariaLive?: "polite" | "assertive";
}
export interface NoticeHandle {
  readonly el: HTMLElement;
  readonly id: string;
  setText(text: string): void;
  close(): void;
  isOpen(): boolean;
}

let _stack: HTMLElement | null = null;
const _live = new Map<string, NoticeHandle>();
let _seq = 0;

function _ensureStack(): HTMLElement {
  if (_stack && _stack.isConnected) return _stack;
  const s = document.createElement("div");
  s.id = "noticeStack";
  s.className = "notice-stack";
  (document.body || document.documentElement).appendChild(s);
  _stack = s;
  _relayout();
  // 让位规则结构化：不靠 sheet 模块记得调 relayoutNotices()——直接观察 backdrop 的 class 翻转（模态/gate 开合）。
  //   class 变动很频繁但回调只做一次 matches 判断，便宜；C3 收成单 backdrop 后同样成立。
  if (!_observer && typeof MutationObserver !== "undefined") {
    _observer = new MutationObserver((muts) => {
      for (const m of muts) {
        const t = m.target as Element;
        if (t.matches?.(".backdrop, .sync-gate-backdrop")) { _relayout(); return; }
      }
    });
    _observer.observe(document.body, { attributes: true, attributeFilter: ["class"], subtree: true });
  }
  return s;
}
let _observer: MutationObserver | null = null;

/** 有模态/gate 开着 → 顶部停靠（不盖 sheet 的按钮行）；否则底部。 */
function _modalOpen(): boolean {
  return !!document.querySelector(".backdrop:not(.hidden), .sync-gate-backdrop:not(.hidden)");
}
function _relayout(): void {
  const s = _stack;
  if (!s) return;
  const top = _modalOpen();
  s.classList.toggle("docked-top", top);
  s.style.top = top ? Math.round(floatingTopFloor() + 8) + "px" : "";
}
/** 模态/gate 开合后调（C3 sheet 模块的开合路径）；也可在任何布局变化后调。 */
export function relayoutNotices(): void { _relayout(); }

export function showNotice(opts: NoticeOpts): NoticeHandle {
  const id = opts.id ?? `notice-${++_seq}`;
  const prev = _live.get(id);
  if (prev) prev.close();
  const stack = _ensureStack();
  const el = document.createElement("div");
  const level = opts.level ?? "neutral";
  el.className = `toast notice notice-${level}`;
  el.setAttribute("role", level === "error" ? "alert" : "status");
  el.setAttribute("aria-live", opts.ariaLive ?? (level === "error" ? "assertive" : "polite"));
  el.dataset.noticeId = id;
  const txt = document.createElement("span");
  txt.className = "notice-text";
  txt.textContent = opts.text;
  el.appendChild(txt);
  let open = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const close = () => {
    if (!open) return;
    open = false;
    if (timer) clearTimeout(timer);
    el.remove();
    if (_live.get(id)?.el === el) _live.delete(id);
  };
  const dismiss = () => { close(); opts.onDismiss?.(); };
  for (const a of opts.actions ?? []) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "notice-action" + (a.primary ? " primary" : "");
    b.textContent = a.label;
    b.addEventListener("click", (e) => { e.stopPropagation(); close(); a.onClick(); });
    el.appendChild(b);
  }
  if (opts.dismissible !== false) {
    const x = document.createElement("button");
    x.type = "button";
    x.className = "dismiss";
    if (opts.dismissLabel) x.setAttribute("aria-label", opts.dismissLabel);
    x.innerHTML = iconHtml("x");
    x.addEventListener("click", (e) => { e.stopPropagation(); dismiss(); });
    el.appendChild(x);
  }
  if (opts.tapToDismiss !== false) el.addEventListener("click", () => dismiss());
  if (opts.autoHideMs && opts.autoHideMs > 0) timer = setTimeout(close, opts.autoHideMs);
  stack.appendChild(el);
  _relayout();
  const handle: NoticeHandle = {
    el, id,
    setText(t) { txt.textContent = t; },
    close,
    isOpen: () => open,
  };
  _live.set(id, handle);
  return handle;
}

export function closeNotice(id: string): void { _live.get(id)?.close(); }
export function noticeCount(): number { return _live.size; }
export function isNoticeOpen(id: string): boolean { return _live.get(id)?.isOpen() ?? false; }

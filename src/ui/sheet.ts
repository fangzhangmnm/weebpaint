// Sheet —— 模态 sheet 深模块：一个 backdrop、一个栈、一条焦点规则、与交互锁的关系一处。created 2026-09-02 by Claude Fable 5.1（UI 纪元 C3）。
//
// 考古（ai-docs/reports/20260902-ui-epoch-recurring-mistakes.html C3 + 红线反省节）：openSheet/closeSheet 抄了 4 份 + 6 处裸写，
//   index.html 11 个 backdrop div 各配一个 sheet；焦点/键盘/busy 先后这些「开一个模态就该管的事」没有 owner，五次各修一处
//   （07-22 切后台 blur、07-24 焦点陷阱、07-25 键盘收起致 click 落空、08-19 busy 盖确认 sheet 死锁、08-21 busy 期键盘穿透）。
//
// 本模块：
//   · 收养式：sheet 内容仍是 index.html 的静态节点（.sheet），本模块只管生命周期。
//   · **一个 backdrop**（#sheetBackdrop，运行时建）：z 随最上层 sheet 的 band（modal 500 / gate 540）；点它 = 关最上层（可 dismiss 时）。
//   · **栈**：可叠（gate 压在普通 sheet 上）；z = band 基底 + 1 + 序号（inline，band 内归一化）。
//   · **焦点**：开时可指定聚焦；关时若焦点在 sheet 内 → blur（iOS 回前台还焦点弹键盘 / 键盘收起致 click 落空那两课）。
//   · **Escape** 关最上层（可 dismiss 时）；消费者给 onDismiss 则把「取消」语义交给它（confirm 的 resolve(null) 之类）。
//   · **交互锁**：开模态 = intent "dialog"——busy 期 = 自相矛盾 → 响亮 throw（沿 sheets.ts 老护栏，现在所有 sheet 都过这道）；
//     gate 传 allowDuringBusy（它就是要穿透 busy 的决策面）。
//   · 通知栈让位（ui/notice）靠观察 backdrop 的 class，无需本模块记得调。

import { assertAllows } from "./interaction-lock.ts";

export type SheetBand = "modal" | "gate";
export interface SheetOpts {
  band?: SheetBand;                 // 默认 modal
  dismissible?: boolean;            // 默认 true：Escape / 点 backdrop 可关
  onDismiss?: () => void;           // 用户取消（Escape / backdrop）时调；缺省 = 直接 close
  onClose?: () => void;             // 任何路径关闭后回调
  focus?: HTMLElement | null;       // 开时聚焦（缺省不动焦点——iPad 别乱弹键盘）
  allowDuringBusy?: boolean;        // gate 专用：设计上与 busy 协同
}
export interface SheetHandle { readonly el: HTMLElement; close(): void; isOpen(): boolean }

interface Entry { el: HTMLElement; opts: SheetOpts; handle: SheetHandle }
const _stack: Entry[] = [];
let _backdrop: HTMLElement | null = null;
let _keyBound = false;

function _zBase(band: SheetBand): number {
  let v = NaN;
  try { v = parseInt(getComputedStyle(document.documentElement).getPropertyValue(band === "gate" ? "--z-gate" : "--z-modal"), 10); } catch { /* shim */ }
  return Number.isFinite(v) && v > 0 ? v : (band === "gate" ? 540 : 500);
}
function _ensureBackdrop(): HTMLElement {
  if (_backdrop && _backdrop.isConnected) return _backdrop;
  const b = document.createElement("div");
  b.id = "sheetBackdrop";
  b.className = "backdrop hidden";
  b.addEventListener("click", () => _dismissTop());
  (document.body || document.documentElement).appendChild(b);
  _backdrop = b;
  if (!_keyBound) {
    _keyBound = true;
    document.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !_stack.length) return;
      // 文本框内的 Escape 由各 sheet 自己处理（input sheet 有自己的 onKey）——这里只兜没被处理的
      if (e.defaultPrevented) return;
      e.preventDefault();
      _dismissTop();
    }, true);
  }
  return b;
}
function _dismissTop() {
  const top = _stack[_stack.length - 1];
  if (!top || top.opts.dismissible === false) return;
  if (top.opts.onDismiss) top.opts.onDismiss(); else top.handle.close();
}
function _relayout() {
  const b = _ensureBackdrop();
  if (!_stack.length) { b.classList.add("hidden"); b.classList.remove("sync-gate-backdrop"); b.style.zIndex = ""; return; }
  const top = _stack[_stack.length - 1];
  const band = top.opts.band ?? "modal";
  b.classList.remove("hidden");
  b.classList.toggle("sync-gate-backdrop", band === "gate");
  b.style.zIndex = String(_zBase(band));
  _stack.forEach((en, i) => { en.el.style.zIndex = String(_zBase(en.opts.band ?? "modal") + 1 + i); });
}

export function openSheet(el: HTMLElement, opts: SheetOpts = {}): SheetHandle {
  const existing = _stack.find((e) => e.el === el);
  if (existing) { existing.opts = opts; _relayout(); return existing.handle; }
  if (!opts.allowDuringBusy) assertAllows("dialog", "open sheet " + (el.id || el.className));
  let open = true;
  const handle: SheetHandle = {
    el,
    isOpen: () => open,
    close() {
      if (!open) return;
      open = false;
      const i = _stack.findIndex((e) => e.el === el);
      if (i >= 0) _stack.splice(i, 1);
      el.classList.add("hidden");
      el.style.zIndex = "";
      const ae = document.activeElement as HTMLElement | null;
      if (ae && el.contains(ae)) ae.blur?.();   // 关 sheet 收键盘（iOS 两课）
      _relayout();
      opts.onClose?.();
    },
  };
  _stack.push({ el, opts, handle });
  el.classList.remove("hidden");
  _relayout();
  if (opts.focus) { const f = opts.focus; setTimeout(() => { f.focus?.(); (f as HTMLInputElement).select?.(); }, 0); }
  return handle;
}
export function closeSheet(el: HTMLElement | null): void {
  if (!el) return;
  _stack.find((e) => e.el === el)?.handle.close();
}
export function isSheetOpen(el: HTMLElement | null): boolean { return !!el && _stack.some((e) => e.el === el); }
export function topSheet(): HTMLElement | null { return _stack[_stack.length - 1]?.el ?? null; }
export function anySheetOpen(): boolean { return _stack.length > 0; }
/** 唯一 backdrop 节点（诊断/测试；未开过任何 sheet 时为 null）。 */
export function sheetBackdrop(): HTMLElement | null { return _backdrop; }
export function closeAllSheets(): void { for (const e of [..._stack]) e.handle.close(); }

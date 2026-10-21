// 职责（单一）：in-app 模态对话框原语——确认 / 输入 / 锁屏 gate。
// 守红线「不用系统 alert/prompt/confirm」（iPad PWA 全屏体验烂）。纯 DOM，自持元素引用。
// sync 决策编排（gateCloudSyncOnOpen / checkCloudETag / 闲置锁屏）= store-coupled，留在 app，调本模块的 lockSyncGate。

import { openSheet as openModalSheet, closeSheet as closeModalSheet } from "./ui/sheet.ts";   // 2026-09-02 C3：backdrop/栈/焦点/busy 互斥归 ui/sheet

// **busy/sheet 互斥护栏（2026-06-12 死锁修复）**：fullscreen-busy 遮罩 z(540) 高于 input/confirm
//   sheet z(500)，busy 激活时弹输入框 = 框被盖住、用户点不到 → await 永不 resolve → 无限转圈。
//   这是**编程错误**（"我在忙" 与 "请输入" 自相矛盾）：交互输入必须在 withBusy 之外做。
//   → 这里**响亮 throw**，把静默转圈变成定位到调用栈的报错。（lockSyncGate 不受此限——它是 sync
//   冲突 gate，自带 spinner、设计上与 busy 协同，不走这条。）
// （_assertNotBusy 2026-09-02 C3/C8 进 ui/sheet → interaction-lock.assertAllows("dialog")：所有 sheet 都过这道，不止三原语）

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const g = {
  sheet: () => $("genericSheet"),
  title: () => $("genericSheetTitle"),
  message: () => $("genericSheetMessage"),
  input: () => $("genericSheetInput") as HTMLInputElement,
  form: () => $("genericSheetForm") as HTMLFormElement,
  user: () => $("genericSheetUser") as HTMLInputElement,
  check: () => $("genericSheetCheck"),
  checkInput: () => $("genericSheetCheckInput") as HTMLInputElement,
  checkLabel: () => $("genericSheetCheckLabel"),
  choices: () => $("genericSheetChoices"),
  confirm: () => $("genericSheetConfirm"),
  cancel: () => $("genericSheetCancel"),
};

function resolveAndClose<T>(resolve: (v: T) => void, value: T, cleanup: () => void) {
  cleanup();
  closeModalSheet(g.sheet());
  resolve(value);
}

// 真表单（2026-10-21）：这张 form **永远不真的提交**——submit 事件一律 preventDefault；输入态的「确定 / Enter」= requestSubmit → onSubmit。
//   确认态（没有输入框）点「确定」= 同一颗 submit 钮，也只走 click，不会跳页。
let _formGuarded = false;
function ensureFormGuard(): void {
  if (_formGuarded) return;
  _formGuarded = true;
  g.form().addEventListener("submit", (e) => e.preventDefault());
}

// 输入框对话框 → Promise<string|null>（取消 = null）。
// opts.password：输入框打码（type=password，关闭时还原）；opts.message：输入框上方说明行。
export function openInputSheet(title: string, defaultValue = "", opts: { placeholder?: string; password?: PasswordMode; message?: string; account?: string } = {}): Promise<string | null> {
  return openInputSheetEx(title, defaultValue, opts).then((r) => (r ? r.value : null));
}

/** 同上，多一个可选的勾（2026-10-17「在这台设备上记住密码」）：勾态随结果返回；取消 = null。 */
/** 密码态：true / "current" = 输入已有口令（autocomplete=current-password）；"new" = 设 / 换口令（new-password，密码管理器问「更新？」）。 */
export type PasswordMode = boolean | "current" | "new";
export function openInputSheetEx(title: string, defaultValue = "", { placeholder = "", password = false, message = "", checkbox, account }: { placeholder?: string; password?: PasswordMode; message?: string; checkbox?: { label: string; checked?: boolean }; account?: string } = {}): Promise<{ value: string; checked: boolean } | null> {
  return new Promise((resolve) => {
    ensureFormGuard();
    g.title().textContent = title;
    if (message) { g.message().classList.remove("hidden"); g.message().textContent = message; }
    else g.message().classList.add("hidden");
    g.input().classList.remove("hidden");
    // 密码态 = 真的 type=password + autocomplete（2026-10-21 user「口令面板改成真表单让 Edge 密码管理器记住 做，全家做」；此前为了躲密码管理器用
    //   type=text + -webkit-text-security 打码，那条 2026-10-21 吃书）。账号字段 = 图库 id，给密码管理器当 key（没有就空着，字段仍在）。
    //   绝不 autocomplete="off"、不禁粘贴。文本态（新建画名等）照旧 type=text、不带 autocomplete。
    const pwMode: "current" | "new" | null = password === "new" ? "new" : password ? "current" : null;
    g.input().type = pwMode ? "password" : "text";
    if (pwMode) g.input().setAttribute("autocomplete", pwMode === "new" ? "new-password" : "current-password");
    else g.input().removeAttribute("autocomplete");
    g.user().value = pwMode ? (account ?? "") : "";
    g.input().value = defaultValue;
    g.input().placeholder = placeholder;
    if (checkbox) { g.checkLabel().textContent = checkbox.label; g.checkInput().checked = !!checkbox.checked; g.check().classList.remove("hidden"); }
    openModalSheet(g.sheet(), { onDismiss: () => onCancel() });
    setTimeout(() => { g.input().focus(); g.input().select(); }, 0);
    let done = false;   // submit 与 click 同时到也只结一次账
    const onConfirm = () => { if (done) return; done = true; resolveAndClose(resolve, { value: g.input().value, checked: !!checkbox && g.checkInput().checked }, cleanup); };
    const onCancel = () => { if (done) return; done = true; resolveAndClose(resolve, null, cleanup); };
    const onSubmit = (e: Event) => { e.preventDefault(); onConfirm(); };   // 确定钮 = submit；密码管理器看的就是这次提交
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); g.form().requestSubmit(); }
      else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
    };
    const cleanup = () => {
      g.form().removeEventListener("submit", onSubmit);
      g.cancel().removeEventListener("click", onCancel);
      g.input().removeEventListener("keydown", onKey);
      g.input().type = "text";
      g.input().removeAttribute("autocomplete");
      g.input().value = "";
      g.user().value = "";
      g.check().classList.add("hidden"); g.checkInput().checked = false;   // 勾不残留到下一个输入框
    };
    g.form().addEventListener("submit", onSubmit);
    g.cancel().addEventListener("click", onCancel);
    g.input().addEventListener("keydown", onKey);
  });
}

// 确认对话框 → Promise<boolean>。
export function openConfirmSheet(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    ensureFormGuard();
    g.title().textContent = title;
    g.input().classList.add("hidden");
    g.message().classList.remove("hidden");
    g.message().textContent = message;
    openModalSheet(g.sheet(), { onDismiss: () => onCancel() });
    const onConfirm = () => resolveAndClose(resolve, true, cleanup);
    const onCancel = () => resolveAndClose(resolve, false, cleanup);
    const cleanup = () => {
      g.confirm().removeEventListener("click", onConfirm);
      g.cancel().removeEventListener("click", onCancel);
    };
    g.confirm().addEventListener("click", onConfirm);
    g.cancel().addEventListener("click", onCancel);
  });
}

// 多选项对话框 → Promise<T|null>（取消/点背板 = null）。#19 首用（拖入图片：新图层/设为参考）。
//   确认按钮隐藏，取消保留；选项按钮动态生成进 #genericSheetChoices。
//   onPick（2026-08-21 smart save）：**在按钮 click listener 内同步调**（resolve 之前）——
//   iOS 红线：loginRedirect 这类需要 user-gesture 的动作不能放在 `await openChoiceSheet` 之后
//   （Promise resolve 的微任务续体可能丢 transient activation → Safari 静默拦）。要保手势的
//   副作用走 onPick，别走返回值。
export function openChoiceSheet<T>(title: string, message: string, choices: { label: string; value: T; primary?: boolean; onPick?: () => void }[]): Promise<T | null> {
  return new Promise((resolve) => {
    ensureFormGuard();
    g.title().textContent = title;
    g.input().classList.add("hidden");
    if (message) { g.message().classList.remove("hidden"); g.message().textContent = message; }
    else g.message().classList.add("hidden");
    const box = g.choices();
    box.innerHTML = "";
    box.classList.remove("hidden");
    g.confirm().classList.add("hidden");
    const cleanup = () => {
      g.cancel().removeEventListener("click", onCancel);
      box.innerHTML = "";
      box.classList.add("hidden");
      g.confirm().classList.remove("hidden");
    };
    const onCancel = () => resolveAndClose(resolve, null as T | null, cleanup);
    for (const c of choices) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sheet-action" + (c.primary ? "" : " ghost");
      btn.textContent = c.label;
      btn.addEventListener("click", () => { c.onPick?.(); resolveAndClose(resolve, c.value as T | null, cleanup); });   // onPick 同步先跑（保 user-gesture）
      box.appendChild(btn);
    }
    openModalSheet(g.sheet(), { onDismiss: () => onCancel() });
    g.cancel().addEventListener("click", onCancel);
  });
}

// ---- Sync gate（锁屏覆盖 + 动作按钮）：纯 DOM 原语。决策编排在 app。----
// 动作 value 多态：多数是选择字符串（store onConflict / 文件夹名），cloud-freshness 用 { kind:"skip" } 哨兵。
// → lockSyncGate<T>；外部 settleSyncGate 可用任意值兜底关闭（pending resolve 因此擦成 unknown）。
interface SyncGateAction<T = string> { label: string; value: T; primary?: boolean; }
interface SyncGateOpts<T = string> { title: string; message: string; showSpinner?: boolean; actions: SyncGateAction<T>[]; note?: string; }
const syncGate: {
  sheet: HTMLElement; title: HTMLElement; message: HTMLElement;
  spinner: HTMLElement; actions: HTMLElement; note: HTMLElement; _pendingResolve: ((value: unknown) => void) | null;
} = {
  sheet: $("syncGateSheet"),
  title: $("syncGateTitle"),
  message: $("syncGateMessage"),
  spinner: $("syncGateSpinner"),
  actions: $("syncGateActions"),
  note: $("syncGateNote"),
  _pendingResolve: null,
};

export function lockSyncGate<T = string>({ title, message, showSpinner, actions, note }: SyncGateOpts<T>): Promise<T> {
  syncGate.title.textContent = title;
  syncGate.message.textContent = message;
  syncGate.note.textContent = note ?? "";          // 每次 lock 都重置：上一位调用者的小字不残留
  syncGate.note.classList.toggle("hidden", !note);
  syncGate.spinner.classList.toggle("hidden", !showSpinner);
  syncGate.actions.innerHTML = "";
  return new Promise<T>((resolve) => {
    for (const a of actions) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = a.label;
      if (a.primary) btn.classList.add("primary");
      btn.addEventListener("click", () => { unlockSyncGate(); resolve(a.value); });
      syncGate.actions.appendChild(btn);
    }
    // gate band + 允许穿透 busy（冲突必 surface；不可 dismiss——决策只能按钮选）
    openModalSheet(syncGate.sheet, { band: "gate", allowDuringBusy: true, dismissible: false });
    syncGate._pendingResolve = resolve as (value: unknown) => void;   // 让 fetch 完成时从外部 unlock 并返回
  });
}
export function unlockSyncGate() {
  closeModalSheet(syncGate.sheet);
  syncGate._pendingResolve = null;
}
export function settleSyncGate(value: unknown) {
  if (syncGate._pendingResolve) {
    const r = syncGate._pendingResolve;
    unlockSyncGate();
    r(value);
  }
}

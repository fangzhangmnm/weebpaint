// edit-lock —— 开着的这幅画此刻让不让改（家族「源文件原则上只读：手动解锁才能改」，2026-11-08）。created 2026-11-08 by Claude Fable 5.1
//   user 2026-11-08：「默认的文件你根本不能编辑，一编辑就报错，一保存就报错，然后都是灰的…得手动的解锁才行」
//   「到时候演示所的设计得设计的非常的瑞士奶酪…甚至是我们在库这一层里面本身拒绝写入」（演示所 = 演示锁，语音）。
// 这是 app 这一侧的三片奶酪的**一处回答**（库那一片在 @internal/store 2.3.0 的 lockByDefault，独立成立）：
//   ① 界面：interaction-lock 的 readonly 锁（2026-09-02 就定好了策略表）——落笔 / 粘贴 / 改 doc 的快捷键不收，平移 / 缩放 / 吸色 / 复制 / 导出照常；
//   ② 写门：Workpiece.writeGate——图层面板、滤镜、变换、撤销重做这些不经 ① 的按钮，在开写令牌那一下被拒；
//   ③ 保存：editor-session 的 editLocked——锁着还有改动 / 人按了存 → 响亮抛，改动留在内存里。
// 锁着 = 库开了 lockByDefault ∧ 开着的画住在图库里 ∧ 不是刚新建还没首存的 ∧ 这台设备上没有活着的解锁。**每次问都现算**（不记状态，不会失步）。
//   本地文件 / 空白画布 / 没挂图库：这一轮不锁（库管不到的地方）。
// 解锁只许由人的手势发起：本模块没有任何解锁的口（解锁在 edit-lock-door.ts 的两个钮和图库的菜单里）。
import { setDynamicLock, notifyLockChange, onReadonlyDenied } from "./ui/interaction-lock.ts";

export interface EditLockDeps {
  /** 现在挂着的库的锁面；没有库 → null。 */
  store(): { lockByDefault: boolean; unlockOf(identifier: string): unknown; watchUnlocks(cb: (live: unknown[]) => void): () => void } | null;
  /** 开着的这幅画在图库里的身份（全名）；本地文件 / 空白 / 没开 → null。 */
  activeIdentifier(): string | null;
  /** 刚新建、还没首存（它还不存在于库里，谈不上锁）。 */
  createPending(): boolean;
  /** 正在装入文档（装入不算改）。 */
  loading(): boolean;
  /** 开着的是硬盘上的单个文件（不经过库）→ 这一次打开的句柄（每次打开是新的一个）；不是 → null。 */
  localFile?(): object | null;
}

let _deps: EditLockDeps | null = null;
let _watched: unknown = null, _unwatch: (() => void) | null = null;
let _last = false;
const _changeListeners = new Set<(locked: boolean) => void>();
const _flashListeners = new Set<() => void>();

// 硬盘上的单个文件（user 2026-11-08：「硬盘上的一个文件，如果能实现这个功能的话，我觉得也可以」「就取决于这个锁跟着是谁」）：
//   它不经过库，库那一片奶酪没有；锁跟着**这一次打开的这个文件**（按句柄认）——打开默认锁着，人点「接着改」解锁，管到关掉 / 换开别的为止，不往任何地方记
//   （单个文件没有可靠的身份，只有文件名；按名字记一天会认错文件）。新画存成的文件不锁（那一下就是人在建它）。导出、另存为不归锁管 = 逃生口。
let _localUnlocked: object | null = null;
/** 「接着改」：解锁现在开着的这个硬盘文件。**只在人点钮时调**（edit-lock-door.ts）。开着的不是硬盘文件 → false。 */
export function unlockLocalFile(): boolean {
  const lf = _deps?.localFile?.() ?? null;
  if (!lf) return false;
  _localUnlocked = lf; refreshEditLock();
  return true;
}
/** 这个句柄算解着：新画刚存成的文件（人自己那一下保存建出来的），或者解着锁时文件换了句柄（给它加密另写了一份）。不是解锁的口：只许在这两处调。 */
export function keepLocalFileUnlocked(handle: object): void { _localUnlocked = handle; refreshEditLock(); }
/** 「锁上」现在开着的这个硬盘文件（画布文件菜单里那一项；调之前调用方已经把改动写回去了）。 */
export function lockLocalFile(): void { _localUnlocked = null; refreshEditLock(); }
/** 现在有没有东西可以「锁上」：开着一幅已经存在的画（图库里的 / 硬盘文件），而且它此刻解着。空白画布、刚新建还没存的、已经锁着的 → false。 */
export function canLockNow(): boolean {
  const d = _deps; if (!d) return false;
  const lf = d.localFile?.() ?? null;
  if (lf) return _localUnlocked === lf;
  const st = d.store(); if (!st || !st.lockByDefault) return false;
  const id = d.activeIdentifier(); if (!id || d.createPending()) return false;
  return !!st.unlockOf(id);
}
/** 现在开着的是不是硬盘上的单个文件（门据此只给一个钮）。 */
export function isLocalFileOpen(): boolean { return !!_deps?.localFile?.(); }

/** 开着的这幅画此刻是不是锁着。 */
export function isEditLocked(): boolean {
  const d = _deps; if (!d) return false;
  const lf = d.localFile?.() ?? null;
  if (lf) return _localUnlocked !== lf;   // 硬盘上的单个文件：只看这一次打开解没解
  const st = d.store(); if (!st || !st.lockByDefault) return false;
  const id = d.activeIdentifier(); if (!id) return false;
  if (d.createPending()) return false;
  return !st.unlockOf(id);
}
/** 给后端写门用：锁着（且不在装入）→ 让门闪一下并返回原因；否则 null。
 *  label = 写令牌的标签："load" = 整份装入（换画 / 新建 / 还原，替换整个文档，不是改这幅锁着的画）→ 永远放行；装入期间（loading）也放行。 */
export function editWriteGate(label?: string): string | null {
  if (label === "load") return null;
  if (!_deps || _deps.loading() || !isEditLocked()) return null;
  flashEditLock();
  return "edit-locked";
}
/** 保存这一层用：这个身份是不是锁着（editor-session 的 EditorAdapter.editLocked）。 */
export function isIdentifierEditLocked(identifier: string): boolean {
  const st = _deps?.store(); if (!st || !st.lockByDefault) return false;
  return !st.unlockOf(identifier);
}
/** 蹭到了：让门闪一下（不弹任何东西）。 */
export function flashEditLock(): void { for (const f of _flashListeners) { try { f(); } catch { /* 闪不闪不许影响调用方 */ } } }
export function onEditLockFlash(fn: () => void): () => void { _flashListeners.add(fn); return () => _flashListeners.delete(fn); }
/** 锁态变了（换画 / 解锁 / 锁上 / 过期 / 换库）→ 回调现在的锁态。 */
export function onEditLockChange(fn: (locked: boolean) => void): () => void { _changeListeners.add(fn); return () => _changeListeners.delete(fn); }

/** 对一下：库换了就重订解锁的订阅；锁态变了就通知（界面重画）。换画、装入完、存完、换库之后调；多调无害。 */
export function refreshEditLock(): void {
  const d = _deps; if (!d) return;
  const st = d.store();
  if (st !== _watched) {
    _unwatch?.(); _unwatch = null; _watched = st;
    if (st?.lockByDefault) _unwatch = st.watchUnlocks(() => refreshEditLock());   // 解 / 锁 / 过期 / 改名：库会叫
  }
  const now = isEditLocked();
  if (now === _last) return;
  _last = now;
  notifyLockChange();   // interaction-lock 的监听者（按钮灰不灰）
  for (const f of _changeListeners) { try { f(now); } catch { /* 监听者出错不许影响锁 */ } }
}

let _unDenied: (() => void) | null = null;
/** 测试收尾用：拆掉接线（模块是单例，不拆会带进后面的测试）。 */
export function _resetEditLockForTest(): void { _localUnlocked = null; _unwatch?.(); _unwatch = null; _watched = null; _deps = null; _last = false; _unDenied?.(); _unDenied = null; setDynamicLock("readonly", null); _changeListeners.clear(); _flashListeners.clear(); }
export function initEditLock(deps: EditLockDeps): void {
  _deps = deps;
  _unwatch?.(); _unwatch = null; _watched = null; _last = false;   // 重新接线（测试会接好几次）：从头订
  setDynamicLock("readonly", isEditLocked);          // ① 界面那一片：每次问都现算
  _unDenied?.(); _unDenied = onReadonlyDenied(() => flashEditLock());   // 被 ① 拦下的动作 → 门闪一下
  refreshEditLock();
}

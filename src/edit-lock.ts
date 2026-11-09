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
}

let _deps: EditLockDeps | null = null;
let _watched: unknown = null, _unwatch: (() => void) | null = null;
let _last = false;
const _changeListeners = new Set<(locked: boolean) => void>();
const _flashListeners = new Set<() => void>();

/** 开着的这幅画此刻是不是锁着。 */
export function isEditLocked(): boolean {
  const d = _deps; if (!d) return false;
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
export function _resetEditLockForTest(): void { _unwatch?.(); _unwatch = null; _watched = null; _deps = null; _last = false; _unDenied?.(); _unDenied = null; setDynamicLock("readonly", null); _changeListeners.clear(); _flashListeners.clear(); }
export function initEditLock(deps: EditLockDeps): void {
  _deps = deps;
  _unwatch?.(); _unwatch = null; _watched = null; _last = false;   // 重新接线（测试会接好几次）：从头订
  setDynamicLock("readonly", isEditLocked);          // ① 界面那一片：每次问都现算
  _unDenied?.(); _unDenied = onReadonlyDenied(() => flashEditLock());   // 被 ① 拦下的动作 → 门闪一下
  refreshEditLock();
}

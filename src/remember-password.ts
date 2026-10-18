// 「在这台设备上记住密码」政策。created 2026-10-17 by Claude Opus 5.5
// user 2026-10-14 / 10-15（KudsRocket 会话，见 ai-docs/inbox/20261014-from-kudsrocket-remember-password.md）→ 2026-10-17（WXHW 会话）：
//   「口令同意。口令加一个过期时间，最多一个月。」「升级加密库同意」。决策与威胁模型 = @internal/encryption 仓 ai-docs/adr/0001-device-remembers-password.md。
// 规矩：
//   · 只记**统一图库密码**；导入件自己的密码（per-name）照旧每次问。验得了的面板上一个勾（默认不勾）；记 30 天（库上限），到期自动忘。
//   · 开页：记着 → 先和 verifier 比，对了才 setPassword；对不上（别的设备改过 / 重置过）→ 忘掉，照常问；没 verifier → 忘掉。
//   · 统一密码被换掉：新的过得了 verifier（改密码先写 verifier 再换）→ 记新的、过期日不变；过不了（开了一张别的密码的本地文件，
//     session-state 把那把设成了会话密码）→ 不跟，记着的那把留着。锁定 / 首次密码撤销（setPassword(null)）→ 忘掉。
//   · 「锁定」/ 断开连接（退出登录）/ 忘记密码重置 → 忘掉；还原出厂删库（REMEMBER_DB 带 GUID 前缀）；清缓存 / 强制更新不碰。
//   · keeper 由组装点（app.ts）递进来（建在 encryption.ts）；本模块不打印密码。
//   · **单文件 html / itch 形态整个关掉**（user 2026-10-17「做」）：file:// 在 Chromium 里所有本地 html 共一个存储桶，itch 所有游戏共
//     `html-classic.itch.zone` 一个 origin——同源的别人能拿库里那把钥匙解出密码。`enabled: false` = 不给勾、不恢复、不跟、不碰存储。
import type { PasswordKeeper } from "@internal/encryption";
import { onCurrentPasswordChange } from "./crypto-state.ts";

export interface RememberDeps {
  /** false = 这个形态不提供（单文件 html / itch：同源的不只我们）。 */
  enabled: boolean;
  keeper: () => PasswordKeeper;
  /** verifier 在不在（跟账号走的 synced collection）。 */
  hasVerifier: () => boolean;
  /** 这把是不是统一图库密码（password-verifier.checkVerifier）。 */
  checkVerifier: (pw: string) => Promise<"ok" | "bad" | "none">;
  /** 把验过的密码送进内存（crypto-state.setPassword）。 */
  setPassword: (pw: string) => void;
  onError: (e: unknown) => void;
  /** 面板勾了、记上了（UI 说一句记到哪天）。 */
  onRemembered?: (expiresAt: number) => void;
  now?: () => number;
}

let d: RememberDeps | null = null;
let _until: number | null = null;   // 记到什么时候；null = 没记
let _pw: string | null = null;      // 记着的是哪一把（判断统一密码变了要不要跟）
let _choice = false;                // 最近一次提交的面板勾没勾（取一次就清）
let _forgetting: Promise<void> | null = null;
const _subs = new Set<() => void>();
const notify = () => { for (const cb of _subs) { try { cb(); } catch { /* UI subscriber bugs must not break remember state */ } } };
const need = (): RememberDeps => { if (!d) throw new Error("remember-password not wired (wireRememberPassword)"); return d; };

/** 组装点调一次；测试再调一次换成内存版（会清掉状态）。 */
export function wireRememberPassword(deps: RememberDeps): void { d = deps; _until = null; _pw = null; _choice = false; _forgetting = null; }
export function rememberedUntil(): number | null { return _until; }
/** 这个形态提不提供「在这台设备上记住」（面板要不要给勾）。 */
export function rememberAvailable(): boolean { return d?.enabled === true; }
export function onRememberChange(cb: () => void): () => void { _subs.add(cb); return () => _subs.delete(cb); }
/** 密码面板交回勾态（取消 = false）；重开面板时按它预勾。 */
export function setRememberChoice(v: boolean): void { _choice = v; }
export function rememberChoice(): boolean { return _choice; }

/** 开页：试记着的密码。"unlocked" | "none"（没记 / 没 verifier 可比）| "stale"（对不上，已忘）。 */
export async function restoreRemembered(): Promise<"unlocked" | "none" | "stale"> {
  const dd = need();
  if (!dd.enabled) return "none";   // 单文件 / itch：不碰存储
  const pw = await dd.keeper().recall();
  if (pw == null) { _until = null; _pw = null; notify(); return "none"; }
  if (!dd.hasVerifier()) { await forgetRemembered(); return "none"; }
  if ((await dd.checkVerifier(pw)) !== "ok") { await forgetRemembered(); return "stale"; }
  _pw = pw; _until = (await dd.keeper().status()).expiresAt;
  dd.setPassword(pw);   // 订阅里 pw === _pw → 不动
  notify();
  return "unlocked";
}

/** 忘掉（幂等；在飞的那次直接复用）。 */
export function forgetRemembered(): Promise<void> {
  if (!need().enabled) return Promise.resolve();
  _forgetting ??= (async () => {
    try { await need().keeper().forget(); _pw = null; _until = null; notify(); }
    finally { _forgetting = null; }
  })();
  return _forgetting;
}

async function follow(pw: string | null): Promise<void> {
  const dd = need();
  if (!dd.enabled) { _choice = false; return; }
  if (pw == null) { _choice = false; if (_until != null) await forgetRemembered(); return; }
  if (_until != null) {
    if (pw === _pw) return;
    const left = _until - (dd.now ?? Date.now)();
    if (left <= 0) { await forgetRemembered(); return; }
    if ((await dd.checkVerifier(pw)) !== "ok") return;   // 会话里临时换成别的密码（导入件）：不跟
    const { expiresAt } = await dd.keeper().remember(pw, { ttlMs: left });
    _pw = pw; _until = expiresAt; notify();
    return;
  }
  if (!_choice) return;
  _choice = false;
  const { expiresAt } = await dd.keeper().remember(pw);
  _pw = pw; _until = expiresAt; notify();
  dd.onRemembered?.(expiresAt);
}
onCurrentPasswordChange((pw) => { if (d) follow(pw).catch((e) => d?.onError(e)); });

// change-password.ts —— 图库换密码的编排（纯：零 DOM、零 store import；宿主注入 rekey / 记忆 / 提交）。
// created 2026-09-09 by Claude Fable 5.1（user 2026-09-09「还是加一个换密码ui吧，不然还是容易泄密」；store 0.12.0 `file.rekey`）。
// 为什么要有这个流程：没有它，用户换密码只能逐件「解除加密 → 再加密」，中间态把明文 push 上 OneDrive（版本历史永久留明文；
//   2026-09-09 加密合规审计 ①②）。rekey 是密文→密文：旧钥经 crypt.getPassword seam、新钥显式传入、内存重打包、云端只见新容器。
// 顺序（可中断、混合态可恢复）：
//   ① 每个目标先登记旧钥（seam 对它们给旧钥）；② 提交新密码（verifier + 全局内存密码）；③ 逐件 rekey：
//   成功（swapped / cloud-deferred / conflict = 本地已是新钥容器，云端由 push 流接力）→ 忘掉旧钥登记；
//   其余（offline / locked / no-local / not-encrypted / 抛）→ 保留旧钥登记 + 计入 kept（这件仍是旧密码；锁定后再开会问，per-name 兜住）。
//   中途崩溃 = 新旧两把钥匙并存，解锁循环 per-name 都能记住，不丢数据、不泄明文。

export const REKEY_OK: ReadonlySet<string> = new Set(["swapped", "cloud-deferred", "conflict"]);

export interface ChangePasswordDeps {
  /** 本机有字节的加密件（库全名）。 */
  targets: string[];
  oldPassword: string;
  newPassword: string;
  rekey: (name: string, newPassword: string) => Promise<{ status: string }>;
  /** 显式登记「这件用 pw」（不许做等于全局的短路）。 */
  rememberFilePassword: (name: string, pw: string) => void;
  forgetFilePassword: (name: string) => void;
  /** 提交新密码：verifier + 全局内存密码。只在 targets 登记完旧钥之后调、rekey 之前调。 */
  commitNewPassword: (pw: string) => Promise<void>;
  onProgress?: (done: number, total: number, name: string) => void;
  onError?: (name: string, e: unknown) => void;
}
export interface ChangePasswordReport { moved: string[]; kept: { name: string; status: string }[] }

export async function runChangePassword(d: ChangePasswordDeps): Promise<ChangePasswordReport> {
  if (!d.newPassword) throw new Error("change-password: newPassword required");
  if (d.newPassword === d.oldPassword) return { moved: [], kept: [] };   // 没变：不提交、不重封
  for (const n of d.targets) d.rememberFilePassword(n, d.oldPassword);   // ① 旧钥先钉在每件上
  await d.commitNewPassword(d.newPassword);                               // ② 全局换新钥（此后新稿 / 解锁都用新钥）
  const moved: string[] = [];
  const kept: { name: string; status: string }[] = [];
  let i = 0;
  for (const n of d.targets) {                                            // ③ 逐件密文→密文
    d.onProgress?.(i++, d.targets.length, n);
    try {
      const r = await d.rekey(n, d.newPassword);
      if (REKEY_OK.has(r.status)) { d.forgetFilePassword(n); moved.push(n); }
      else kept.push({ name: n, status: r.status });
    } catch (e) { d.onError?.(n, e); kept.push({ name: n, status: "error" }); }
  }
  return { moved, kept };
}

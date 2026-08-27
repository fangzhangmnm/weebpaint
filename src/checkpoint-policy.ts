// checkpoint（撤销更改 / revert）的**纯策略**：key 怎么拼、哪些时刻封存、加密件怎么处理。
// 纯模块：无 DOM / 无 IDB / 无 store —— 所以能 node 测（IDB 那层进真机批）。
// 落盘在 storage.ts（app 自己的 `weebpaint` 库，不是 store 的库）；编排在 session-state.ts。
//
// 语义（human 拍板 2026-07-18）：
//   · 快照点 = **打开这幅画的那一刻**（从图库点开 / 新建 / 另存为新身份），不是自动定时。
//   · **tab 重开不刷新**：冷启动 restore 不封存 —— 否则用户重开一次 tab，能回退到的"上次打开"
//     就被刷成了现在，revert 变成没用的空操作。
//   · revert 自己也不封存 —— 否则刚回滚掉的状态立刻把快照覆盖了，等于只能 revert 一次。
//   · 永远只留一份（slot 恒 0），但 key 按「多幅画 + 同画多档」设计好，将来加档不用改 key 格式。
//   · 加密作品存**密文容器**字节（明文派生物永不落持久层——红线）。

/** 何时封存 checkpoint。**显式枚举**而不是在 adopt 里埋钩子——因为 revert 也走 adopt，
 *  埋在里面就会「回滚完顺手把快照覆盖掉」。加新入口时来这里加一条，别在深处埋。 */
export type CheckpointTrigger =
  | "gallery-open"    // 从图库点开一幅画 → 封存
  | "new-doc"         // 新建画布（首存之后）→ 封存（revert = 回到空白）
  | "save-as"         // 另存为新身份 → 封存（新身份的"打开态"就是此刻）
  | "boot-restore"    // 冷启动 / tab 重开 → **不**封存
  | "revert"          // 回滚 → **不**封存
  | "cloud-refresh"   // 云端快进后整装重载（2026-08-25）→ 封存：revert 锚必须指向新世界线，
                      //   否则「回到打开时」会把刚快进来的云端版又用旧世界线覆写回去（案卷 §1 的孪生洞）
  // ── revert v2（P4 2026-08-26，verdicts §2.7）──
  | "local-open"          // 打开本地文件（file 家）的**打开点快照**：挂行李牌、session 级、正常关闭随牌焚 → 封存
  | "resume-first-input"  // 新的一次坐下的**首笔之前**（copy-on-write：at-rest 字节此刻仍是坐下前态）→ 封存
  | "pre-revert";         // revert 前自动拍当前态 = **undo revert**（先 saveNow 再取 at-rest——加密件红线：
                          //   活 doc 明文永不直落持久层，flush 后取的是密文容器）→ 封存

const CAPTURE: Record<CheckpointTrigger, boolean> = {
  "gallery-open": true,
  "new-doc": true,
  "save-as": true,
  "boot-restore": false,
  "revert": false,
  "cloud-refresh": true,
  "local-open": true,
  "resume-first-input": true,
  "pre-revert": true,
};

export function shouldCapture(trigger: CheckpointTrigger): boolean {
  return CAPTURE[trigger] === true;
}

/** checkpoint 的 IDB key。fullName = 库身份全名（X.ora），slot 恒 0（结构留多档余地）。
 *  `:` 安全：文件名里的 `:` 被 config.sessionFileName 剥掉了，不会和分隔符打架。 */
export function checkpointKey(fullName: string, slot = 0): string {
  return `${fullName}:${slot}`;
}

/** 一条 checkpoint 记录。bytes = **at-rest 字节**：加密件是密文容器，明文件是明文 ora。 */
export interface CheckpointRecord {
  name: string;        // 库身份全名（X.ora）
  slot: number;
  at: number;          // 封存时刻（epoch ms）——UI 显示「回到约 N 分钟前」
  bytes: Blob;
  encrypted: boolean;  // bytes 是不是密文容器（读回时决定要不要解壳）
}

/** 显示用：距今多少分钟（至少 1，避免「回到 0 分钟前」这种废话）。 */
export function checkpointAgeMinutes(at: number, now: number): number {
  return Math.max(1, Math.round((now - at) / 60000));
}


// ═══ revert v2 ring（P4 2026-08-26，verdicts §2.7；added by Claude Fable 5）═══════════════
// ring = 多档快照按**全局字节预算**滚动淘汰最旧（revert list 白送）；档位不数条数，数字节。
// docKey = 户口全名（X.ora）或行李牌 tag（file 家打开点快照，session 级、正常关闭随牌焚）。
// 落盘 = storage.ts 的 checkpoint-ring store；本节只有纯判断（node 测钉）。

/** ring 字节预算（可调常量，拍板值：桌面 64MB / 移动 32MB）。isCoarsePointer=移动端启发式判据。 */
export const RING_BUDGET_DESKTOP = 64 * 1024 * 1024;
export const RING_BUDGET_MOBILE = 32 * 1024 * 1024;
export function ringBudget(isCoarsePointer: boolean): number {
  return isCoarsePointer ? RING_BUDGET_MOBILE : RING_BUDGET_DESKTOP;
}

/** 坐下判定（输入间隔 qualifier）：两次输入隔 ≥ 此值 = 新的一次坐下 → 首笔之前封存。
 *  刻意**不依赖** visibility/锁屏/PWA 挂起事件——iPad 上那些不可靠（1623 分钟案根治）。可调常量。 */
export const SITTING_GAP_MS = 15 * 60_000;
export function isNewSitting(lastInputAt: number | null, now: number): boolean {
  return lastInputAt != null && now - lastInputAt >= SITTING_GAP_MS;
}

export interface RingEntryMeta {
  id: string;                 // ring 内唯一 id（存储层生成）
  docKey: string;             // 户口全名 or 行李牌 tag
  trigger: CheckpointTrigger;
  at: number;
  size: number;               // bytes.size（淘汰核算用；Blob 惰性，meta 自带免碰字节）
  encrypted: boolean;
}

/** 淘汰计划：按 at 旧→新淘汰，直到 现存+新档 ≤ 预算。
 *  新档自己**永不进淘汰名单**：超预算的巨档也要存（revert 保护 > 预算洁癖）——宁可 ring 只剩这一档。 */
export function planRingEviction(existing: ReadonlyArray<Pick<RingEntryMeta, "id" | "at" | "size">>, incomingSize: number, budget: number): string[] {
  const evict: string[] = [];
  let total = existing.reduce((s, e) => s + e.size, 0) + incomingSize;
  for (const e of [...existing].sort((a, b) => a.at - b.at)) {
    if (total <= budget) break;
    evict.push(e.id);
    total -= e.size;
  }
  return evict;
}

/** revert 列表的人话时间（拍板：「回到 今天 14:02（打开时）」——括号里的 trigger 词由 UI i18n 出）。
 *  纯函数：now 注入可测。跨天用日期，同天用 今天/昨天。 */
export function humanCheckpointTime(at: number, now: number): { day: "today" | "yesterday" | "date"; date: string; time: string } {
  const d = new Date(at), n = new Date(now);
  const p2 = (x: number) => String(x).padStart(2, "0");
  const time = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yest = new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1, 12);
  const day = sameDay(d, n) ? "today" : sameDay(d, yest) ? "yesterday" : "date";
  return { day, date: `${d.getMonth() + 1}/${d.getDate()}`, time };
}

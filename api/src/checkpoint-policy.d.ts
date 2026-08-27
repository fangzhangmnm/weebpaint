/** 何时封存 checkpoint。**显式枚举**而不是在 adopt 里埋钩子——因为 revert 也走 adopt，
 *  埋在里面就会「回滚完顺手把快照覆盖掉」。加新入口时来这里加一条，别在深处埋。 */
export type CheckpointTrigger = "gallery-open" | "new-doc" | "save-as" | "boot-restore" | "revert" | "cloud-refresh" | "local-open" | "resume-first-input" | "pre-revert";
export declare function shouldCapture(trigger: CheckpointTrigger): boolean;
/** checkpoint 的 IDB key。fullName = 库身份全名（X.ora），slot 恒 0（结构留多档余地）。
 *  `:` 安全：文件名里的 `:` 被 config.sessionFileName 剥掉了，不会和分隔符打架。 */
export declare function checkpointKey(fullName: string, slot?: number): string;
/** 一条 checkpoint 记录。bytes = **at-rest 字节**：加密件是密文容器，明文件是明文 ora。 */
export interface CheckpointRecord {
    name: string;
    slot: number;
    at: number;
    bytes: Blob;
    encrypted: boolean;
}
/** 显示用：距今多少分钟（至少 1，避免「回到 0 分钟前」这种废话）。 */
export declare function checkpointAgeMinutes(at: number, now: number): number;
/** ring 字节预算（可调常量，拍板值：桌面 64MB / 移动 32MB）。isCoarsePointer=移动端启发式判据。 */
export declare const RING_BUDGET_DESKTOP: number;
export declare const RING_BUDGET_MOBILE: number;
export declare function ringBudget(isCoarsePointer: boolean): number;
/** 坐下判定（输入间隔 qualifier）：两次输入隔 ≥ 此值 = 新的一次坐下 → 首笔之前封存。
 *  刻意**不依赖** visibility/锁屏/PWA 挂起事件——iPad 上那些不可靠（1623 分钟案根治）。可调常量。 */
export declare const SITTING_GAP_MS: number;
export declare function isNewSitting(lastInputAt: number | null, now: number): boolean;
export interface RingEntryMeta {
    id: string;
    docKey: string;
    trigger: CheckpointTrigger;
    at: number;
    size: number;
    encrypted: boolean;
}
/** 淘汰计划：按 at 旧→新淘汰，直到 现存+新档 ≤ 预算。
 *  新档自己**永不进淘汰名单**：超预算的巨档也要存（revert 保护 > 预算洁癖）——宁可 ring 只剩这一档。 */
export declare function planRingEviction(existing: ReadonlyArray<Pick<RingEntryMeta, "id" | "at" | "size">>, incomingSize: number, budget: number): string[];
/** revert 列表的人话时间（拍板：「回到 今天 14:02（打开时）」——括号里的 trigger 词由 UI i18n 出）。
 *  纯函数：now 注入可测。跨天用日期，同天用 今天/昨天。 */
export declare function humanCheckpointTime(at: number, now: number): {
    day: "today" | "yesterday" | "date";
    date: string;
    time: string;
};

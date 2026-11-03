/** 为什么没有存储：dev-switch = 开发开关（?nostore / 本机开关键 / 测试 env）；storage-blocked = 浏览器不给存（Safari 双击打开等，
 *  一碰就 SecurityError）；null = 在场。2026-11-03 起分开说（家族工单 B2，Claude Opus 5.5）：只有 storage-blocked 才说
 *  「这个浏览器没测过……」那句（src/site-hint.ts），开发开关不该吓人。 */
export type StoreAbsentReason = "dev-switch" | "storage-blocked" | null;
export declare const NOSTORE_KEY = "weebpaint-bd6cece69075d759.nostore";
export declare function detectStoreAbsentReason(): StoreAbsentReason;
export declare function detectStoreAbsent(): boolean;

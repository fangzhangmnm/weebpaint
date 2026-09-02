export type LockKind = "busy" | "readonly";
export type Intent = "pointer:draw" | "pointer:navigate" | "pointer:pick" | "key:shortcut" | "key:modifier" | "paste" | "copy" | "doc:mutate" | "persist" | "export:read" | "menu" | "dialog" | "gate" | "notice";
export interface IntentCtx {
    shortcutCategory?: string;
}
/** readonly 放行的快捷键类（KEYBOARD_SHORTCUTS 的 category i18n key）。 */
export declare const READONLY_SHORTCUT_CATEGORIES: Set<string>;
/** 纯函数：某把锁对某意图放不放行（可测；readonly 的快捷键按类）。 */
export declare function policyAllows(kind: LockKind, intent: Intent, ctx?: IntentCtx): boolean;
/** 拉锁；返回放锁函数（幂等）。 */
export declare function acquireLock(kind: LockKind): () => void;
export declare function isLocked(kind?: LockKind): boolean;
export declare function activeLocks(): LockKind[];
/** 此刻放不放行：每把在场的锁都得同意。无锁 = 放行。 */
export declare function allows(intent: Intent, ctx?: IntentCtx): boolean;
/** 编程错误式断言（如 busy 期开模态 = 自相矛盾 → 响亮 throw，别静默转圈）。 */
export declare function assertAllows(intent: Intent, what: string): void;
export declare function onLockChange(fn: () => void): () => void;
/** pointer role（pointer-route.assignRole 的产物）→ intent。ignore/null = 不需要许可。 */
export declare function intentForPointerRole(role: string | null): Intent | null;
/** 测试用：清零所有锁。 */
export declare function _resetLocksForTest(): void;

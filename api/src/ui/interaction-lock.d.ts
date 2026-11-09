export type LockKind = "busy" | "readonly" | "gate";
export type Intent = "pointer:draw" | "pointer:navigate" | "pointer:pick" | "key:shortcut" | "key:modifier" | "paste" | "copy" | "doc:mutate" | "persist" | "export:read" | "menu" | "dialog" | "gate" | "notice";
export interface IntentCtx {
    shortcutCategory?: string;
    /** 这个动作要做的操作（= 写令牌的标签；src/edit-lock-table.ts 那张表的键）。只对 readonly 有意义：
     *  表里列为「看法」的操作，锁着也放行（2026-11-09：选区、图层可见性）。没给 = 按下面的静态表。 */
    op?: string;
}
/** readonly 放行的快捷键类（KEYBOARD_SHORTCUTS 的 category i18n key）。 */
export declare const READONLY_SHORTCUT_CATEGORIES: Set<string>;
/** 纯函数：某把锁对某意图放不放行（可测）。
 *  readonly = 静态表（读的都放）**加上一条**：这个动作要做的操作在分类表里是「看法」→ 放（指针画选区、选区类快捷键…）。
 *  「看法」只会多放、不会多拦；busy / gate 不看 op（那两把锁在场时什么都不该动）。 */
export declare function policyAllows(kind: LockKind, intent: Intent, ctx?: IntentCtx): boolean;
export declare function setDynamicLock(kind: LockKind, held: (() => boolean) | null): void;
export declare function notifyLockChange(): void;
export declare function onReadonlyDenied(fn: (intent: Intent) => void): () => void;
/** 拉锁；返回放锁函数（幂等）。 */
export declare function acquireLock(kind: LockKind): () => void;
export declare function isLocked(kind?: LockKind): boolean;
export declare function activeLocks(): LockKind[];
/** 此刻放不放行：每把在场的锁都得同意。无锁 = 放行。 */
export declare function allows(intent: Intent, ctx?: IntentCtx): boolean;
/** 编程错误式断言（如 busy 期开模态 = 自相矛盾 → 响亮 throw，别静默转圈）。 */
export declare function assertAllows(intent: Intent, what: string): void;
export declare function onLockChange(fn: () => void): () => void;
/** pointer role（pointer-route.assignRole 的产物）→ intent。ignore/null = 不需要许可。
 *  lasso 这个 role 底下有三种事（画选区 / 拖浮层 / 油漆桶落色），intent 一律是 pointer:draw——细分靠调用方另给的 op（input.ts pointerOp）。 */
export declare function intentForPointerRole(role: string | null): Intent | null;
/** 测试用：清零所有锁。 */
export declare function _resetLocksForTest(): void;

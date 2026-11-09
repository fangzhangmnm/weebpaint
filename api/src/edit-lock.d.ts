export interface EditLockDeps {
    /** 现在挂着的库的锁面；没有库 → null。 */
    store(): {
        lockByDefault: boolean;
        unlockOf(identifier: string): unknown;
        watchUnlocks(cb: (live: unknown[]) => void): () => void;
    } | null;
    /** 开着的这幅画在图库里的身份（全名）；本地文件 / 空白 / 没开 → null。 */
    activeIdentifier(): string | null;
    /** 刚新建、还没首存（它还不存在于库里，谈不上锁）。 */
    createPending(): boolean;
    /** 正在装入文档（装入不算改）。 */
    loading(): boolean;
}
/** 开着的这幅画此刻是不是锁着。 */
export declare function isEditLocked(): boolean;
/** 给后端写门用：锁着（且不在装入）→ 让门闪一下并返回原因；否则 null。
 *  label = 写令牌的标签："load" = 整份装入（换画 / 新建 / 还原，替换整个文档，不是改这幅锁着的画）→ 永远放行；装入期间（loading）也放行。 */
export declare function editWriteGate(label?: string): string | null;
/** 保存这一层用：这个身份是不是锁着（editor-session 的 EditorAdapter.editLocked）。 */
export declare function isIdentifierEditLocked(identifier: string): boolean;
/** 蹭到了：让门闪一下（不弹任何东西）。 */
export declare function flashEditLock(): void;
export declare function onEditLockFlash(fn: () => void): () => void;
/** 锁态变了（换画 / 解锁 / 锁上 / 过期 / 换库）→ 回调现在的锁态。 */
export declare function onEditLockChange(fn: (locked: boolean) => void): () => void;
/** 对一下：库换了就重订解锁的订阅；锁态变了就通知（界面重画）。换画、装入完、存完、换库之后调；多调无害。 */
export declare function refreshEditLock(): void;
/** 测试收尾用：拆掉接线（模块是单例，不拆会带进后面的测试）。 */
export declare function _resetEditLockForTest(): void;
export declare function initEditLock(deps: EditLockDeps): void;

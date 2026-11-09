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
    /** 开着的是硬盘上的单个文件（不经过库）→ 这一次打开的句柄（每次打开是新的一个）；不是 → null。 */
    localFile?(): object | null;
}
/** 开着的这幅画此刻是不是锁着。 */
export declare function isEditLocked(): boolean;
/** 现在有没有东西可以「锁上」：开着一幅已经存在的画（图库里的 / 硬盘文件），而且它此刻解着。空白画布、刚新建还没存的、已经锁着的 → false。 */
export declare function canLockNow(): boolean;
/** 现在开着的是不是硬盘上的单个文件（门据此只给一个钮）。 */
export declare function isLocalFileOpen(): boolean;
/** 保存这一层用：这个身份是不是锁着（editor-session 的 EditorAdapter.editLocked——它按「要存的那个身份」问，不按「开着的这幅」）。 */
export declare function isIdentifierEditLocked(identifier: string): boolean;
/** 「接着改」：解锁现在开着的这个硬盘文件。**只在人点钮时调**（edit-lock-door.ts）。开着的不是硬盘文件 → false。 */
export declare function unlockLocalFile(): boolean;
/** 这个句柄算解着：新画刚存成的文件（人自己那一下保存建出来的），或者解着锁时文件换了句柄（给它加密另写了一份）。不是解锁的口：只许在这两处调。 */
export declare function keepLocalFileUnlocked(handle: object): void;
/** 「锁上」现在开着的这个硬盘文件（画布文件菜单里那一项；调之前调用方已经把改动写回去了）。 */
export declare function lockLocalFile(): void;
/** 解锁之后问一次：锁着的时候有没有动过要进文件的看法。问完清零。 */
export declare function takeLookOwed(): boolean;
/** 写门：这个操作此刻让不让做。让 → null；不让 → 原因（并让门闪一下）。label = 操作的名字（写令牌的标签）。
 *  · "load" = 整份装入（换画 / 新建 / 还原，替换整个文档，不是改这幅锁着的画）→ 永远放行，上一幅欠着的看法作废；装入期间也放行。
 *  · 锁着：分类表里的「看法」放行（要进文件的记一笔欠着）；其余一律拒。没锁：都放。 */
export declare function editWriteGate(label?: string): string | null;
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

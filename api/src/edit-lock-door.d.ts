export interface EditLockDoorDeps {
    /** 开着的这幅画在图库里的身份（全名）；没有 → null。 */
    activeIdentifier(): string | null;
    /** 「接着改」：解锁（图库库的动词，自己会说话）。 */
    unlock(identifier: string): Promise<boolean>;
    /** 「存一版再改」：先存一版，成了才解锁。 */
    saveVersionThenUnlock(identifier: string): Promise<boolean>;
    /** 开着的是硬盘上的单个文件时的「接着改」（解到关掉这个文件为止）。 */
    unlockLocal(): boolean;
}
export declare function initEditLockDoor(d: EditLockDoorDeps): void;

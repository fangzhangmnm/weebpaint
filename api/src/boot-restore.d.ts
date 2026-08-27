export interface RestorePorts {
    /** 持久层记的「上次打开的是谁」。**三态**（P1.5 2026-08-26 user 拍板「首次打开新画布，上次图库则图库」）：
     *  null=从未绑定（首次）→ 新画布；""=上次停在图库（有意）→ 图库；名 → 自动恢复它。 */
    getWantedName(): string | null;
    /** 真正去开（store.file.open + adopt）。返回是否装入了字节。 */
    restore(name: string): Promise<boolean>;
    /** 只改内存里的活动名，**不动持久的 currentFile**（= session.setName(x, {persist:false})）。 */
    setNameMemoryOnly(name: string | null): void;
    /** 「上次就停在图库」（wanted 为空 = 用户离开时的**有意**状态）的落点。
     *  ⚠ canvas-first（P1 2026-08-26，verdicts §2.4「boot 永不 404 跳 gallery」）：只有这条有意路
     *  还落图库；失败/断路/锁 三条路一律落画布——图库不是失败的垃圾桶。 */
    openGallery(): Promise<void>;
    updateSaveStatus(): void;
    onOpened(name: string): void;
    onNotFound(name: string): void;
    /** 上次 boot 留下的 attempt 标记（优雅收场会清 null；非 null = 上次死在开它的半路）。 */
    getRestoreAttempt(): string | null;
    setRestoreAttempt(name: string | null): void;
    /** 标记必须在 restore 之前**落盘**——collection 冷写是 400ms 防抖，OOM 崩溃可比它快。 */
    flushMarker(): Promise<void>;
    onCrashLoopSkipped(name: string): void;
    /** 无 Web Locks 支持时恒 false（整套降级为现状，行为不变）。 */
    isDocLockedElsewhere(name: string): Promise<boolean>;
    onLockedElsewhere(name: string): void;
    /** 关闭态恒 false（含容器未配置 auth）。 */
    isCloudEnabled(): boolean;
    /** 云关落点（P1.5 起**只剩云关这一条路**用它）：plain 空白画布（无 store 家可安，无 session 绑定；
     *  P2 transient 接手后升级）。⚠ 纯 UI 落点，零数据变更：currentFile/标记一个都不碰。 */
    openBlankCanvas(): Promise<void>;
    /** 云关落点的提示文案（为什么没自动开上次的画）——与 openBlankCanvas 分离：落点共用、文案各表。 */
    onCloudOff(): void;
    /** 云开态的画布落点（P1.5）= **可画的新画布**（lazyblank：日期默认名、首笔自动安家进图库——
     *  瑞士奶酪：云开态不许存在「能画但存不了」的画布）。首次 + 失败/断路/锁 四条路共用；
     *  与 openBlankCanvas（云关 plain blank，无 store 家可安，P2 transient 接手）分开。
     *  内部自管身份（memory-only 日期名），故这些路径先 setNameMemoryOnly(null) 再调它不冲突。 */
    openFreshCanvas(): Promise<void>;
}
export type RestoreOutcome = "restored" | "fresh-first-boot" | "gallery-deliberate" | "blank-failed" | "blank-crash-loop" | "blank-locked-elsewhere" | "blank-cloud-off";
export declare function restoreLastSession(p: RestorePorts): Promise<RestoreOutcome>;

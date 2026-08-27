/** 上次离开时开着什么（boot 三态的 typed 形；P1.5 user 拍板「首次新画布，上次图库则图库」）。 */
export type ResumeOpened = {
    kind: "doc";
    path: string;
} | {
    kind: "gallery";
} | null;
export interface ResumeSlate {
    opened: ResumeOpened;
    /** 崩溃环断路标记（boot-restore 纪律③）：boot 自动开画前写目标名，优雅收场清 null。
     *  与 opened 同记录同原子写——「写标记必须先于 restore 落盘」由同步写直接保证。 */
    restoreAttempt: string | null;
}
export declare function readSlate(galleryId?: string): ResumeSlate;
/** 唯一写点①：活动身份持久化（原 setCurrentSessionName 的持久层）。
 *  开画成功 = app 活着且真拿住画 → 崩溃环标记一并解除（原 appState.restoreAttempt=null 语义）。 */
export declare function setOpened(opened: ResumeOpened, galleryId?: string): void;
/** 唯一写点②：崩溃环标记（boot-restore 纪律③）。同步落盘——无需 flush。 */
export declare function setRestoreAttempt(name: string | null, galleryId?: string): void;
/** 一次性播种（幂等）：从 legacy 双态迁入——currentFile 三态字符串（null=首次/""=图库/名=画）+
 *  restoreAttempt。已有回执条（含播种过的空条）→ 不覆盖。boot 在 collection hydrate 后调一次。 */
export declare function seedSlateFromLegacy(legacy: {
    currentFile: string | null;
    restoreAttempt: string | null;
}, galleryId?: string): void;

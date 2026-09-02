export type NoticeLevel = "neutral" | "info" | "warning" | "error";
export interface NoticeAction {
    label: string;
    onClick: () => void;
    primary?: boolean;
}
export interface NoticeOpts {
    id?: string;
    level?: NoticeLevel;
    text: string;
    actions?: NoticeAction[];
    dismissible?: boolean;
    dismissLabel?: string;
    tapToDismiss?: boolean;
    autoHideMs?: number;
    onDismiss?: () => void;
    ariaLive?: "polite" | "assertive";
}
export interface NoticeHandle {
    readonly el: HTMLElement;
    readonly id: string;
    setText(text: string): void;
    close(): void;
    isOpen(): boolean;
}
/** 模态/gate 开合后调（C3 sheet 模块的开合路径）；也可在任何布局变化后调。 */
export declare function relayoutNotices(): void;
export declare function showNotice(opts: NoticeOpts): NoticeHandle;
export declare function closeNotice(id: string): void;
export declare function noticeCount(): number;
export declare function isNoticeOpen(id: string): boolean;

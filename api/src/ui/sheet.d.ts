export type SheetBand = "modal" | "gate";
export interface SheetOpts {
    band?: SheetBand;
    dismissible?: boolean;
    onDismiss?: () => void;
    onClose?: () => void;
    focus?: HTMLElement | null;
    allowDuringBusy?: boolean;
}
export interface SheetHandle {
    readonly el: HTMLElement;
    close(): void;
    isOpen(): boolean;
}
export declare function openSheet(el: HTMLElement, opts?: SheetOpts): SheetHandle;
export declare function closeSheet(el: HTMLElement | null): void;
export declare function isSheetOpen(el: HTMLElement | null): boolean;
export declare function topSheet(): HTMLElement | null;
export declare function anySheetOpen(): boolean;
/** 唯一 backdrop 节点（诊断/测试；未开过任何 sheet 时为 null）。 */
export declare function sheetBackdrop(): HTMLElement | null;
export declare function closeAllSheets(): void;

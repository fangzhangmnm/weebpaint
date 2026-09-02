export type PopupBand = "menu" | "popover" | "modal";
export type PopupVariant = "list" | "compact";
export interface PopupMenuItem<Id extends string = string> {
    id: Id;
    label: string;
    icon?: string;
    hidden?: boolean;
    disabled?: boolean;
    danger?: boolean;
    checked?: boolean;
    separatorBefore?: boolean;
}
export interface PopupMenuOpts<Id extends string = string> {
    anchor: HTMLElement;
    items: () => PopupMenuItem<Id>[];
    /** 返回 "keep" = 选了但菜单不关（随后请 refresh）。 */
    onPick: (id: Id, item: PopupMenuItem<Id>) => void | "keep";
    onClose?: () => void;
    align?: "left" | "right";
    offsetY?: number;
    band?: PopupBand;
    variant?: PopupVariant;
    swallowOutsideTap?: boolean;
    ariaLabel?: string;
}
export interface PopupMenuHandle {
    close(): void;
    refresh(): void;
    readonly isOpen: boolean;
    readonly el: HTMLElement;
    readonly anchor: HTMLElement;
}
/** 当前开着的 popup-menu（没有 = null）。 */
export declare function currentPopupMenu(): PopupMenuHandle | null;
/** 关掉当前开着的（下笔 / 切页等外部时机用）。 */
export declare function closePopupMenu(): void;
/** 锚按钮 toggle 语义：同一锚已开 → 关并返回 null；否则开。 */
export declare function togglePopupMenu<Id extends string>(opts: PopupMenuOpts<Id>): PopupMenuHandle | null;
export declare function openPopupMenu<Id extends string>(opts: PopupMenuOpts<Id>): PopupMenuHandle;

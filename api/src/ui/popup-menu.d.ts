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
    header?: boolean;
}
/** 现建 / 收养共用的锚定与关闭选项。 */
export interface PopupAnchorOpts {
    anchor: HTMLElement;
    align?: "left" | "right";
    offsetY?: number;
    belowToolbars?: boolean;
    edgeMargin?: number;
    /** z band：现建默认 menu；收养默认 "css"（保留节点自己的 CSS z）。菜单内再弹 = popover；sheet(modal) 内 = modal。 */
    band?: PopupBand | "css";
    swallowOutsideTap?: boolean;
    onClose?: () => void;
    ariaLabel?: string;
}
export interface PopupMenuOpts<Id extends string = string> extends PopupAnchorOpts {
    items: () => PopupMenuItem<Id>[];
    /** 返回 "keep" = 选了但菜单不关（随后请 refresh）。 */
    onPick: (id: Id, item: PopupMenuItem<Id>) => void | "keep";
    variant?: PopupVariant;
}
export interface AdoptedPopupOpts extends PopupAnchorOpts {
    /** 节点原本嵌在某容器里（backdrop-filter / overflow 会困住它）→ 收养时搬到 body（一次性）。 */
    mountToBody?: boolean;
    /** 不重定位（节点由 CSS 钉死）——只要外点关/Escape/栈。 */
    position?: "anchor" | "css";
}
export interface PopupMenuHandle {
    close(): void;
    /** 现建：重绘 items + 重定位；收养：重定位。 */
    refresh(): void;
    readonly isOpen: boolean;
    readonly el: HTMLElement;
    readonly anchor: HTMLElement;
}
/** 最上层的 popup（没有 = null）。 */
export declare function currentPopupMenu(): PopupMenuHandle | null;
/** 全关（下笔 / 切页等外部时机用）。 */
export declare function closePopupMenu(): void;
export declare const closeAllPopupMenus: typeof closePopupMenu;
/** 关某个节点的 popup（不在栈里 → 只确保它 hidden；老调用方「menu.classList.add("hidden")」的替身）。 */
export declare function closePopupMenuOf(el: HTMLElement | null): void;
export declare function isPopupOpen(el: HTMLElement | null): boolean;
/** 锚按钮 toggle 语义：同一锚已开 → 关并返回 null；否则开。 */
export declare function togglePopupMenu<Id extends string>(opts: PopupMenuOpts<Id>): PopupMenuHandle | null;
export declare function toggleAdoptedPopup(el: HTMLElement, opts: AdoptedPopupOpts): PopupMenuHandle | null;
export declare function openPopupMenu<Id extends string>(opts: PopupMenuOpts<Id>): PopupMenuHandle;
/** 收养静态节点：显示 + 锚定 + 栈 + 外点关/Escape；关 = 加 hidden（节点留在 DOM，内容仍是 index.html 的）。 */
export declare function openAdoptedPopup(el: HTMLElement, opts: AdoptedPopupOpts): PopupMenuHandle;

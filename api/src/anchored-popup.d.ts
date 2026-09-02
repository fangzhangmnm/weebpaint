export declare function safeAreaTop(): number;
export declare function topToolbarBottom(): number;
interface PositionOpts {
    anchor?: HTMLElement | null;
    align?: "left" | "right";
    offsetY?: number;
    edgeMargin?: number;
    belowToolbars?: boolean;
    clampViewport?: boolean;
}
export declare function positionPopup(popupEl: HTMLElement | null, opts?: PositionOpts): void;
export {};

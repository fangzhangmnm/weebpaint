export interface LeftDialOpts {
    getSize(): number;
    getOpacity(): number;
    getSizeMax(): number;
    getBrushName(): string;
    getCanDraw(): boolean;
    getZoom(): number;
    onSize(px: number): void;
    onOpacity(frac: number): void;
    onBrushTap(): void;
    onBrushLongpress(): void;
    onPick(): void;
    onPickHoldStart(): void;
    onPickHoldEnd(): void;
    getPicking(): boolean;
    getPickIcon(): string;
    getPickTitle(): string;
    getDialVisible(): boolean;
    getPickVisible(): boolean;
    getRuler(): {
        on: boolean;
        placing: boolean;
    };
    onRulerTap(): void;
    onRulerLongpress(): void;
}
export interface LeftDialHandle {
    flashSize(): void;
    unmount(): void;
}
export declare function mountLeftDial(el: HTMLElement, opts: LeftDialOpts): LeftDialHandle;

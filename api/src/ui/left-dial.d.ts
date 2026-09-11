export interface LeftDialOpts {
    getSize(): number;
    getOpacity(): number;
    getSizeMax(): number;
    getCanDraw(): boolean;
    getZoom(): number;
    onSize(px: number): void;
    onOpacity(frac: number): void;
    onPick(): void;
    onPickHoldStart(): void;
    onPickHoldEnd(): void;
    getPicking(): boolean;
    getPickIcon(): string;
    getPickTitle(): string;
}
export interface LeftDialHandle {
    flashSize(): void;
    unmount(): void;
}
export declare function mountLeftDial(el: HTMLElement, opts: LeftDialOpts): LeftDialHandle;

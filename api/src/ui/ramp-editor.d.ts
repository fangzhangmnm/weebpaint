import { type ColorRamp, type Rgba8 } from "../common/color-ramp.ts";
/** 256 段硬边渐变：第 i 段覆盖 [i/256, (i+1)/256]（双位置色标语法）。 */
export declare function rampCssGradient(lut: Uint8ClampedArray): string;
/** ＋ 钮插入位置：选中与右邻中点；选中末位 → 与左邻中点；无选中 → 最大间隔中点。 */
export declare function pickInsertStopT(stops: readonly {
    t: number;
}[], selected: number): number;
export declare function rgba8ToHex(c: Rgba8): string;
export interface RampEditorOpts {
    ramp: ColorRamp;
    onInput(): void;
    onCommit(): void;
    onSelect?(i: number): void;
}
export interface RampEditorHandle {
    el: HTMLElement;
    setRamp(r: ColorRamp): void;
    redraw(): void;
    selected(): number;
    select(i: number): void;
    dispose(): void;
}
export declare function makeRampEditor(o: RampEditorOpts): RampEditorHandle;

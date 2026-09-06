import type { AnimCurve } from "../common/anim-curve.ts";
import { type MixSpace } from "../backend/algorithms/color-mix.ts";
export interface SmudgeLayer {
    docW: number;
    docH: number;
    getImageData(docX: number, docY: number, w: number, h: number): ImageData;
    putImageData(docX: number, docY: number, img: ImageData): void;
}
export interface SmudgeSelection {
    materializeMaskRegion(x0: number, y0: number, w: number, h: number): Uint8Array;
}
export type SmudgeMode = "smear" | "dull" | "paint";
export interface SmudgeSettings {
    mode: SmudgeMode;
    size: number;
    hardness: number;
    spacing: number;
    strength: number;
    sizeCoeff: number;
    flowCoeff: number;
    opaCoeff: number;
    pressureGamma: number;
    pressureCurve?: AnimCurve | null;
    colorRate: number;
    color: readonly [number, number, number];
    mix: MixSpace;
    lockAlpha: boolean;
}
type Rect = [number, number, number, number];
export declare class SmudgeEngine {
    private _st;
    beginStroke(layer: SmudgeLayer, settings: SmudgeSettings, x: number, y: number, pressure: number, selection: SmudgeSelection | null): void;
    extendStroke(x: number, y: number, pressure: number): void;
    endStroke(): void;
    cancelStroke(): void;
    flushDirty(): Rect | null;
    private _radius;
    private _dab;
    private _weightedAverage;
}
export {};

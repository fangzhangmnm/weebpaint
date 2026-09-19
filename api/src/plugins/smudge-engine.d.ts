import type { AnimCurve } from "../common/anim-curve.ts";
import type { MixSpace } from "../backend/algorithms/color-mix.ts";
import type { RegionStroke } from "../backend/gl/region-stroke.ts";
export type SmudgeMode = "smear" | "dull" | "paint";
export interface SmudgeSettings {
    mode: SmudgeMode;
    dull: number;
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
    dilution?: number;
    memoryLength?: number;
    color: readonly [number, number, number];
    mix: MixSpace;
    lockAlpha: boolean;
}
type Rect = [number, number, number, number];
export declare class SmudgeEngine {
    private _st;
    /** 起笔。rs = 本笔的 RegionStroke（session 造；选区平面与 lockAlpha 都在它身上）。 */
    beginStroke(rs: RegionStroke, settings: SmudgeSettings, x: number, y: number, pressure: number): void;
    extendStroke(x: number, y: number, pressure: number): void;
    endStroke(): void;
    cancelStroke(): void;
    flushDirty(): Rect | null;
    private _radius;
    private _average;
    private _multiRes;
    private _dab;
}
export {};

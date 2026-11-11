import { type PressureShaper } from "../common/pressure-curve.ts";
import { PressureLPF } from "./stroke-smoother.ts";
import { StrokeCore, type StampParams } from "./stroke-core.ts";
import type { ViewLeaf } from "./workpiece/painting-view.ts";
import type { ResolvedBrush } from "../common/resolved-brush.ts";
import type { Stamp, StrokeShape } from "./gl/gl-stamp.ts";
type Rect = [number, number, number, number];
interface StrokeState {
    layer: ViewLeaf;
    settings: ResolvedBrush;
    pShape: PressureShaper;
    mode: string;
    buffered: boolean;
    lastX: number;
    lastY: number;
    lastP: number;
    pLPF: PressureLPF | null;
    accumDist: number;
    strokeDist: number;
    dirty: Rect | null;
    isBuildup: boolean;
    core: StrokeCore | null;
}
export declare class BrushEngine {
    _stroke: StrokeState | null;
    constructor();
    _stepFor(s: ResolvedBrush, pressure: number, shape: PressureShaper): number;
    beginStroke(layer: ViewLeaf, settings: ResolvedBrush, x: number, y: number, pressure: number, mode?: string, smooth?: {
        tau?: number;
        deadzone?: number;
        tailBow?: number;
    }, t?: number | null): void;
    extendStroke(x: number, y: number, pressure: number, t?: number | null): void;
    _extendImmediate(x: number, y: number, pEff: number): void;
    endStroke(): ReturnType<BrushEngine["collectStamps"]>;
    cancelStroke(): void;
    stampAt(x: number, y: number, pressure: number): void;
    stampPixels(pts: Array<{
        x: number;
        y: number;
    }>, pressure: number): void;
    collectStamps(): {
        stamps: Stamp[];
        shape: StrokeShape;
        layer: ViewLeaf;
        mode: string;
        opacity: number;
        blendMode: string;
        bx: number;
        by: number;
        bw: number;
        bh: number;
    } | null;
    flushDirty(): Rect | null;
    _stampParams(pressure: number, strokeDist: number): StampParams | null;
    _stampOne(x: number, y: number, pressure: number): void;
    private _pixelBlendSpan;
    pixelDiscInto(buf: Uint8ClampedArray, rw: number, rh: number, ox: number, oy: number, ix: number, iy: number, intSize: number, rgb: {
        r: number;
        g: number;
        b: number;
    }, as: number, comp: "over" | "erase" | "atop"): void;
    private _pixelDiscInto;
    _pixelStampDirect(x: number, y: number, size: number, stampAlpha: number): void;
    _markDirty(x0: number, y0: number, x1: number, y1: number): void;
}
export {};

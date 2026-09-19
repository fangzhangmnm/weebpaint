import type { RegionStroke, RegionTex, Rect } from "../backend/gl/region-stroke.ts";
export interface LiquifySettings {
    bleed?: string;
    sample?: string;
    size: number;
    strength: number;
    mode: string;
}
interface LeafState {
    rs: RegionStroke;
    srcRect: [number, number, number, number];
    plane: RegionTex | null;
    sample: number;
}
interface Field {
    x: number;
    y: number;
    w: number;
    h: number;
    A: RegionTex;
    B: RegionTex;
}
interface LiquifyStroke {
    leaves: LeafState[];
    owner: RegionStroke;
    docW: number;
    docH: number;
    settings: LiquifySettings;
    mode: number;
    bleed: number;
    R: number;
    strength: number;
    lastX: number;
    lastY: number;
    dirty: [number, number, number, number] | null;
    field: Field | null;
}
export declare class LiquifyEngine {
    _stroke: LiquifyStroke | null;
    /** targets = 写靶叶列表（单叶 [rs]；组液化 = 组内全部叶各一个 RegionStroke，含隐藏）。选区平面在 RegionStroke 身上。 */
    beginStroke(targets: readonly RegionStroke[], settings: LiquifySettings, x: number, y: number, _selection?: unknown): void;
    extendStroke(x: number, y: number): void;
    private _growField;
    endStroke(): void;
    isActive(): boolean;
    cancelStroke(): void;
    flushDirty(): [number, number, number, number] | null;
    /** 位移场的 doc 矩形 [x0,y0,x1,y1)（测试 / 诊断；null = 还没起场）。 */
    get fieldRect(): Rect | null;
}
export {};

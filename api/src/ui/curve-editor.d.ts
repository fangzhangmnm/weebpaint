import { type AnimCurve, type Keyframe } from "../common/anim-curve.ts";
export interface PlotSize {
    w: number;
    h: number;
}
/** 数据 (t,v) → 绘图区 px（y 翻转）。 */
export declare function dataToPx(t: number, v: number, size: PlotSize): {
    x: number;
    y: number;
};
/** 绘图区 px → 数据（不钳制，调用方决定）。 */
export declare function pxToData(x: number, y: number, size: PlotSize): {
    t: number;
    v: number;
};
export declare const HANDLE_LEN_PX = 56;
/** 把手钮相对 key 的 px 偏移：斜率 m = dv/dt 的屏幕方向（in 侧反向），定长 HANDLE_LEN_PX。 */
export declare function handleOffsetPx(slope: number, side: "in" | "out", size: PlotSize, len?: number): {
    dx: number;
    dy: number;
};
/** 加权把手：钮 = Bezier 控制点（沿切线拉 w·Δt），随权重变长；dtSeg = 该侧段的 Δt。 */
export declare function weightedHandleOffsetPx(slope: number, weight: number, dtSeg: number, side: "in" | "out", size: PlotSize): {
    dx: number;
    dy: number;
};
/** 加权把手屏幕偏移 → 权重（|Δx| / (Δt_seg · W)，钳 [MIN_WEIGHT, 1]）。 */
export declare function weightFromHandlePx(dx: number, dtSeg: number, size: PlotSize): number;
/** 把手钮屏幕偏移 → 斜率（dt 钳到该侧，防翻面/无穷）。 */
export declare function slopeFromHandlePx(dx: number, dy: number, side: "in" | "out", size: PlotSize): number;
/** ＋ 钮的插入位置：选中 key 与右邻中点；选中末 key → 与左邻中点；无选中 → 最大间隔中点。 */
export declare function pickInsertT(keys: readonly Keyframe[], selected: number): number;
/** 该 key 能否删（端点锁 / 至少留两点）。 */
export declare function canRemoveKey(n: number, i: number, lockEndpointsT: boolean): boolean;
/** 键盘微调：方向键 → (dt, dv)；shift ×10。返回 null = 不是微调键。 */
export declare function keyboardNudge(key: string, shift: boolean, step: number): {
    dt: number;
    dv: number;
} | null;
export interface CurveEditorOpts {
    curve: AnimCurve;
    plotSize?: number;
    lockEndpointsT?: boolean;
    showIdentity?: boolean;
    accent?: string;
    fmt?: (t: number, v: number) => string;
    keyStep?: number;
    onInput(): void;
    onCommit(): void;
}
export interface CurveEditorHandle {
    el: HTMLElement;
    setCurve(c: AnimCurve): void;
    redraw(): void;
    selected(): number;
    select(i: number): void;
    dispose(): void;
}
export declare const DEFAULT_PLOT_SIZE = 200;
export declare function makeCurveEditor(o: CurveEditorOpts): CurveEditorHandle;

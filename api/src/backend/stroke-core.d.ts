import { type PressureShaper } from "../common/pressure-curve.ts";
import { StrokeSmoother } from "./stroke-smoother.ts";
import type { ResolvedBrush } from "../common/resolved-brush.ts";
/** 一条路：若干个点，每个点 dim 个坐标和一个压感。 */
export interface StrokePath {
    readonly dim: number;
    readonly count: number;
    coord(i: number, k: number): number;
    pressure(i: number): number;
    /** 第 i 个点和它前一个点之间不连（落点跳到了别处，比如从胳膊跳到了身子）。 */
    breakBefore(i: number): boolean;
    /** 前多少个点不会再变。 */
    readonly frozenCount: number;
}
/** 宿主的落点：把平滑好的中心线（屏幕上）换成一条路。不给 = 路就是中心线本身（二维、unit 1、没有断点）。BrushEngine 永远不给。 */
export interface PathPlacer {
    readonly dim: number;
    /** 路的坐标里「一个像素」有多大：二维 1；三维 = 贴图上一格在空间里的大小。走步的最小间距、笔尖的最小大小都乘它。 */
    readonly unit: number;
    /**
     * 把平滑好的中心线（屏幕上的点 cx / cy / cp，前 frozenCount 个不会再变）换成一条路。每次要走步之前调一次。路上的点可以比中心线上的多（宿主会把线落密，
     * 好贴着表面走）。宿主自己记着上次换到哪了；前面不会再变的部分不用重算。落密、打射线、判断断开都是宿主的事，内核不知道。
     */
    place(cx: readonly number[], cy: readonly number[], cp: readonly number[], count: number, frozenCount: number): StrokePath;
}
/** 笔尖列表：不认识图层。每颗 dim + 3 个数：位置（dim 个）、大小、浓度、这一颗落下时已经走了多远。 */
export interface StrokeTips {
    readonly dim: number;
    readonly count: number;
    readonly data: Float64Array;
    /** 前多少颗已经定型：来自路上不会再变的部分，而且离那一部分的尾巴超过收笔渐细的长度——以后每次再收集（含抬笔后的最终结果）逐位不变。 */
    readonly frozenCount: number;
}
export interface StampParams {
    size: number;
    stampAlpha: number;
}
export declare function signedLerp(coeff: number, p: number): number;
/** 走一步多远：size_eff × spacing（低压感 size 小 → step 小，不出豆豆链）；最少半个像素 = 0.5 × unit。 */
export declare function stepFor(s: ResolvedBrush, pressure: number, shape: PressureShaper, unit?: number): number;
/** 压感 → { 大小, 浓度 }（起笔 / 收笔渐细 + signedLerp 联动）。null = 太淡跳过。taperTotal = 收笔时量的总长（没抬笔 = null，不做收笔渐细）。笔尖最少半个像素 = 0.5 × unit。 */
export declare function stampParamsOf(s: ResolvedBrush, shape: PressureShaper, pressure: number, strokeDist: number, taperTotal: number | null, unit?: number): StampParams | null;
/** 走步的游标。 */
export interface Walk {
    ci: number;
    started: boolean;
    accumDist: number;
    lastP: number;
    strokeDist: number;
}
export declare const freshWalk: () => Walk;
/**
 * 沿一条路从 walk 游标走到第 endIdx 个点，等距撒点；起点补一颗。每颗调 emit(第几段, x, y, z, 压感, 走了多远)（二维时 z = 0；按数传、不分配——每帧从头走一遍）。
 * 断开的地方不在两头之间插笔尖、那一段不算进「走了多远」、间距的余数带过去。**缓冲笔的走步循环全仓只有这一处**（像素笔直接落层那一份留在 BrushEngine._extendImmediate）。
 */
export declare function walkPath(path: StrokePath, walk: Walk, endIdx: number, step: (pressure: number) => number, emit: (seg: number, x: number, y: number, z: number, p: number, strokeDist: number) => void): void;
/** 一笔的手感（不认识图层）：落笔建一个，喂点、收集、抬笔。 */
export declare class StrokeCore {
    readonly settings: ResolvedBrush;
    readonly pShape: PressureShaper;
    readonly sm: StrokeSmoother;
    private readonly _pLPF;
    private readonly _placer;
    private _wc;
    /** 抬笔时量的总长（给收笔渐细）；没抬笔 = null（live 不做收笔渐细）。 */
    taperTotal: number | null;
    constructor(settings: ResolvedBrush, x: number, y: number, pressure: number, smooth?: {
        tau?: number;
        deadzone?: number;
        tailBow?: number;
    }, t?: number | null, placer?: PathPlacer | null);
    /** 路的坐标里一个像素多大（二维 1）。 */
    get unit(): number;
    /** 路的维数。 */
    get dim(): number;
    /** 喂一个点（屏幕上）。停顿那条规矩：死区锚没离开落笔点前压感 LPF 只对钟不积压感（考古 ai-docs/20260604-stroke-smoother-time-gate.md）。 */
    extend(x: number, y: number, pressure: number, t?: number | null): void;
    /** 现在的路（给了 PathPlacer = 宿主落出来的；没给 = 中心线本身）。 */
    path(): StrokePath;
    /** 走一步多远（这一笔的笔、压感整形、单位都定了）。 */
    private _step;
    /** 定型缓存跟到这条路：从上次的游标接着走到最后一个不会再变的点，新走出来的笔尖原料记下；再把原料按现在的收笔总长算成笔尖（只算新的；总长变了全算）。 */
    private _advance;
    /** 尾巴：从定型的游标（拷一份）接着走到路的最后一个点，每颗算好交出去。 */
    private _walkTail;
    /**
     * 一颗一颗交出这一笔到现在的全部笔尖（纯读；抬笔后自动含收笔渐细）：emit(第几段, x, y, z, 大小, 浓度, 走了多远)。
     * 定型的那一段从缓存里原样交出，只重走还会变的尾巴（每帧的走步只和尾巴有关，1-4d）；交出去的和每次从头走一遍逐位相同。
     * path 要给就给这一笔自己的 path()（缓存靠它的前 frozenCount 个点不变）。
     * 二维的 BrushEngine.collectStamps 直接用它拼笔尖对象（不经过中间数组：画画软件每帧都收集一遍）。
     */
    /**
     * from（可选，CatsUp 1-4d 第 9 条）：定型的笔尖从第 from 颗开始回调（前面的不再每帧回调一遍；回调里的先后和编号不变，只是少了前面那些）。
     *   界：0 ≤ from ≤ 已经定型的颗数（frozenTipCount）；超了 = 抛（还会变的尾巴每次都要从头走，不能跳）。不给 = 0 = 和以前一样。
     */
    forEachTip(emit: (seg: number, x: number, y: number, z: number, size: number, alpha: number, strokeDist: number) => void, path?: StrokePath, from?: number): void;
    /** 已经定型的笔尖有几颗（forEachTip 的 from 不能超过它）。 */
    frozenTipCount(path?: StrokePath): number;
    /** 收集这一笔到现在的全部笔尖（StrokeTips，含定型的前缀）。 */
    collect(): StrokeTips;
    /** 抬笔：平滑器收尾（把直线桥换成带动量的弧尾、钉终点）；有收笔渐细就沿整条路干走一遍量总长（定型的那一段从缓存的游标接着走）。之后 collect() 含收笔渐细。 */
    finish(): void;
}

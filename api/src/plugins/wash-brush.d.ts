import type { Filter, FilterParams, BrushSettings, DirtyRect } from "../filters.ts";
import { RegionStroke, type RegionTex } from "../backend/gl/region-stroke.ts";
interface WashDab {
    cx: number;
    cy: number;
    R: number;
    a: number;
}
export interface WashState {
    rs: RegionStroke;
    params: FilterParams;
    brushSettings: BrushSettings;
    lastX: number;
    lastY: number;
    pendingDist: number;
    pending: WashDab[];
    dabs: number;
    dirty: DirtyRect | null;
    cov: RegionTex | null;
}
export interface WashKernel {
    /** 滤波需要的邻域半径（bake 区域 = dab bbox 外扩 bleed；只当输入，不写回）。 */
    bleed(params: FilterParams): number;
    /** 对 W₀ 的 (ex0,ey0,ew,eh) 区域算一次滤波 → straight u8 区域纹理（调用方 free）。 */
    bakeRegion(rs: RegionStroke, ex0: number, ey0: number, ew: number, eh: number, params: FilterParams): RegionTex;
}
/** 给色彩类 filter 挂上 wash 笔行为（GPU 区域程序）。filter 只提供 kernel（bleed + bakeRegion）。 */
export declare function attachWashBrushBehavior(FilterClass: Filter, kernel: WashKernel): void;
export {};

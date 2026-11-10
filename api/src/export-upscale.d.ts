export declare const UPSCALE_FACTORS: readonly [1, 2, 3, 4, 8];
/** 放大后单边上限 / 面积上限。面积按 iOS canvas 的上限（约 4096²）：JPG 走 canvas 编码，超了出空图；PNG 同用一条，免得两种格式两套规矩。 */
export declare const UPSCALE_MAX_SIDE = 16384;
export declare const UPSCALE_MAX_PIXELS: number;
export declare function upscaleFits(w: number, h: number, k: number): boolean;
/** 想要 want 倍、这张图实际能做到的最大倍数（表里 ≤ want 且放得下的那个；都不行 = 1）。 */
export declare function largestFittingUpscale(w: number, h: number, want: number): number;
/** straight RGBA 整数倍最近邻放大；k ≤ 1 原样返回。 */
export declare function upscaleRgba(data: Uint8ClampedArray, w: number, h: number, k: number): {
    data: Uint8ClampedArray;
    w: number;
    h: number;
};

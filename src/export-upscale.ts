// export-upscale.ts —— 图片导出的整数倍放大（像素画发社交媒体：一个像素变 N×N 块，最近邻、不糊）。
// created 2026-11-09 by Claude Opus 5.5（家族周账 F-230；user 2026-11-08 深夜「像素化的导出能不能做一个上采样的选项，
//   就是一个像素变多个像素，方便社交媒体分享这种」）。纯函数：倍数表 + 上限 + 放大本身（复用 resample-bytes 的最近邻）。
// 倍数跟着每幅画存（desk 顶层键 exportUpscale，访问器 desk.export.upscale；user 2026-11-09「记住」「我同意，然后让fable做文件格式」）。
//   edited by Claude Fable 5.2 2026-11-09（原先只记到这次打开）。

import { nearestResampleBytes } from "./backend/algorithms/resample-bytes.ts";

export const UPSCALE_FACTORS = [1, 2, 3, 4, 8] as const;
/** 放大后单边上限 / 面积上限。面积按 iOS canvas 的上限（约 4096²）：JPG 走 canvas 编码，超了出空图；PNG 同用一条，免得两种格式两套规矩。 */
export const UPSCALE_MAX_SIDE = 16384;
export const UPSCALE_MAX_PIXELS = 4096 * 4096;

export function upscaleFits(w: number, h: number, k: number): boolean {
  if (k <= 1) return true;
  return w * k <= UPSCALE_MAX_SIDE && h * k <= UPSCALE_MAX_SIDE && w * h * k * k <= UPSCALE_MAX_PIXELS;
}

/** 想要 want 倍、这张图实际能做到的最大倍数（表里 ≤ want 且放得下的那个；都不行 = 1）。 */
export function largestFittingUpscale(w: number, h: number, want: number): number {
  for (let i = UPSCALE_FACTORS.length - 1; i >= 0; i--) {
    const k = UPSCALE_FACTORS[i]!;
    if (k <= want && upscaleFits(w, h, k)) return k;
  }
  return 1;
}

/** straight RGBA 整数倍最近邻放大；k ≤ 1 原样返回。 */
export function upscaleRgba(data: Uint8ClampedArray, w: number, h: number, k: number): { data: Uint8ClampedArray; w: number; h: number } {
  if (!(k > 1)) return { data, w, h };
  return { data: nearestResampleBytes(data, w, h, w * k, h * k), w: w * k, h: h * k };
}

/** 任意值 → 倍数表里的值：不是有限数 / 小于 2 = 1；表外的往下靠（5 → 4，99 → 8）。文件里读出来的倍数过这一道。 */
export function snapUpscale(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 1;
  let got = 1;
  for (const k of UPSCALE_FACTORS) if (k <= v) got = k;
  return got;
}

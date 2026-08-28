import type { WatermarkRaster } from "./backend/algorithms/watermark.ts";
/** 字号 = clamp(导出宽 × 2.5%, 12, 96)。纯数学，单独导出供测试锚住钳制两端。 */
export declare function watermarkFontPx(exportWidth: number): number;
/**
 * 文字 → 水印 RGBA 块（straight alpha）。
 * @param text        水印文字（调用方负责 trim / 空串判断，这里再兜一次）
 * @param exportWidth 导出平面宽度（决定字号；裁到选区时传选区宽，不是 doc 宽）
 * @returns null = 本环境栅格不了 / 文字为空 → 调用方静默跳过水印
 */
export declare function rasterWatermarkText(text: string, exportWidth: number): WatermarkRaster | null;

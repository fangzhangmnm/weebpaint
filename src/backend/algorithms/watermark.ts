// created 2026-08-28 by Claude Fable 5
// 导出水印合成（#13，宣发需要）。**纯字节**：把已栅格化的水印 RGBA（straight alpha）
// 以 over 算子贴到导出平面右下角。文字→字节的栅格化在壳域 watermark-raster.ts（本模块零 DOM）。
// 边距 = 短边 2%（钳 [8, 64]px）；水印超宽（画布太小）→ 等比例落格弃贴（宁可不贴不要糊贴）。

export interface WatermarkRaster { bytes: Uint8ClampedArray; w: number; h: number }

export function compositeWatermark(dst: Uint8ClampedArray, dw: number, dh: number, mark: WatermarkRaster): void {
  const margin = Math.max(8, Math.min(64, Math.round(Math.min(dw, dh) * 0.02)));
  if (mark.w + margin > dw || mark.h + margin > dh) return;   // 画布装不下 → 不贴（诚实弃贴，别缩到糊）
  const x0 = dw - mark.w - margin;
  const y0 = dh - mark.h - margin;
  for (let y = 0; y < mark.h; y++) {
    for (let x = 0; x < mark.w; x++) {
      const si = (y * mark.w + x) * 4;
      const sa = mark.bytes[si + 3] / 255;
      if (sa === 0) continue;
      const di = ((y0 + y) * dw + (x0 + x)) * 4;
      const da = dst[di + 3] / 255;
      const oa = sa + da * (1 - sa);
      if (oa === 0) continue;
      // straight-alpha over（与全链 straight 口径一致；导出前的最后一笔）
      dst[di]     = Math.round((mark.bytes[si]     * sa + dst[di]     * da * (1 - sa)) / oa);
      dst[di + 1] = Math.round((mark.bytes[si + 1] * sa + dst[di + 1] * da * (1 - sa)) / oa);
      dst[di + 2] = Math.round((mark.bytes[si + 2] * sa + dst[di + 2] * da * (1 - sa)) / oa);
      dst[di + 3] = Math.round(oa * 255);
    }
  }
}

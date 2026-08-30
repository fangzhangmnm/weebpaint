// 参考图导入压缩政策（纯函数，零 DOM/canvas；spec=ai-docs/20260830-reference-window-rework-spec.md §2）。
// created 2026-08-30 by Claude Fable 5（user 同日拍板：1024² 面积上限 / 小图原样豁免 / 拍平白底 jpeg 一条道）。
//
// 三行政策（漏斗 side-windows.addReferenceImage 消费）：
//   1. 面积 ≤ AREA_MAX → 原字节原样进 ora（像素画/小图/贴纸豁免：无损、透明顺带保住）；
//   2. 超了 → 等比缩到面积 ≤ AREA_MAX，拍平白底 → jpeg q≈85（透明不保留，user 拍板）；
//   3. 压完反而更大 → 保原字节（调用方比较字节数）。
// 管线家规：解码走浏览器解码边界（shell/image-io）、缩放走 areaResampleBytes、编码走 jpeg-js——
//   本模块只出**决策**与**字节变换**，不碰任何解码/编码器。

export const REF_AREA_MAX = 1024 * 1024;   // user 2026-08-30「1024^2 的像素数量」（面积上限，非长边）
export const REF_JPEG_QUALITY = 85;

/** 转码决策：null = 原样保留（豁免）；否则给出等比缩放目标尺寸（面积 ≤ areaMax，保长宽比）。 */
export function planRefTranscode(sw: number, sh: number, areaMax = REF_AREA_MAX): { fw: number; fh: number } | null {
  if (!(sw > 0) || !(sh > 0)) return null;             // 尺寸不可信 → 不动它（诚实豁免）
  const area = sw * sh;
  if (area <= areaMax) return null;
  const k = Math.sqrt(areaMax / area);
  // floor 保证缩后面积 ≤ areaMax（round 会在极端比例下越界）；下限 1。
  const fw = Math.max(1, Math.floor(sw * k));
  const fh = Math.max(1, Math.floor(sh * k));
  return { fw, fh };
}

/** 拍平白底（in place）：straight RGBA → 不透明 RGBA（jpeg 无 alpha；半透明按白底合成）。 */
export function flattenWhiteInPlace(rgba: Uint8ClampedArray): Uint8ClampedArray {
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a === 255) continue;
    const f = a / 255, inv = 255 * (1 - f);
    rgba[i]     = rgba[i]     * f + inv;
    rgba[i + 1] = rgba[i + 1] * f + inv;
    rgba[i + 2] = rgba[i + 2] * f + inv;
    rgba[i + 3] = 255;
  }
  return rgba;
}

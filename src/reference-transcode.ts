// 参考图导入压缩政策（纯函数，零 DOM/canvas；spec=ai-docs/20260830-reference-window-rework-spec.md §2）。
// created 2026-08-30 by Claude Fable 5（user 同日拍板：1024² 面积上限 / 小图原样豁免 / 拍平白底 jpeg 一条道；
// 0830 补拍板：豁免加字节条件 500KB + GIF 禁原样只取首帧——「两个同时加」）。
//
// 政策（漏斗 side-windows.addReferenceImage 消费）：
//   1. 面积 ≤ AREA_MAX **且** 字节 ≤ BYTES_MAX **且** 非 GIF → 原字节原样进 ora
//      （像素画/小图/贴纸豁免：无损、透明顺带保住；字节条件堵「小面积重字节」洞——高噪 PNG/动图容器）；
//   2. 其余 → 等比缩到面积 ≤ AREA_MAX（已达标就原尺寸），拍平白底 → jpeg q≈85（透明不保留）；
//   3. 压完反而更大 → 保原字节（调用方比较）——**GIF 除外**（禁原样是硬条件：动图字节不进 ora，
//      显示本来就只有首帧，存原件=假 affordance + 白费体积）。
// 管线家规：解码走浏览器解码边界（shell/image-io）、缩放走 areaResampleBytes、编码走 jpeg-js——
//   本模块只出**决策**与**字节变换**，不碰任何解码/编码器。

export const REF_AREA_MAX = 1024 * 1024;    // user「1024^2 的像素数量」（面积上限，非长边）
export const REF_BYTES_MAX = 500 * 1024;    // user「要不就用500kb」（豁免的字节条件）
export const REF_JPEG_QUALITY = 85;

export interface RefTranscodePlan {
  fw: number; fh: number;
  /** 政策 3「压大保原」是否适用（GIF=false：禁原样是硬条件）。 */
  allowKeepIfBigger: boolean;
}

/** 导入决策：null = 原字节原样进 ora；否则转码（目标尺寸 + 压大保原开关）。 */
export function planRefImport(sw: number, sh: number, byteSize: number, mime: string): RefTranscodePlan | null {
  if (!(sw > 0) || !(sh > 0)) return null;             // 尺寸不可信 → 不动它（诚实豁免）
  const gif = mime === "image/gif";
  const area = sw * sh;
  const dims = area > REF_AREA_MAX
    ? (() => {
        const k = Math.sqrt(REF_AREA_MAX / area);
        // floor 保证缩后面积 ≤ 上限（round 会在极端比例下越界）；下限 1。
        return { fw: Math.max(1, Math.floor(sw * k)), fh: Math.max(1, Math.floor(sh * k)) };
      })()
    : null;
  if (!gif && !dims && byteSize <= REF_BYTES_MAX) return null;   // 豁免：面积+字节双达标且非 GIF
  return { fw: dims?.fw ?? Math.round(sw), fh: dims?.fh ?? Math.round(sh), allowKeepIfBigger: !gif };
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

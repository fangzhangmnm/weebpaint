export declare const REF_AREA_MAX: number;
export declare const REF_JPEG_QUALITY = 85;
/** 转码决策：null = 原样保留（豁免）；否则给出等比缩放目标尺寸（面积 ≤ areaMax，保长宽比）。 */
export declare function planRefTranscode(sw: number, sh: number, areaMax?: number): {
    fw: number;
    fh: number;
} | null;
/** 拍平白底（in place）：straight RGBA → 不透明 RGBA（jpeg 无 alpha；半透明按白底合成）。 */
export declare function flattenWhiteInPlace(rgba: Uint8ClampedArray): Uint8ClampedArray;

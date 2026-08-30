export declare const REF_AREA_MAX: number;
export declare const REF_BYTES_MAX: number;
export declare const REF_JPEG_QUALITY = 85;
export interface RefTranscodePlan {
    fw: number;
    fh: number;
    /** 政策 3「压大保原」是否适用（GIF=false：禁原样是硬条件）。 */
    allowKeepIfBigger: boolean;
}
/** 导入决策：null = 原字节原样进 ora；否则转码（目标尺寸 + 压大保原开关）。 */
export declare function planRefImport(sw: number, sh: number, byteSize: number, mime: string): RefTranscodePlan | null;
/** 拍平白底（in place）：straight RGBA → 不透明 RGBA（jpeg 无 alpha；半透明按白底合成）。 */
export declare function flattenWhiteInPlace(rgba: Uint8ClampedArray): Uint8ClampedArray;

export interface WatermarkRaster {
    bytes: Uint8ClampedArray;
    w: number;
    h: number;
}
export declare function compositeWatermark(dst: Uint8ClampedArray, dw: number, dh: number, mark: WatermarkRaster): void;

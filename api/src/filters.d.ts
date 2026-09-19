export type { FilterParams } from "./backend/filters/kernel.ts";
import type { FilterParams } from "./backend/filters/kernel.ts";
export { clamp8 } from "./backend/filters/kernel.ts";
export interface Filter {
    id: string;
    title: string;
    category?: string;
    modes?: string[];
    bleedRadius?(params: FilterParams): number;
    defaults?(): FilterParams;
    buildBody?(container: HTMLElement, state: unknown, onChange: () => void): void;
    disposeBody?(state: unknown): void;
    onBodyResize?(state: unknown, avail: {
        w: number;
        h: number;
    }): void;
    supportsLayerGroup?: boolean;
    strokePreview?: "shadow" | "region";
    strokeSnapshot?: boolean;
    bake(srcData: Uint8ClampedArray, dstData: Uint8ClampedArray, params: FilterParams, mask: Uint8Array | null, w: number, h: number): void;
    beginBrushStroke?(targets: readonly StrokeTarget[], params: FilterParams, brushSettings: BrushSettings, selection: BrushSelection | null, x: number, y: number, p: number): unknown;
    extendBrushStamp?(state: unknown, x: number, y: number, p: number): void;
    endBrushStroke?(state: unknown): void;
    cancelBrushStroke?(state: unknown): void;
    flushDirty?(state: unknown): DirtyRect | null;
}
export interface StrokeTarget {
    docW: number;
    docH: number;
    bboxX: number;
    bboxY: number;
    bboxW: number;
    bboxH: number;
    getImageData(docX: number, docY: number, w: number, h: number): ImageData;
    putImageData(docX: number, docY: number, img: ImageData): void;
}
export interface BrushSettings {
    size: number;
    spacingValue?: number;
    hardness?: number;
    flow?: number;
    opacity?: number;
    spacing?: number;
    sizeCoeff?: number;
    flowCoeff?: number;
    opaCoeff?: number;
    pressureGamma?: number;
    pressureCurve?: unknown;
    color?: string;
}
export interface BrushSelection {
    bboxX: number;
    bboxY: number;
    materializeMaskRegion(x0: number, y0: number, w: number, h: number): Uint8Array;
}
export type DirtyRect = [number, number, number, number];
export declare function registerFilter(FilterClass: Filter): void;
export declare function getFilter(id: string): Filter | null;
export declare function listFilters(): Filter[];
export declare function onFilterRegistered(fn: (item: Filter) => void): () => void;
export interface SliderRowOpts {
    fmt?: (value: number) => string;
    gradient?: string;
}
export declare function makeSliderRow(label: string, key: string, min: number, max: number, step: number, init: number, onChange: (key: string, value: number) => void, opts?: SliderRowOpts): HTMLLabelElement;
export declare function makeSectionTitle(text: string): HTMLDivElement;
/** 色彩类滤镜笔（模糊/锐化）的间距地板：wash 合成后间距只影响 mask 边缘平滑度，10% 足够；再小 = 白烧 dab。 */
export declare const COLOR_BRUSH_MIN_SPACING = 0.1;
export interface SelectOption {
    value: string;
    label: string;
}
export declare function makeSelectRow(label: string, key: string, options: SelectOption[], init: string, onChange: (key: string, value: string) => void): HTMLLabelElement;

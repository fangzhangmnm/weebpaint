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
    supportsLayerGroup?: boolean;
    bake(srcData: Uint8ClampedArray, dstData: Uint8ClampedArray, params: FilterParams, mask: Uint8Array | null, w: number, h: number): void;
    beginBrushStroke?(layers: readonly BrushLayer[], params: FilterParams, brushSettings: BrushSettings, selection: BrushSelection | null, x: number, y: number, p: number): ColorBrushState;
    extendBrushStamp?(state: ColorBrushState, x: number, y: number, p: number): void;
    endBrushStroke?(state: ColorBrushState): void;
    flushDirty?(state: ColorBrushState): DirtyRect | null;
}
export interface BrushLayer {
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
export interface ColorBrushState {
    layer: BrushLayer;
    params: FilterParams;
    brushSettings: BrushSettings;
    selection: BrushSelection | null;
    FilterClass: Filter;
    lastX: number;
    lastY: number;
    pendingDist: number;
    dirty: DirtyRect | null;
}
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
/** 色彩类滤镜笔（模糊/锐化）的间距地板：每颗 dab 都是一次卷积，间距再小 = 强度×N 且成本×N；10% 是 v132–v0.13.3 的历史值。 */
export declare const COLOR_BRUSH_MIN_SPACING = 0.1;
export declare function attachColorBrushBehavior(FilterClass: Filter): void;
export interface SelectOption {
    value: string;
    label: string;
}
export declare function makeSelectRow(label: string, key: string, options: SelectOption[], init: string, onChange: (key: string, value: string) => void): HTMLLabelElement;

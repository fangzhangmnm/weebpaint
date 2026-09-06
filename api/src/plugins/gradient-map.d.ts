import { type GradientMapParams } from "../backend/filters/gradient-map-kernel.ts";
import { type RampEditorHandle } from "../ui/ramp-editor.ts";
interface GradientMapBuildState {
    params: GradientMapParams;
    _rampEditor?: RampEditorHandle;
}
export declare class GradientMapFilter {
    static id: string;
    static title: string;
    static category: string;
    static modes: string[];
    static bleedRadius: (params: import("../filters.ts").FilterParams | null) => number;
    static defaults: () => import("../filters.ts").FilterParams;
    static bake: (src: Uint8ClampedArray, dst: Uint8ClampedArray, params: import("../filters.ts").FilterParams, mask: Uint8Array | null, w: number, h: number) => void;
    static buildBody(container: HTMLElement, state: GradientMapBuildState, onChange: () => void): void;
}
export {};

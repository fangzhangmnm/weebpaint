import { type CurvesParams } from "../backend/filters/curves-kernel.ts";
import { type CurveEditorHandle } from "../ui/curve-editor.ts";
interface CurvesBuildState {
    params: CurvesParams;
    _curveEditor?: CurveEditorHandle;
    _body?: HTMLElement;
}
/** 曲线编辑器绘图区边长（device 偏好；坏值回 DEFAULT_PLOT_SIZE）。 */
export declare function plotSizePref(): number;
export declare class CurvesFilter {
    static id: string;
    static title: string;
    static category: string;
    static modes: string[];
    static bleedRadius: (params: import("../filters.ts").FilterParams | null) => number;
    static defaults: () => import("../filters.ts").FilterParams;
    static bake: (src: Uint8ClampedArray, dst: Uint8ClampedArray, params: import("../filters.ts").FilterParams, mask: Uint8Array | null, w: number, h: number) => void;
    static disposeBody(state: CurvesBuildState): void;
    static onBodyResize(state: CurvesBuildState, avail: {
        w: number;
        h: number;
    }): void;
    static buildBody(container: HTMLElement, state: CurvesBuildState, onChange: () => void): void;
}
export {};

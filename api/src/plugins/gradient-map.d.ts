import { type GradientMapParams } from "../backend/filters/gradient-map-kernel.ts";
import { type RampEditorHandle } from "../ui/ramp-editor.ts";
interface GradientMapBuildState {
    params: GradientMapParams;
    _rampEditor?: RampEditorHandle;
    _unregisterTarget?: () => void;
}
export declare class GradientMapFilter {
    static id: string;
    static title: string;
    static category: string;
    static modes: string[];
    static bleedRadius: (params: import("../filters.ts").FilterParams | null) => number;
    static defaults: () => import("../filters.ts").FilterParams;
    static bake: (src: Uint8ClampedArray, dst: Uint8ClampedArray, params: import("../filters.ts").FilterParams, mask: Uint8Array | null, w: number, h: number) => void;
    /** 关面板 / 重置重建前：注销 color target、dispose 编辑器、色板显示回笔刷色。 */
    static disposeBody(state: GradientMapBuildState): void;
    static buildBody(container: HTMLElement, state: GradientMapBuildState, onChange: () => void): void;
}
export {};

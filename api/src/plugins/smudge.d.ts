import type { FilterParams, BrushLayer, BrushSettings, BrushSelection, DirtyRect } from "../filters.ts";
import { SmudgeEngine, type SmudgeSettings } from "./smudge-engine.ts";
interface SmudgeBrushState {
    engine: SmudgeEngine;
}
/** "#rrggbb" → straight sRGB 0..1（解析失败 → 黑）。 */
export declare function parseHexColor(hex: unknown): [number, number, number];
export declare const PAINT_DEFAULTS: {
    readonly mode: "paint";
    readonly colorRate: 0.49;
    readonly dull: 0.5;
    readonly dilution: 0.32;
    readonly memoryLength: 0.085;
    readonly strengthScale: 0.4;
};
export declare const MEMORY_MIN = 0.02, MEMORY_MAX = 2;
/** 纯函数：variant params + 当前笔（ResolvedBrush 形）+ 图层 → 引擎设置（可单测）。 */
export declare function smudgeSettingsFrom(params: FilterParams, bs: BrushSettings, layer: {
    lockAlpha?: boolean;
}): SmudgeSettings;
export declare class SmudgeFilter {
    static id: string;
    static title: string;
    static category: string;
    static modes: string[];
    static bleedRadius(_p: FilterParams): number;
    static defaults(): {
        mode: string;
        colorRate: number;
        dull: number;
    };
    static supportsLayerGroup: boolean;
    static brushVariants: ({
        id: string;
        title: string;
        params: {
            mode: string;
            colorRate: number;
            dull: number;
        };
    } | {
        id: string;
        title: string;
        params: {
            mode: "paint";
            colorRate: 0.49;
            dull: 0.5;
            dilution: 0.32;
            memoryLength: 0.085;
            strengthScale: 0.4;
        };
    })[];
    static brushSliders: ({
        key: string;
        title: string;
        min: number;
        max: number;
        step: number;
        fmt: (v: number) => string;
        variants?: undefined;
        map?: undefined;
    } | {
        key: string;
        title: string;
        min: number;
        max: number;
        step: number;
        fmt: (v: number) => string;
        variants: string[];
        map?: undefined;
    } | {
        key: string;
        title: string;
        min: number;
        max: number;
        step: number;
        variants: string[];
        map: {
            toParam: (v: number) => number;
            fromParam: (p: number) => number;
        };
        fmt: (v: number) => string;
    })[];
    static mixModes: {
        id: string;
        title: string;
    }[];
    static beginBrushStroke(layers: readonly BrushLayer[], params: FilterParams, brushSettings: BrushSettings, selection: BrushSelection | null, x: number, y: number, pressure: number): SmudgeBrushState;
    static extendBrushStamp(state: SmudgeBrushState, x: number, y: number, pressure: number): void;
    static endBrushStroke(state: SmudgeBrushState): void;
    static cancelBrushStroke(state: SmudgeBrushState): void;
    static flushDirty(state: SmudgeBrushState): DirtyRect | null;
}
export {};

import type { FilterParams, BrushLayer, BrushSettings, BrushSelection, DirtyRect } from "../filters.ts";
import { SmudgeEngine, type SmudgeSettings } from "./smudge-engine.ts";
interface SmudgeBrushState {
    engine: SmudgeEngine;
}
/** "#rrggbb" → straight sRGB 0..1（解析失败 → 黑）。 */
export declare function parseHexColor(hex: unknown): [number, number, number];
/** 纯函数：variant params + 当前笔（ResolvedBrush 形）+ 图层 → 引擎设置（可单测）。 */
export declare function smudgeSettingsFrom(params: FilterParams, bs: BrushSettings & {
    spacing?: number;
    sizeCoeff?: number;
    opaCoeff?: number;
    pressureGamma?: number;
    color?: string;
}, layer: {
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
    };
    static supportsLayerGroup: boolean;
    static brushVariants: {
        id: string;
        title: string;
        params: {
            mode: string;
            colorRate: number;
        };
    }[];
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

import type { AppContext } from "./app-context.ts";
export declare const LAYER_MODE_LABEL: Record<string, string>;
export declare const GROUP_MODE_LABEL: Record<string, string>;
export declare function toggleLayersPanel(force?: boolean): void;
export declare function renderLayersPanel(): void;
export declare function initLayersPanel(ctx: AppContext): void;

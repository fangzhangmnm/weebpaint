import type { AppContext } from "./app-context.ts";
export declare function setMenuItem(btn: HTMLElement, on: boolean, stateLabel?: string): void;
export declare function applyCheckerboard(on: boolean): void;
export declare function genAiEnabled(): boolean;
export declare function renderSettingsFromPrefs(): void;
export declare function setMenuOpen(open: boolean): void;
export declare function initSettingsMenu(ctx: AppContext): void;

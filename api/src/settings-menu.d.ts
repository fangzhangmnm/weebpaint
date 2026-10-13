import type { AppContext } from "./app-context.ts";
export declare function setMenuItem(btn: HTMLElement, on: boolean, stateLabel?: string): void;
/** 本次会话第一次见到数位笔（input.onPenFirstSeen）：没碰过开关且开着 → 自动关一次并告知（总账 #85）。 */
export declare function autoOffSingleFingerDrawOnPen(): void;
export declare function applyCheckerboard(on: boolean): void;
export declare function genAiEnabled(): boolean;
export declare function renderSettingsFromPrefs(): void;
export declare function setMenuOpen(open: boolean): void;
export declare function initSettingsMenu(ctx: AppContext): void;

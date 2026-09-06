import { type Verb } from "./common/verbs.ts";
import type { AppContext } from "./app-context.ts";
export declare function updateShapeToolbar(): void;
export declare function updateLassoToolbar(): void;
export declare function isPicking(mode: string): boolean;
export declare function pickOnce(): void;
export declare function setTool(tool: string): void;
/** 切到动词（可指定子工具）：写 desk.subTool 记忆，再按表路由到老入口——行为语义零变更。 */
export declare function setVerb(verb: Verb, sub?: string): void;
export declare function _syncEditModeUI(): void;
export declare const RACK_PANEL_BY_TOOL: Record<string, string>;
export declare function initToolbar(ctx: AppContext): void;

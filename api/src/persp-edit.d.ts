import type { AppContext } from "./app-context.ts";
export declare function perspEditActive(): boolean;
export declare function setPerspGizmoLiveGate(fn: () => boolean): void;
/** 尺子条「编辑消失点」钮：再点 = 退出（恒 apply）；点其他工具 = onToolSwitch apply 同款。 */
export declare function togglePerspEdit(): void;
export declare function enterPerspEdit(): void;
export declare function initPerspEdit(ctx: AppContext): void;

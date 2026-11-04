import type { AppContext } from "./app-context.ts";
/** 闸门上的「重新登录」：和 smart save 同一个姿势（在点击的同步栈里起跳；有意导航，beforeunload 别挡）。工单 G。 */
export declare function beginSignInNav(onFail: (e: unknown) => void): void;
export declare function initTopbarMenu(ctx: AppContext): void;
export declare function runSaveAsFlow(): Promise<void>;

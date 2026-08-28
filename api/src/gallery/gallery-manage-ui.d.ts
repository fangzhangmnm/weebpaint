import type { AppContext } from "../app-context.ts";
/** 编辑器无库单入口（topbar 文件菜单）也走同一条连接流程。 */
export declare const openGalleryConnectFlow: () => Promise<void>;
export declare function renderGalleryManage(): void;
export declare function initGalleryManageUI(ctx: AppContext): void;

import type { AppContext } from "../app-context.ts";
/** 编辑器无库单入口（topbar 文件菜单）也走同一条连接流程。 */
export declare const openGalleryConnectFlow: () => Promise<void>;
/** redirect 回程续办（app.ts wp:auth-changed 接线；2026-08-28 iPad「点两次」修）：
 *  跳转前落的「待续连接」标记还新鲜 + 已登录 → 续走 mint+switchFlow，把首次连接一次办完。
 *  已经挂上库（boot 领养赢了竞态/别的入口先到）→ 目的已达，只清标记。幂等：标记清了就不会重入。 */
export declare function resumePendingOneDriveConnect(): Promise<void>;
export declare function renderGalleryManage(): void;
export declare function initGalleryManageUI(ctx: AppContext): void;

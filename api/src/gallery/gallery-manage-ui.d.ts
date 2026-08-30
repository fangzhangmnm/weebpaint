import type { AppContext } from "../app-context.ts";
/** 编辑器无库单入口（topbar 文件菜单「连接图库…」）：打开**同一个**云 popup（user 0830「editor 里
 *  连接到库也用同一个菜单」）。popup 在 galleryFull 外层，编辑器态可显示；无库态内容=连接选项+账号行；
 *  编辑器里没有断开（断开只在图库页，user 0830）——本入口本就只在无库时可见（settings-menu 反相 gating）。 */
export declare function openConnectMenuFromEditor(anchor: HTMLElement): void;
/** redirect 回程续办（app.ts wp:auth-changed 接线；2026-08-28 iPad「点两次」修）：
 *  跳转前落的「待续连接」标记还新鲜 + 已登录 → 续走 mint+switchFlow，把连接一次办完。
 *  幂等：标记清了就不会重入。
 *  ⚠ 不设「已挂库就退」早退（0830 修）：换库场景（folder 库在挂、点连 OneDrive）redirect 回程
 *  boot 会先把旧库挂回去——此时必须继续 switchFlow 完成切换；同库目标由 switchFlow 的
 *  「已是当前图库」自己短路，异库走绿灯门（boot restore 开了画会被收口 gate 挡下，属预期）。 */
export declare function resumePendingOneDriveConnect(): Promise<void>;
export declare function renderGalleryManage(): void;
export declare function initGalleryManageUI(ctx: AppContext): void;

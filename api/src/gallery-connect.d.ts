import type { GalleryEntry } from "./gallery-registry.ts";
/** attach/detach 流程单飞道（案卷 20260830 §BUG D）：boot 领养 / redirect 续办 / 切库 / 卸库全走这条，
 *  流程间不再交错（gallery-manage-ui 的 switchFlow/detachFlow 同用）。⚠ 不可重入：锁内别 await 走锁的流程。 */
export declare const galleryFlow: import("./flow-lock.ts").FlowLock;
/** 权限确保：granted → true；prompt 且 opts.request（手势上下文）→ requestPermission；否则 false（离线态）。 */
export declare function ensureFolderPermission(entry: GalleryEntry, opts: {
    request: boolean;
}): Promise<boolean>;
export declare const canPickFolderGallery: () => boolean;
/** 铸/复用 = 与挂载分离（UI 在两步之间问「继承 or 出厂」并走绿灯门）。created = 这次真铸了新条目。 */
export interface MintResult {
    entry: GalleryEntry;
    created: boolean;
}
/** 本地文件夹 picker（手势）：选哪就是哪（VS Code 姿态）；同夹二挂 isSameEntry 复用 id。用户取消 = null。 */
export declare function mintFolderByPicker(): Promise<MintResult | null>;
/** 登录交互形态（user 2026-08-25 拍板「桌面主场 MSAL popup 做、iOS redirect」、0830 确认直做；
 *  store 0.10.0 收货）：iOS/iPadOS（含伪装 MacIntel 的 iPadOS：多点触控判据）与 Android 的弹窗
 *  拦截/PWA 兼容性差 → redirect；其余（桌面浏览器）→ popup——全程不离页，画布/表单状态零丢失，
 *  不再需要「待续标记 + 回程续办」舞步（redirect 舞步保留给移动端与回程兜底）。 */
export declare function oneDriveInteractMode(): "popup" | "redirect";
/** OneDrive（手势）。**redirect 事实**（2026-08-28 iPad 实锤「点两次」破案）：signIn 缺省 = loginRedirect =
 *  整页跳走，本函数后半段死在跳转点——回来后 seed 只写 registry、没人 attach，第二次点才靠
 *  「再跳一次 → boot 领养」侥幸出库。修法两半：
 *  ① 已登录 → **不再 signIn**，直接用 active 账号同步续 mint（零跳转，connect 一次到位）；
 *  ② 未登录 → 桌面 popup：弹回即续（同函数直落 mint，不离页）；移动 redirect：跳转前落
 *    「待续连接」标记（device-kv + 时间戳），回程 auth-changed 由 resumePendingOneDriveConnect
 *    续办 mint+attach（gallery-manage-ui 接线）。 */
export declare function mintOneDriveByAccount(): Promise<MintResult | null>;
/** 换一个账号连接（0.9.0 口子，user 0828「加口子」）：强制微软账号选择页——多账号「铸第二账号」
 *  的唯一入口（P3 §1.10）。桌面 popup：账号选择页开在弹窗里，选完即续 mint（不离页）；
 *  移动 redirect：必在点击同步栈调（页面即离开），回程由 resumePendingOneDriveConnect 续办。 */
export declare function mintOneDriveSwitchAccount(): Promise<MintResult | null>;
export declare function markPendingOneDriveConnect(): void;
export declare function clearPendingOneDriveConnect(): void;
/** 读并判新鲜；不清除（清除归续办成功/作废方调 clear——读写分离防半路丢标记）。 */
export declare function hasFreshPendingOneDriveConnect(): boolean;
/** 挂载既有条目（手势上下文；调用方保证已过绿灯门 detach）。folder 缺权限当场 request 一次。 */
export declare function attachGallery(entry: GalleryEntry): Promise<void>;
/** boot 静默重挂（app.ts prefsReady 链头，fixup/restore 之前）。店懒出生（2026-08-27）后只剩一问：
 *  registry lastActive 有条目吗？有 → 普通 attach（建店+换入；gesture:false 不 requestPersist、folder 权限
 *  只 query 不弹）；无/读不出 → 什么都不做（eval 起点就是 kind:"none"，无预建实例可拆）——
 *  「无账号无文件不应该有 gallery」（user 2026-08-27）由出生姿势直接保证，不再靠 boot 拆迁。
 *  attach 失败 → 响亮上报 + 回落无库（绝不让 app 骑在半挂的店上）。 */
export declare function bootAttachFromRegistry(): Promise<void>;

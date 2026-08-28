import type { GalleryEntry } from "./gallery-registry.ts";
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
/** OneDrive（手势）：signIn 走 account picker——选哪个账号铸哪个账号的库（多账号=多条目，结构支持）。 */
export declare function mintOneDriveByAccount(): Promise<MintResult | null>;
/** 挂载既有条目（手势上下文；调用方保证已过绿灯门 detach）。folder 缺权限当场 request 一次。 */
export declare function attachGallery(entry: GalleryEntry): Promise<void>;
/** boot 静默重挂（app.ts prefsReady 链头，fixup/restore 之前）。店懒出生（2026-08-27）后只剩一问：
 *  registry lastActive 有条目吗？有 → 普通 attach（建店+换入；gesture:false 不 requestPersist、folder 权限
 *  只 query 不弹）；无/读不出 → 什么都不做（eval 起点就是 kind:"none"，无预建实例可拆）——
 *  「无账号无文件不应该有 gallery」（user 2026-08-27）由出生姿势直接保证，不再靠 boot 拆迁。
 *  attach 失败 → 响亮上报 + 回落无库（绝不让 app 骑在半挂的店上）。 */
export declare function bootAttachFromRegistry(): Promise<void>;

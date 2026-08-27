import type { GalleryEntry } from "./gallery-registry.ts";
/** 权限确保：granted → true；prompt 且 opts.request（手势上下文）→ requestPermission；否则 false（离线态）。 */
export declare function ensureFolderPermission(entry: GalleryEntry, opts: {
    request: boolean;
}): Promise<boolean>;
export declare const canPickFolderGallery: () => boolean;
/** 连接本地文件夹（手势）：选哪就是哪（VS Code 姿态）；同夹二挂 isSameEntry 复用 id。用户取消 = null。 */
export declare function pickAndConnectFolderGallery(): Promise<GalleryEntry | null>;
/** 连接 OneDrive（手势）：signIn 走 account picker——选哪个账号铸哪个账号的库（多账号=多条目，结构支持）。 */
export declare function connectOneDriveGallery(): Promise<GalleryEntry | null>;
/** 挂载既有条目（手势上下文；调用方保证已过绿灯门 detach）。folder 缺权限当场 request 一次。 */
export declare function attachGallery(entry: GalleryEntry): Promise<void>;
/** boot 静默重挂（app.ts prefsReady 链头，fixup/restore 之前）：
 *  · lastActive = legacy OneDrive（dbId=defaultStore）→ **领养**预建实例（零换店零重灌 = 现状路径）；
 *  · lastActive = folder / 非 legacy OneDrive → 规矩 dispose 预建实例（无人用过，无数据风险）→ attach（权限只 query）；
 *  · 无 lastActive → 不动（legacy 现状继续当家；关云/无库的真 sunset = Slice E）。
 *  任何失败 → 响亮上报 + 回落无库模式（绝不让 app 骑在已 dispose 的店上）。 */
export declare function bootAttachFromRegistry(): Promise<void>;

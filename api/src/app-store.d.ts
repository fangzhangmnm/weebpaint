import { createOneDriveProvider } from "@internal/store";
import type { RackPersistence } from "./brush-rack-controller.ts";
import type { Store } from "@internal/store";
export declare const storeAbsent: boolean;
type _Auth = ReturnType<typeof createOneDriveProvider>["auth"];
export declare const provider: import("@internal/store").CloudProvider | null;
export type AppStorePort = Pick<Store, "file" | "files" | "collection">;
export type GalleryBackend = {
    kind: "live";
    store: AppStorePort;
} | {
    kind: "none";
};
export declare function galleryBackend(): GalleryBackend;
export declare function requireStore(): AppStorePort;
/** 有活店？店懒出生后的不变量：_storeFull≠null ⇔ attachment attached（无预建店无 boot 窗口）。
 *  P3 sunset：hasGallery 的真相源。 */
export declare function hasLiveStore(): boolean;
export type { Collection, EncryptedBlob } from "@internal/store";
export { wipeAppNamespace, scanAppNamespace } from "@internal/store";
export { isCached as isCachedSyncState } from "@internal/store";
export declare let brushRackCollection: RackPersistence;
export declare function _seedNextRackInitData(items: {
    id: string;
    value: unknown;
}[] | null): void;
/** 换当前 store 实例（next=null → null-store = 无库模式）。重灌 4+1 collections、重跑 init 门、
 *  广播 wp:gallery-changed（笔架等持句柄消费者在 app.ts 监听重挂）。旧实例的 dispose 由调用方（attachment 器官）负责。 */
export declare function _swapStoreForGallery(next: Store | null): Promise<void>;
/** persist 三件套③执行体（手势时刻调；fire-and-forget，结果永不改变数据安全行为）。值级 import 收拢本接缝。 */
export declare function requestGalleryPersist(): void;
/** 为 registry 条目建新 store 实例（不换当前——换是 _swapStoreForGallery 的事）。
 *  残留审计 A（0828，ledger §4 pin【必做】的 app 半边）：onedrive 条目带 homeAccountId → 建 **pinned
 *  provider**（store 0.8.0 graph 实例化口子：token 钉死该账号，per-instance 缓存互不投毒）——
 *  attach 账号 B 的库绝不再拿 active 账号 A 的 token 读写。auth 面维持模块单例（MSAL 实例库内共享）。
 *  无 homeAccountId 的老条目沿用全局 provider（现状单账号语义不变）。forgetFlow 的临时店同走本函数=同修。 */
export declare function _buildStoreForGalleryEntry(entry: {
    kind: "onedrive" | "folder";
    dbId: string;
    handle?: unknown;
    homeAccountId?: string;
}): Store;
export declare const isAuthConfigured: () => boolean;
export declare const initAuth: () => Promise<void> | Promise<import("@internal/store").AuthState>;
export declare const signIn: () => Promise<unknown>;
export declare const signOut: () => Promise<void>;
export declare const isSignedIn: () => boolean;
export declare const getActiveAccount: () => any;
export declare const retrySilentSignIn: () => Promise<boolean>;
export declare const getToken: () => Promise<string> | Promise<null>;
export declare const onAuthChanged: (cb: Parameters<_Auth["onAuthChanged"]>[0]) => () => void;
export declare const getAuthState: () => import("@internal/store").AuthState | {
    signedIn: false;
};
declare function itemToG(it: {
    path: string;
    syncState: string;
    lastModified?: number;
    size?: number;
}): {
    name: string;
    local: {
        name: string;
        size: number | undefined;
        updatedAt: number | undefined;
    } | null;
    cloud: {
        path: string;
        name: string;
        size: number | undefined;
        lastModifiedDateTime: string | undefined;
    } | null;
    dirty: boolean;
    ghost: boolean;
    pendingGone: boolean;
    cloudNewer: boolean;
    newerOnCloud: boolean;
    conflict: boolean;
};
/** 图库杂物条目（#24，user 0828 拍板「显示其他扩展名的文件，不提供打开」——诚实性：看似空夹其实有货）。 */
export interface CloudOtherItem {
    path: string;
    name: string;
    size?: number;
    lastModified?: number;
}
export interface CloudImageItem {
    path: string;
    name: string;
    size?: number;
    lastModified?: number;
    cached: boolean;
}
export declare function watchFolder(folder: string, cb: (snap: {
    path: string;
    items: ReturnType<typeof itemToG>[];
    images: CloudImageItem[];
    others: CloudOtherItem[];
    folderNames: string[];
}) => void): () => void;
export declare function watchFolderImages(folder: string, cb: (snap: {
    path: string;
    images: CloudImageItem[];
    folderNames: string[];
}) => void): () => void;
/** picker 选中后取整份图片字节（本地缓存优先、整份拉云、autoCacheOpenedFile 顺手落缓存）。拿不到 → null。 */
export declare const openCloudImage: (path: string) => Promise<Blob | null>;
export declare const listGalleryTrash: () => Promise<{
    name: string;
    deletedAt: number;
    encrypted: boolean;
    conflictLive: boolean;
    local: {
        name: string;
        trashKey: string;
        encrypted: boolean;
    } | null;
    cloud: {
        path: string;
        id: string;
    } | null;
}[]>;

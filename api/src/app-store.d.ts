import type { Store, Collection as _Coll } from "@internal/store";
export declare const storeAbsent: boolean;
export declare const provider: import("@internal/store").CloudProvider | null;
declare const _auth: import("@internal/store").OneDriveAuth;
export type AppStorePort = Pick<Store, "file" | "files" | "collection" | "encryption">;
export declare let store: AppStorePort;
export type { Collection, EncryptedBlob } from "@internal/store";
export declare let brushRackCollection: _Coll;
/** 换当前 store 实例（next=null → null-store = 无库模式）。重灌 4+1 collections、重跑 init 门、
 *  广播 wp:gallery-changed（笔架等持句柄消费者在 app.ts 监听重挂）。旧实例的 dispose 由调用方（attachment 器官）负责。 */
export declare function _swapStoreForGallery(next: Store | null): Promise<void>;
/** attachment 器官取全 Store（dispose/files.dirty 面）。app 层其余一律走 AppStorePort。 */
export declare function _currentFullStore(): Store;
/** persist 三件套③执行体（手势时刻调；fire-and-forget，结果永不改变数据安全行为）。值级 import 收拢本接缝。 */
export declare function requestGalleryPersist(): void;
export declare function _takeBootStore(): Store | null;
/** 为 registry 条目建新 store 实例（不换当前——换是 _swapStoreForGallery 的事）。 */
export declare function _buildStoreForGalleryEntry(entry: {
    kind: "onedrive" | "folder";
    dbId: string;
    handle?: unknown;
}): Store;
export declare const isAuthConfigured: () => boolean;
export declare const initAuth: () => Promise<import("@internal/store").AuthState>;
export declare const signIn: () => Promise<unknown>;
export declare const signOut: () => Promise<void>;
export declare const isSignedIn: () => boolean;
export declare const getActiveAccount: () => any;
export declare const retrySilentSignIn: () => Promise<boolean>;
export declare const getToken: () => Promise<string>;
export declare const onAuthChanged: (cb: Parameters<typeof _auth.onAuthChanged>[0]) => () => void;
export declare const getAuthState: () => import("@internal/store").AuthState;
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

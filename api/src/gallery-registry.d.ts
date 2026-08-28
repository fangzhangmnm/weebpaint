export type GalleryKind = "onedrive" | "folder";
/** FSA 目录句柄的最小面（node 可测；浏览器 FileSystemDirectoryHandle 结构满足）。 */
export interface DirHandleLike {
    readonly name: string;
    isSameEntry(other: DirHandleLike): Promise<boolean>;
}
export interface GalleryEntry {
    id: string;
    kind: GalleryKind;
    label: string;
    dbId: string;
    homeAccountId?: string;
    handle?: DirHandleLike;
    lastActive: number | null;
    createdAt: number;
}
/** 存储 port（结构 clone 语义；IDB 适配器/Map 假件同形）。 */
export interface RegistryKV {
    put(e: GalleryEntry): Promise<void>;
    delete(id: string): Promise<void>;
    list(): Promise<GalleryEntry[]>;
}
export interface GalleryRegistry {
    list(): Promise<GalleryEntry[]>;
    /** isSameEntry 查重：同夹二挂复用旧条目（顺手刷新 label）；查不到才铸新 id。 */
    mintFolder(handle: DirHandleLike): Promise<GalleryEntry>;
    /** 同账号查重复用；首个 OneDrive 条目认领 legacy 命名空间 "defaultStore"（既有数据零迁移）。 */
    mintOneDrive(homeAccountId: string, username: string): Promise<GalleryEntry>;
    touch(id: string): Promise<void>;
    clearLastActive(): Promise<void>;
    relabel(id: string, label: string): Promise<void>;
    forget(id: string): Promise<void>;
    lastActive(): Promise<GalleryEntry | null>;
    /** 播种（幂等，靠 dedup 不靠标记；每次 auth 变化调都安全）：既有登录态 → legacy OneDrive 条目即激活。 */
    seedLegacyOneDrive(p: {
        homeAccountId: string;
        username: string;
    }): Promise<void>;
}
export declare function createGalleryRegistry(kv: RegistryKV): GalleryRegistry;
export declare function idbRegistryKV(): RegistryKV;
/** 浏览器单例（懒开库：import 本身零 IDB 访问，node 测试 import 安全）。 */
export declare const galleryRegistry: GalleryRegistry;

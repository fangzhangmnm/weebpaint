import type { GalleryEntry, GalleryRegistry } from "./gallery-registry.ts";
export type AttachmentState = {
    kind: "detached";
} | {
    kind: "attached";
    entry: GalleryEntry;
    online: boolean;
};
export type DetachResult = {
    ok: true;
} | {
    ok: false;
    reason: "doc-open";
} | {
    ok: false;
    reason: "dirty";
    dirtyCount: number;
};
/** attach/detach 需要的全 Store 最小面（app-store seam 供真件；测试供假件）。 */
export interface SwappableStore {
    dispose(opts?: {
        drain?: boolean;
    }): Promise<void>;
    files: {
        dirty: {
            count(): Promise<number>;
        };
    };
}
export interface AttachmentDeps {
    storeAbsent: boolean;
    buildStore: (entry: GalleryEntry) => SwappableStore;
    swap: (next: SwappableStore | null) => Promise<void>;
    registry: Pick<GalleryRegistry, "touch" | "relabel" | "clearLastActive">;
    hasOpenGalleryDoc: () => boolean;
    requestPersist: () => void;
    setActiveGalleryId: (id: string | null) => void;
    reportError: (e: unknown) => void;
}
export interface GalleryAttachment {
    state(): AttachmentState;
    /** 挂库（必须 detached）。五步逆序：建实例→换入→锁域→touch/relabel。
     *  opts.online：folder=权限已 granted / onedrive=isSignedIn（调用方查好传入；缺省 true）。
     *  opts.gesture=false：boot 静默重挂——跳过 requestPersist（persist 只在用户手势申请，P3 verdicts）。
     *  （bootAdopt 已退役 2026-08-27：店懒出生后 boot 领养 = 普通 attach，无预建实例可领。） */
    attach(entry: GalleryEntry, opts?: {
        online?: boolean;
        gesture?: boolean;
    }): Promise<void>;
    /** 卸库（绿灯门）。拒卸返账（doc-open / dirty），不销毁任何东西。detached 时幂等 ok。 */
    detach(): Promise<DetachResult>;
    /** 显式逃生（用户过了警告 sheet 才走到这）：不 drain、dirty 留缓存。 */
    forceDetach(): Promise<void>;
    onChange(cb: (s: AttachmentState) => void): () => void;
    /** 离线态翻牌（Slice C：权限/token 恢复或掉线时由 host 调；attached 外 no-op）。 */
    setOnline(v: boolean): void;
}
export declare function createGalleryAttachment(deps: AttachmentDeps): GalleryAttachment;

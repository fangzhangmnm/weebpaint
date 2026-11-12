import type { Gl2Port, Gl2Texture, PooledFBO } from "../../common/gl2-port.ts";
export declare const GPU_TILE_BYTES: number;
export interface GpuTileBackend {
    readonly capacity: number;
    recreate(newCapacity: number): void;
    uploadSlice(slice: number, pixels: Uint8Array): void;
    copySlice(from: PooledFBO, slice: number, srcX: number, srcY: number, w: number, h: number): void;
}
export interface PinSets {
    required: Set<number>;
    preferred: Set<number>;
}
export declare class GpuTilePool {
    private _backend;
    private _maxSlices;
    private _slot;
    private _sliceOwner;
    private _free;
    private _nextId;
    private _frame;
    private _lastUse;
    private _lastBatch;
    private _pinProviders;
    readonly stats: {
        evictions: number;
        recreations: number;
        uploads: number;
        copies: number;
    };
    private _initialCapacity;
    private _parked;
    constructor(backend: GpuTileBackend, maxSlices: number);
    private _initSlices;
    get capacity(): number;
    get generation(): number;
    get maxSlices(): number;
    get allocatedCount(): number;
    get committedBytes(): number;
    get quotaBytes(): number;
    /** 登记「钉住」的一口；返回摘掉它的函数（房间退租 / 睡下去时摘：不摘 = 池一直拉着房间对象放不掉，CatsUp 施工单十九 ⑦）。 */
    registerPinProvider(fn: () => PinSets): () => void;
    /** 登记着的「钉住」有几口（= 合用这个池、醒着没退租的房间数）。 */
    get pinProviderCount(): number;
    /** 停放（自己开的池随房间睡下去）：显存还回去，只留 1 片（显卡的图组不许 0 层）；全部片号作废（generation 变）。幂等。 */
    park(): void;
    /** 停放之后重开回起步那么大（全部片号作废，使用者照代数重传）。没停放 = 不动。 */
    unpark(): void;
    get parked(): boolean;
    isAlive(id: number): boolean;
    slotOf(id: number): number;
    reserve(totalSlices: number): boolean;
    private _recreate;
    clearAll(): void;
    allocBatch(n: number): number[];
    uploadBatch(items: {
        bytes: Uint8Array;
    }[]): number[];
    copyBatchFrom(src: PooledFBO, items: {
        srcX: number;
        srcY: number;
        w: number;
        h: number;
    }[]): number[];
    evict(id: number): void;
    frameMaintain(): void;
    private _collectPins;
    private _evictForSpace;
}
export declare class IndexTexture {
    private _port;
    readonly tex: Gl2Texture;
    readonly across: number;
    readonly down: number;
    private _data;
    constructor(glctx: Gl2Port, docW: number, docH: number);
    rebuild(byKey: Map<number, number>, pool: GpuTilePool): void;
    setSlice(tx: number, ty: number, slice: number): void;
    dispose(): void;
    private _upload;
}

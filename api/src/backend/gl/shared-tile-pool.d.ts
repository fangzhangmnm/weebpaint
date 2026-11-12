import type { Gl2Port, Gl2TileArena } from "../../common/gl2-port.ts";
import { GpuTilePool } from "./gpu-tile-pool.ts";
/** 报数的口：承诺了多少显存（字节）、多少片、图块边长（清单算每层的索引小图用）、现在有几个醒着没退租的房间在用。 */
export interface SharedTilePoolStats {
    readonly committedBytes: number;
    readonly slices: number;
    readonly tileSize: number;
    readonly users: number;
}
export interface SharedTilePool {
    readonly stats: SharedTilePoolStats;
    readonly disposed: boolean;
    /** 退租：图组还给 Port（真显卡立即释放）。幂等。之后合用它的画板再用 = 抛。 */
    dispose(): void;
}
/** 内核里面的那一半（宿主拿不到）。 */
export interface SharedPoolCore {
    readonly pool: GpuTilePool;
    readonly arena: Gl2TileArena;
    disposed: boolean;
}
/** 建一个合用的池：起步和单块画板一样大（64 片，不超过 maxSlices），在 maxSlices 额度里按两倍长。 */
export declare function createSharedTilePool(glctx: Gl2Port, maxSlices: number): SharedTilePool;
/** 内核里面用：取合用池的那一半（GlRoom 构造时）。不是 createSharedTilePool 建的 = 抛。 */
export declare function sharedCoreOf(h: SharedTilePool): SharedPoolCore;

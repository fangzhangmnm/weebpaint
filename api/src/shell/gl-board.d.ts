import type { BakeReport } from "../backend/gl/bake-cells.ts";
import type { Gl2Port, PooledFBO } from "../common/gl2-port.ts";
import type { SharedTilePool } from "../backend/gl/shared-tile-pool.ts";
import { RasterService } from "../backend/gl/raster-service.ts";
import { RegionStroke, type SelMaskPlane } from "../backend/gl/region-stroke.ts";
import type { FloatInput, OverlayInput, SurrogateInput } from "../backend/gl/gl-room.ts";
import type { LayerPixels } from "../backend/tiles/tile-layer.ts";
import type { DocNode, DocLeaf } from "../backend/gl/gl-doc-bridge.ts";
export interface GLDoc {
    layers: DocNode[];
    width: number;
    height: number;
}
export type { DocLeaf as GLLeaf } from "../backend/gl/gl-doc-bridge.ts";
export declare class GLBoard {
    private _glctx;
    private _room;
    private _tree;
    private _raster;
    /** opts.pool = 几块画板合用的图块池（CatsUp 施工单十九第 2 刀；createSharedTilePool 建）；缺 = 照旧自己开一个（画画软件就是这样）。 */
    constructor(glctx: Gl2Port, maxSlices: number, opts?: {
        readonly pool?: SharedTilePool;
    });
    /** 摘掉挂在 Port 上的「画面丢了」回调（退租时摘：不摘 = Port 一直拉着这块画板，换很多次文件之后放不掉）。 */
    private _unInvalidated;
    private _disposed;
    get disposed(): boolean;
    dispose(): void;
    private _alive;
    /** 要用显卡的口：没退租、醒着、合用的池还在。睡着时调 = 抛（先 wake()），不是悄悄画到一块没有显卡那一半的画板上。 */
    private _live;
    get asleep(): boolean;
    sleep(): void;
    wake(): void;
    get memory(): {
        usedTiles: number;
        capacity: number;
        usedBytes: number;
        committedBytes: number;
        quotaBytes: number;
    };
    get stats(): {
        passes: number;
        floatPasses: number;
    };
    get fboPoolStats(): {
        count: number;
        bytes: number;
    };
    get frameStats(): {
        segBuilds: number;
        segHits: number;
        cachingDegraded: boolean;
    };
    get syncDrops(): number;
    markContentDirty(): void;
    commitBrushStroke(leafId: number, pixels: LayerPixels, ov: OverlayInput, docW: number, docH: number, apply: (px: Uint8ClampedArray, x: number, y: number, w: number, h: number) => {
        tx: number;
        ty: number;
    }[]): boolean;
    /** 最近一次 commitBrushStroke 怎么读回的（CatsUp 1-4d 第 8 条）：box / cells / box-unreported + 读了几次、多少字节、报了几格、漏了几格。宿主看 path 自己记日志（内核不认识宿主的日志）。没落成 = null。 */
    get lastBake(): BakeReport | null;
    warmUp(docW: number, docH: number, schedule: (fn: () => void) => void): void;
    private _preborrowDocFBO;
    openRegion(leafId: number, pixels: LayerPixels, docW: number, docH: number, selMask: SelMaskPlane | null, lockAlpha: boolean, snapshot?: boolean): RegionStroke;
    rasterizeStampsToBytes(stamps: Parameters<RasterService["rasterizeStampsToBytes"]>[0], shape: Parameters<RasterService["rasterizeStampsToBytes"]>[1], bx: number, by: number, bw: number, bh: number): Uint8ClampedArray | null;
    compositeToBytes(nodes: DocNode[], docW: number, docH: number, surrogates?: readonly SurrogateInput[], overlays?: readonly OverlayInput[]): {
        data: Uint8ClampedArray;
        w: number;
        h: number;
    } | null;
    pickColor(doc: GLDoc, docBg: string | null, x: number, y: number, surrogates?: readonly SurrogateInput[], overlays?: readonly OverlayInput[]): [number, number, number, number] | null;
    warpToBytes(src: Parameters<RasterService["warpToBytes"]>[0], srcW: number, srcH: number, hinv: number[], mode: number, bx: number, by: number, bw: number, bh: number): {
        data: Uint8ClampedArray;
        w: number;
        h: number;
        dstX: number;
        dstY: number;
    } | null;
    /**
     * 只合成、不上屏（2026-11-10 贴图主线 0-5）：参数和 render 一样，去掉屏幕那几个；返回合成好的整幅图（预乘、和画布一样大、第 0 行 = 画布第 0 行）。
     * 那张图归内核：下一次合成（render / composite）之前有效，宿主不许归还、不许改它的采样设置。docBg 可以是 "#rrggbb"、"checker"、null，
     * 或者直接给一个不透明的颜色 [r, g, b, a]（0..1）当底——三维放材质自己的底色，交出去的图就是不透明的。GL 丢了 = null。
     */
    composite(doc: GLDoc, docBg: string | readonly [number, number, number, number] | null, floats?: FloatInput[], stampOverlays?: readonly OverlayInput[], liveSyncLeaf?: DocLeaf | null, surrogates?: readonly SurrogateInput[]): PooledFBO | null;
    render(doc: GLDoc, affine6: number[], canvasW: number, canvasH: number, scale: number, voidColor: string, docBg: string | null, floats?: FloatInput[], stampOverlays?: readonly OverlayInput[], liveSyncLeaf?: DocLeaf | null, surrogates?: readonly SurrogateInput[], gridBg?: {
        dotColor: string;
        stepPx: number;
        radiusPx: number;
    } | null): void;
}

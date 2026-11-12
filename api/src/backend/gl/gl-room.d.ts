import type { DirtyCells } from "../../common/dirty-rects.ts";
import { GpuTilePool, IndexTexture } from "./gpu-tile-pool.ts";
import { CpuGpuTileBridge } from "./tile-bridge.ts";
import { GLCompositor } from "./gl-compositor.ts";
import type { Acc, OverlayDesc, FloatDesc } from "./gl-compositor.ts";
import type { DocNode, DocLeaf } from "./gl-doc-bridge.ts";
import { LayerPixels } from "../tiles/tile-layer.ts";
import { GLStampRasterizer } from "./gl-stamp.ts";
import type { Stamp, StrokeShape } from "./gl-stamp.ts";
import type { PlanNode, PlanStep, SegBuild } from "./render-plan.ts";
import type { ExternalTexture, PooledFBO, FBOPrec, Gl2Port, Gl2TexSource, Gl2TileArena } from "../../common/gl2-port.ts";
import type { RegionOverlayInput } from "./region-stroke.ts";
export interface SurrogatePlaneInput {
    layerId: number;
    bytes: {
        data: Uint8ClampedArray;
        w: number;
        h: number;
    };
    bx: number;
    by: number;
    w: number;
    h: number;
}
export interface SurrogateShadowInput {
    layerId: number;
    pixels: LayerPixels;
}
export type SurrogateInput = SurrogatePlaneInput | SurrogateShadowInput;
export interface FloatInput {
    layerId: number;
    srcW: number;
    srcH: number;
    hinv: number[];
    mode: number;
    splinePlane?: {
        data: Float32Array;
        w: number;
        h: number;
    } | null;
    u8Plane?: {
        data: Uint8ClampedArray;
        w: number;
        h: number;
    } | null;
}
export interface StampOverlayInput {
    stamps: Stamp[];
    shape: StrokeShape;
    bx: number;
    by: number;
    bw: number;
    bh: number;
    layerId: number;
    opacity: number;
    erase: boolean;
    blendMode: string;
    lockAlpha: boolean;
    selMask: {
        data: Uint8Array;
        ox: number;
        oy: number;
        ow: number;
        oh: number;
    } | null;
}
export interface FillOverlayInput {
    kind: "fill";
    color: [number, number, number];
    bx: number;
    by: number;
    bw: number;
    bh: number;
    layerId: number;
    lockAlpha: boolean;
    selMask: {
        data: Uint8Array;
        ox: number;
        oy: number;
        ow: number;
        oh: number;
    };
}
export interface HostOverlayInput {
    kind: "host";
    /** 宿主画好的这一笔。和画布一样大，预乘，第 0 行 = 画布第 0 行。宿主借的（池子里的离屏图）或者外面包进来的（wrapExternal）；内核只读，不归还，不删，不改它的采样设置。 */
    tex: PooledFBO | ExternalTexture;
    bx: number;
    by: number;
    bw: number;
    bh: number;
    layerId: number;
    opacity: number;
    erase: boolean;
    blendMode: string;
    lockAlpha: boolean;
    selMask: {
        data: Uint8Array;
        ox: number;
        oy: number;
        ow: number;
        oh: number;
    } | null;
    /**
     * 这一笔碰过的格（可选，CatsUp 1-4d 第 8 条）：画布像素上的脏格子位图（8 格见方），宿主抬笔整笔重画那一次标出来的（和画进去的是同一批 item）。
     * 给了 = 落层时只读回这些格（挤进一张小暂存图、一次读回）；内核不全信：同一次读回里带一片核对——方框里报的格以外，合出来的和这一层原来的
     *   有没有不一样（任一通道），有 = 照旧读整个方框（绝不少写），GLBoard.lastBake.path = "box-unreported"。
     * 不给 / 大小和画布对不上 = 照旧读整个方框（画画软件自己不受影响）。
     */
    cells?: DirtyCells;
}
export type OverlayInput = StampOverlayInput | FillOverlayInput | RegionOverlayInput | HostOverlayInput;
export declare function overlayEmpty(ov: OverlayInput): boolean;
export interface LeafRec {
    index: IndexTexture;
    byKey: Map<number, number>;
    src: LayerPixels | null;
    cpuVersion: number;
    gen: number;
}
export declare class GlRoom {
    readonly glctx: Gl2Port;
    readonly arena: Gl2TileArena;
    readonly pool: GpuTilePool;
    readonly bridge: CpuGpuTileBridge;
    readonly comp: GLCompositor;
    readonly rasterizer: GLStampRasterizer;
    readonly leaves: Map<number, LeafRec>;
    private _overlays;
    private _overlayOwnedFBOs;
    private _selTex;
    private _selTexSrc;
    private _fillTex;
    private _fillTexColor;
    private _floatTex;
    private _floats;
    private _liveMergedClips;
    private _invalidateListeners;
    constructor(glctx: Gl2Port, maxSlices: number, accumPrec?: FBOPrec);
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
    onInvalidate(cb: () => void): void;
    invalidateTree(): void;
    dispose(): void;
    handleContextRestored(): void;
    readonly syncStats: {
        drops: number;
    };
    /** false = 池连驱逐后都塞不下（内容超显存 quota）：该层保持陈旧/部分显示。 */
    syncLeafSafe(leafId: number, pixels: LayerPixels, docW: number, docH: number): boolean;
    /** 这一叶在显卡上的那份已经是现在的像素（同步会走快路径、什么都不传）：增量合成的条件之一（1-4d 第 6 条：本帧层的像素没变）。 */
    leafUpToDate(leafId: number, pixels: LayerPixels, docW: number, docH: number): boolean;
    private _syncPixels;
    syncSurrogate(s: SurrogatePlaneInput, docW: number, docH: number): void;
    recAlive(rec: {
        byKey: Map<number, number>;
    }): boolean;
    cpuAlive(): (id: number) => boolean;
    toPlanNodes(nodes: DocNode[], updated: Set<number>, overlayLeafIds: ReadonlySet<number>, leafById: Map<number, DocLeaf>): PlanNode[];
    composeSteps(steps: PlanStep[], acc: Acc, docW: number, docH: number, transient: Map<string, PooledFBO>, segLookup: ((key: string) => IndexTexture | undefined) | null): void;
    composeSegTransient(b: SegBuild, docW: number, docH: number, bg: Parameters<GLCompositor["newAcc"]>[2], transient?: Map<string, PooledFBO>, segLookup?: ((key: string) => IndexTexture | undefined) | null): PooledFBO;
    liveClipTexFor(clipBaseId: number | null, docW: number, docH: number): Gl2TexSource | null;
    releaseLiveClip(): void;
    get hasOverlay(): boolean;
    get overlayLayerId(): number | null;
    /** 任一 overlay（bakeStamps 单 overlay 场景用）；多 overlay 时 = 第一个。 */
    overlayDesc(): OverlayDesc | null;
    /** 某叶的 overlay（合成 leaf pass / clip 基底用）；没有 = null。 */
    overlayDescFor(layerId: number): OverlayDesc | null;
    private _descOf;
    clearOverlay(): void;
    releaseOverlayFBO(): void;
    /** 单 overlay 便利口（bakeStamps / 旧调用点）= setStampOverlays([ov])。 */
    setStampOverlay(ov: OverlayInput, docW: number, docH: number): void;
    /** 装一帧的全部 overlay（每叶最多一个；空的跳过）。上一帧 stamp 分支借的 FBO 在此归还（与旧单槽「换新时还旧」同序）。 */
    setStampOverlays(list: readonly OverlayInput[], docW: number, docH: number): void;
    private _addOverlay;
    /**
     * 二维笔尖和宿主薄层共用的后半段（只有这一份，守卫钉）：一张和画布一样大的预乘薄层 → 转直值 → 带上选区 → 登记。
     * owned = 这张预乘图是内核自己借的（二维笔尖：转完就还）；宿主的图 owned = false（只读、不归还）。
     */
    private _addPremulOverlay;
    private _uploadSelMask;
    get floats(): ReadonlyMap<number, FloatDesc>;
    setFloats(floats: FloatInput[]): void;
}
export declare function poolCapacityForBudget(budgetBytes: number): number;

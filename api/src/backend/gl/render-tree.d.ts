import type { Background, ScreenGridBg } from "./gl-compositor.ts";
import type { DocNode } from "./gl-doc-bridge.ts";
import type { PooledFBO } from "../../common/gl2-port.ts";
import type { GlRoom, FloatInput, OverlayInput, SurrogateInput } from "./gl-room.ts";
export declare class RenderTree {
    private _room;
    private _segCache;
    private _display;
    private _displaySig;
    private _dirty;
    private _lastDocW;
    private _lastDocH;
    private _lastPlan;
    readonly frameStats: {
        segBuilds: number;
        segHits: number;
        cachingDegraded: boolean;
    };
    constructor(room: GlRoom);
    markDirty(): void;
    handleContextRestored(): void;
    renderFrame(nodes: DocNode[], docW: number, docH: number, bg: Background | undefined, affine6: number[], canvasW: number, canvasH: number, scale: number, voidRgb: [number, number, number], floats: FloatInput[], stampOverlays: readonly OverlayInput[], surrogates: readonly SurrogateInput[], liveSyncLeafId: number | null, screenGrid?: ScreenGridBg | null): void;
    /**
     * 只合成、不上屏（2026-11-10 贴图主线 0-5：三维要合成好的那张图贴到模型上）：合成整幅画到一张离屏图并返回。renderFrame = 这一半 + 画到屏幕（同一段代码）。
     * 返回的那张图**归内核**：下一次合成之前有效；宿主不许归还它、不许改它的采样设置。bg 给不透明的颜色 = 交出去的图不透明（三维放材质自己的底色）。
     */
    compositeFrame(nodes: DocNode[], docW: number, docH: number, bg: Background | undefined, floats: FloatInput[], stampOverlays: readonly OverlayInput[], surrogates: readonly SurrogateInput[], liveSyncLeafId: number | null): PooledFBO;
    private _planSig;
    private _segValid;
    private _invalidateSegs;
    private _buildSeg;
    private _present;
}

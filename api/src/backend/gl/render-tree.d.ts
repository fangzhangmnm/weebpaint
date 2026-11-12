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
    /** 缓存段建的时候用的底色（底色烤进最底下那段；段的键只认底色的种类，不认颜色）：变了 = 段全失效（2026-11-11：纯色换纯色以前不失效，最底下那段留着旧颜色）。 */
    private _segBg;
    private _lastDocW;
    private _lastDocH;
    private _lastPlan;
    readonly frameStats: {
        segBuilds: number;
        segHits: number;
        cachingDegraded: boolean;
    };
    /**
     * 增量合成（CatsUp 贴图主线 1-4d 第 6 条）：上一张结果能不能当底（整张合成过一次之后为真；丢上下文 / 换大小 / 退租 = 假）+ 上一帧的宿主薄层（逐片：哪片、叠法、方框）。
     * 这一帧只在宿主报过的块里重合要同时满足：上一张还在、没 markDirty、计划签名没变、本帧缓存段全命中、没有浮层 / 替身 / 正在同步的叶、宿主薄层还是同一片（叠法不变、方框只长）、
     * 每片外来薄层都报过块、本帧层的像素没变、计划里只有认识的 pass 种类。不满足 = 整张（以前的样子）。报来的块记成脏格子位图（dirty-rects.ts，8 格见方），每个 pass 只画那些行段；格子外一个像素都不写。
     */
    private _incOk;
    private _lastHost;
    /** 量 / 测试：上一帧走的哪条路（full 整张 / rects 只合那几块 / same 什么都没变）、几块、占画布多少。 */
    readonly lastPath: {
        path: "full" | "rects" | "same";
        rects: number;
        fraction: number;
    };
    private readonly _pinsFn;
    private _unpin;
    constructor(room: GlRoom);
    markDirty(): void;
    handleContextRestored(): void;
    renderFrame(nodes: DocNode[], docW: number, docH: number, bg: Background | undefined, affine6: number[], canvasW: number, canvasH: number, scale: number, voidRgb: [number, number, number], floats: FloatInput[], stampOverlays: readonly OverlayInput[], surrogates: readonly SurrogateInput[], liveSyncLeafId: number | null, screenGrid?: ScreenGridBg | null): void;
    /**
     * 只合成、不上屏（2026-11-10 贴图主线 0-5：三维要合成好的那张图贴到模型上）：合成整幅画到一张离屏图并返回。renderFrame = 这一半 + 画到屏幕（同一段代码）。
     * 返回的那张图**归内核**：下一次合成之前有效；宿主不许归还它、不许改它的采样设置。bg 给不透明的颜色 = 交出去的图不透明（三维放材质自己的底色）。
     */
    compositeFrame(nodes: DocNode[], docW: number, docH: number, bg: Background | undefined, floats: FloatInput[], stampOverlays: readonly OverlayInput[], surrogates: readonly SurrogateInput[], liveSyncLeafId: number | null): PooledFBO;
    /** 宿主这一帧报的块（每片外来薄层都取走）+ 方框长出来的那几条；有不是宿主的薄层 / 从没报过的 / 换了一片或叠法变了 / 方框缩了 = "full"。 */
    private _takeHostRects;
    private _snapHost;
    /** 增量走不成了（后面的条件不满足）：出「只画几块」，宿主薄层整张重转。 */
    private _dropRects;
    private _planSig;
    private _segValid;
    /**
     * 退租（GLBoard.dispose；CatsUp 0-3a 补全寿命：宿主有很多块画板、会扔，建和拆要成对）：借的 display 离屏图还池、段缓存的索引纹理逐个删。
     * 叶记录（room.leaves）归 GlRoom.dispose。之后不可再用（GLBoard 那层拦）。画画软件一辈子一块画板，不调。
     */
    dispose(): void;
    /** 睡：摘掉「钉住」的口、显示图和段缓存的帧缓冲还池、段缓存的片让出来；标脏（醒来下一帧整张重合）。 */
    sleep(): void;
    /** 醒：重新登记「钉住」的口、标脏。显卡那一半下一帧按内存那份重建（和 handleContextRestored 同一条路）。 */
    wake(): void;
    private _releaseGpuHalf;
    private _invalidateSegs;
    private _buildSeg;
    private _present;
}

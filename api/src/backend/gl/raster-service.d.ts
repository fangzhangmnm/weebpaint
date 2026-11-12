import type { Background } from "./gl-compositor.ts";
import type { DocNode } from "./gl-doc-bridge.ts";
import type { LayerPixels } from "../tiles/tile-layer.ts";
import type { Stamp, StrokeShape } from "./gl-stamp.ts";
import type { PooledFBO } from "../../common/gl2-port.ts";
import { type BakeReport } from "./bake-cells.ts";
import type { GlRoom, OverlayInput, SurrogateInput } from "./gl-room.ts";
/** 方框（这一笔的 bx / by / bw / bh）外扩到图块边、夹在画布里（K2：落层那一遍只合这一块）。空 = null（交给调用的人照整张）。 */
export declare function tileAlignedRect(bx: number, by: number, bw: number, bh: number, docW: number, docH: number): {
    x: number;
    y: number;
    w: number;
    h: number;
} | null;
export declare class RasterService {
    private _room;
    constructor(room: GlRoom);
    rasterizeStampsToBytes(stamps: Stamp[], shape: StrokeShape, bx: number, by: number, bw: number, bh: number): Uint8ClampedArray | null;
    bakeStamps(leafId: number, pixels: LayerPixels, ov: OverlayInput, docW: number, docH: number, apply: (px: Uint8ClampedArray, x: number, y: number, w: number, h: number) => {
        tx: number;
        ty: number;
    }[]): boolean;
    /** 最近一次 bakeStamps 的读回报告（1-4d 第 8 条；GLBoard.lastBake 交给宿主）。没落成 = null。 */
    lastBake: BakeReport | null;
    /** 只给测试：落层那一遍照老路合整张（拿来和限方框的逐字节比；2026-11-12 K2）。不是宿主能开的开关。 */
    bakeWhole: boolean;
    /**
     * 只读报的格：先取一张「这一层原来的」（region-load：从图块池原样取这一层的字节 = CPU 那份，只取方框），再一次画暂存图（格子 + 核对片）、一次读回。
     *   比的必须是这一层真正存着的字节（region-load = 和 CPU 那份同一份），不用合成器现合一张（那是另一段着色器，取整未必和落层那一遍一样），
     *   也不用「带空薄层的同一段」：那样一种 α = 0 也改像素的叠法会把原来的也改掉、核对就看不出来了。
     * 核对片干净 = 拆回、一个图块一次 apply（那一块现在存着的字节贴上读回来的格），交回变了的图块；不干净 = 不 apply、交回漏了几格（调用的人读整个方框）。
     */
    private _readCells;
    warpToBytes(src: {
        data: Float32Array;
        w: number;
        h: number;
    } | {
        data: Uint8ClampedArray;
        w: number;
        h: number;
    }, srcW: number, srcH: number, hinv: number[], mode: number, bx: number, by: number, bw: number, bh: number): {
        data: Uint8ClampedArray;
        w: number;
        h: number;
        dstX: number;
        dstY: number;
    } | null;
    compositeOnce(nodes: DocNode[], docW: number, docH: number, bg?: Background, surrogates?: readonly SurrogateInput[], overlays?: readonly OverlayInput[]): PooledFBO;
    compositeToBytes(nodes: DocNode[], docW: number, docH: number, surrogates?: readonly SurrogateInput[], overlays?: readonly OverlayInput[]): {
        data: Uint8ClampedArray;
        w: number;
        h: number;
    };
    pickColor(nodes: DocNode[], docW: number, docH: number, bg: Background | undefined, x: number, y: number, surrogates?: readonly SurrogateInput[], overlays?: readonly OverlayInput[]): [number, number, number, number];
}

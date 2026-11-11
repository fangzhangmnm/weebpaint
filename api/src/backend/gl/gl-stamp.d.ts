import type { Gl2Port, PooledFBO } from "../../common/gl2-port.ts";
export { STAMP_FALLOFF_GLSL } from "./stamp-falloff.ts";
export interface Stamp {
    x: number;
    y: number;
    size: number;
    alpha: number;
}
export interface StrokeShape {
    hardness: number;
    color: [number, number, number];
    buildup: boolean;
    aspect?: number;
    rotation?: number;
}
export declare class GLStampRasterizer {
    private _glctx;
    private _instData;
    constructor(glctx: Gl2Port);
    rasterize(stamps: Stamp[], shape: StrokeShape, ox: number, oy: number, ow: number, oh: number, scissor?: {
        x: number;
        y: number;
        w: number;
        h: number;
    } | null): PooledFBO;
    /**
     * 淡彩最后上色的那一遍（stamp-color）：累积的 α → premult(color, α) 到另一张 FBO（先全屏清、再 scissor 限着色）；accum 归还，返回新的那张（caller returnFBO）。
     * 2026-11-10（贴图主线 0-5）公开：三维的空间层自己累积完淡彩之后用同一遍上色。
     */
    colorize(accum: PooledFBO, color: [number, number, number], ow: number, oh: number, scissor?: {
        x: number;
        y: number;
        w: number;
        h: number;
    } | null): PooledFBO;
}

export { stampFalloff } from "./gl/stamp-falloff.ts";
export interface SoftTexRead {
    readonly w: number;
    readonly h: number;
    fetch(x: number, y: number, out: Float32Array): void;
}
export interface SoftArenaRead {
    readonly tileSize: number;
    fetch(layer: number, x: number, y: number, out: Float32Array): void;
}
export interface CpuDrawCtx {
    vw: number;
    vh: number;
    uniforms: Record<string, number | boolean | number[] | Float32Array>;
    tex: (name: string) => SoftTexRead | null;
    arena: (name: string) => SoftArenaRead | null;
    forEachPixel(frag: (px: number, py: number, out: Float32Array) => boolean): void;
    instances: Float32Array | null;
    count: number;
    writePixel(px: number, py: number, rgba: Float32Array): void;
}
export type CpuDraw = (ctx: CpuDrawCtx) => void;
/** 这个名字是不是内核自己的程序（在内核那张表里：有 CPU 版或登记成 GPU-only）。宿主登记的程序不许用这些名字（贴图主线 1-4b）。 */
export declare function isKernelProgram(name: string): boolean;
export declare function resolveCpuProgram(name: string): CpuDraw | "gpu-only" | null;

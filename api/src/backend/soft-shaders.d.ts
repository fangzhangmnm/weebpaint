export { stampFalloff } from "./gl/stamp-falloff.ts";
export type { SoftTexRead, SoftArenaRead, CpuDrawCtx, CpuDraw } from "../common/cpu-draw.ts";
import type { CpuDraw } from "../common/cpu-draw.ts";
/** 这个名字是不是内核自己的程序（在内核那张表里：有 CPU 版或登记成 GPU-only）。宿主登记的程序不许用这些名字（贴图主线 1-4b）。 */
export declare function isKernelProgram(name: string): boolean;
export declare function resolveCpuProgram(name: string): CpuDraw | "gpu-only" | null;

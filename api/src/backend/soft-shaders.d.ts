export { stampFalloff } from "./gl/stamp-falloff.ts";
export type { SoftTexRead, SoftArenaRead, CpuDrawCtx, CpuDraw } from "../common/cpu-draw.ts";
import type { CpuDraw } from "../common/cpu-draw.ts";
/** 这个名字是不是内核自己的程序（在内核那张表里：有 CPU 版或登记成 GPU-only）。宿主登记的程序不许用这些名字（贴图主线 1-4b）。 */
export declare function isKernelProgram(name: string): boolean;
/**
 * 外面登记的程序名字的规矩（统筹 11-11）：必须带自己的前缀「前缀/名字」（比如 catsup/space-tip）；没有前缀的名字留给内核。
 * 两种显卡接口的 registerProgram 都先过这一道：不带前缀 = 抛 PROGRAM_NAME_NEEDS_PREFIX；带了前缀还撞内核（不会发生，内核的名字都没有斜杠）= 抛 PROGRAM_NAME_IS_KERNEL。
 */
export declare function checkHostProgramName(name: string): void;
export declare function resolveCpuProgram(name: string): CpuDraw | "gpu-only" | null;

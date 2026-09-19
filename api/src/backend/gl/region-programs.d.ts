import type { Gl2Port } from "../../common/gl2-port.ts";
export declare const REGION_PROGRAM_IDS: readonly ["region-load", "region-crop", "smudge-mask", "smudge-absorb", "reduce-weighted", "reduce-sum", "divide", "box3", "upsample-bilinear", "smudge-deposit", "wash-coverage", "wash-premult", "wash-box3", "wash-unpremult", "wash-sharpen", "wash-lerp"];
export type RegionProgramId = typeof REGION_PROGRAM_IDS[number];
/** 确保 id 已在 port 注册（幂等；SoftGl2Port 在此核对 CPU 孪生，缺 = throw）。 */
export declare function ensureRegionProgram(port: Gl2Port, id: RegionProgramId): void;
/** 一次注册全部（RegionStroke 构造时调；也是对表测试的入口）。 */
export declare function ensureAllRegionPrograms(port: Gl2Port): void;
/** 只读：GLSL 源（gl-smoke / 调试）。 */
export declare function regionProgramSource(id: RegionProgramId): {
    vert: string;
    frag: string;
};

/** GLSL：float stampFalloff(float dist, float radius, float innerR)。放在 main 之前。 */
export declare const STAMP_FALLOFF_GLSL = "\nfloat stampFalloff(float dist, float radius, float innerR) {\n  float decayLen = radius - innerR;\n  if (decayLen <= 0.0 || dist <= innerR) return 1.0;\n  float u = (dist - innerR) / decayLen;\n  return 1.0 - u*u*(3.0 - 2.0*u);\n}";
/** 同一算式的 JS（软件显卡 / CPU 标准答案）。 */
export declare function stampFalloff(dist: number, radius: number, innerR: number): number;

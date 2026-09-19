// 区域程序 / RegionStroke 契约 .h（API .h ritual：提案 → 落地后回写为现值的浓缩；权威 = api/ 的 .d.ts）。
// created 2026-09-18 by Claude Fable 5.1（claude-fable-5-1）· 状态：**已落地 v0.14.17，本文件 = 现值浓缩**（2026-09-18 回写；
//   提案原形与差异表见 20260918-region-programs-formalism-and-gpu-contract.md §3 / §6；决策 = adr/0014-region-programs.md）。
// 权威文件：api/src/backend/gl/region-programs.d.ts · region-stroke.d.ts · gl-room.d.ts · gl-compositor.d.ts · stroke-session.d.ts ·
//   filters.d.ts · plugins/smudge-engine.d.ts · plugins/wash-brush.d.ts。本文件手写浓缩，形状再变以 api/ 为准。

import type { PooledFBO, Gl2Blend } from "../src/common/gl2-port.ts";
import type { GlRoom } from "../src/backend/gl/gl-room.ts";
import type { LayerPixels } from "../src/backend/tiles/tile-layer.ts";
import type { ViewLeaf } from "../src/backend/workpiece/painting-view.ts";
import type { SmudgeSettings } from "../src/plugins/smudge-engine.ts";
import type { FilterParams } from "../src/backend/filters/kernel.ts";

// ============================================================================
// 1. backend/gl/region-programs.ts —— program 封闭枚举（只加不改；每个名在 soft-shaders.ts 有 CPU 孪生，缺 = program() throw）
//    program 名不得含浏览器词（backend 目录格律；region-window → region-crop）
// ============================================================================

export type RegionProgramId =
  // 第一批（手指三 variant）
  | "region-load"          // 叶 tile-index + arena（straight u8）→ W 整幅
  | "region-crop"          // W 窗口 → cur（B×B premult f32；doc 外 = 0）；首 dab 也用它给 accum 沾色
  | "smudge-mask"          // falloff(dist, r, hardness) × selection → mask.r
  | "smudge-absorb"        // A' = mix(cur, A, ρ)；u_clip=1 时 doc 外像素保持 A；1×1 时即 accumColor
  | "reduce-weighted"      // (src, mask) → k×k：u_which 0 = Σ m·src(rgba) / 1 = Σ m(.r)
  | "reduce-sum"           // k×k → 1×1
  | "divide"               // sum / w（w ≤ 0 → 0）
  | "box3"                 // k×k 格归一 + 活格 3×3（dull 中段）
  | "upsample-bilinear"    // k×k → B×B release
  | "smudge-deposit"       // W 窗口 = straight(mix(cur, P, m·s))；P ∈ {accum, accumColor, release} ⊕ 掺色 ⊕ 稀释；lockAlpha
  // 第二批（模糊 / 锐化 wash）
  | "wash-coverage"        // cov = max(cov, stampA·flow·sel)（blend max-alpha，scissor = dab bbox，doc u8 alpha）
  | "wash-premult"         // W₀ 区域 → premult f32（字节单位）
  | "wash-box3"            // premult 3×3 盒（区域边缘 clamp）× N
  | "wash-unpremult"       // premult f32 → straight u8（clamp8 截断；a≤0 保原字节）
  | "wash-sharpen"         // luma USM（高斯 3×3 字节截断 + 阈值 4；k=0 = 原样）
  | "wash-lerp"            // W = lerp(W₀, baked, cov)（premult 权重；scissor = dab bbox）
  // 第三批（液化，2026-09-19，总账 #71）
  | "field-copy"           // 位移场搬家（长场：新场 ← 旧场 @ offset，其余 0）/ 拷回（A ← B）
  | "liquify-accumulate"   // B = A + 模式位移 × smoothstep（reconstruct：A·(1−α)）；scissor = footprint
  | "liquify-warp";        // W(p) = W₀(p − d(p))：核 nearest/bilinear/bicubic/spline(u_plane rgba16f)，选区 bleed import/clip/edge 整数 march
// 未来只加名：连续形式 "advect-segment"（#1）。

export function ensureRegionProgram(port: import("../src/common/gl2-port.ts").Gl2Port, id: RegionProgramId): void;
export function ensureAllRegionPrograms(port: import("../src/common/gl2-port.ts").Gl2Port): void;
export function regionProgramSource(id: RegionProgramId): { vert: string; frag: string };

// ============================================================================
// 2. backend/gl/region-stroke.ts —— 窄服务（一笔一个；构造即整幅装载 W；5 个动词 + 1 个算子）
// ============================================================================

export type RegionTexFormat = "rgba-f32" | "rgba-u8";
export interface RegionTex { readonly w: number; readonly h: number; readonly format: RegionTexFormat; }
export type RegionDst = RegionTex | "W";
export type RegionTexRef = RegionTex | "W" | "W0" | "selection";
export type RegionRect = { x: number; y: number; w: number; h: number };
export type Rect = [number, number, number, number];   // x0,y0,x1,y1（exclusive）
export interface SelMaskPlane { data: Uint8Array; ox: number; oy: number; ow: number; oh: number; }
export type RegionUniforms = Record<string, number | boolean | number[] | Float32Array>;
/** 显示 + 提交共用：W 当 overlay（doc 尺寸，ox/oy=0）；bx..bh = 累计写过的矩形；bw=bh=0 = 还没写过（overlayEmpty）。 */
export interface RegionOverlayInput { kind: "region"; tex: PooledFBO; layerId: number; bx: number; by: number; bw: number; bh: number; }

export declare class RegionStroke {
  /** caps.floatColorBuffer 假 → throw REGION_NO_FLOAT_FBO；syncLeafSafe 假 → throw REGION_GPU_POOL_EXHAUSTED（绝不带陈旧 W 起笔）。 */
  constructor(room: GlRoom, leafId: number, pixels: LayerPixels, docW: number, docH: number, selMask: SelMaskPlane | null,
              opts?: { snapshot?: boolean; lockAlpha?: boolean });
  readonly leafId: number; readonly docW: number; readonly docH: number; readonly lockAlpha: boolean;
  get selection(): { ox: number; oy: number; ow: number; oh: number } | null;
  get dirty(): Rect | null;
  alloc(w: number, h: number, format: RegionTexFormat): RegionTex;     // 借自 FBO 池，清零
  free(t: RegionTex): void;                                            // 提前归还（区域尺寸临时件按 flush 借还）
  /** 唯一算子。textures 的 key = program 的 sampler 名；dst 与任一采样源同一张 → throw REGION_READ_WRITE_HAZARD；写 W 按 scissor 记 dirty。 */
  run(program: RegionProgramId, dst: RegionDst, textures: Record<string, RegionTexRef>, uniforms?: RegionUniforms, scissor?: RegionRect, blend?: Gl2Blend): void;
  overlay(): RegionOverlayInput;
  readPixels(x0: number, y0: number, w: number, h: number): Uint8Array;   // 显式慢路径（测试 / 诊断；液化 spline 起笔预滤波读内容框一次）
  get contentBounds(): [number, number, number, number] | null;            // 装载时顺手算的内容框 [x0,y0,x1,y1)；空叶 null（2026-09-19）
  upload(w: number, h: number, data: Float32Array): RegionTex;             // 只读上传纹理（rgba16f-tex；spline 系数平面）；不能当 run 的 dst（2026-09-19）
  dispose(): void;                                                       // 幂等；之后任何动词 throw REGION_DISPOSED
  // ---- StrokeTarget 面：bbox = 整 doc；两个 CPU 字节口响亮不实现（REGION_TARGET_NO_CPU_IO）----
  readonly bboxX: number; readonly bboxY: number; readonly bboxW: number; readonly bboxH: number;
  getImageData(docX: number, docY: number, w: number, h: number): ImageData;
  putImageData(docX: number, docY: number, img: ImageData): void;
}

// ============================================================================
// 3. filters.ts —— 写靶改名 + 预览宿 / 快照声明（user 2026-09-18「别叫 Layer」）
// ============================================================================

/** 一笔期间的像素写靶（运行时 = StrokeShadow 替身或 RegionStroke），不是图层树节点。原 BrushLayer + SmudgeLayer。 */
export interface StrokeTarget {
  docW: number; docH: number;
  bboxX: number; bboxY: number; bboxW: number; bboxH: number;
  getImageData(docX: number, docY: number, w: number, h: number): ImageData;
  putImageData(docX: number, docY: number, img: ImageData): void;
}
// Filter 契约新增 / 改动：
//   strokePreview?: "shadow" | "region";   // 缺省 shadow（形状笔 pixelMode 等）；手指 / 模糊 / 锐化 / 液化（09-19 起）= region
//   strokeSnapshot?: boolean;              // region 时要不要起笔快照 W₀（wash 类要）
//   beginBrushStroke?(targets: readonly StrokeTarget[], params, brushSettings, selection, x, y, p): unknown;   // layers → targets；state 不透明
//   extendBrushStamp?(state: unknown, x, y, p): void; endBrushStroke?(state: unknown): void; cancelBrushStroke?(state: unknown): void; flushDirty?(state: unknown): DirtyRect | null;
export const COLOR_BRUSH_MIN_SPACING: 0.1;

// ============================================================================
// 4. gl-room.ts / gl-compositor.ts / blend-glsl.ts —— overlay 第三成员 + replace（uniform u_ovReplace，非新 program 名）
// ============================================================================
// export type OverlayInput = StampOverlayInput | FillOverlayInput | RegionOverlayInput;
// OverlayDesc.replace?: boolean  →  pass() 传 u_ovReplace；GLSL overlay 分支：bbox 内 = overlay 直值、bbox 外 = base；soft-shaders makeComposite 同分支。
// RasterService.bakeStamps(leafId, pixels, ov: OverlayInput, …) 对 region 原封可用（GPU merge → readPixels(bx..bh) → applyRegionDiff → 收养）。

// ============================================================================
// 5. backend/stroke-session.ts —— 预览宿第四种 "region"
// ============================================================================
// export type StrokePreview = "overlay" | "livesync" | "shadow" | "region";
// StrokeSessionSpec.regionSnapshot?: boolean（= Filter.strokeSnapshot）
export interface StrokeSessionDepsAddition {
  openRegion(leaf: ViewLeaf, opts: { snapshot: boolean }): RegionStroke;   // board.openRegionStroke / backend._openRegion；throw 时 session 先收令牌再冒错
  setRegions(regions: readonly RegionStroke[]): void;                      // board.setStrokeRegions：每帧各 region.overlay() 按叶当 overlay；[] = 关（2026-09-19 多叶：组液化 N 叶 N 个）
  commitRegion(region: RegionStroke): boolean;                             // board.commitRegionStroke = bakeStamps 写回链；没写过 = true；false → 令牌取消 + throw REGION_COMMIT_FAILED
}
// GLBoard.openRegion(leafId, pixels, docW, docH, selMask, lockAlpha, snapshot = false): RegionStroke（错误信息附 caps 快照）
// Board.openRegionStroke(layer, {snapshot}) / setStrokeRegions(regions[]) / commitRegionStroke(region)

// ============================================================================
// 6. plugins/smudge-engine.ts（公共面不变，写靶 = RegionStroke）· plugins/wash-brush.ts
// ============================================================================
export declare class SmudgeEngine {
  beginStroke(rs: RegionStroke, settings: SmudgeSettings, x: number, y: number, pressure: number): void;
  extendStroke(x: number, y: number, pressure: number): void;
  endStroke(): void; cancelStroke(): void;
  flushDirty(): Rect | null;
}
export interface WashKernel {
  bleed(params: FilterParams): number;
  bakeRegion(rs: RegionStroke, ex0: number, ey0: number, ew: number, eh: number, params: FilterParams): RegionTex;   // straight u8 区域，调用方 free
}
export function attachWashBrushBehavior(FilterClass: import("../src/filters.ts").Filter, kernel: WashKernel): void;   // 设 strokePreview="region" + strokeSnapshot

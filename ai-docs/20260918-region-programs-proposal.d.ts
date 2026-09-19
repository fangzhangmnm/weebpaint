// 提案 .h —— 区域程序 / RegionStroke 目标契约（API .h ritual：现状 = api/ v0.14.16，本文件 = 目标形状）。
// created 2026-09-18 by Claude Fable 5.1（claude-fable-5-1）· 状态：**已落地 v0.14.17；现值 = api/src/backend/gl/region-stroke.d.ts /
//   region-programs.d.ts / stroke-session.d.ts / filters.d.ts（gen-api 重打）。本文件保留为提案历史；与现值的差异表在
//   20260918-region-programs-formalism-and-gpu-contract.md §6（要点：无 load()、多 free()/readPixels()、run 多 blend、textures key = sampler 名、
//   replace 是 uniform u_ovReplace 不是新 ovMode、第二批 6 个 program、region-window → region-crop、Filter 多 strokeSnapshot、deps openRegion(leaf,{snapshot})/setRegion/commitRegion）。**
// 论证与出处：20260918-region-programs-formalism-and-gpu-contract.md。
// 纪律：只列新增 / 改动的签名；没列的（Gl2Port、GlRoom、RasterService.bakeStamps、Filter 笔契约、SmudgeSettings）**一个字不动**。

import type { FBOPrec, PooledFBO } from "../src/common/gl2-port.ts";
import type { GlRoom } from "../src/backend/gl/gl-room.ts";
import type { LayerPixels } from "../src/backend/tiles/tile-layer.ts";
import type { SmudgeSettings, SmudgeSelection } from "../src/plugins/smudge-engine.ts";

// ============================================================================
// 1. backend/gl/region-programs.ts —— program 封闭枚举（只加不改；每个名在 soft-shaders.ts 有 CPU 孪生，缺 = program() throw）
// ============================================================================

/** 第一批（手指三 variant）。 */
export type RegionProgramSmudge =
  | "region-load"          // 叶 index + arena（straight u8）→ W 矩形
  | "region-window"        // W 窗口 → cur（B×B premult f32；doc 外 = 0）
  | "smudge-mask"          // falloff(dist, r, hardness) × selection → mask（B×B f32；与 gl-stamp 同式）
  | "smudge-absorb"        // accum' = mix(cur, accum, ρ)（混色空间）；doc 外像素不沾
  | "reduce-weighted"      // (cur, mask) → k×k：premult 加权和 / 权重和（两级：B → 16×16 → 1）
  | "box3"                 // 3×3 盒滤波（dull 中段；第二批模糊 ×N 同一 program）
  | "upsample-bilinear"    // k×k → B×B
  | "smudge-deposit";      // W 窗口 = straight(mix(cur, P, M·s))；P ∈ {accum, accumColor, release} ⊕ 掺色 ⊕ 稀释；lockAlpha
/** 第二批（模糊 / 锐化 wash；本轮，user 09-18 yes）。 */
export type RegionProgramWash = "wash-coverage" | "unsharp" | "wash-lerp";
/** 第三批（液化，另案）。 */
export type RegionProgramLiquify = "disp-accumulate" | "warp-disp";
/** 远景（连续形式 #1）：接口不变，只多这个名。 */
export type RegionProgramFuture = "advect-segment";

export type RegionProgramId = RegionProgramSmudge | RegionProgramWash | RegionProgramLiquify | RegionProgramFuture;

/** 输入槽（封闭 key）。`field` = 位移 / 速度场纹理，给液化 / 连续形式 / 远景留的门。 */
export type RegionInputKey =
  | "W" | "W0" | "cur" | "mask" | "accum" | "accumColor" | "release" | "field" | "coverage" | "selection";

// ============================================================================
// 2. backend/gl/region-stroke.ts —— 窄服务：5 个动词，1 个算子
// ============================================================================

export type RegionTexFormat = "rgba-f32" | "rgba-u8" | "rg-f32" | "r-f32" | "r-u8";
export interface RegionTex { readonly w: number; readonly h: number; readonly format: RegionTexFormat; }
export type Rect = [number, number, number, number];   // x0, y0, x1, y1（exclusive）

export interface RegionTarget {
  tex: RegionTex | "W";                         // "W" = 工作区域本体（straight u8）
  scissor?: { x: number; y: number; w: number; h: number };   // doc 坐标（写 W 时）或纹理坐标
}
export type RegionInputs = Partial<Record<RegionInputKey, RegionTex | "W" | "W0" | "selection">>;
export type RegionUniforms = Record<string, number | boolean | number[] | Float32Array>;

/** 显示 + 提交共用：W 当 overlay，合成 ovMode = "replace"（bbox 内 = W 直值，bbox 外 = base）。 */
export interface RegionOverlayInput {
  kind: "region";
  tex: PooledFBO;            // = W
  layerId: number;
  bx: number; by: number; bw: number; bh: number;   // W 当前覆盖的 doc 矩形
  selMask: null;             // 选区已在 smudge-mask 吃过；replace 不再裁
}

export declare class RegionStroke implements StrokeTarget {
  /** 一笔一个。selMask = 选区 gray8 平面（同 StampOverlayInput.selMask 形），null = 无选区。 */
  constructor(room: GlRoom, leafId: number, pixels: LayerPixels, docW: number, docH: number,
              selMask: { data: Uint8Array; ox: number; oy: number; ow: number; oh: number } | null);
  readonly leafId: number;
  readonly docW: number;
  readonly docH: number;
  /** W 当前覆盖矩形（只扩不缩，夹 doc）；null = 还没 load。 */
  readonly rect: Rect | null;
  /** 扩工作区域到包含 rect：新增部分从叶 tile 装载（program region-load）。W₀ 只在有 program 要它时才同步维护。 */
  load(rect: Rect): void;
  /** 状态纹理（A / ā / release / field / coverage）：借自 FBO 池，dispose 归还。 */
  alloc(w: number, h: number, format: RegionTexFormat): RegionTex;
  /** 唯一算子。program 必须在枚举内且已登记 CPU 孪生；dst 与 inputs 不得是同一张纹理（读写冲突 → throw）。 */
  run(program: RegionProgramId, dst: RegionTarget, inputs: RegionInputs, uniforms?: RegionUniforms): void;
  /** 当前 W 作为 overlay（每帧显示 + 收口提交都用它）。 */
  overlay(): RegionOverlayInput;
  /** 归还全部 FBO / 纹理；之后任何调用 throw。 */
  dispose(): void;
  // ---- StrokeTarget 面（§2b；液化并存期用；GPU 手指 / wash 不调这两个 ImageData 方法）----
  readonly bboxX: number; readonly bboxY: number; readonly bboxW: number; readonly bboxH: number;
  getImageData(docX: number, docY: number, w: number, h: number): ImageData;   // readPixels 慢路径，仅兼容
  putImageData(docX: number, docY: number, img: ImageData): void;              // upload 慢路径，仅兼容
}

// ============================================================================
// 2b. filters.ts / smudge-engine.ts —— 写靶改名 + 预览宿声明
//     user 2026-09-18：「反正别叫Layer, brushlayer也改名，如果语义一样那么改一样的名字」
//     BrushLayer（filters.ts）与 SmudgeLayer（smudge-engine.ts）语义相同 = 一笔期间的像素写靶（运行时 = StrokeShadow 替身，
//     不是图层树节点）→ 合并为 StrokeTarget，字段取并集；StrokeShadow 已全部实现。
// ============================================================================

export interface StrokeTarget {
  readonly docW: number;
  readonly docH: number;
  readonly bboxX: number; readonly bboxY: number; readonly bboxW: number; readonly bboxH: number;
  getImageData(docX: number, docY: number, w: number, h: number): ImageData;
  putImageData(docX: number, docY: number, img: ImageData): void;
}
// Filter 笔契约（filters.ts）改动只此三行：
//   strokePreview?: "shadow" | "region";        // 缺省 shadow（液化现状）；手指 / 模糊 / 锐化 声明 "region"
//   beginBrushStroke?(targets: readonly StrokeTarget[], params, brushSettings, selection, x, y, p): ColorBrushState;   // layers → targets
//   （BrushLayer 类型删除；SmudgeLayer 类型删除）
// filter-brush.ts BrushFilter.beginBrushStroke(targets: readonly ViewLeaf[] …) 同步改 targets；stroke-session.ts 的 `targets` 字段已是这个名。

// ============================================================================
// 3. backend/gl/gl-room.ts / blend-glsl.ts —— overlay 第三成员 + replace 模式（改动只此两处）
// ============================================================================

// export type OverlayInput = StampOverlayInput | FillOverlayInput | RegionOverlayInput;
// compositeFragSource(mode, "overlay", overlayMode: BlendMode | "replace")
//   replace：bbox 内 srcA = ov.a, Cs = ov.rgb（直值直出）；bbox 外 = base。soft-shaders makeComposite 同分支。

// ============================================================================
// 4. backend/stroke-session.ts —— 预览宿第四种：region（GPU 驻留，收口走 bakeStamps）
// ============================================================================

// export type StrokePreview = "overlay" | "livesync" | "shadow" | "region";
export interface StrokeSessionDepsAddition {
  /** board.commitRegion —— = RasterService.bakeStamps(leafId, pixels, regionOverlay, …)，在令牌内；true = 已落层 */
  commitRegion(ov: RegionOverlayInput): boolean;
  /** board.setRegionOverlay —— 描边期每帧把 W 当 overlay 喂 GlRoom；null = 关 */
  setRegionOverlay(ov: RegionOverlayInput | null): void;
  /** 造 RegionStroke 的工厂（board 持 GlRoom；无 WebGL2 / 无 floatColorBuffer → throw，响亮不可用） */
  openRegion(leafId: number, pixels: LayerPixels): RegionStroke;
}
// StrokeSession 在 preview === "region" 时：targets = [RegionStroke]（单叶）；end() → commitRegion(region.overlay()) → token.commit → dispose；
// cancel() → dispose（真层从未被写，零回滚）。

// ============================================================================
// 5. plugins/smudge-engine.ts —— 公共面不变，层面换成 RegionStroke（精确翻译，SmudgeSettings 一字不改）
// ============================================================================

export declare class SmudgeEngine {
  beginStroke(region: RegionStroke, settings: SmudgeSettings, x: number, y: number, pressure: number, selection: SmudgeSelection | null): void;
  extendStroke(x: number, y: number, pressure: number): void;
  endStroke(): void;
  cancelStroke(): void;
  flushDirty(): Rect | null;
}
// 每 dab（= 现 _dab 的 1)–4)）：region-window → smudge-mask → {smudge-absorb | reduce-weighted×2 (+ box3 + upsample-bilinear)} → smudge-deposit(scissor = 窗口)。
// 精度：W straight u8（逐 dab 量化 = CPU ImageData 语义）；A / ā / cur / mask / release = f32；混色三档 = color-mix.ts 原式（CPU 孪生复用同一实现）。
// 验收：旧 CPU 引擎录 golden 夹具 → SoftGl2Port 新引擎 ±2/255 → gl-smoke（SwiftShader）对 SoftGl ±ε。

// ============================================================================
// 6. 明确不动
// ============================================================================
// Gl2Port（含 FBOPrec / TexUploadFormat）、GlRoom 其余、RasterService.bakeStamps 签名、GLStampRasterizer、
// Filter 笔契约的四个方法形状（只改名 layers→targets + 加 strokePreview，见 §2b）、FilterBrushEngine、SmudgeSettings、
// liquify-engine.ts（第三批另案；只跟着吃 StrokeTarget 改名）。
// 浮点 FBO：要求 caps.floatColorBuffer（EXT_color_buffer_float）；缺席 = 手指族动词提示不可用（一条 caps 守卫，不做 SoftGl 回退；
//   逃生口 = f32 打包 RGBA8，记录在案不做）——**待 user 点头**（doc §3.7）。

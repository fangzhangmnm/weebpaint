// smudge-engine —— 手指 / 涂抹引擎（**GPU 区域程序版**，2026-09-18 Claude Fable 5.1 逐 dab 精确翻译自 09-05 的 CPU 版；
//   CPU 版最后形态 = git a700fad（golden fixture 录自它）；提案 ai-docs/20260918-region-programs-formalism-and-gpu-contract.md）。
// user 拍板：「先做已有的的数学形式化，以后做创新。目的是一个很窄的gpu的接口加速」「逐 dab 精确翻译 同意」。
//   → 数学一字不改（SmudgeSettings 字段不动，手感数字不动）；每颗 dab 变成 4–13 个 RegionStroke.run；
//     验收 = test/smudge-golden.test.mjs：对旧 CPU 引擎录的 27 用例 fixture ±2/255（差异只来自 f64→f32、sRGB LUT vs pow、归约求和顺序）。
//
// 模型（每颗 dab；「块」= 以 round(cx),round(cy) 为中心的 B×B **整数**窗口，Accum 与它逐像素对齐——整数位移 → 零重采样）：
//   1) 记忆：Accum = mix(cur, Accum, ρ)，ρ = (s^MEMORY_EXP)^(step/D)（smear/dull）或 exp(−(step/D)/L)（paint 带 memoryLength）。
//      smear 的 Accum 是一整块（带纹理，才有 drag lines）；dull 的 Accum 是一个颜色（mask 加权平均）。
//   2) 出料：P = Accum（smear）/ Accum 色（dull）/ 多分辨率块（dull 中段）；paint 再 mix(P, 画笔色, colorRate·压感) 与稀释。
//   3) 上色：cur' = mix(cur, P, M·s)，M = 圆/软边 falloff × 选区；混色走三档空间。lockAlpha：只混颜色不动 alpha。
//   4) 写回 W（straight u8，逐 dab 量化 = 旧 CPU ImageData 语义）+ dirty。首颗 dab：Accum ← cur（先「沾」），不上色。
//   强度 s = strength × signedLerp(flowCoeff, p^γ) × signedLerp(opaCoeff, p^γ)；半径 r = size/2 × signedLerp(sizeCoeff, p^γ)。
//   footprint 夹 doc 边界（颜料可拖出内容框）。全程 premult：透明像素 RGB 永不参与。
//
// GPU 落法（program 名见 backend/gl/region-programs.ts；每个都有 CPU 孪生，SoftGl2Port 上可全量跑）：
//   region-crop → cur；smudge-mask → mask；[reduce-weighted×2 → reduce-sum×2 → divide → avg]（dull>0 或稀释）；
//   [smudge-absorb 1×1 → accumColor]（dull>0）；[smudge-absorb B×B → accum]（dull<1 且 ρ<1）；
//   [reduce-weighted×2 k×k → box3 → upsample-bilinear → release]（0<dull<1）；smudge-deposit → W（scissor = 裁过 doc 的窗口）。
//   状态纹理全 f32（ρ≈1 时 f16 会冻住记忆），W u8。写靶 = RegionStroke（一笔一个，session 造、session 销）。
// 性能：dab 数 × 4–13 draw；大手指的 B² 像素成本从 CPU 上消失（本轮目标场景，总账 #42）。小手指 2% 间距的 draw 数待真机计时。

import { makePressureShaper, type PressureShaper } from "../common/pressure-curve.ts";
import type { AnimCurve } from "../common/anim-curve.ts";
import type { MixSpace } from "../backend/algorithms/color-mix.ts";
import type { RegionStroke, RegionTex, RegionUniforms } from "../backend/gl/region-stroke.ts";

export type SmudgeMode = "smear" | "dull" | "paint";

export interface SmudgeSettings {
  mode: SmudgeMode;
  dull: number;          // 0..1 smear↔dull 连续量：0 = 搬块（smear），1 = 揉平均色（dull），中间 = 多分辨率出料（2026-09-06 handoff §3-C）
  size: number;          // dab 直径（p=1 时，doc px）
  hardness: number;      // 0..1（硬芯比例）
  spacing: number;       // dab 间距 = 直径 × spacing
  strength: number;      // 0..1 基础强度（= flow × opacity × 每笔 pull；压感在引擎里叠）
  sizeCoeff: number;     // 压感→尺寸（signedLerp，同 brush.ts）
  flowCoeff: number;     // 压感→强度（滤镜笔预设把压感写在 flowCoeff 上；2026-09-05 user「对强度需要有压感一定要有」）
  opaCoeff: number;      // 压感→强度（第二乘子，同画笔 opa_mul）
  pressureGamma: number;
  pressureCurve?: AnimCurve | null;   // 2026-09-05 可选压感曲线（有则替代 gamma）
  colorRate: number;     // paint 模式：每 dab 掺入画笔色的比例（0..1）；引擎再乘压感 s_p（handoff §3-A）
  dilution?: number;     // paint 模式：稀释 0..1（缺省 0 = 现状；handoff §3-B）
  memoryLength?: number; // paint 模式：湿色记忆长度（直径数，>0 → 解耦记忆律；缺省/0 = 沿用 s³ 律；handoff §3-D）
  color: readonly [number, number, number];   // 画笔色 straight sRGB 0..1
  mix: MixSpace;
  lockAlpha: boolean;
}

type Rect = [number, number, number, number];   // x0,y0,x1,y1（x1/y1 exclusive）
const SPACE_INDEX: Record<MixSpace, number> = { srgb: 0, oklab: 1, spectral: 2 };
const REDUCE_N = 16;   // 全平均的第一级归约格数（两级：B → 16×16 → 1）

interface StrokeState {
  rs: RegionStroke;
  s: SmudgeSettings;
  pShape: PressureShaper;
  Rmax: number;
  B: number;
  half: number;
  space: number;
  cur: RegionTex;
  mask: RegionTex;
  accum: [RegionTex, RegionTex]; ai: number;      // ping-pong：accum[ai] = 当前读
  color: [RegionTex, RegionTex]; ci: number;      // accumColor 1×1 ping-pong
  avg: RegionTex;                                  // 本 dab 的 mask 加权平均（1×1）
  sumN: RegionTex; wN: RegionTex; sum1: RegionTex; w1: RegionTex;
  release: RegionTex | null;
  cellK: number; cellSum: RegionTex | null; cellW: RegionTex | null; box: RegionTex | null;
  paint: [number, number, number, number];
  primed: boolean;
  lastX: number; lastY: number;
  pendingDist: number;
  dirty: Rect | null;
}

// signed_lerp（同 brush.ts）：coeff ∈ [−1,1]，p ∈ [0,1] → [1−|coeff|, 1]
function signedLerp(coeff: number, p: number): number {
  const amp = 1 - Math.abs(coeff);
  return coeff >= 0 ? amp + (1 - amp) * p : 1 + (amp - 1) * p;
}
const clamp01 = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v);
const MEMORY_EXP = 3;   // 每直径残留 = s^MEMORY_EXP（手感数字，user 09-05「别的 app 没有先不要画蛇添足」记忆不封顶）
const PAINT_PRESSURE_COLOR_RATE = true;   // handoff §3-A：paint 掺色率吃压感（作者出厂开）
const PAINT_PRESSURE_DILUTION = false;    // handoff §3-A：稀释吃压感（作者出厂关；要不要暴露开关归 user）

export class SmudgeEngine {
  private _st: StrokeState | null = null;

  /** 起笔。rs = 本笔的 RegionStroke（session 造；选区平面与 lockAlpha 都在它身上）。 */
  beginStroke(rs: RegionStroke, settings: SmudgeSettings, x: number, y: number, pressure: number): void {
    const Rmax = Math.max(0.5, settings.size / 2);
    const B = Math.ceil(2 * Rmax) + 2;
    const f32 = "rgba-f32" as const;
    const st: StrokeState = {
      rs, s: settings, pShape: makePressureShaper(settings), Rmax, B, half: Math.floor(B / 2),
      space: SPACE_INDEX[settings.mix] ?? 0,
      cur: rs.alloc(B, B, f32), mask: rs.alloc(B, B, f32),
      accum: [rs.alloc(B, B, f32), rs.alloc(B, B, f32)], ai: 0,
      color: [rs.alloc(1, 1, f32), rs.alloc(1, 1, f32)], ci: 0,
      avg: rs.alloc(1, 1, f32),
      sumN: rs.alloc(REDUCE_N, REDUCE_N, f32), wN: rs.alloc(REDUCE_N, REDUCE_N, f32), sum1: rs.alloc(1, 1, f32), w1: rs.alloc(1, 1, f32),
      release: null, cellK: 0, cellSum: null, cellW: null, box: null,
      paint: [settings.color[0], settings.color[1], settings.color[2], 1],
      primed: false,
      lastX: x, lastY: y, pendingDist: 0, dirty: null,
    };
    this._st = st;
    this._dab(st, x, y, pressure, 0);
  }

  extendStroke(x: number, y: number, pressure: number): void {
    const st = this._st;
    if (!st) return;
    const dx = x - st.lastX, dy = y - st.lastY;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0) return;
    const r = this._radius(st, pressure);
    const step = Math.max(1, 2 * r * Math.max(0.01, st.s.spacing));
    st.pendingDist += dist;
    if (st.pendingDist < step) { st.lastX = x; st.lastY = y; return; }
    const ux = dx / dist, uy = dy / dist;
    let placed = step - (st.pendingDist - dist);   // 本段内第一颗 dab 的位置
    const sx = st.lastX, sy = st.lastY;
    // 每颗 dab 都恰好落在「距上颗 step」处（pendingDist 是上颗以来累计的笔程），故记忆用的 step 就是 step。
    while (placed <= dist) {
      this._dab(st, sx + ux * placed, sy + uy * placed, pressure, step);
      placed += step;
    }
    st.pendingDist = dist - (placed - step);
    st.lastX = x; st.lastY = y;
  }

  endStroke(): void { this._st = null; }
  cancelStroke(): void { this._st = null; }

  flushDirty(): Rect | null {
    const st = this._st;
    if (!st) return null;
    const d = st.dirty;
    st.dirty = null;
    return d;
  }

  private _radius(st: StrokeState, pressure: number): number {
    const pc = st.pShape(pressure);
    return Math.max(0.5, st.Rmax * signedLerp(st.s.sizeCoeff || 0, pc));
  }

  // 本 dab 的 mask 加权平均（src 按 mask 加权）→ dst（1×1）：两级归约 + 除法（镜像旧 _weightedAverage）。
  private _average(st: StrokeState, src: RegionTex, dst: RegionTex): void {
    const rs = st.rs, B = st.B;
    rs.run("reduce-weighted", st.sumN, { u_src: src, u_mask: st.mask }, { u_size: [REDUCE_N, REDUCE_N], u_B: B, u_which: 0 });
    rs.run("reduce-weighted", st.wN, { u_src: src, u_mask: st.mask }, { u_size: [REDUCE_N, REDUCE_N], u_B: B, u_which: 1 });
    rs.run("reduce-sum", st.sum1, { u_src: st.sumN }, { u_srcSize: [REDUCE_N, REDUCE_N] });
    rs.run("reduce-sum", st.w1, { u_src: st.wN }, { u_srcSize: [REDUCE_N, REDUCE_N] });
    rs.run("divide", dst, { u_sum: st.sum1, u_w: st.w1 });
  }

  // 多分辨率出料（handoff §3-C，镜像旧 _multiRes）：Accum 按 k×k 格 mask 加权平均 → 活格 3×3 盒滤 → 双线性放大回 B×B → release。
  private _multiRes(st: StrokeState, dullK: number): void {
    const rs = st.rs, B = st.B;
    const k = Math.max(2, Math.min(B - 1, Math.round(Math.pow(B, 1 - dullK))));
    if (st.cellK !== k || !st.cellSum || !st.cellW || !st.box) {
      st.cellK = k;
      st.cellSum = rs.alloc(k, k, "rgba-f32"); st.cellW = rs.alloc(k, k, "rgba-f32"); st.box = rs.alloc(k, k, "rgba-f32");
    }
    if (!st.release) st.release = rs.alloc(B, B, "rgba-f32");
    const acc = st.accum[st.ai];
    rs.run("reduce-weighted", st.cellSum, { u_src: acc, u_mask: st.mask }, { u_size: [k, k], u_B: B, u_which: 0 });
    rs.run("reduce-weighted", st.cellW, { u_src: acc, u_mask: st.mask }, { u_size: [k, k], u_B: B, u_which: 1 });
    rs.run("box3", st.box, { u_sum: st.cellSum, u_w: st.cellW }, { u_size: [k, k] });
    rs.run("upsample-bilinear", st.release, { u_box: st.box, u_w: st.cellW, u_mask: st.mask }, { u_size: [B, B], u_k: k });
  }

  // 一颗 dab。step = 距上颗 dab 的笔程（首颗 0）。顺序 = 旧 _dab 的 1)–4)。
  private _dab(st: StrokeState, cx: number, cy: number, pressure: number, step: number): void {
    const s0 = st.s, rs = st.rs;
    const pc = st.pShape(pressure);
    const r = Math.max(0.5, st.Rmax * signedLerp(s0.sizeCoeff || 0, pc));
    const strength = clamp01(s0.strength * signedLerp(s0.flowCoeff || 0, pc) * signedLerp(s0.opaCoeff || 0, pc));
    const B = st.B;
    const ox = Math.round(cx) - st.half, oy = Math.round(cy) - st.half;   // 窗口原点（doc 坐标）
    const docW = rs.docW, docH = rs.docH;
    const x0 = Math.max(0, ox), y0 = Math.max(0, oy);
    const x1 = Math.min(docW, ox + B), y1 = Math.min(docH, oy + B);
    if (x1 <= x0 || y1 <= y0) return;   // 整块在 doc 外：手指悬空，什么都不发生（Accum 保持）
    const win: RegionUniforms = { u_size: [B, B], u_origin: [ox, oy], u_docSize: [docW, docH] };
    // 读块（premult f32）+ 算 mask
    rs.run("region-crop", st.cur, { u_W: "W" }, win);
    const innerR = Math.max(0, Math.min(0.999, s0.hardness)) * r;
    const sel = rs.selection;
    rs.run("smudge-mask", st.mask, sel ? { u_sel: "selection" } : {}, {
      ...win, u_center: [cx, cy], u_r: r, u_innerR: innerR,
      u_hasSel: sel ? 1 : 0, u_selOrigin: sel ? [sel.ox, sel.oy] : [0, 0], u_selSize: sel ? [sel.ow, sel.oh] : [1, 1],
    });
    const mode = s0.mode;
    const space = st.space;
    // smear↔dull 连续量（旧 settings 无 dull 字段 → 按 mode 二值；NaN 防御）
    const dullK = clamp01(Number.isFinite(s0.dull) ? s0.dull : (mode === "dull" ? 1 : 0));
    if (!st.primed) {
      // 首颗：沾色，不上色（两份记忆都沾：块 + 平均色，旋钮中途拧也有料）
      rs.run("region-crop", st.accum[st.ai], { u_W: "W" }, win);
      this._average(st, st.cur, st.color[st.ci]);
      st.primed = true;
      return;
    }
    // 1) 记忆更新：smear/dull ρ = (s³)^(step/D)；paint 带 memoryLength 时 ρ = exp(−(step/D)/L)（handoff §3-D 解耦）
    const D = 2 * r;
    const memL = mode === "paint" && Number.isFinite(s0.memoryLength) && (s0.memoryLength as number) > 0 ? (s0.memoryLength as number) : 0;
    const rho = memL > 0
      ? Math.exp(-(Math.max(0, step) / D) / memL)
      : (strength >= 1 ? 1 : strength <= 0 ? 0 : Math.pow(strength, MEMORY_EXP * Math.max(0, step) / D));
    const dil = mode === "paint" ? clamp01(Number.isFinite(s0.dilution) ? (s0.dilution as number) : 0) : 0;
    const dilEff = PAINT_PRESSURE_DILUTION ? 1 - pc * (1 - dil) : dil;
    if (dullK > 0 || dilEff > 0) this._average(st, st.cur, st.avg);
    if (dullK > 0) {
      const ni = 1 - st.ci;
      rs.run("smudge-absorb", st.color[ni], { u_A: st.color[st.ci], u_cur: st.avg },
        { u_size: [1, 1], u_origin: [0, 0], u_docSize: [docW, docH], u_clip: 0, u_space: space, u_rho: rho });
      st.ci = ni;
    }
    if (dullK < 1 && rho < 1) {
      // 只更新窗口内落在 doc 里的像素（doc 外 cur=0：手指探出画布不「沾」到透明）→ u_clip=1
      const ni = 1 - st.ai;
      rs.run("smudge-absorb", st.accum[ni], { u_A: st.accum[st.ai], u_cur: st.cur },
        { ...win, u_clip: 1, u_space: space, u_rho: rho });
      st.ai = ni;
    }
    if (strength <= 0) return;
    // 2)+3) 出料 + 上色
    const colorRate = mode === "paint" ? clamp01(s0.colorRate) * (PAINT_PRESSURE_COLOR_RATE ? pc : 1) : 0;   // §3-A 压感反向
    if (dullK > 0 && dullK < 1) this._multiRes(st, dullK);                                                        // §3-C 中段出料块
    const Psel = dullK >= 1 ? 1 : dullK <= 0 ? 0 : 2;
    const P = Psel === 1 ? st.color[st.ci] : Psel === 0 ? st.accum[st.ai] : st.release!;
    rs.run("smudge-deposit", "W", { u_cur: st.cur, u_mask: st.mask, u_P: P, u_avg: st.avg }, {
      u_docSize: [docW, docH], u_origin: [ox, oy],
      u_strength: strength, u_colorRate: colorRate, u_dilEff: dilEff,
      u_lock: s0.lockAlpha ? 1 : 0, u_space: space, u_Psel: Psel, u_paint: st.paint,
    }, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    // 4) dirty（CPU 版只在真有像素被处理时标；这里按裁过 doc 的窗口标——多报无害，golden 契约 = ⊇）
    const dr = st.dirty;
    if (!dr) st.dirty = [x0, y0, x1, y1];
    else { dr[0] = Math.min(dr[0], x0); dr[1] = Math.min(dr[1], y0); dr[2] = Math.max(dr[2], x1); dr[3] = Math.max(dr[3], y1); }
  }
}

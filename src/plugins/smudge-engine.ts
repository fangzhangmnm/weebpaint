// smudge-engine —— 手指 / 涂抹引擎（CPU，premult float；路线 = GIMP 形持久 Accum + 按笔程归一的记忆）。
// created 2026-09-05 by Claude Fable 5.1。数学考古与候选比较：ai-docs/20260905-smudge-math-survey.md §3 / §5。
// user 2026-09-05 拍板：先 CPU prototype；需求 ①②③④⑦ 同一引擎（手指 = colorRate 0，带颜料的手指 = paint 模式）。
//
// 模型（每颗 dab；「块」= 以 round(cx),round(cy) 为中心的 B×B **整数**窗口，Accum 与它逐像素对齐——
//   整数位移 → 零重采样，不会像逐 dab bilinear 那样越拖越糊；亚像素运动被量化到整像素，spacing ≥ 1px 时看不出）：
//   1) 记忆：Accum = mix(cur, Accum, ρ)，ρ = (s^MEMORY_EXP)^(step/D)。s = 本 dab 强度，step = 距上颗 dab 的笔程，
//      D = dab 直径 → 「走过一个直径后旧颜料还剩 s³」：满强度 = 永不衰减的纯拖（drag lines），半强度 ≈ 12% = 柔和揉。
//      按笔程归一使手感与 spacing 解耦（MyPaint/GIMP 是每 dab 衰减，见 survey §3.2 坑）。MEMORY_EXP=3 是首版手感数字
//      （对照：MyPaint 常用 smudge_length 0.5 × spacing 25% ≈ 每直径 6%，GIMP rate 50% × spacing 20% ≈ 3%）。
//      smear 的 Accum 是一整块（带纹理，才有 drag lines）；dull 的 Accum 是一个颜色（mask 加权平均）。
//   2) 出料：P = Accum（smear）/ Accum 色（dull）/ mix(Accum, 画笔色, colorRate)（paint，带颜料的手指）。
//   3) 上色：cur' = mix(cur, P, M·s)，M = 圆/软边 falloff（与 gl-stamp 同式）× 选区 mask；mix 走 color-mix 的混色空间。
//      lockAlpha：只混颜色不动 alpha（cur.a = 0 的像素恒不动）。
//   4) 写回 + dirty。
//   首颗 dab：Accum ← cur（手指先「沾」上画布），不上色。
// 强度 s = strength × signedLerp(flowCoeff, p^γ) × signedLerp(opaCoeff, p^γ)；半径 r = size/2 × signedLerp(sizeCoeff, p^γ)（与 brush.ts 同式）。
// footprint 夹 **doc 边界**，不夹 layer.bbox——颜料要能拖出内容框（同液化 tile era 的结论；tile 按需分配，写哪都行）。
// 全程 premult：透明像素 RGB 永不参与（黑边病根的反面）。
//
// 2026-09-06 湿画笔补全（ai-docs/20260906-wet-brush-completion-handoff.md，user「回到混色，123 同意」；clean-room：本实现只读 handoff）：
//   A) paint 压感反向：colorRate_eff = colorRate × s_p（轻按只揉、重按落色）；稀释反向默认关（PAINT_PRESSURE_DILUTION）。
//   B) 稀释 dilution（paint）：出料 P 上色前整体 × (1 − d·(1 − ā))，ā = 本 dab mask 加权的画布 alpha → 透明处画不上、半透明按比例。
//   C) 多分辨率出料（三 variant 共用「揉匀」中段）：k = round(B^(1−dull)) ∈ [2, B−1]，Accum 按 k×k 格 mask 加权 premult 平均
//      （无 mask 像素 = 死格）→ 活格 3×3 盒滤 → 双线性放大回 B×B。两端不变：dull=0 块、dull=1 单色（accumColor 回归一致）。
//   D) 记忆解耦（paint）：ρ = exp(−(step/D)/L)，L = memoryLength（直径数，1/e 衰减）；smear/dull 仍 ρ = (s³)^(step/D)。
//
// 性能（CPU）：每 dab B² 像素 × 一次 mix（smear 再 + 一次记忆 mix）。srgb 档 = 4 mul-add/px；oklab/spectral 档
//   每像素十几个超越函数，大笔会慢——这是「先 CPU 原型」的已知代价，GPU 契约等手感定了再看（survey §5 候选 B）。

import { makePressureShaper, type PressureShaper } from "../common/pressure-curve.ts";
import type { AnimCurve } from "../common/anim-curve.ts";
import { mixPremultInto, type MixSpace } from "../backend/algorithms/color-mix.ts";

export interface SmudgeLayer {
  docW: number;
  docH: number;
  getImageData(docX: number, docY: number, w: number, h: number): ImageData;
  putImageData(docX: number, docY: number, img: ImageData): void;
}
export interface SmudgeSelection {
  materializeMaskRegion(x0: number, y0: number, w: number, h: number): Uint8Array;   // gray8
}
export type SmudgeMode = "smear" | "dull" | "paint";

export interface SmudgeSettings {
  mode: SmudgeMode;
  dull: number;          // 0..1 smear↔dull 连续量：0 = 搬块（smear），1 = 揉平均色（dull），中间 = 多分辨率出料（2026-09-06 handoff §3-C；旧版 lerp 两端）
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

interface StrokeState {
  layer: SmudgeLayer;
  s: SmudgeSettings;
  pShape: PressureShaper;   // 压感整形（begin 烤一次）
  selection: SmudgeSelection | null;
  Rmax: number;
  B: number;                 // 窗口边长（整数）
  half: number;              // floor(B/2)：窗口原点 = round(c) − half
  accum: Float32Array;       // smear：B×B premult；dull/paint-dull 不用（用 accumColor）
  accumColor: Float32Array;  // dull：一个 premult 颜色
  paint: Float32Array;       // paint 模式的画笔色（premult，α=1）
  cur: Float32Array;         // 本 dab 的画布块（B×B premult；doc 外 = 0）
  mask: Float32Array;        // 本 dab 的 M（B×B）
  tmp: Float32Array;         // 4 floats scratch
  avg: Float32Array;         // 本 dab mask 加权的画布平均色（premult；alpha 分量 = ā）
  release: Float32Array;     // 多分辨率出料块（B×B premult）
  cellK: number;             // 多分辨率格数缓存（k 变了重分配）
  cellSum: Float32Array | null; cellW: Float32Array | null; cellBox: Float32Array | null; cellLive: Uint8Array | null; cellBoxLive: Uint8Array | null;
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
const MEMORY_EXP = 3;   // 每直径残留 = s^MEMORY_EXP（手感数字，见文件头）
const PAINT_PRESSURE_COLOR_RATE = true;   // handoff §3-A：paint 掺色率吃压感（作者出厂开）
const PAINT_PRESSURE_DILUTION = false;    // handoff §3-A：稀释吃压感（作者出厂关；要不要暴露开关归 user）

export class SmudgeEngine {
  private _st: StrokeState | null = null;

  beginStroke(layer: SmudgeLayer, settings: SmudgeSettings, x: number, y: number, pressure: number, selection: SmudgeSelection | null): void {
    const Rmax = Math.max(0.5, settings.size / 2);
    const B = Math.ceil(2 * Rmax) + 2;
    const n = B * B;
    const st: StrokeState = {
      layer, s: settings, pShape: makePressureShaper(settings), selection, Rmax, B, half: Math.floor(B / 2),
      accum: new Float32Array(n * 4),   // 2026-09-05 连续 dull：块记忆恒分配（旋钮中途拧到 <1 也有料）
      accumColor: new Float32Array(4),
      paint: new Float32Array([settings.color[0], settings.color[1], settings.color[2], 1]),
      cur: new Float32Array(n * 4),
      mask: new Float32Array(n),
      tmp: new Float32Array(4),
      avg: new Float32Array(4),
      release: new Float32Array(n * 4),
      cellK: 0, cellSum: null, cellW: null, cellBox: null, cellLive: null, cellBoxLive: null,
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

  // 一颗 dab。step = 距上颗 dab 的笔程（首颗 0）。
  private _dab(st: StrokeState, cx: number, cy: number, pressure: number, step: number): void {
    const s0 = st.s;
    const pc = st.pShape(pressure);
    const r = Math.max(0.5, st.Rmax * signedLerp(s0.sizeCoeff || 0, pc));
    const strength = clamp01(s0.strength * signedLerp(s0.flowCoeff || 0, pc) * signedLerp(s0.opaCoeff || 0, pc));
    const B = st.B;
    const ox = Math.round(cx) - st.half, oy = Math.round(cy) - st.half;   // 窗口原点（doc 坐标）
    const { docW, docH } = st.layer;
    const x0 = Math.max(0, ox), y0 = Math.max(0, oy);
    const x1 = Math.min(docW, ox + B), y1 = Math.min(docH, oy + B);
    if (x1 <= x0 || y1 <= y0) return;   // 整块在 doc 外：手指悬空，什么都不发生（Accum 保持）
    const w = x1 - x0, h = y1 - y0;
    const img = st.layer.getImageData(x0, y0, w, h);
    const d = img.data;
    const cur = st.cur, mask = st.mask;
    cur.fill(0);
    // 读块（premult float）+ 算 mask
    const innerR = Math.max(0, Math.min(0.999, s0.hardness)) * r;
    const decay = r - innerR;
    let sel: Uint8Array | null = null;
    if (st.selection) sel = st.selection.materializeMaskRegion(x0, y0, w, h);
    mask.fill(0);
    for (let j = 0; j < h; j++) {
      const py = y0 + j;
      const wy = py - oy;
      for (let i = 0; i < w; i++) {
        const px = x0 + i;
        const wx = px - ox;
        const k = (j * w + i) * 4;
        const q = wy * B + wx;
        const a = d[k + 3] / 255;
        cur[q * 4] = (d[k] / 255) * a; cur[q * 4 + 1] = (d[k + 1] / 255) * a; cur[q * 4 + 2] = (d[k + 2] / 255) * a; cur[q * 4 + 3] = a;
        const ddx = px + 0.5 - cx, ddy = py + 0.5 - cy;
        const dist = Math.hypot(ddx, ddy);
        if (dist >= r) continue;
        let m = 1;
        if (decay > 0 && dist > innerR) { const u = (dist - innerR) / decay; m = 1 - u * u * (3 - 2 * u); }
        if (sel) m *= sel[j * w + i] / 255;
        mask[q] = m;
      }
    }
    const mode = s0.mode;
    const space = s0.mix;
    const n = B * B;
    // smear↔dull 连续量（旧 settings 无 dull 字段 → 按 mode 二值；NaN 防御）
    const dullK = clamp01(Number.isFinite(s0.dull) ? s0.dull : (mode === "dull" ? 1 : 0));
    if (!st.primed) {
      // 首颗：沾色，不上色（两份记忆都沾：块 + 平均色，旋钮中途拧也有料）
      st.accum.set(cur);
      this._weightedAverage(cur, mask, n, st.accumColor);
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
    if (dullK > 0 || dilEff > 0) this._weightedAverage(cur, mask, n, st.avg);
    if (dullK > 0) mixPremultInto(st.accumColor, 0, st.avg, 0, st.accumColor, 0, rho, space);
    if (dullK < 1 && rho < 1) {
      const acc = st.accum;
      for (let q = 0; q < n; q++) {
        const o = q * 4;
        // 只更新窗口内落在 doc 里的像素（doc 外 cur=0：手指探出画布不「沾」到透明）
        const wx = q % B, wy = (q - wx) / B;
        const px = ox + wx, py = oy + wy;
        if (px < x0 || px >= x1 || py < y0 || py >= y1) continue;
        mixPremultInto(acc, o, cur, o, acc, o, rho, space);
      }
    }
    if (strength <= 0) return;
    // 2)+3) 出料 + 上色
    const tmp = st.tmp;
    const lock = s0.lockAlpha;
    const colorRate = mode === "paint" ? clamp01(s0.colorRate) * (PAINT_PRESSURE_COLOR_RATE ? pc : 1) : 0;   // §3-A 压感反向
    const dilF = dilEff > 0 ? 1 - dilEff * (1 - clamp01(st.avg[3])) : 1;                                       // §3-B 稀释系数
    if (dullK > 0 && dullK < 1) this._multiRes(st, dullK);                                                        // §3-C 中段出料块
    let dirty = false;
    for (let j = 0; j < h; j++) {
      const wy = y0 + j - oy;
      for (let i = 0; i < w; i++) {
        const wx = x0 + i - ox;
        const q = wy * B + wx;
        const m = mask[q];
        if (m <= 0) continue;
        const a = m * strength;
        const o = q * 4;
        const ca = cur[o + 3];
        if (lock && ca <= 0) continue;
        // 出料 P
        let P: Float32Array, pi: number;
        if (dullK >= 1) { P = st.accumColor; pi = 0; }
        else if (dullK <= 0) { P = st.accum; pi = o; }
        else { P = st.release; pi = o; }   // 中段 = 多分辨率出料（handoff §3-C；旧版是块与平均色 lerp）
        if (colorRate > 0) { mixPremultInto(tmp, 0, P, pi, st.paint, 0, colorRate, space); P = tmp; pi = 0; }
        if (dilF < 1) {   // 稀释：出料四通道同乘（保持 premult）
          if (P !== tmp) { tmp[0] = P[pi]; tmp[1] = P[pi + 1]; tmp[2] = P[pi + 2]; tmp[3] = P[pi + 3]; P = tmp; pi = 0; }
          tmp[0] *= dilF; tmp[1] *= dilF; tmp[2] *= dilF; tmp[3] *= dilF;
        }
        // 上色（写进 cur 就地）
        mixPremultInto(cur, o, cur, o, P, pi, a, space);
        const k = (j * w + i) * 4;
        let na = cur[o + 3];
        let nr = cur[o], ng = cur[o + 1], nb = cur[o + 2];
        if (lock) {
          // 只混颜色：去预乘再按原 alpha 重预乘
          if (na > 1e-6) { const f = ca / na; nr *= f; ng *= f; nb *= f; }
          else { nr = ng = nb = 0; }
          na = ca;
        }
        // premult → straight 字节（ImageData 是 straight）
        if (na <= 1e-6) { d[k] = 0; d[k + 1] = 0; d[k + 2] = 0; d[k + 3] = 0; }
        else {
          d[k] = Math.round((nr / na) * 255); d[k + 1] = Math.round((ng / na) * 255); d[k + 2] = Math.round((nb / na) * 255);
          d[k + 3] = Math.round(na * 255);
        }
        dirty = true;
      }
    }
    if (!dirty) return;
    st.layer.putImageData(x0, y0, img);
    const dr = st.dirty;
    if (!dr) st.dirty = [x0, y0, x1, y1];
    else { dr[0] = Math.min(dr[0], x0); dr[1] = Math.min(dr[1], y0); dr[2] = Math.max(dr[2], x1); dr[3] = Math.max(dr[3], y1); }
  }

  // 多分辨率出料（handoff §3-C）：Accum 按 k×k 格 mask 加权 premult 平均 → 活格 3×3 盒滤 → 双线性放大回 B×B 进 st.release。
  //   死格（无 mask 像素）不进平均；盒滤只数活格（死格自身也拿邻活格均值，双线性时邻格有料）；透明像素 RGB 全程 premult。
  private _multiRes(st: StrokeState, dullK: number): void {
    const B = st.B, n = B * B;
    const k = Math.max(2, Math.min(B - 1, Math.round(Math.pow(B, 1 - dullK))));
    if (st.cellK !== k || !st.cellSum) {
      st.cellK = k;
      st.cellSum = new Float32Array(k * k * 4); st.cellW = new Float32Array(k * k); st.cellBox = new Float32Array(k * k * 4);
      st.cellLive = new Uint8Array(k * k); st.cellBoxLive = new Uint8Array(k * k);
    }
    const sum = st.cellSum!, wsum = st.cellW!, box = st.cellBox!, live = st.cellLive!, boxLive = st.cellBoxLive!;
    sum.fill(0); wsum.fill(0); live.fill(0); boxLive.fill(0);
    const acc = st.accum, mask = st.mask, rel = st.release;
    const scale = k / B;
    for (let q = 0; q < n; q++) {
      const m = mask[q];
      if (m <= 0) continue;
      const x = q % B, y = (q - x) / B;
      const c = Math.min(k - 1, Math.floor(y * scale)) * k + Math.min(k - 1, Math.floor(x * scale));
      const o = q * 4, co = c * 4;
      sum[co] += acc[o] * m; sum[co + 1] += acc[o + 1] * m; sum[co + 2] += acc[o + 2] * m; sum[co + 3] += acc[o + 3] * m; wsum[c] += m;
    }
    for (let c = 0; c < k * k; c++) {
      const w = wsum[c];
      if (w <= 0) continue;
      live[c] = 1;
      const co = c * 4; sum[co] /= w; sum[co + 1] /= w; sum[co + 2] /= w; sum[co + 3] /= w;
    }
    for (let cy = 0; cy < k; cy++) for (let cx = 0; cx < k; cx++) {
      let r = 0, g = 0, b = 0, a = 0, cnt = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = cy + dy; if (yy < 0 || yy >= k) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = cx + dx; if (xx < 0 || xx >= k) continue;
          const c2 = yy * k + xx; if (!live[c2]) continue;
          const o2 = c2 * 4; r += sum[o2]; g += sum[o2 + 1]; b += sum[o2 + 2]; a += sum[o2 + 3]; cnt++;
        }
      }
      const c = cy * k + cx, co = c * 4;
      if (cnt > 0) { box[co] = r / cnt; box[co + 1] = g / cnt; box[co + 2] = b / cnt; box[co + 3] = a / cnt; boxLive[c] = 1; }
    }
    for (let q = 0; q < n; q++) {
      const o = q * 4;
      if (mask[q] <= 0) { rel[o] = rel[o + 1] = rel[o + 2] = rel[o + 3] = 0; continue; }   // mask 外用不到
      const x = q % B, y = (q - x) / B;
      const u = (x + 0.5) * scale - 0.5, v = (y + 0.5) * scale - 0.5;
      const i0 = Math.floor(u), j0 = Math.floor(v), fu = u - i0, fv = v - j0;
      let r = 0, g = 0, b = 0, a = 0, wt = 0;
      for (let dj = 0; dj <= 1; dj++) {
        const jj = Math.min(k - 1, Math.max(0, j0 + dj)), wv = dj ? fv : 1 - fv;
        for (let di = 0; di <= 1; di++) {
          const ii = Math.min(k - 1, Math.max(0, i0 + di)), w = (di ? fu : 1 - fu) * wv;
          const c = jj * k + ii;
          if (w <= 0 || !boxLive[c]) continue;
          const co = c * 4; r += box[co] * w; g += box[co + 1] * w; b += box[co + 2] * w; a += box[co + 3] * w; wt += w;
        }
      }
      if (wt > 0) { rel[o] = r / wt; rel[o + 1] = g / wt; rel[o + 2] = b / wt; rel[o + 3] = a / wt; }
      else { rel[o] = rel[o + 1] = rel[o + 2] = rel[o + 3] = 0; }
    }
  }

  // mask 加权平均（premult；alpha 也平均——透明处会把平均色拉淡，与 Krita dulling 同）
  private _weightedAverage(cur: Float32Array, mask: Float32Array, n: number, out: Float32Array): void {
    let sr = 0, sg = 0, sb = 0, sa = 0, sw = 0;
    for (let q = 0; q < n; q++) {
      const m = mask[q];
      if (m <= 0) continue;
      const o = q * 4;
      sr += cur[o] * m; sg += cur[o + 1] * m; sb += cur[o + 2] * m; sa += cur[o + 3] * m; sw += m;
    }
    if (sw <= 0) { out[0] = out[1] = out[2] = out[3] = 0; return; }
    out[0] = sr / sw; out[1] = sg / sw; out[2] = sb / sw; out[3] = sa / sw;
  }
}

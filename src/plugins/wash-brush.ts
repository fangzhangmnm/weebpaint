// wash-brush —— 色彩类滤镜笔（模糊 / 锐化）的 wash 行为，**GPU 区域程序版**（created 2026-09-18 by Claude Fable 5.1；
//   逐 dab 精确翻译自 filters.ts 旧 attachColorBrushBehavior（v0.13.14 wash 幂等，user 09-06「模糊笔 wash idempotent 同意」），
//   旧 CPU 分块实现最后形态 = git 4bb35dd）。提案 ai-docs/20260918-region-programs-formalism-and-gpu-contract.md §1.2（模糊 / 锐化行）。
//
// 语义（一字不改）：
//   ① dab 只累积覆盖：cov = max(cov, stampA·flow·sel)（stampA = 圆/软边 falloff，innerR = R·hardness；dist > R 不算）；
//   ② 每次 flush 对本次 dab 扫过的 bbox（+bleed）从**起笔快照 W₀**算一次滤波（kernel.bakeRegion）；
//   ③ W = lerp(W₀, baked, cov)（premult 权重）只写回 dab bbox。一笔之内来回描 = 描一遍；强度与间距解耦。
//   间距 = max(COLOR_BRUSH_MIN_SPACING, 笔间距)（user 09-05「模糊锐化自己的地板同意」）；R = max(2, size/2·压感)；flow = flow ?? opacity。
// GPU 落法：cov = doc 尺寸 u8（alpha 通道，blend max-alpha，量化 1/255——与旧 CPU f32 cov 的有意偏差）；
//   bake 在区域尺寸的临时纹理上（wash-premult → N×wash-box3 → wash-unpremult / wash-sharpen），用完 free；wash-lerp 写 W。
//   写靶 = RegionStroke（session 造，snapshot:true 才有 W₀——filter 声明 strokeSnapshot）。

import type { Filter, FilterParams, StrokeTarget, BrushSettings, BrushSelection, DirtyRect } from "../filters.ts";
import { COLOR_BRUSH_MIN_SPACING } from "../filters.ts";
import { RegionStroke, type RegionTex } from "../backend/gl/region-stroke.ts";

interface WashDab { cx: number; cy: number; R: number; a: number; }
export interface WashState {
  rs: RegionStroke;
  params: FilterParams;
  brushSettings: BrushSettings;
  lastX: number; lastY: number;
  pendingDist: number;
  pending: WashDab[];
  dabs: number;           // 累计 dab 数（测试观测口）
  dirty: DirtyRect | null;
  cov: RegionTex | null;  // doc 尺寸 u8 覆盖（懒建）
}
export interface WashKernel {
  /** 滤波需要的邻域半径（bake 区域 = dab bbox 外扩 bleed；只当输入，不写回）。 */
  bleed(params: FilterParams): number;
  /** 对 W₀ 的 (ex0,ey0,ew,eh) 区域算一次滤波 → straight u8 区域纹理（调用方 free）。 */
  bakeRegion(rs: RegionStroke, ex0: number, ey0: number, ew: number, eh: number, params: FilterParams): RegionTex;
}

function pushDab(state: WashState, cx: number, cy: number, pressure: number): void {
  const bs = state.brushSettings;
  const R = Math.max(2, bs.size / 2 * (pressure ?? 1));
  const flow = Math.max(0, Math.min(1, bs.flow ?? bs.opacity ?? 1));
  if (flow <= 0) return;
  state.pending.push({ cx, cy, R, a: flow });
  state.dabs++;
}

/** 把 pending dab 合成掉：① 覆盖 max；② 扫过区域从 W₀ 算一次滤波；③ W = lerp(W₀, baked, cov)。 */
function composite(state: WashState, kernel: WashKernel): void {
  const dabs = state.pending;
  if (!dabs.length) return;
  state.pending = [];
  const rs = state.rs, bs = state.brushSettings, params = state.params;
  const hardness = bs.hardness ?? 0.6;
  const docW = rs.docW, docH = rs.docH;
  if (!state.cov) state.cov = rs.alloc(docW, docH, "rgba-u8");
  const sel = rs.selection;
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const d of dabs) {
    const sx0 = Math.max(Math.floor(d.cx - d.R), 0), sy0 = Math.max(Math.floor(d.cy - d.R), 0);
    const sx1 = Math.min(Math.ceil(d.cx + d.R), docW), sy1 = Math.min(Math.ceil(d.cy + d.R), docH);
    if (sx1 <= sx0 || sy1 <= sy0) continue;
    bx0 = Math.min(bx0, sx0); by0 = Math.min(by0, sy0); bx1 = Math.max(bx1, sx1); by1 = Math.max(by1, sy1);
    rs.run("wash-coverage", state.cov, sel ? { u_sel: "selection" } : {}, {
      u_docSize: [docW, docH], u_center: [d.cx, d.cy], u_R: d.R, u_innerR: d.R * hardness, u_flow: d.a,
      u_hasSel: sel ? 1 : 0, u_selOrigin: sel ? [sel.ox, sel.oy] : [0, 0], u_selSize: sel ? [sel.ow, sel.oh] : [1, 1],
    }, { x: sx0, y: sy0, w: sx1 - sx0, h: sy1 - sy0 }, "max-alpha");
  }
  if (!(bx1 > bx0 && by1 > by0)) return;
  const bleed = kernel.bleed(params);
  const ex0 = Math.max(0, bx0 - bleed), ey0 = Math.max(0, by0 - bleed);
  const ex1 = Math.min(docW, bx1 + bleed), ey1 = Math.min(docH, by1 + bleed);
  const baked = kernel.bakeRegion(rs, ex0, ey0, ex1 - ex0, ey1 - ey0, params);
  rs.run("wash-lerp", "W", { u_W0: "W0", u_dst: baked, u_cov: state.cov },
    { u_docSize: [docW, docH], u_origin: [ex0, ey0] },
    { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 });
  rs.free(baked);
  const d = state.dirty;
  if (!d) state.dirty = [bx0, by0, bx1, by1];
  else { d[0] = Math.min(d[0], bx0); d[1] = Math.min(d[1], by0); d[2] = Math.max(d[2], bx1); d[3] = Math.max(d[3], by1); }
}

/** 给色彩类 filter 挂上 wash 笔行为（GPU 区域程序）。filter 只提供 kernel（bleed + bakeRegion）。 */
export function attachWashBrushBehavior(FilterClass: Filter, kernel: WashKernel): void {
  FilterClass.strokePreview = "region";
  FilterClass.strokeSnapshot = true;
  FilterClass.beginBrushStroke = function(targets: readonly StrokeTarget[], params: FilterParams, brushSettings: BrushSettings, _selection: BrushSelection | null, x: number, y: number, p: number): WashState {
    if (targets.length !== 1) throw new Error(`Filter ${FilterClass.id}: wash brush is single-leaf (got ${targets.length} targets)`);
    const rs = targets[0];
    if (!(rs instanceof RegionStroke)) throw new Error(`Filter ${FilterClass.id}: target must be a RegionStroke (strokePreview="region")`);
    const state: WashState = { rs, params, brushSettings, lastX: x, lastY: y, pendingDist: 0, pending: [], dabs: 0, dirty: null, cov: null };
    pushDab(state, x, y, p);
    return state;
  };
  FilterClass.extendBrushStamp = function(state: unknown, x: number, y: number, p: number): void {
    const st = state as WashState;
    const dx = x - st.lastX, dy = y - st.lastY;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0) return;
    const bs = st.brushSettings;
    const R = Math.max(2, bs.size / 2);
    const presetSpacing = (typeof bs.spacing === "number" && bs.spacing > 0) ? bs.spacing : (bs.spacingValue || 0.06);
    const spacingFrac = Math.max(COLOR_BRUSH_MIN_SPACING, presetSpacing);
    const spacingPx = Math.max(1, R * 2 * spacingFrac);
    st.pendingDist += dist;
    if (st.pendingDist < spacingPx) { st.lastX = x; st.lastY = y; return; }
    const ux = dx / dist, uy = dy / dist;
    let placedDist = spacingPx - (st.pendingDist - dist);
    while (placedDist <= dist) {
      pushDab(st, st.lastX + ux * placedDist, st.lastY + uy * placedDist, p);
      placedDist += spacingPx;
    }
    st.pendingDist = dist - (placedDist - spacingPx);
    st.lastX = x; st.lastY = y;
  };
  // 抬笔：把还没 flush 的 dab 合成掉（StrokeSession.end 在 endStroke 之后不再 flush，直接提交 W）
  FilterClass.endBrushStroke = function(state: unknown): void { composite(state as WashState, kernel); };
  FilterClass.cancelBrushStroke = function(_state: unknown): void { /* RegionStroke 由 session dispose；无别的状态 */ };
  FilterClass.flushDirty = function(state: unknown): DirtyRect | null {
    const st = state as WashState;
    composite(st, kernel);
    const d = st.dirty;
    st.dirty = null;
    return d;
  };
}

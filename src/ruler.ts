// ruler —— 尺子模型的纯几何（ADR-0013，2026-09-09）。created 2026-09-09 by Claude Fable 5.1
//
// 形状从「一种笔」（ADR-0005 形状笔引擎，已删）变成「画布上的一把尺」：任何像素笔的徒手笔迹沿尺走。
//   user 2026-09-09：「形状笔同意 1（尺子模型）……同意形状笔不是笔而是辅助」。
// 本模块零 DOM、零 desk 知识：尺子数据（Ruler）+ 每笔一个投影器（StrokeGuide）+ 放置（drag / 画一圈拟合）
//   + doc 变换 remap + overlay 线段。投影核复用 shape-geometry（15° 吸附 / 椭圆拟合）与 perspective-frame
//   （VP 方向 / 平面四边形 / 平面度量），那两个纯模块原样留。
// 曲线尺（ellipse）存 doc 系闭合 polyline（放置时由拟合 / 平面 chart / 平面度量圆算出，≤ MAX_ELLIPSE_PTS 点）：
//   一份表示吃掉全部透视分支，projection = 最近线段；desk JSON 里几 KB，可接受。
// Q4（谁吸尺）讨论中：RULER_ROLES 一个常量集，翻一下即改。选区笔不走 input 像素笔切口，不在此集。

import { type Pt, snapLineEnd, rectCorners, fitEllipse, ellipseArcPolyline, perimeterRamanujan } from "./shape-geometry.ts";
import { type PerspConfig, planeFamilies, quadFromCorners, homographyUnitSquare, applyMat3, planeChart, planeMetric,
         constrainSquareOnPlane, metricCirclePolyline, snapDirections, snapToDirections } from "./perspective-frame.ts";

export type RulerKind = "parallel" | "persp" | "ellipse" | "rect" | "grid";
export interface RulerParallel { kind: "parallel"; angle: number; anchor: Pt }   // 文档系弧度；anchor 只给 overlay 定位
export interface RulerPersp { kind: "persp" }                                     // 几何 = 透视框（frame），无自有状态
export interface RulerEllipse { kind: "ellipse"; pts: Pt[] }                       // 闭合 polyline（首 == 末）
export interface RulerRect { kind: "rect"; corners: [Pt, Pt, Pt, Pt] }
export interface RulerGrid { kind: "grid"; corners: [Pt, Pt, Pt, Pt]; nu: number; nv: number }
export type Ruler = RulerParallel | RulerPersp | RulerEllipse | RulerRect | RulerGrid;
export const RULER_KINDS: readonly RulerKind[] = ["parallel", "persp", "ellipse", "rect", "grid"];

/** 一笔一个：begin 给起点（曲线尺把起点也吸上去，返回吸后的点）；project 逐点投影。 */
export interface StrokeGuide { begin(x: number, y: number): Pt; project(x: number, y: number): Pt }

/** 谁吸尺（Q4 讨论中，user 2026-09-09「45 我需要讨论下」）：像素笔角色集（input pixel-stroke role）。 */
export const RULER_ROLES: ReadonlySet<string> = new Set(["draw", "erase", "filterBrush"]);
/** 透视尺：首段走够这么远（doc px）才锁 VP 族，之前的点钉在起点。 */
export const PERSP_LOCK_PX = 6;
const MAX_ELLIPSE_PTS = 180;
const TWO_PI = Math.PI * 2;

export interface PlaceOpts {
  constrain: boolean;             // 15° / 正方 / 正圆（透视下：吸 VP 射线 / 平面正方 / 平面正圆）
  frame: PerspConfig | null;      // 透视框（desk.persp 经 configFromModeState；关 = null）
  rot: number;                    // 视口旋转（视口相对矩形 / 拟合用；透视下不用）
  docW: number; docH: number;
}

// ---- 投影核 ----

function lineGuide(anchor: Pt, dir: Pt): StrokeGuide {
  const L = Math.hypot(dir.x, dir.y) || 1;
  const ux = dir.x / L, uy = dir.y / L;
  const proj = (x: number, y: number): Pt => {
    const t = (x - anchor.x) * ux + (y - anchor.y) * uy;
    return { x: anchor.x + ux * t, y: anchor.y + uy * t };
  };
  return { begin: proj, project: proj };
}

/** 最近点投影到线段集（rect 4 边 / grid 线 / 椭圆 polyline）。n ≤ 几百，逐点 O(n) 够用。 */
function segmentsGuide(segs: Array<[Pt, Pt]>): StrokeGuide {
  const proj = (x: number, y: number): Pt => {
    let best: Pt = { x, y }, bd = Infinity;
    for (const [a, b] of segs) {
      const vx = b.x - a.x, vy = b.y - a.y;
      const L2 = vx * vx + vy * vy;
      let t = L2 > 0 ? ((x - a.x) * vx + (y - a.y) * vy) / L2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = a.x + vx * t, py = a.y + vy * t;
      const d = (px - x) * (px - x) + (py - y) * (py - y);
      if (d < bd) { bd = d; best = { x: px, y: py }; }
    }
    return best;
  };
  return { begin: proj, project: proj };
}

function polySegs(pts: Pt[]): Array<[Pt, Pt]> {
  const out: Array<[Pt, Pt]> = [];
  for (let i = 1; i < pts.length; i++) out.push([pts[i - 1], pts[i]]);
  return out;
}
function quadSegs(c: [Pt, Pt, Pt, Pt]): Array<[Pt, Pt]> {
  return [[c[0], c[1]], [c[1], c[2]], [c[2], c[3]], [c[3], c[0]]];
}
/** 格线：单位方 (u,v) 经 homography 映到四边形；nu 列 nv 行 → nu+1 竖线 + nv+1 横线（含外框）。 */
export function gridSegments(corners: [Pt, Pt, Pt, Pt], nu: number, nv: number): Array<[Pt, Pt]> {
  const H = homographyUnitSquare(corners);
  if (!H) return quadSegs(corners);
  const out: Array<[Pt, Pt]> = [];
  const cu = Math.max(1, Math.min(48, Math.round(nu))), cv = Math.max(1, Math.min(48, Math.round(nv)));
  for (let i = 0; i <= cu; i++) { const u = i / cu; out.push([applyMat3(H, u, 0), applyMat3(H, u, 1)]); }
  for (let j = 0; j <= cv; j++) { const v = j / cv; out.push([applyMat3(H, 0, v), applyMat3(H, 1, v)]); }
  return out;
}

/** 尺的线段集（overlay 用；persp 尺无自有线段——透视 gizmo 另画）。parallel 画 5 条平行线示意方向族。 */
export function rulerSegments(r: Ruler, docW: number, docH: number): Array<[Pt, Pt]> {
  switch (r.kind) {
    case "parallel": {
      const L = (docW + docH) * 2;
      const ux = Math.cos(r.angle), uy = Math.sin(r.angle);
      const nx = -uy, ny = ux;                          // 法向：平行线族的间距方向
      const gap = Math.max(docW, docH) / 6;
      const out: Array<[Pt, Pt]> = [];
      for (let k = -2; k <= 2; k++) {
        const a = { x: r.anchor.x + nx * gap * k, y: r.anchor.y + ny * gap * k };
        out.push([{ x: a.x - ux * L, y: a.y - uy * L }, { x: a.x + ux * L, y: a.y + uy * L }]);
      }
      return out;
    }
    case "persp": return [];
    case "ellipse": return polySegs(r.pts);
    case "rect": return quadSegs(r.corners);
    case "grid": return gridSegments(r.corners, r.nu, r.nv);
  }
}

/** 建一笔的投影器。persp 尺需要 frame（透视关 → null = 本笔不吸）；其余尺不看 frame。 */
export function guideFor(r: Ruler, frame: PerspConfig | null): StrokeGuide | null {
  switch (r.kind) {
    case "parallel": {
      const dir = { x: Math.cos(r.angle), y: Math.sin(r.angle) };
      let g: StrokeGuide | null = null;
      return {
        begin(x, y) { g = lineGuide({ x, y }, dir); return { x, y }; },
        project(x, y) { return g ? g.project(x, y) : { x, y }; },
      };
    }
    case "persp": {
      if (!frame) return null;
      let start: Pt = { x: 0, y: 0 }, dirs: Pt[] = [], g: StrokeGuide | null = null;
      return {
        begin(x, y) { start = { x, y }; dirs = snapDirections(frame, start); g = null; return { x, y }; },
        project(x, y) {
          if (g) return g.project(x, y);
          const dx = x - start.x, dy = y - start.y;
          const L = Math.hypot(dx, dy);
          if (L < PERSP_LOCK_PX || !dirs.length) return { x: start.x, y: start.y };   // 首段未定向：钉在起点
          let best = dirs[0], bestDot = -1;
          for (const d of dirs) { const dot = Math.abs((dx * d.x + dy * d.y) / L); if (dot > bestDot) { bestDot = dot; best = d; } }
          g = lineGuide(start, best);                                                   // 锁族：本笔到底
          return g.project(x, y);
        },
      };
    }
    case "ellipse": return r.pts.length >= 2 ? segmentsGuide(polySegs(r.pts)) : null;
    case "rect": return segmentsGuide(quadSegs(r.corners));
    case "grid": return segmentsGuide(gridSegments(r.corners, r.nu, r.nv));
  }
}

// ---- 放置 ----

function frameFamilies(frame: PerspConfig | null) {
  if (!frame || frame.plane === "off") return null;
  const fams = planeFamilies(frame);
  return fams ? { famA: fams[0], famB: fams[1] } : null;
}

/** 两角 → 四边形：透视开 = 平面上的四边形（constrain = 平面欧氏正方，度量不可实现静默回退）；否则视口相对 AABB。 */
function quadFrom(p0: Pt, p1: Pt, o: PlaceOpts, constrain: boolean): [Pt, Pt, Pt, Pt] | null {
  const ff = frameFamilies(o.frame);
  if (ff && o.frame) {
    let cc = p1;
    if (constrain) {
      const m = planeMetric(o.frame, ff.famA, ff.famB, p0, o.docW, o.docH);
      const adj = m && constrainSquareOnPlane(m, p1);
      if (adj) cc = adj;
    }
    return quadFromCorners(p0, cc, ff.famA, ff.famB);
  }
  return rectCorners(p0, p1, o.rot, constrain);
}

/** 拖一下放尺：parallel（方向；constrain = 15° / 透视吸 VP 射线）、rect（正方约束）、grid（nu×nv）。太短 / 病态 → null。 */
export function placeFromDrag(kind: "parallel" | "rect" | "grid", p0: Pt, p1: Pt, o: PlaceOpts, grid?: { nu: number; nv: number }): Ruler | null {
  if (kind === "parallel") {
    let end = p1;
    if (o.constrain) {
      end = o.frame ? snapToDirections(p0.x, p0.y, p1.x, p1.y, snapDirections(o.frame, p0)) : snapLineEnd(p0.x, p0.y, p1.x, p1.y);
    }
    const dx = end.x - p0.x, dy = end.y - p0.y;
    if (Math.hypot(dx, dy) < 2) return null;
    return { kind: "parallel", angle: Math.atan2(dy, dx), anchor: { x: p0.x, y: p0.y } };
  }
  if (Math.hypot(p1.x - p0.x, p1.y - p0.y) < 2) return null;
  const q = quadFrom(p0, p1, o, kind === "rect" && o.constrain);
  if (!q) return null;
  if (kind === "rect") return { kind: "rect", corners: q };
  return { kind: "grid", corners: q, nu: grid?.nu ?? 2, nv: grid?.nv ?? 6 };
}

function closeAndCap(pts: Pt[]): Pt[] {
  if (pts.length < 3) return pts;
  const out = pts.slice(0, MAX_ELLIPSE_PTS);
  const last = out[out.length - 1], first = out[0];
  if (last.x !== first.x || last.y !== first.y) out.push({ ...first });
  return out.map((p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 }));   // desk JSON 瘦身
}

/** 画一圈放椭圆尺（ADR-0005 §4 拟合哲学不变：闭合 max 范数 / 弧 LSQ→Kasa）；尺恒是整圈（弧由笔迹自己决定）。
 *  constrain = 正圆「圆心拖半径」（起点 = 圆心，末点定半径；透视下 = 平面欧氏圆的像）。透视开 = 在平面 chart 里拟合再映回。 */
export function placeFromLoop(pts: Pt[], o: PlaceOpts): RulerEllipse | null {
  if (pts.length < 2) return null;
  const p0 = pts[0], p1 = pts[pts.length - 1];
  const ff = frameFamilies(o.frame);
  if (o.constrain) {
    if (ff && o.frame) {
      const m = planeMetric(o.frame, ff.famA, ff.famB, p0, o.docW, o.docH);
      if (m) {
        const poly = metricCirclePolyline(m, p1, MAX_ELLIPSE_PTS - 1);
        if (poly.length >= 8) return { kind: "ellipse", pts: closeAndCap(poly) };
      }
    }
    const r = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    if (r < 1) return null;
    const n = Math.min(MAX_ELLIPSE_PTS - 1, Math.max(24, Math.ceil(TWO_PI * r / 2)));
    const out: Pt[] = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TWO_PI; out.push({ x: p0.x + r * Math.cos(a), y: p0.y + r * Math.sin(a) }); }
    return { kind: "ellipse", pts: closeAndCap(out) };
  }
  if (ff) {
    const chart = planeChart(ff.famA, ff.famB, p0);
    if (!chart) return null;
    const fit = fitEllipse(pts.map((p) => chart.toPlane(p)), 0, false);
    if (!fit) return null;
    const full = { ...fit, closed: true, sweep: TWO_PI };
    const seg = Math.max(perimeterRamanujan(fit.rx, fit.ry) / (MAX_ELLIPSE_PTS - 1), 1e-6);
    const doc = ellipseArcPolyline(full, seg).map((p) => chart.toDoc(p.x, p.y)).filter((p): p is Pt => !!p);
    return doc.length >= 3 ? { kind: "ellipse", pts: closeAndCap(doc) } : null;
  }
  const fit = fitEllipse(pts, o.rot, false);
  if (!fit) return null;
  const full = { ...fit, closed: true, sweep: TWO_PI };
  const seg = Math.max(perimeterRamanujan(fit.rx, fit.ry) / (MAX_ELLIPSE_PTS - 1), 1e-6);
  return { kind: "ellipse", pts: closeAndCap(ellipseArcPolyline(full, seg)) };
}

// ---- doc 变换 ----

/** 裁切 / 翻转 / 旋转 / 缩放 / 偏移：尺跟 doc 走（同 desk.persp 的 remapShapePersp）。f = 点映射。 */
export function remapRuler(r: Ruler, f: (p: Pt) => Pt): Ruler {
  switch (r.kind) {
    case "parallel": {
      const a = f(r.anchor);
      const b = f({ x: r.anchor.x + Math.cos(r.angle) * 100, y: r.anchor.y + Math.sin(r.angle) * 100 });
      return { kind: "parallel", anchor: a, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    case "persp": return r;
    case "ellipse": return { kind: "ellipse", pts: r.pts.map(f) };
    case "rect": return { kind: "rect", corners: r.corners.map(f) as [Pt, Pt, Pt, Pt] };
    case "grid": return { kind: "grid", corners: r.corners.map(f) as [Pt, Pt, Pt, Pt], nu: r.nu, nv: r.nv };
  }
}

/** 载入校验（desk JSON 来自文件；坏形状 → null，别让一把坏尺炸掉起笔）。 */
export function sanitizeRuler(v: unknown): Ruler | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const num = (x: unknown) => typeof x === "number" && Number.isFinite(x);
  const pt = (p: unknown): p is Pt => !!p && typeof p === "object" && num((p as Pt).x) && num((p as Pt).y);
  const quad = (c: unknown): c is [Pt, Pt, Pt, Pt] => Array.isArray(c) && c.length === 4 && c.every(pt);
  switch (r.kind) {
    case "parallel": return num(r.angle) && pt(r.anchor) ? { kind: "parallel", angle: r.angle as number, anchor: r.anchor as Pt } : null;
    case "persp": return { kind: "persp" };
    case "ellipse": return Array.isArray(r.pts) && r.pts.length >= 3 && r.pts.every(pt) ? { kind: "ellipse", pts: r.pts as Pt[] } : null;
    case "rect": return quad(r.corners) ? { kind: "rect", corners: r.corners } : null;
    case "grid": return quad(r.corners) && num(r.nu) && num(r.nv) ? { kind: "grid", corners: r.corners, nu: r.nu as number, nv: r.nv as number } : null;
    default: return null;
  }
}


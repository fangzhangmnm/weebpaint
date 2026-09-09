// ruler —— 尺子模型的纯几何（ADR-0013，2026-09-09）。created 2026-09-09 by Claude Fable 5.1
//
// 形状从「一种笔」（ADR-0005 形状笔引擎，已删）变成「画布上的一把尺」：任何像素笔的徒手笔迹沿尺走。
//   user 2026-09-09：「形状笔同意 1（尺子模型）……同意形状笔不是笔而是辅助」。
// 本模块零 DOM、零 desk 知识：尺子数据（Ruler）+ 每笔一个投影器（StrokeGuide）+ 放置（drag / 画一圈拟合）
//   + doc 变换 remap + overlay 线段。投影核复用 shape-geometry（15° 吸附 / 椭圆拟合）与 perspective-frame
//   （VP 方向 / 平面四边形 / 平面度量），那两个纯模块原样留。
// 曲线尺（ellipse）存 doc 系闭合 polyline（放置时由拟合 / 平面 chart / 平面度量圆算出，≤ MAX_ELLIPSE_PTS 点）：
//   一份表示吃掉全部透视分支，projection = 最近线段；desk JSON 里几 KB，可接受。
// Q4（谁吸尺）已决（user 2026-09-09「你之前不是选区笔也想做吗」→ 按原提案全员）：画笔 / 橡皮 / 手指族 / 选区笔。
//   选区笔不走 input 像素笔切口（lasso role 借 brush 引擎），input 的选区笔起笔/落点处另有同款钩子，伪 role 名 "selPen"。
// Q5 像素画（user 2026-09-09「B 同意，必须用整数的像素算法，不然像素画场景就是废」）：像素模式下尺子不给浮点点，而是先把尺算成
//   **整数像素链**（直线 Bresenham / 轴对齐椭圆 midpoint / 任意四边形内切圆 Zingl conic / 矩形周界 / 格线逐段），投影 = 链上最近像素，
//   并把上次到这次之间的链像素按序吐给引擎 stampPixels（每像素恰好一次，seen-set），永不走弦。见 pixelGuide / projectPath。

import { type Pt, type ClipBox, snapLineEnd, rectCorners, fitEllipse, ellipseArcPolyline, perimeterRamanujan, rotatePt,
         bresenhamLine, bresenhamRectPerimeter, bresenhamEllipseRect, clipSegToBox } from "./shape-geometry.ts";
import { type PerspConfig, planeFamilies, quadFromCorners, homographyUnitSquare, applyMat3, planeChart, planeMetric,
         constrainSquareOnPlane, metricCirclePolyline, snapDirections, snapToDirections } from "./perspective-frame.ts";
import { bresenhamConicInQuad } from "./pixel-conic.ts";

export type RulerKind = "parallel" | "persp" | "ellipse" | "rect" | "grid";
export interface RulerParallel { kind: "parallel"; angle: number; anchor: Pt }   // 文档系弧度；anchor 只给 overlay 定位
export interface RulerPersp { kind: "persp" }                                     // 几何 = 透视框（frame），无自有状态
export interface RulerEllipse { kind: "ellipse"; pts: Pt[]; quad?: [Pt, Pt, Pt, Pt] }   // 闭合 polyline（首 == 末）+ 外接四边形（像素链用：内切 conic）
export interface RulerRect { kind: "rect"; corners: [Pt, Pt, Pt, Pt] }
export interface RulerGrid { kind: "grid"; corners: [Pt, Pt, Pt, Pt]; nu: number; nv: number }
export type Ruler = RulerParallel | RulerPersp | RulerEllipse | RulerRect | RulerGrid;
export const RULER_KINDS: readonly RulerKind[] = ["parallel", "persp", "ellipse", "rect", "grid"];

/** 一笔一个：begin 给起点（曲线尺把起点也吸上去，返回吸后的点）；project 逐点投影。
 *  像素链尺另有 projectPath：返回从上次位置到这次位置沿链吐出的**新**像素中心（seen-set 去重），调用方逐颗 stampPixels、不再 extend。 */
export interface StrokeGuide { begin(x: number, y: number): Pt; project(x: number, y: number): Pt; projectPath?(x: number, y: number): Pt[] }

/** 谁吸尺（Q4 已决 2026-09-09）：像素笔角色（draw / erase / filterBrush）+ 选区笔伪 role "selPen"。 */
export const RULER_ROLES: ReadonlySet<string> = new Set(["draw", "erase", "filterBrush", "selPen"]);
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

/** 建一笔的投影器。persp 尺需要 frame（透视关 → null = 本笔不吸）；其余尺不看 frame。
 *  pixel（像素画模式）给裁剪盒 → 整数像素链投影器（projectPath）；不给 → 连续投影器（project）。 */
export function guideFor(r: Ruler, frame: PerspConfig | null, pixel?: { box: ClipBox }): StrokeGuide | null {
  if (pixel) return pixelGuide(r, frame, pixel.box);
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

function quadOfBox(cx: number, cy: number, rx: number, ry: number, rot: number): [Pt, Pt, Pt, Pt] {
  // q 空间的轴对齐盒四角 → R(-rot) 映回 doc（rot=0 即轴对齐矩形；顺序同 quadFromCorners：绕行）
  const c = [{ x: cx - rx, y: cy - ry }, { x: cx + rx, y: cy - ry }, { x: cx + rx, y: cy + ry }, { x: cx - rx, y: cy + ry }];
  return c.map((p) => rotatePt(p, -rot)) as [Pt, Pt, Pt, Pt];
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
        if (poly.length >= 8) {
          // 外接方框（平面欧氏正方）的像 → 像素链用的 conic quad；投不出来（越地平线）就不带 quad（像素模式退化走 polyline 连线）
          const B = m.unproject(p1);
          let quad: [Pt, Pt, Pt, Pt] | undefined;
          if (B) {
            const R = Math.hypot(B[0] - m.A3[0], B[1] - m.A3[1], B[2] - m.A3[2]);
            const corner = (su: number, sv: number): Pt | null => m.project([m.A3[0] + su * R * m.U[0] + sv * R * m.V[0], m.A3[1] + su * R * m.U[1] + sv * R * m.V[1], m.A3[2] + su * R * m.U[2] + sv * R * m.V[2]]);
            const cs = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
            if (cs.every((c): c is Pt => !!c)) quad = cs as [Pt, Pt, Pt, Pt];
          }
          return { kind: "ellipse", pts: closeAndCap(poly), ...(quad ? { quad } : {}) };
        }
      }
    }
    const r = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    if (r < 1) return null;
    const n = Math.min(MAX_ELLIPSE_PTS - 1, Math.max(24, Math.ceil(TWO_PI * r / 2)));
    const out: Pt[] = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TWO_PI; out.push({ x: p0.x + r * Math.cos(a), y: p0.y + r * Math.sin(a) }); }
    return { kind: "ellipse", pts: closeAndCap(out), quad: quadOfBox(p0.x, p0.y, r, r, 0) };
  }
  if (ff) {
    const chart = planeChart(ff.famA, ff.famB, p0);
    if (!chart) return null;
    const fit = fitEllipse(pts.map((p) => chart.toPlane(p)), 0, false);
    if (!fit) return null;
    const full = { ...fit, closed: true, sweep: TWO_PI };
    const seg = Math.max(perimeterRamanujan(fit.rx, fit.ry) / (MAX_ELLIPSE_PTS - 1), 1e-6);
    const doc = ellipseArcPolyline(full, seg).map((p) => chart.toDoc(p.x, p.y)).filter((p): p is Pt => !!p);
    if (doc.length < 3) return null;
    const cs = quadOfBox(fit.cx, fit.cy, fit.rx, fit.ry, 0).map((c) => chart.toDoc(c.x, c.y));   // 平面轴对齐盒的像
    const quad = cs.every((c): c is Pt => !!c) ? (cs as [Pt, Pt, Pt, Pt]) : undefined;
    return { kind: "ellipse", pts: closeAndCap(doc), ...(quad ? { quad } : {}) };
  }
  const fit = fitEllipse(pts, o.rot, false);
  if (!fit) return null;
  const full = { ...fit, closed: true, sweep: TWO_PI };
  const seg = Math.max(perimeterRamanujan(fit.rx, fit.ry) / (MAX_ELLIPSE_PTS - 1), 1e-6);
  return { kind: "ellipse", pts: closeAndCap(ellipseArcPolyline(full, seg)), quad: quadOfBox(fit.cx, fit.cy, fit.rx, fit.ry, fit.rot) };
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
    case "ellipse": return { kind: "ellipse", pts: r.pts.map(f), ...(r.quad ? { quad: r.quad.map(f) as [Pt, Pt, Pt, Pt] } : {}) };
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
    case "ellipse": return Array.isArray(r.pts) && r.pts.length >= 3 && r.pts.every(pt)
      ? { kind: "ellipse", pts: r.pts as Pt[], ...(quad(r.quad) ? { quad: r.quad } : {}) } : null;
    case "rect": return quad(r.corners) ? { kind: "rect", corners: r.corners } : null;
    case "grid": return quad(r.corners) && num(r.nu) && num(r.nv) ? { kind: "grid", corners: r.corners, nu: r.nu as number, nv: r.nv as number } : null;
    default: return null;
  }
}


// ---- 像素链投影器（Q5，user「必须用整数的像素算法」）----

interface PixelChain { pts: Pt[]; closed: boolean }   // pts = 像素中心（i+0.5），按链序
const pix = (v: number) => Math.round(v - 0.5);         // doc 坐标 → 像素索引（+0.5 中心制，同 pixel-conic）
const keyOf = (p: Pt) => (p.x - 0.5) + "," + (p.y - 0.5);

/** 凸闭合曲线的像素集（栅格器输出不保证顺序）→ 按绕质心的角排成环。 */
function ringOrder(pts: Pt[]): Pt[] {
  if (pts.length < 3) return pts.slice();
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= pts.length; cy /= pts.length;
  return pts.slice().sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
}
function isAxisAlignedQuad(q: [Pt, Pt, Pt, Pt]): boolean {
  const e = 1e-6;
  return Math.abs(q[0].y - q[1].y) < e && Math.abs(q[2].y - q[3].y) < e && Math.abs(q[0].x - q[3].x) < e && Math.abs(q[1].x - q[2].x) < e;
}
function lineChain(a: Pt, b: Pt, box: ClipBox): PixelChain | null {
  const seg = clipSegToBox(a, b, box);
  if (!seg) return null;
  const pts = bresenhamLine(pix(seg[0].x), pix(seg[0].y), pix(seg[1].x), pix(seg[1].y));
  return pts.length ? { pts, closed: false } : null;
}
/** 过 anchor、方向 dir 的整数直线链（裁到 box；顺序沿 dir）。 */
function infiniteLineChain(anchor: Pt, dir: Pt, box: ClipBox): PixelChain | null {
  const L = (box.x1 - box.x0) + (box.y1 - box.y0);
  const a = { x: anchor.x - dir.x * L, y: anchor.y - dir.y * L }, b = { x: anchor.x + dir.x * L, y: anchor.y + dir.y * L };
  return lineChain(a, b, box);
}
/** 椭圆尺 → 一条闭环：轴对齐 quad 走 midpoint 椭圆（bresenhamEllipseRect），其余走 Zingl conic；无 quad → polyline 逐段 Bresenham（退化）。 */
function ellipseChains(r: RulerEllipse, box: ClipBox): PixelChain[] {
  if (r.quad) {
    const q = r.quad;
    let pts: Pt[];
    if (isAxisAlignedQuad(q)) {
      const xs = q.map((p) => p.x), ys = q.map((p) => p.y);
      pts = bresenhamEllipseRect(pix(Math.min(...xs)), pix(Math.min(...ys)), pix(Math.max(...xs)), pix(Math.max(...ys)));
    } else {
      pts = bresenhamConicInQuad(q, box);
    }
    if (pts.length) return [{ pts: ringOrder(pts), closed: true }];
  }
  const seen = new Set<string>();
  const out: Pt[] = [];
  for (let i = 1; i < r.pts.length; i++) {
    for (const p of bresenhamLine(pix(r.pts[i - 1].x), pix(r.pts[i - 1].y), pix(r.pts[i].x), pix(r.pts[i].y))) {
      const k = keyOf(p); if (seen.has(k)) continue; seen.add(k); out.push(p);
    }
  }
  return out.length ? [{ pts: out, closed: true }] : [];
}
function quadChain(c: [Pt, Pt, Pt, Pt], box: ClipBox): PixelChain[] {
  if (isAxisAlignedQuad(c)) {
    const xs = c.map((p) => p.x), ys = c.map((p) => p.y);
    const pts = bresenhamRectPerimeter(pix(Math.min(...xs)), pix(Math.min(...ys)), pix(Math.max(...xs)), pix(Math.max(...ys)));
    return pts.length ? [{ pts: ringOrder(pts), closed: true }] : [];
  }
  // 一般四边形：四边逐段 Bresenham 首尾相接（角点去重）；被裁掉的边断成多条开链
  const seen = new Set<string>();
  const chains: PixelChain[] = [];
  let cur: Pt[] = [];
  for (let i = 0; i < 4; i++) {
    const seg = clipSegToBox(c[i], c[(i + 1) % 4], box);
    if (!seg) { if (cur.length) { chains.push({ pts: cur, closed: false }); cur = []; } continue; }
    for (const p of bresenhamLine(pix(seg[0].x), pix(seg[0].y), pix(seg[1].x), pix(seg[1].y))) {
      const k = keyOf(p); if (seen.has(k)) continue; seen.add(k); cur.push(p);
    }
  }
  if (cur.length) chains.push({ pts: cur, closed: chains.length === 0 });
  return chains;
}
function gridChains(r: RulerGrid, box: ClipBox): PixelChain[] {
  const out: PixelChain[] = [];
  for (const [a, b] of gridSegments(r.corners, r.nu, r.nv)) { const ch = lineChain(a, b, box); if (ch) out.push(ch); }
  return out;
}

/** 链集上的投影器：最近像素 + 链内按序补齐 + 本笔 seen-set。dirResolver 给「起笔后才定方向」的尺（平行线 / 透视）建链。 */
function chainGuide(initial: PixelChain[], dirResolver: ((start: Pt, x: number, y: number) => PixelChain[] | null) | null): StrokeGuide {
  let chains = initial;
  let start: Pt = { x: 0, y: 0 };
  let lastC = -1, lastI = -1;
  const seen = new Set<string>();
  const nearest = (x: number, y: number): { c: number; i: number } | null => {
    let bc = -1, bi = -1, bd = Infinity;
    for (let c = 0; c < chains.length; c++) {
      const pts = chains[c].pts;
      for (let i = 0; i < pts.length; i++) {
        const d = (pts[i].x - x) * (pts[i].x - x) + (pts[i].y - y) * (pts[i].y - y);
        if (d < bd) { bd = d; bc = c; bi = i; }
      }
    }
    return bc < 0 ? null : { c: bc, i: bi };
  };
  const emit = (p: Pt, out: Pt[]) => { const k = keyOf(p); if (!seen.has(k)) { seen.add(k); out.push(p); } };
  return {
    begin(x, y) {
      start = { x, y }; seen.clear(); lastC = -1; lastI = -1;
      if (dirResolver) chains = [];                        // 方向未定：等 projectPath 走够再建链
      const n = nearest(x, y);
      if (!n) return { x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5 };
      lastC = n.c; lastI = n.i;
      const p = chains[n.c].pts[n.i];
      seen.add(keyOf(p));
      return p;
    },
    project(x, y) { const n = nearest(x, y); return n ? chains[n.c].pts[n.i] : { x, y }; },
    projectPath(x, y) {
      const out: Pt[] = [];
      if (dirResolver && !chains.length) {
        const built = dirResolver(start, x, y);
        if (!built) return out;                              // 首段未定向：钉在起点，什么都不吐
        chains = built;
        const s0 = nearest(start.x, start.y);
        if (s0) { lastC = s0.c; lastI = s0.i; seen.add(keyOf(chains[s0.c].pts[s0.i])); }   // 起笔那颗已由 begin 落下
      }
      const n = nearest(x, y);
      if (!n) return out;
      if (n.c !== lastC || lastI < 0) { emit(chains[n.c].pts[n.i], out); lastC = n.c; lastI = n.i; return out; }
      const ch = chains[n.c], len = ch.pts.length;
      let step: number, count: number;
      if (ch.closed) {
        const fwd = (n.i - lastI + len) % len;
        if (fwd <= len - fwd) { step = 1; count = fwd; } else { step = -1; count = len - fwd; }
      } else { step = n.i >= lastI ? 1 : -1; count = Math.abs(n.i - lastI); }
      let i = lastI;
      for (let k = 0; k < count; k++) { i = (i + step + len) % len; emit(ch.pts[i], out); }
      lastC = n.c; lastI = n.i;
      return out;
    },
  };
}

/** 像素画模式的整数链投影器（guideFor 的 pixel 分支）。 */
export function pixelGuide(r: Ruler, frame: PerspConfig | null, box: ClipBox): StrokeGuide | null {
  switch (r.kind) {
    case "parallel": {
      const dir = { x: Math.cos(r.angle), y: Math.sin(r.angle) };
      return chainGuide([], (start) => { const ch = infiniteLineChain({ x: Math.floor(start.x) + 0.5, y: Math.floor(start.y) + 0.5 }, dir, box); return ch ? [ch] : []; });
    }
    case "persp": {
      if (!frame) return null;
      return chainGuide([], (start, x, y) => {
        const dx = x - start.x, dy = y - start.y;
        const L = Math.hypot(dx, dy);
        const dirs = snapDirections(frame, start);
        if (L < PERSP_LOCK_PX || !dirs.length) return null;
        let best = dirs[0], bestDot = -1;
        for (const d of dirs) { const dot = Math.abs((dx * d.x + dy * d.y) / L); if (dot > bestDot) { bestDot = dot; best = d; } }
        const ch = infiniteLineChain({ x: Math.floor(start.x) + 0.5, y: Math.floor(start.y) + 0.5 }, best, box);
        return ch ? [ch] : [];
      });
    }
    case "ellipse": { const chs = ellipseChains(r, box); return chs.length ? chainGuide(chs, null) : null; }
    case "rect": { const chs = quadChain(r.corners, box); return chs.length ? chainGuide(chs, null) : null; }
    case "grid": { const chs = gridChains(r, box); return chs.length ? chainGuide(chs, null) : null; }
  }
}

// ---- 拖画（user 2026-09-09「像素笔圆和矩形，网格应该是拖动啊……再加一个普通笔也可以用的拖动模式看谁舒服」）----
// 拖一下 = 整形一次落笔（旧形状笔的手势，活在尺子模型里：同一套放置几何，只是落笔而不留尺）。

/** 像素画拖画：整形的整数像素集（跨链去重——格线交叉不双叠、矩形角点不重复）。parallel 用 seg（起点→终点一段，不是无限线）。 */
export function shapePixels(r: Ruler, box: ClipBox, seg?: [Pt, Pt]): Pt[] {
  let chains: PixelChain[] = [];
  switch (r.kind) {
    case "parallel": { if (!seg) return []; const ch = lineChain(seg[0], seg[1], box); chains = ch ? [ch] : []; break; }
    case "persp": return [];
    case "ellipse": chains = ellipseChains(r, box); break;
    case "rect": chains = quadChain(r.corners, box); break;
    case "grid": chains = gridChains(r, box); break;
  }
  const seen = new Set<string>();
  const out: Pt[] = [];
  for (const ch of chains) for (const p of ch.pts) { const k = keyOf(p); if (!seen.has(k)) { seen.add(k); out.push(p); } }
  return out;
}
/** 普通笔拖画：整形的折线组（喂引擎逐段驱动；格线 = 多段）。 */
export function shapePolylines(r: Ruler, seg?: [Pt, Pt]): Pt[][] {
  switch (r.kind) {
    case "parallel": return seg ? [[seg[0], seg[1]]] : [];
    case "persp": return [];
    case "ellipse": return [r.pts];
    case "rect": return [[...r.corners, r.corners[0]]];
    case "grid": return gridSegments(r.corners, r.nu, r.nv).map(([a, b]) => [a, b]);
  }
}

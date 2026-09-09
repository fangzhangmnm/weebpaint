// 尺子模型纯几何（ADR-0013）。created 2026-09-09 by Claude Fable 5.1
// 钉：平行线尺 / 透视尺（首段锁族）/ 椭圆尺 / 矩形尺 / 格线尺 的投影；放置（拖 / 画一圈 / 约束）；doc 变换 remap；载入校验。
import { describe, it, eq, assert } from "./runner.mjs";
const R = await import("../src/ruler.ts");

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const nearPt = (p, x, y, eps = 1e-6) => near(p.x, x, eps) && near(p.y, y, eps);
const O = { constrain: false, frame: null, rot: 0, docW: 800, docH: 600 };
const P1 = { vp1: { x: 1000, y: 500 }, vp2: null, vp3: null, lockHorizon: true, plane: "ground" };

describe("ruler · 投影核", () => {
  it("平行线尺：过起点、沿尺的方向投影；换笔换起点", () => {
    const g = R.guideFor({ kind: "parallel", angle: 0, anchor: { x: 0, y: 0 } }, null);
    g.begin(3, 7);
    assert(nearPt(g.project(10, 20), 10, 7), "水平尺：y 钉在起点");
    g.begin(0, 0);
    const g2 = R.guideFor({ kind: "parallel", angle: Math.PI / 4, anchor: { x: 0, y: 0 } }, null);
    g2.begin(0, 0);
    assert(nearPt(g2.project(10, 0), 5, 5), "45° 尺：(10,0) 投影到 (5,5)");
  });
  it("透视尺：首段 < PERSP_LOCK_PX 钉起点；走够后锁最近 VP 族，本笔到底不换族；透视关 → null", () => {
    eq(R.guideFor({ kind: "persp" }, null), null, "frame 为 null → 不吸");
    const g = R.guideFor({ kind: "persp" }, P1);
    g.begin(0, 0);
    assert(nearPt(g.project(2, 1), 0, 0), "未定向：钉起点");
    const p = g.project(100, 40);                                  // 朝 VP (0.894,0.447) 的族最近
    const ux = 1000 / Math.hypot(1000, 500), uy = 500 / Math.hypot(1000, 500);
    const t = 100 * ux + 40 * uy;
    assert(nearPt(p, ux * t, uy * t, 1e-6), "锁 VP 族后正交投影到该射线");
    const q = g.project(10, 90);                                   // 更像竖直族，但已锁定
    assert(near(q.y / q.x, uy / ux, 1e-6), "本笔不换族");
  });
  it("椭圆尺（正圆：圆心拖半径）：起点也吸上尺；最近点投影", () => {
    const r = R.placeFromLoop([{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }], { ...O, constrain: true });
    eq(r.kind, "ellipse"); assert(r.pts.length >= 24 && r.pts.length <= 181, "点数有界 " + r.pts.length);
    const first = r.pts[0], last = r.pts[r.pts.length - 1];
    assert(first.x === last.x && first.y === last.y, "闭合（首==末）");
    const g = R.guideFor(r, null);
    const b = g.begin(20, 0);
    assert(near(Math.hypot(b.x, b.y), 10, 0.05), "起点吸到圆上（半径 10）");
    const p = g.project(0, 3);
    assert(near(Math.hypot(p.x, p.y), 10, 0.05) && p.y > 9, "内点投到最近圆周点");
  });
  it("矩形尺：4 边最近点；正方约束", () => {
    const r = R.placeFromDrag("rect", { x: 0, y: 0 }, { x: 10, y: 20 }, O);
    eq(r.kind, "rect");
    const g = R.guideFor(r, null);
    assert(nearPt(g.project(5, -3), 5, 0), "上边");
    assert(nearPt(g.project(12, 5), 10, 5), "右边");
    const sq = R.placeFromDrag("rect", { x: 0, y: 0 }, { x: 10, y: 20 }, { ...O, constrain: true });
    const w = Math.hypot(sq.corners[1].x - sq.corners[0].x, sq.corners[1].y - sq.corners[0].y);
    const h = Math.hypot(sq.corners[3].x - sq.corners[0].x, sq.corners[3].y - sq.corners[0].y);
    assert(near(w, h, 1e-9) && near(w, 20, 1e-9), "正方：边长取 max=20");
  });
  it("格线尺：nu×nv → nu+1 竖线 + nv+1 横线（含外框）；吸最近格线", () => {
    const r = R.placeFromDrag("grid", { x: 0, y: 0 }, { x: 20, y: 60 }, O, { nu: 2, nv: 6 });
    eq(r.kind, "grid"); eq(r.nu, 2); eq(r.nv, 6);
    eq(R.gridSegments(r.corners, r.nu, r.nv).length, 3 + 7);
    const g = R.guideFor(r, null);
    assert(nearPt(g.project(9, 33), 10, 33, 1e-9), "吸到 x=10 中线");
    assert(nearPt(g.project(3, 31), 3, 30, 1e-9), "吸到 y=30 横线");
  });
});

describe("ruler · 放置", () => {
  it("平行线尺：约束 = 15° 吸附；太短 → null", () => {
    eq(R.placeFromDrag("parallel", { x: 0, y: 0 }, { x: 1, y: 0.5 }, O), null, "太短");
    const free = R.placeFromDrag("parallel", { x: 0, y: 0 }, { x: 100, y: 30 }, O);
    assert(near(free.angle, Math.atan2(30, 100)), "自由角度");
    const snap = R.placeFromDrag("parallel", { x: 0, y: 0 }, { x: 100, y: 30 }, { ...O, constrain: true });
    assert(near(snap.angle, Math.PI / 12, 1e-9), "16.7° → 15°");
    const vp = R.placeFromDrag("parallel", { x: 0, y: 0 }, { x: 100, y: 30 }, { ...O, constrain: true, frame: P1 });
    assert(near(vp.angle, Math.atan2(500, 1000), 1e-9), "透视下吸向 VP 射线");
  });
  it("椭圆尺：徒手一圈拟合（max 范数 AABB）→ 整圈 polyline，点在椭圆上", () => {
    const pts = [];
    for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 2; pts.push({ x: 100 + 30 * Math.cos(a), y: 50 + 15 * Math.sin(a) }); }
    const r = R.placeFromLoop(pts, O);
    eq(r.kind, "ellipse");
    let maxErr = 0;
    for (const p of r.pts) { const e = Math.abs(((p.x - 100) / 30) ** 2 + ((p.y - 50) / 15) ** 2 - 1); if (e > maxErr) maxErr = e; }
    assert(maxErr < 0.02, "polyline 点在拟合椭圆上（误差 " + maxErr.toFixed(4) + "）");
    // 半圈也是整圈尺（弧由笔迹决定）
    const half = R.placeFromLoop(pts.slice(0, 33), O);
    assert(half && half.pts.length > 24, "半圈也出整圈");
  });
  it("透视下的矩形 = 平面四边形（两角定形）", () => {
    const r = R.placeFromDrag("rect", { x: 100, y: 400 }, { x: 300, y: 450 }, { ...O, frame: P1 });
    assert(r && r.kind === "rect", "有解");
    const c = r.corners;
    // 对边不平行：含 VP 族的边延长线交于 VP 附近方向（四角都是有限点即可）
    assert(c.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), "四角有限");
  });
});

describe("ruler · remap / 校验", () => {
  it("remapRuler：翻转映射把平行线尺的角度镜像；矩形角点跟着走", () => {
    const W = 800;
    const par = R.remapRuler({ kind: "parallel", angle: Math.PI / 6, anchor: { x: 10, y: 20 } }, (p) => ({ x: W - p.x, y: p.y }));
    assert(near(Math.cos(par.angle), -Math.cos(Math.PI / 6), 1e-9) && near(Math.sin(par.angle), Math.sin(Math.PI / 6), 1e-9), "角度镜像");
    assert(nearPt(par.anchor, 790, 20), "anchor 映射");
    const rect = R.remapRuler({ kind: "rect", corners: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 5 }] }, (p) => ({ x: p.x + 1, y: p.y + 2 }));
    assert(nearPt(rect.corners[2], 11, 7), "角点平移");
    eq(R.remapRuler({ kind: "persp" }, (p) => p).kind, "persp");
  });
  it("sanitizeRuler：坏形状 → null；好形状原样", () => {
    eq(R.sanitizeRuler(null), null); eq(R.sanitizeRuler({ kind: "bogus" }), null);
    eq(R.sanitizeRuler({ kind: "parallel", angle: "x", anchor: { x: 0, y: 0 } }), null);
    eq(R.sanitizeRuler({ kind: "ellipse", pts: [{ x: 0, y: 0 }] }), null, "椭圆至少 3 点");
    eq(R.sanitizeRuler({ kind: "rect", corners: [{ x: 0, y: 0 }] }), null);
    assert(R.sanitizeRuler({ kind: "grid", corners: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], nu: 2, nv: 6 }), "好格线尺");
    eq(R.sanitizeRuler({ kind: "persp" }).kind, "persp");
  });
  it("rulerSegments：平行线尺 5 条示意线；矩形 4 边；透视尺 0（gizmo 另画）", () => {
    eq(R.rulerSegments({ kind: "parallel", angle: 0, anchor: { x: 0, y: 0 } }, 800, 600).length, 5);
    eq(R.rulerSegments({ kind: "rect", corners: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] }, 800, 600).length, 4);
    eq(R.rulerSegments({ kind: "persp" }, 800, 600).length, 0);
  });
});

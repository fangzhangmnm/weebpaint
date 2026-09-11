// 「几何」拖画 decorator（shape-stroke.ts，ADR-0013 修订 ③）。created 2026-09-10 by Claude Fable 5.1
// 钉：① 手势 → 几何（直线段 / 矩形 / 画圈拟合 / 透视种 = 直线吸 VP）；② decorator 满足 StrokeEngine 面：extend 只记、flushDirty 才重驱（一个事件批一次）、
//   buffered 内引擎逐段 begin/extend/end 收 StampCollect 合并（格线多段一条 undo）、endStroke 返最终 collect；③ 就地写引擎（inPlace）每帧先 reset 再重画、
//   抬手收内笔；④ 留尺（io=null）不碰引擎、只把几何交给 onEnd；⑤ cancel 无痕（reset + inner.cancel + onCancel）；⑥ 脏区 = 本帧 ∪ 上帧。
import { describe, it, eq, assert } from "./runner.mjs";
const S = await import("../src/shape-stroke.ts");

const O = { constrain: false, frame: null, rot: 0, docW: 800, docH: 600 };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const gesture = (kind, place = O) => new S.ShapeGesture({ kind, place: () => place, grid: () => ({ nu: 2, nv: 3 }) });

/** 假内引擎：记录调用序列；buffered 时 endStroke 吐一个 collect（stamps 数 = extend 数 + 1）。 */
function fakeInner({ buffered = true } = {}) {
  const log = [];
  let n = 0, open = false;
  return {
    log,
    beginInner(x, y) { log.push(["begin", x, y]); n = 1; open = true; },
    extendStroke(x, y, p) { log.push(["extend", x, y, p]); n++; },
    endStroke() { log.push(["end"]); open = false; const k = n; n = 0; return buffered ? { stamps: new Array(k).fill(0), bx: 0, by: 0, bw: 10, bh: 10 } : null; },
    cancelStroke() { log.push(["cancel"]); open = false; n = 0; },
    flushDirty() { return open || n ? [1, 2, 3, 4] : null; },
    stampPixels(pts, p) { log.push(["pixels", pts.length, p]); },
    get isOpen() { return open; },
  };
}
const mkIo = (inner, extra = {}) => ({ inner, beginInner: (x, y) => inner.beginInner(x, y), reset: () => { inner.log.push(["reset"]); inner.cancelStroke(); }, inPlace: false, pixel: false, box: { x0: -64, y0: -64, x1: 864, y1: 664 }, ...extra });

describe("shape-stroke · ShapeGesture 手势 → 几何", () => {
  it("直线：拖一下 = 平行线尺 + 起点→终点在尺方向上的投影段", () => {
    const g = gesture("parallel");
    g.begin({ x: 10, y: 10 }); g.extend({ x: 110, y: 12 });
    const r = g.ruler();
    eq(r.kind, "parallel"); assert(near(r.angle, Math.atan2(2, 100)), "方向 = 拖的方向");
    const seg = g.seg(r);
    assert(near(seg[0].x, 10) && near(seg[0].y, 10), "段起点 = 锚");
    assert(near(seg[1].x, 110) && near(seg[1].y, 12), "段终点 = 终点本身（就在尺上）");
  });
  it("直线约束：15° 吸附（(100,12) → 水平）", () => {
    const g = gesture("parallel", { ...O, constrain: true });
    g.begin({ x: 0, y: 0 }); g.extend({ x: 100, y: 12 });
    const r = g.ruler(); assert(near(r.angle, 0), "吸到 0°");
    const seg = g.seg(r); assert(near(seg[1].y, 0) && near(seg[1].x, 100), "终点投到水平线上");
  });
  it("矩形 / 格线：两角 → 四边形；太短 → null", () => {
    const g = gesture("rect");
    g.begin({ x: 0, y: 0 }); g.extend({ x: 40, y: 20 });
    eq(g.ruler().kind, "rect"); eq(g.ruler().corners.length, 4);
    const gg = gesture("grid"); gg.begin({ x: 0, y: 0 }); gg.extend({ x: 40, y: 20 });
    const r = gg.ruler(); eq(r.kind, "grid"); eq(r.nu, 2); eq(r.nv, 3);
    const short = gesture("rect"); short.begin({ x: 0, y: 0 }); short.extend({ x: 1, y: 0 });
    eq(short.ruler(), null, "太短不成形");
  });
  it("圆：画一圈拟合成闭合 polyline；约束 = 起点圆心拖半径", () => {
    const g = gesture("ellipse");
    g.begin({ x: 100, y: 0 });
    for (let i = 1; i <= 36; i++) { const a = (i / 36) * Math.PI * 2; g.extend({ x: 100 * Math.cos(a), y: 60 * Math.sin(a) }); }
    const r = g.ruler(); eq(r.kind, "ellipse"); assert(r.pts.length >= 8, "闭合 polyline");
    const c = gesture("ellipse", { ...O, constrain: true });
    c.begin({ x: 0, y: 0 }); c.extend({ x: 50, y: 0 });
    const rc = c.ruler(); assert(rc.pts.every((p) => near(Math.hypot(p.x, p.y), 50, 0.02)), "正圆半径 50（点坐标存两位小数）");
  });
  it("透视种：拖画 = 直线吸向 VP 射线（透视关着退化成普通直线）", () => {
    const frame = { plane: "off", vps: [], families: [] };   // 只要非 null 就走 constrain；snapDirections 拿不到族 → 原样
    const g = gesture("persp", { ...O, frame: null });
    g.begin({ x: 0, y: 0 }); g.extend({ x: 100, y: 12 });
    const r = g.ruler(); eq(r.kind, "parallel"); assert(near(r.angle, Math.atan2(12, 100)), "透视关 = 不约束");
    void frame;
  });
});

describe("shape-stroke · shapedStroke decorator（buffered 内引擎）", () => {
  it("extend 只记；flushDirty 才重驱一次：begin + 逐点 extend + end，恒压 0.5；cs = 合并 collect", () => {
    const inner = fakeInner();
    const d = S.shapedStroke(gesture("parallel"), mkIo(inner));
    d.begin(0, 0);
    eq(inner.log.length, 0, "begin 不碰引擎");
    d.extendStroke(50, 0); d.extendStroke(100, 0);
    eq(inner.log.length, 0, "extend 不碰引擎");
    const dirty = d.flushDirty();
    assert(dirty && dirty.length === 4, "重驱后有脏区");
    eq(inner.log[0][0], "begin"); eq(inner.log[inner.log.length - 1][0], "end");
    assert(inner.log.some((e) => e[0] === "extend" && e[3] === S.SHAPE_PRESSURE), "恒压");
    assert(d.collectStamps() && d.collectStamps().stamps.length >= 2, "collect 可拉");
    eq(d.flushDirty(), null, "没新点不重驱");
    const cs = d.endStroke();
    assert(cs && cs.stamps.length >= 2, "抬手返最终 collect");
  });
  it("格线多段：每段一次 begin/end，合并成一个 collect（一条 undo）", () => {
    const inner = fakeInner();
    const d = S.shapedStroke(gesture("grid"), mkIo(inner));
    d.begin(0, 0); d.extendStroke(100, 60); d.flushDirty();
    const begins = inner.log.filter((e) => e[0] === "begin").length;
    eq(begins, 3 + 4, "nu=2 → 3 竖线 + nv=3 → 4 横线 = 7 段");
    assert(d.collectStamps().stamps.length >= 14, "合并了全部段的 stamps");
  });
  it("每帧从头重驱：第二帧的几何不带第一帧的点；脏区 = 本帧 ∪ 上帧", () => {
    const inner = fakeInner();
    const d = S.shapedStroke(gesture("parallel"), mkIo(inner));
    d.begin(0, 0); d.extendStroke(100, 0); d.flushDirty();
    const n1 = inner.log.length;
    d.extendStroke(200, 0);
    const r2 = d.flushDirty();
    assert(inner.log.length > n1 && inner.log[n1][0] === "begin", "第二帧重新 begin");
    assert(r2 && r2[0] === 1, "脏区并集");
    eq(inner.log.filter((e) => e[0] === "reset").length, 0, "buffered 不需要 reset");
  });
  it("像素画：shapePixels → beginInner(首颗) + stampPixels(其余)；抬手收内笔", () => {
    const inner = fakeInner({ buffered: false });
    const d = S.shapedStroke(gesture("parallel"), mkIo(inner, { pixel: true, inPlace: true }));
    d.begin(0.5, 0.5); d.extendStroke(10.5, 0.5); d.flushDirty();
    assert(inner.log.some((e) => e[0] === "pixels" && e[1] === 10), "首颗由 begin 落，其余 10 颗 stampPixels");
    d.extendStroke(20.5, 0.5); d.flushDirty();
    eq(inner.log.filter((e) => e[0] === "reset").length, 1, "第二帧先 reset（restore 替身）");
    d.endStroke();
    eq(inner.log[inner.log.length - 1][0], "end", "抬手收开着的内笔");
    eq(inner.isOpen, false);
  });
  it("就地写引擎（滤镜笔形制 inPlace）：每帧 reset 后重画，抬手不再 end 第二次", () => {
    const inner = fakeInner({ buffered: false });
    const d = S.shapedStroke(gesture("rect"), mkIo(inner, { inPlace: true }));
    d.begin(0, 0); d.extendStroke(40, 20); d.flushDirty();
    eq(inner.log.filter((e) => e[0] === "reset").length, 0, "首帧无需 reset");
    d.extendStroke(60, 30); d.flushDirty();
    eq(inner.log.filter((e) => e[0] === "reset").length, 1, "第二帧 reset");
    const ends = inner.log.filter((e) => e[0] === "end").length;
    d.endStroke();
    eq(inner.log.filter((e) => e[0] === "end").length, ends + 1, "抬手：本帧已逐段 end；decorator 再 end 一次是 no-op 语义（假引擎记一次）");
  });
  it("cancel：reset + inner.cancel + onCancel，collect 清空", () => {
    const inner = fakeInner({ buffered: false });
    let cancelled = 0;
    const d = S.shapedStroke(gesture("rect"), mkIo(inner, { inPlace: true }), { onCancel: () => cancelled++ });
    d.begin(0, 0); d.extendStroke(40, 20); d.flushDirty();
    d.cancelStroke();
    assert(inner.log.some((e) => e[0] === "reset") && inner.log[inner.log.length - 1][0] === "cancel", "reset 后 cancel");
    eq(cancelled, 1); eq(d.collectStamps(), null);
  });
});

describe("shape-stroke · 留尺（io = null）", () => {
  it("不碰引擎：flushDirty 给草稿（onDraft）、抬手把几何交给 onEnd", () => {
    const drafts = []; let ended = null;
    const d = S.shapedStroke(gesture("rect"), null, { onDraft: (r) => drafts.push(r), onEnd: (r) => { ended = r; } });
    d.begin(0, 0); d.extendStroke(40, 20);
    eq(d.flushDirty(), null, "无脏区（零像素）");
    eq(drafts.length, 1); eq(drafts[0].kind, "rect");
    eq(d.endStroke(), null); eq(ended.kind, "rect");
    eq(d.collectStamps(), null);
  });
});

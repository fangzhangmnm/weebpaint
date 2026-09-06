// curve-editor 编辑器皮：纯函数几何 + dom-shim 下构造/句柄不抛。created 2026-09-05 by Claude Fable 5.1
import { describe, it, eq, assert } from "./runner.mjs";
import {
  dataToPx, pxToData, handleOffsetPx, slopeFromHandlePx, pickInsertT, canRemoveKey, keyboardNudge, HANDLE_LEN_PX,
  makeCurveEditor, weightedHandleOffsetPx, weightFromHandlePx,
} from "../src/ui/curve-editor.ts";
import { identityCurve, makeCurve } from "../src/common/anim-curve.ts";

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const SZ = { w: 300, h: 300 };

describe("curve-editor · 坐标映射", () => {
  it("data↔px 互逆，y 翻转", () => {
    const p = dataToPx(0.25, 0.75, SZ);
    eq(p.x, 75); eq(p.y, 75);
    const d = pxToData(75, 75, SZ);
    assert(near(d.t, 0.25) && near(d.v, 0.75));
    eq(dataToPx(0, 0, SZ).y, 300, "v=0 在底边");
  });
});

describe("curve-editor · 把手几何", () => {
  it("斜率 1 → 45° 定长 40px；in 侧反向", () => {
    const o = handleOffsetPx(1, "out", SZ);
    assert(near(Math.hypot(o.dx, o.dy), HANDLE_LEN_PX));
    assert(o.dx > 0 && o.dy < 0, "向右上");
    assert(near(o.dx, -o.dy));
    const i = handleOffsetPx(1, "in", SZ);
    assert(near(i.dx, -o.dx) && near(i.dy, -o.dy));
  });
  it("非方形绘图区：屏幕方向按纵横比换算", () => {
    const o = handleOffsetPx(1, "out", { w: 400, h: 200 });
    // 数据 (1,1) → 屏幕 (400, -200)：dx:dy = 2:1
    assert(near(o.dx / -o.dy, 2));
  });
  it("把手 px → 斜率 与 offset 互逆；dt 钳到该侧（防翻面）", () => {
    for (const m of [0, 0.5, 1, 3, -2]) {
      const o = handleOffsetPx(m, "out", SZ);
      assert(near(slopeFromHandlePx(o.dx, o.dy, "out", SZ), m, 1e-9), `out m=${m}`);
      const i = handleOffsetPx(m, "in", SZ);
      assert(near(slopeFromHandlePx(i.dx, i.dy, "in", SZ), m, 1e-9), `in m=${m}`);
    }
    // 拖到 key 左侧（out 侧翻面）→ dt 钳 1e-3，斜率有限且方向按 dv
    const s = slopeFromHandlePx(-50, -30, "out", SZ);
    assert(Number.isFinite(s) && s > 0);
    eq(slopeFromHandlePx(0, 0, "out", SZ), 0);
  });
});

describe("curve-editor · ＋/🗑 规则", () => {
  const keys = (...ts) => ts.map((t) => ({ t, v: t }));
  it("pickInsertT：选中与右邻中点；末 key 与左邻；无选中最大间隔", () => {
    eq(pickInsertT(keys(0, 0.2, 1), 0), 0.1);
    eq(pickInsertT(keys(0, 0.2, 1), 2), 0.6);
    eq(pickInsertT(keys(0, 0.2, 1), -1), 0.6);
    eq(pickInsertT(keys(0, 1), -1), 0.5);
    eq(pickInsertT([], -1), 0.5);
    eq(pickInsertT(keys(0.2), -1), 1);
  });
  it("canRemoveKey：端点锁 / 至少两点", () => {
    eq(canRemoveKey(3, 1, true), true);
    eq(canRemoveKey(3, 0, true), false);
    eq(canRemoveKey(3, 2, true), false);
    eq(canRemoveKey(3, 0, false), true);
    eq(canRemoveKey(2, 1, false), false);
    eq(canRemoveKey(3, -1, false), false);
  });
  it("keyboardNudge：方向键 / shift ×10 / 非方向键 null", () => {
    eq(keyboardNudge("ArrowUp", false, 1 / 255).dv, 1 / 255);
    eq(keyboardNudge("ArrowLeft", true, 0.01).dt, -0.1);
    eq(keyboardNudge("a", false, 1), null);
  });
});

describe("curve-editor · dom-shim 构造", () => {
  it("makeCurveEditor 建/切曲线/select/dispose 不抛；data-* 反映 key 数与选中", () => {
    let inputs = 0, commits = 0;
    const c = identityCurve();
    const h = makeCurveEditor({ curve: c, lockEndpointsT: true, onInput: () => inputs++, onCommit: () => commits++ });
    eq(h.selected(), -1);
    eq(h.el.dataset.keyCount, "2");
    h.select(1);
    eq(h.selected(), 1);
    eq(h.el.dataset.selected, "1");
    h.setCurve(makeCurve([{ t: 0, v: 0 }, { t: 0.5, v: 0.7 }, { t: 1, v: 1 }]));
    eq(h.el.dataset.keyCount, "3");
    eq(h.selected(), -1);
    h.redraw();
    h.dispose();
    eq(inputs, 0); eq(commits, 0);
  });
});

describe("curve-editor · 加权把手几何", () => {
  it("钮 = 控制点：w·Δt 沿切线；权重 ↔ 偏移互逆；in 侧反向", () => {
    const o = weightedHandleOffsetPx(1, 0.5, 0.4, "out", SZ);   // Δt_seg 0.4 → dt 0.2 → 60px
    assert(near(o.dx, 60) && near(o.dy, -60));
    assert(near(weightFromHandlePx(o.dx, 0.4, SZ), 0.5));
    const i = weightedHandleOffsetPx(1, 0.5, 0.4, "in", SZ);
    assert(near(i.dx, -60) && near(i.dy, 60));
    assert(near(weightFromHandlePx(i.dx, 0.4, SZ), 0.5));
  });
  it("权重钳 [0.05, 1]；Δt=0 不炸", () => {
    eq(weightFromHandlePx(10000, 0.4, SZ), 1);
    eq(weightFromHandlePx(0, 0.4, SZ), 0.05);
    assert(Number.isFinite(weightedHandleOffsetPx(1, 0.3, 0, "out", SZ).dx));
  });
});

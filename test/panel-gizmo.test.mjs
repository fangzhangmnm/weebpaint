// 浮窗把手深模块（src/ui/panel-gizmo.ts）：钳制纯函数 + 把手接线（DOM shim 上合成 pointer 事件）。
// created 2026-09-02 by Claude Fable 5.1.
import { describe, it, eq, assert } from "./runner.mjs";
const deq = (a, b, m) => eq(JSON.stringify(a), JSON.stringify(b), m);   // runner 的 eq 是 ===；结构比较走 JSON
import { clampPanelPos, clampSize, attachPanelDrag, attachPanelResize, PANEL_TOP_FLOOR } from "../src/ui/panel-gizmo.ts";

describe("panel-gizmo · clampPanelPos", () => {
  const vp = { w: 1000, h: 800 }, size = { w: 200, h: 300 };
  it("视口内原样", () => deq(clampPanelPos({ left: 100, top: 120 }, size, vp), { left: 100, top: 120 }));
  it("左/上越界 → 0 / 顶地板 60（iPad 出血区）", () => {
    deq(clampPanelPos({ left: -50, top: 10 }, size, vp), { left: 0, top: PANEL_TOP_FLOOR });
  });
  it("右/下越界 → vw-w / vh-h", () => deq(clampPanelPos({ left: 950, top: 700 }, size, vp), { left: 800, top: 500 }));
  it("自定义 topFloor", () => deq(clampPanelPos({ left: 0, top: 0 }, size, vp, 96).top, 96));
  it("窗比视口大：取靠左/靠上那端（不产生负 max 的反转）", () => {
    deq(clampPanelPos({ left: 500, top: 500 }, { w: 1200, h: 900 }, vp), { left: 0, top: PANEL_TOP_FLOOR });
  });
  it("clampSize", () => { eq(clampSize(50, 100, 300), 100); eq(clampSize(500, 100, 300), 300); eq(clampSize(200, 100, Infinity), 200); });
});

// ---- 把手接线：用 shim 的 EventTarget 合成 pointer 事件 ----
function fakeEl(rect) {
  const listeners = {};
  return {
    _rect: rect, offsetWidth: rect.width, offsetHeight: rect.height,
    getBoundingClientRect() { return { ...this._rect, right: this._rect.left + this._rect.width, bottom: this._rect.top + this._rect.height }; },
    addEventListener(t, f) { (listeners[t] ??= []).push(f); },
    removeEventListener(t, f) { listeners[t] = (listeners[t] || []).filter((g) => g !== f); },
    dispatch(t, e) { for (const f of listeners[t] || []) f(e); },
    setPointerCapture() { this.captured = true; }, releasePointerCapture() { this.captured = false; },
    listenerCount(t) { return (listeners[t] || []).length; },
  };
}
const pe = (pointerId, clientX, clientY, target = null) => ({ pointerId, clientX, clientY, target, preventDefault() {}, stopPropagation() {} });

describe("panel-gizmo · attachPanelDrag", () => {
  it("down→move 输出钳制后的位置；up 释放；别的 pointerId 不理", () => {
    globalThis.window.innerWidth = 1000; globalThis.window.innerHeight = 800;
    const panel = fakeEl({ left: 100, top: 100, width: 200, height: 300 });
    const head = fakeEl({ left: 100, top: 100, width: 200, height: 30 });
    const moves = []; let ended = 0;
    attachPanelDrag(panel, head, { onMove: (p) => moves.push(p), onEnd: () => ended++ });
    head.dispatch("pointerdown", pe(1, 150, 110));
    assert(head.captured);
    head.dispatch("pointermove", pe(2, 999, 999));          // 别的指针
    head.dispatch("pointermove", pe(1, 250, 160));          // +100,+50
    head.dispatch("pointermove", pe(1, -500, 2000));        // 越界
    deq(moves, [{ left: 200, top: 150 }, { left: 0, top: 500 }]);
    head.dispatch("pointerup", pe(1, 0, 0));
    eq(ended, 1); assert(!head.captured);
    head.dispatch("pointermove", pe(1, 300, 300));          // up 后不再动
    eq(moves.length, 2);
  });
  it("ignore：点到关闭钮不起拖", () => {
    const panel = fakeEl({ left: 0, top: 0, width: 100, height: 100 }), head = fakeEl({ left: 0, top: 0, width: 100, height: 20 });
    const moves = [];
    // shim 里 Element 可能不是真类：ignore 只在 target 是 Element 时才问 → 用 document.createElement 造一个
    const closeBtn = globalThis.document.createElement("button");
    attachPanelDrag(panel, head, { ignore: (t) => t === closeBtn, onMove: (p) => moves.push(p) });
    head.dispatch("pointerdown", pe(1, 5, 5, closeBtn));
    head.dispatch("pointermove", pe(1, 50, 50));
    eq(moves.length, 0);
  });
  it("dispose 后无监听", () => {
    const panel = fakeEl({ left: 0, top: 0, width: 100, height: 100 }), head = fakeEl({ left: 0, top: 0, width: 100, height: 20 });
    const h = attachPanelDrag(panel, head, { onMove() {} });
    eq(head.listenerCount("pointermove"), 1); h.dispose(); eq(head.listenerCount("pointermove"), 0);
  });
});

describe("panel-gizmo · attachPanelResize", () => {
  it("delta 加到起拖尺寸上，按 min/max 钳；默认 max.w = 视口右缘留 8", () => {
    globalThis.window.innerWidth = 1000; globalThis.window.innerHeight = 800;
    const panel = fakeEl({ left: 700, top: 100, width: 200, height: 300 }), grip = fakeEl({ left: 0, top: 0, width: 22, height: 22 });
    const sizes = [];
    attachPanelResize(panel, grip, { getSize: () => ({ w: 200, h: 260 }), min: { w: 180, h: 0 }, onResize: (s) => sizes.push(s) });
    grip.dispatch("pointerdown", pe(3, 900, 400));
    grip.dispatch("pointermove", pe(3, 950, 420));     // +50,+20 → w 250, h 280
    grip.dispatch("pointermove", pe(3, 1500, 0));      // w 超上限 → 1000-700-8=292；h 负 → 0
    grip.dispatch("pointermove", pe(3, 700, 400));     // w 0 → min 180
    deq(sizes, [{ w: 250, h: 280 }, { w: 292, h: 0 }, { w: 180, h: 260 }]);
    grip.dispatch("pointerup", pe(3, 0, 0));
    assert(!grip.captured);
  });
});

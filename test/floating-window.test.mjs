// FloatingWindow 深模块（src/ui/floating-window.ts）：地板纯函数 / z 栈归一化 / transient 去留 / restore·open 钳制。
// created 2026-09-02 by Claude Fable 5.1（UI 纪元 C2）。
import { describe, it, eq, assert } from "./runner.mjs";
import {
  computeTopFloor, TOP_DEAD_ZONE_MIN, FLOOR_GAP, floatingTopFloor,
  registerFloatingWindow, suppressFloatingForTransient, restoreFloatingAfterTransient,
  clampAllFloatingWindows, floatingWindowStack, floatingWindowOf,
} from "../src/ui/floating-window.ts";
const deq = (a, b, m) => eq(JSON.stringify(a), JSON.stringify(b), m);

describe("floating-window · computeTopFloor（出血区地板）", () => {
  it("顶栏可见：地板 = 顶栏下缘 + 间距（顶栏能点，它下面就能点）", () => eq(computeTopFloor(0, 50), 50 + FLOOR_GAP));
  it("顶栏不可见：地板 = safe-area + 死区硬底线", () => eq(computeTopFloor(24, null), 24 + TOP_DEAD_ZONE_MIN));
  it("顶栏很矮时硬底线兜底（iOS 18+ 横屏死区 env() 报 0）", () => eq(computeTopFloor(0, 10), TOP_DEAD_ZONE_MIN));
  it("运行时地板 ≥ 死区硬底线（shim 里 #topBar 无高度 → 走底线）", () => assert(floatingTopFloor() >= TOP_DEAD_ZONE_MIN));
});

// ---- 假浮窗：只暴露 module 用到的面（classList/style/rect/offset/listeners）----
function fakeWin(rect, hidden = true) {
  const cls = new Set(hidden ? ["hidden"] : []);
  const listeners = {};
  const el = {
    _rect: { ...rect }, style: {},
    classList: { contains: (c) => cls.has(c), add: (c) => cls.add(c), remove: (c) => cls.delete(c), toggle(c, f) { f ? cls.add(c) : cls.delete(c); } },
    get offsetWidth() { return cls.has("hidden") ? 0 : this._rect.width; },
    get offsetHeight() { return cls.has("hidden") ? 0 : this._rect.height; },
    getBoundingClientRect() { return { ...this._rect, right: this._rect.left + this._rect.width, bottom: this._rect.top + this._rect.height }; },
    addEventListener(t, f) { (listeners[t] ??= []).push(f); },
    removeEventListener(t, f) { listeners[t] = (listeners[t] || []).filter((g) => g !== f); },
    dispatch(t, e = {}) { for (const f of listeners[t] || []) f(e); },
    setPointerCapture() {}, releasePointerCapture() {},
    tagName: "DIV", closest: () => null,
  };
  return el;
}
const z = (el) => parseInt(el.style.zIndex, 10);
function fresh(n, opts = {}) {
  const ws = [];
  for (let i = 0; i < n; i++) {
    const el = fakeWin({ left: 100 + i * 10, top: 100 + i * 10, width: 200, height: 150 });
    ws.push({ el, h: registerFloatingWindow(el, { id: "w" + i, ...(opts[i] ?? {}) }) });
  }
  return ws;
}

describe("floating-window · z 栈", () => {
  it("注册进栈底；open 置顶；点窗置顶；z 永远困在 band 内（base + 序号）", () => {
    const [a, b, c] = fresh(3);
    const base = z(a.el) - floatingWindowStack().indexOf("w0");
    a.h.open(); b.h.open(); c.h.open();
    assert(z(c.el) > z(b.el) && z(b.el) > z(a.el), "开谁谁到顶");
    a.el.dispatch("pointerdown");
    assert(z(a.el) > z(c.el), "点窗到顶");
    // 全栈 z 连续且 ≥ base（归一化，无递增计数器）
    const all = [a, b, c].map((w) => z(w.el)).sort((x, y) => x - y);
    assert(all.every((v, i) => i === 0 || v === all[i - 1] + 1), "z 连续");
    assert(all[0] >= base, "不低于 band 基底");
    a.h.dispose(); b.h.dispose(); c.h.dispose();
  });
  it("dispose 出栈，其余重新归一化", () => {
    const [a, b] = fresh(2);
    a.h.open(); b.h.open();
    a.h.dispose();
    assert(floatingWindowOf(a.el) === null, "出栈");
    assert(floatingWindowOf(b.el) !== null && Number.isFinite(z(b.el)));
    b.h.dispose();
  });
});

describe("floating-window · transient 去留（v116 白名单 → 每窗自述）", () => {
  it("keepDuring 之外的 mode 藏；缺省 transient 的窗从不被藏；复原只复原被藏的", () => {
    const [color, layers, adjust] = fresh(3, {
      0: { transient: { keepDuring: [] } },
      1: { transient: { keepDuring: ["transform", "adjust-color"] } },
      2: {},   // adjust：从不抑制
    });
    color.h.open(); layers.h.open(); adjust.h.open();
    suppressFloatingForTransient("transform");
    assert(!color.h.isOpen(), "颜色窗 transform 时藏");
    assert(layers.h.isOpen(), "图层窗 transform 时留");
    assert(adjust.h.isOpen(), "调整窗从不藏");
    restoreFloatingAfterTransient();
    assert(color.h.isOpen(), "复原");
    suppressFloatingForTransient("crop");
    assert(!color.h.isOpen() && !layers.h.isOpen() && adjust.h.isOpen(), "crop：颜色/图层都藏");
    // 嵌套（transition 间套用）：先复原再藏，不会把「本来就关着的」当成被抑制的
    color.h.close();
    suppressFloatingForTransient("adjust-color");
    restoreFloatingAfterTransient();
    assert(!color.h.isOpen(), "用户自己关的窗不会被复原成开");
    assert(layers.h.isOpen());
    [color, layers, adjust].forEach((w) => w.h.dispose());
  });
  it("抑制/复原不触发 onOpenChange（aria 不抖）", () => {
    let calls = 0;
    const [w] = fresh(1, { 0: { transient: { keepDuring: [] }, onOpenChange: () => calls++ } });
    w.h.open(); eq(calls, 1);
    suppressFloatingForTransient("crop"); restoreFloatingAfterTransient();
    eq(calls, 1);
    w.h.dispose();
  });
});

describe("floating-window · 钳制（restore / open 兜底 / 视口变）", () => {
  it("restore：越界坐标钳到视口内 + 出血区地板；hidden 时用 pos/fallback 尺寸", () => {
    globalThis.window.innerWidth = 1000; globalThis.window.innerHeight = 800;
    const [w] = fresh(1, { 0: { fallbackSize: { w: 200, h: 150 } } });
    w.h.restore({ left: -500, top: -500 });
    eq(w.el.style.left, "0px");
    eq(w.el.style.top, floatingTopFloor() + "px", "top 钳到地板（不再是手填 60）");
    w.h.restore({ left: 5000, top: 5000 });
    eq(w.el.style.left, (1000 - 200) + "px"); eq(w.el.style.top, (800 - 150) + "px");
    w.h.dispose();
  });
  it("restore(null)：清 inline 几何（上一张画的出屏坐标不许粘住）", () => {
    const [w] = fresh(1);
    w.h.restore({ left: 10, top: 500 });
    w.h.restore(null);
    eq(w.el.style.left, ""); eq(w.el.style.top, ""); eq(w.el.style.width, "");
    w.h.dispose();
  });
  it("restore 带 width：按 resize.min 与视口钳；带 apply 的窗不写 height（图层窗「高=列表高」语义）", () => {
    globalThis.window.innerWidth = 1000; globalThis.window.innerHeight = 800;
    const grip = fakeWin({ left: 0, top: 0, width: 22, height: 22 }, false);
    const [w] = fresh(1, { 0: { resize: { grip, min: { w: 200, h: 0 }, apply: () => {} } } });
    w.h.restore({ left: 10, top: 100, width: 50, height: 999 });
    eq(w.el.style.width, "200px"); eq(w.el.style.height, undefined);
    w.h.restore({ left: 10, top: 100, width: 5000 });
    eq(w.el.style.width, (1000 - 24) + "px");
    w.h.dispose();
  });
  it("open：兜底回屏——无论坐标从哪条路粘上来，开的瞬间在视口内", () => {
    globalThis.window.innerWidth = 1000; globalThis.window.innerHeight = 800;
    const [w] = fresh(1);
    w.el._rect = { left: 950, top: -100, width: 200, height: 150 };   // 粘上来的出屏几何
    w.h.open();
    eq(w.el.style.left, "800px"); eq(w.el.style.top, floatingTopFloor() + "px");
    w.h.dispose();
  });
  it("视口变：所有开着的窗重钳 + onViewport 收到地板（参考窗端口）", () => {
    globalThis.window.innerWidth = 1000; globalThis.window.innerHeight = 800;
    let got = null;
    const [a, b] = fresh(2, { 1: { onViewport: (f) => { got = f; } } });
    a.h.open(); b.h.open();
    a.el._rect = { left: 900, top: 700, width: 200, height: 150 };
    globalThis.window.innerWidth = 600; globalThis.window.innerHeight = 500;   // 旋转/Split View 变小
    clampAllFloatingWindows();
    eq(a.el.style.left, "400px"); eq(a.el.style.top, "350px");
    eq(got, floatingTopFloor());
    a.h.dispose(); b.h.dispose();
  });
  it("拖动：走 panel-gizmo，地板现算（不是注册时的常数）", () => {
    globalThis.window.innerWidth = 1000; globalThis.window.innerHeight = 800;
    const head = fakeWin({ left: 100, top: 100, width: 200, height: 30 }, false);
    const moves = [];
    const [w] = fresh(1, { 0: { head, onMove: (p) => moves.push(p) } });
    w.h.open();
    const pe = (id, x, y) => ({ pointerId: id, clientX: x, clientY: y, target: null, preventDefault() {}, stopPropagation() {} });
    head.dispatch("pointerdown", pe(1, 150, 110));
    head.dispatch("pointermove", pe(1, 150, -900));
    head.dispatch("pointerup", pe(1, 150, -900));
    eq(moves.length, 1); eq(moves[0].top, floatingTopFloor());
    eq(w.el.style.top, floatingTopFloor() + "px");
    w.h.dispose();
  });
});

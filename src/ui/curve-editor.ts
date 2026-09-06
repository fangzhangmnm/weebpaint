// curve-editor —— anim-curve 的编辑器皮（SVG 曲线 + HTML 键/把手/overlay 钮）。
// created 2026-09-05 by Claude Fable 5.1。提案 = ai-docs/20260830-curve-and-ramp-deep-module-proposal.md §2.4。
//
// user 2026-08-30 拍板：Unity 肌肉记忆（选中 key 露切线把手，拖把手改斜率）；增删点走**实体 overlay 钮**
//   （参考窗 gizmo 语言：右上角 28px 半透明圆钮，闲置 2.5s 淡至 .35，能悬停的设备指针离窗全隐）——
//   不做双击加点、不做拖出删；渲染 SVG。
//
// 分层：
//   · 纯函数（node 直测，test/curve-editor.test.mjs）：screen↔data 映射、把手几何、插入位置挑选、键盘微调。
//   · DOM 皮：一个 <div class="curve-editor">；曲线/网格/把手线 = <svg viewBox="0 0 1000 1000">（非缩放描边）；
//     key 与把手钮 = 绝对定位 HTML 元素（CSS px 尺寸、真实触屏命中面，不做 viewBox 单位换算）。
//   · 数学全在 common/anim-curve.ts；本模块只调 verb（moveKey/insertKey/removeKey/setTangent/…）。
//   · 拖 key = drag-value 的 rel 状态机（按住 shift 细调 ×0.15；抓取不跳变——起手锚在 key 当前值，不是指针位置）。
//   · 值域：t、v 都钳 [0,1]（调整曲线 / 压感消费者的域；时间轴皮另做 pan/zoom，本轮不做）。
//   · 尺寸（user 2026-09-05「曲线窗口可以做的默认再小一点，原来的 50-60%，然后加可变大小」）：绘图区默认 200px 正方形
//     （原 362 的 55%），右下角 grip 拖拽改边长（ui/panel-gizmo attachPanelResize），本 session 记住上次尺寸（不持久化——
//     持久化键要 user 点头）。把手钮 16px / 把手长 56px / 线 2px（「曲线手柄太小」）。
//   · 宿主持 AnimCurve 引用，本编辑器**原地改**（宿主 params 就是它）；onInput 每变一次、onCommit 每手势收尾。

import {
  type AnimCurve, type TangentMode, type Keyframe, TANGENT_MODES,
  evaluate, insertKey, removeKey, moveKey, setTangentMode, setTangent, setBroken, identityCurve,
} from "../common/anim-curve.ts";
import { dragMove, type DragState } from "./drag-value.ts";
import { attachPanelResize } from "./panel-gizmo.ts";
import { createSelectField, type SelectField } from "./select-field.ts";
import { iconHtml } from "./icon.ts";
import { t as tr } from "../i18n/index.ts";

// ---- 纯函数 ----

export interface PlotSize { w: number; h: number }   // 绘图区 CSS px

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** 数据 (t,v) → 绘图区 px（y 翻转）。 */
export function dataToPx(t: number, v: number, size: PlotSize): { x: number; y: number } {
  return { x: t * size.w, y: (1 - v) * size.h };
}
/** 绘图区 px → 数据（不钳制，调用方决定）。 */
export function pxToData(x: number, y: number, size: PlotSize): { t: number; v: number } {
  return { t: x / (size.w || 1), v: 1 - y / (size.h || 1) };
}

export const HANDLE_LEN_PX = 56;
const MIN_HANDLE_DT = 1e-3;   // 把手不许翻到 key 另一侧（Unity 同）；dt 下限保斜率有限

/** 把手钮相对 key 的 px 偏移：斜率 m = dv/dt 的屏幕方向（in 侧反向），定长 HANDLE_LEN_PX。 */
export function handleOffsetPx(slope: number, side: "in" | "out", size: PlotSize, len = HANDLE_LEN_PX): { dx: number; dy: number } {
  const m = Number.isFinite(slope) ? slope : 0;
  let vx = size.w, vy = -m * size.h;            // 数据方向 (1, m) → 屏幕 (w, -m·h)
  const L = Math.hypot(vx, vy) || 1;
  vx = (vx / L) * len; vy = (vy / L) * len;
  return side === "out" ? { dx: vx, dy: vy } : { dx: -vx, dy: -vy };
}

/** 把手钮屏幕偏移 → 斜率（dt 钳到该侧，防翻面/无穷）。 */
export function slopeFromHandlePx(dx: number, dy: number, side: "in" | "out", size: PlotSize): number {
  let dt = dx / (size.w || 1);
  const dv = -dy / (size.h || 1);
  if (side === "out") dt = Math.max(MIN_HANDLE_DT, dt);
  else dt = Math.min(-MIN_HANDLE_DT, dt);
  return dv / dt;
}

/** ＋ 钮的插入位置：选中 key 与右邻中点；选中末 key → 与左邻中点；无选中 → 最大间隔中点。 */
export function pickInsertT(keys: readonly Keyframe[], selected: number): number {
  const n = keys.length;
  if (n === 0) return 0.5;
  if (n === 1) return keys[0].t < 0.5 ? 1 : 0;
  if (selected >= 0 && selected < n - 1) return (keys[selected].t + keys[selected + 1].t) / 2;
  if (selected === n - 1) return (keys[n - 2].t + keys[n - 1].t) / 2;
  let bi = 0, bg = -1;
  for (let i = 0; i < n - 1; i++) {
    const g = keys[i + 1].t - keys[i].t;
    if (g > bg) { bg = g; bi = i; }
  }
  return (keys[bi].t + keys[bi + 1].t) / 2;
}

/** 该 key 能否删（端点锁 / 至少留两点）。 */
export function canRemoveKey(n: number, i: number, lockEndpointsT: boolean): boolean {
  if (i < 0 || i >= n || n <= 2) return false;
  if (lockEndpointsT && (i === 0 || i === n - 1)) return false;
  return true;
}

/** 键盘微调：方向键 → (dt, dv)；shift ×10。返回 null = 不是微调键。 */
export function keyboardNudge(key: string, shift: boolean, step: number): { dt: number; dv: number } | null {
  const s = shift ? step * 10 : step;
  switch (key) {
    case "ArrowLeft": return { dt: -s, dv: 0 };
    case "ArrowRight": return { dt: s, dv: 0 };
    case "ArrowUp": return { dt: 0, dv: s };
    case "ArrowDown": return { dt: 0, dv: -s };
  }
  return null;
}

// ---- DOM 皮 ----

export interface CurveEditorOpts {
  curve: AnimCurve;                 // 引用持有，原地改
  plotSize?: number;                // 初始绘图区边长 px（缺省 = 本 session 上次拖到的尺寸，起始 DEFAULT_PLOT_SIZE）
  lockEndpointsT?: boolean;         // 首尾 key t 钉 0/1 且不可删（调整曲线 / 压感 = true）
  showIdentity?: boolean;           // 对角参考线（默认 true）
  accent?: string;                  // 曲线色（缺省 --accent）
  fmt?: (t: number, v: number) => string;   // 选中 key 读数
  keyStep?: number;                 // 键盘微调步长（数据单位；默认 1/255）
  onInput(): void;                  // 形状每变一次
  onCommit(): void;                 // 一次手势结束
}
export interface CurveEditorHandle {
  el: HTMLElement;
  setCurve(c: AnimCurve): void;
  redraw(): void;
  selected(): number;
  select(i: number): void;
  dispose(): void;
}

const IDLE_DIM_MS = 2500;
const VB = 1000;   // svg viewBox 边长（逻辑单位）
export const DEFAULT_PLOT_SIZE = 200;
const MIN_PLOT_SIZE = 120;
let _sessionPlotSize = DEFAULT_PLOT_SIZE;   // 本 session 上次拖到的边长（所有曲线编辑器共用）

export function makeCurveEditor(o: CurveEditorOpts): CurveEditorHandle {
  let curve = o.curve;
  const lockEnds = o.lockEndpointsT ?? false;
  const keyStep = o.keyStep ?? 1 / 255;
  let sel = -1;

  const el = document.createElement("div");
  el.className = "curve-editor";
  el.tabIndex = 0;
  if (o.accent) el.style.setProperty("--curve-accent", o.accent);
  el.innerHTML =
    `<div class="ce-plot">` +
      `<svg viewBox="0 0 ${VB} ${VB}" preserveAspectRatio="none" aria-hidden="true">` +
        `<g class="ce-grid"></g>` +
        `<line class="ce-identity" x1="0" y1="${VB}" x2="${VB}" y2="0"></line>` +
        `<path class="ce-curve" d=""></path>` +
        `<line class="ce-hline" data-side="in"></line>` +
        `<line class="ce-hline" data-side="out"></line>` +
      `</svg>` +
      `<div class="ce-keys"></div>` +
      `<div class="ce-knob" data-side="in" hidden></div>` +
      `<div class="ce-knob" data-side="out" hidden></div>` +
      `<div class="ce-gizmos">` +
        `<button type="button" class="ce-gizmo" data-act="add">${iconHtml("new")}</button>` +
        `<button type="button" class="ce-gizmo" data-act="del">${iconHtml("trash-can")}</button>` +
      `</div>` +
      `<div class="ce-grip" data-act="resize" aria-hidden="true"></div>` +
    `</div>` +
    `<div class="ce-row ce-row-readout"><span class="ce-readout"></span></div>` +
    `<div class="ce-row ce-row-tangent">` +
      `<span class="ce-label"></span>` +
      `<span class="ce-select-slot"></span>` +
      `<button type="button" class="ce-btn" data-act="broken" aria-pressed="false"></button>` +
      `<button type="button" class="ce-btn" data-act="reset"></button>` +
    `</div>`;

  const q = <T extends Element = HTMLElement>(s: string) => el.querySelector(s) as T;
  const plot = q(".ce-plot");
  const svg = q<SVGSVGElement>("svg");
  const grid = q<SVGGElement>(".ce-grid");
  const identity = q<SVGLineElement>(".ce-identity");
  const pathEl = q<SVGPathElement>(".ce-curve");
  const hlineIn = q<SVGLineElement>('.ce-hline[data-side="in"]');
  const hlineOut = q<SVGLineElement>('.ce-hline[data-side="out"]');
  const keysEl = q(".ce-keys");
  const knobIn = q('.ce-knob[data-side="in"]');
  const knobOut = q('.ce-knob[data-side="out"]');
  const addBtn = q<HTMLButtonElement>('.ce-gizmo[data-act="add"]');
  const delBtn = q<HTMLButtonElement>('.ce-gizmo[data-act="del"]');
  const readout = q(".ce-readout");
  const grip = q(".ce-grip");
  const brokenBtn = q<HTMLButtonElement>('.ce-btn[data-act="broken"]');
  const resetBtn = q<HTMLButtonElement>('.ce-btn[data-act="reset"]');

  // 静态文案
  q(".ce-label").textContent = tr("curve.tangent");
  brokenBtn.textContent = tr("curve.broken");
  resetBtn.textContent = tr("curve.reset");
  addBtn.title = tr("curve.addKey"); addBtn.setAttribute("aria-label", tr("curve.addKey"));
  delBtn.title = tr("curve.removeKey"); delBtn.setAttribute("aria-label", tr("curve.removeKey"));
  if (o.showIdentity === false) identity.setAttribute("hidden", "");

  // 网格 4×4
  {
    let g = "";
    for (let i = 1; i < 4; i++) {
      const p = (i / 4) * VB;
      g += `<line x1="${p}" y1="0" x2="${p}" y2="${VB}"></line><line x1="0" y1="${p}" x2="${VB}" y2="${p}"></line>`;
    }
    grid.innerHTML = g;
  }

  // 切线模式下拉（select-field 标准件）
  const MODE_LABEL: Record<TangentMode, string> = {
    clampedAuto: tr("curve.mode.clampedAuto"), auto: tr("curve.mode.auto"), free: tr("curve.mode.free"),
    flat: tr("curve.mode.flat"), linear: tr("curve.mode.linear"), constant: tr("curve.mode.constant"),
  };
  const modeField: SelectField = createSelectField({
    className: "generic-sheet-input ce-mode",
    items: () => TANGENT_MODES.map((m) => ({ value: m, label: MODE_LABEL[m] })),
    value: () => (sel >= 0 && curve.keys[sel] ? curve.keys[sel].outMode : "clampedAuto"),
    onChange: (v) => {
      if (sel < 0 || !curve.keys[sel]) return;
      setTangentMode(curve, sel, v as TangentMode, "both");
      redraw(); o.onInput(); o.onCommit();
    },
  });
  q(".ce-select-slot").appendChild(modeField.el);

  const plotSize = (): PlotSize => {
    const r = plot.getBoundingClientRect();
    return { w: r.width || plotPx, h: r.height || plotPx };
  };

  // 绘图区边长：inline 写死 px（CSS 只给 margin/边框），grip 拖拽改；本 session 记忆
  let plotPx = Math.max(MIN_PLOT_SIZE, Math.round(o.plotSize ?? _sessionPlotSize));
  const maxPlotPx = () => Math.max(MIN_PLOT_SIZE, (el.clientWidth || 380) - 4);
  const applyPlotSize = () => { plot.style.width = `${plotPx}px`; plot.style.height = `${plotPx}px`; };
  applyPlotSize();
  const resizeGizmo = attachPanelResize(plot, grip, {
    getSize: () => ({ w: plotPx, h: plotPx }),
    min: { w: MIN_PLOT_SIZE, h: MIN_PLOT_SIZE },
    max: () => { const m = maxPlotPx(); return { w: m, h: m }; },
    onResize: ({ w, h }) => { plotPx = Math.min(maxPlotPx(), Math.round(Math.max(w, h))); applyPlotSize(); redraw(); },   // 正方形：取长边
    onEnd: () => { _sessionPlotSize = plotPx; },
  });

  // ---- 绘制 ----
  const fmt = o.fmt ?? ((t: number, v: number) => `${t.toFixed(3)} → ${v.toFixed(3)}`);
  function redraw(): void {
    const keys = curve.keys;
    if (sel >= keys.length) sel = -1;
    // 曲线 path：129 采样，v 钳 [0,1]（所见即所烤：LUT clamp8 同口径）
    const N = 128;
    let d = "";
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const v = clamp01(evaluate(curve, t));
      d += `${i === 0 ? "M" : "L"}${(t * VB).toFixed(1)} ${((1 - v) * VB).toFixed(1)}`;
    }
    pathEl.setAttribute("d", d);
    // keys
    while (keysEl.children.length > keys.length) keysEl.removeChild(keysEl.lastChild!);
    while (keysEl.children.length < keys.length) {
      const k = document.createElement("div");
      k.className = "ce-key";
      keysEl.appendChild(k);
    }
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const kel = keysEl.children[i] as HTMLElement;
      kel.dataset.i = String(i);
      kel.dataset.t = k.t.toFixed(4);
      kel.dataset.v = k.v.toFixed(4);
      kel.dataset.inMode = k.inMode;
      kel.dataset.outMode = k.outMode;
      kel.style.left = `${clamp01(k.t) * 100}%`;
      kel.style.top = `${(1 - clamp01(k.v)) * 100}%`;
      kel.classList.toggle("selected", i === sel);
      kel.classList.toggle("locked", lockEnds && (i === 0 || i === keys.length - 1));
    }
    // 把手（只在选中 key 露出；端点缺侧 / constant 侧不露）
    const k = sel >= 0 ? keys[sel] : null;
    const size = plotSize();
    const showSide = (side: "in" | "out"): boolean => {
      if (!k) return false;
      if (side === "in" && (sel === 0 || k.inMode === "constant")) return false;
      if (side === "out" && (sel === keys.length - 1 || k.outMode === "constant")) return false;
      return true;
    };
    for (const side of ["in", "out"] as const) {
      const knob = side === "in" ? knobIn : knobOut;
      const line = side === "in" ? hlineIn : hlineOut;
      if (!k || !showSide(side)) { knob.hidden = true; line.setAttribute("hidden", ""); continue; }
      const kp = dataToPx(clamp01(k.t), clamp01(k.v), size);
      const off = handleOffsetPx(side === "in" ? k.inTan : k.outTan, side, size);
      knob.hidden = false;
      knob.style.left = `${kp.x + off.dx}px`;
      knob.style.top = `${kp.y + off.dy}px`;
      line.removeAttribute("hidden");
      const ux = VB / size.w, uy = VB / size.h;
      line.setAttribute("x1", (kp.x * ux).toFixed(1)); line.setAttribute("y1", (kp.y * uy).toFixed(1));
      line.setAttribute("x2", ((kp.x + off.dx) * ux).toFixed(1)); line.setAttribute("y2", ((kp.y + off.dy) * uy).toFixed(1));
    }
    // 读数 / 行控件
    readout.textContent = k ? fmt(k.t, k.v) : "";
    const canDel = canRemoveKey(keys.length, sel, lockEnds);
    delBtn.disabled = !canDel;
    brokenBtn.disabled = !k;
    brokenBtn.setAttribute("aria-pressed", k && k.broken ? "true" : "false");
    (modeField.el as HTMLButtonElement).disabled = !k;
    modeField.refresh();
    el.dataset.keyCount = String(keys.length);
    el.dataset.selected = String(sel);
  }

  function select(i: number): void {
    sel = i >= 0 && i < curve.keys.length ? i : -1;
    redraw();
  }

  // ---- 手势 ----
  type Drag = { kind: "key"; id: number; st: DragState } | { kind: "knob"; id: number; side: "in" | "out" };
  let drag: Drag | null = null;
  let changedInGesture = false;

  const onDown = (e: PointerEvent) => {
    pokeIdle();
    const target = e.target as HTMLElement;
    const keyEl = target.closest?.(".ce-key") as HTMLElement | null;
    const knobEl = target.closest?.(".ce-knob") as HTMLElement | null;
    if (!keyEl && !knobEl) return;   // 空处 tap：不加点（拍板：加点走 ＋ 钮）
    e.preventDefault();
    try { plot.setPointerCapture(e.pointerId); } catch { /* 容忍 */ }
    changedInGesture = false;
    el.focus?.({ preventScroll: true });
    if (keyEl) {
      const i = parseInt(keyEl.dataset.i || "-1", 10);
      if (i < 0 || !curve.keys[i]) return;
      sel = i;
      const k = curve.keys[i];
      // rel 起手：锚在 key 当前值（抓取不跳变）；shift 中途按下 → 细调 ×0.15（drag-value 状态机）
      drag = { kind: "key", id: e.pointerId, st: { mode: "rel", x: clamp01(k.t), y: 1 - clamp01(k.v), lastPx: e.clientX, lastPy: e.clientY } };
      redraw();
    } else if (knobEl && sel >= 0) {
      drag = { kind: "knob", id: e.pointerId, side: knobEl.dataset.side === "in" ? "in" : "out" };
    }
  };
  const onMove = (e: PointerEvent) => {
    pokeIdle();
    if (!drag || e.pointerId !== drag.id) return;
    if (e.pointerType !== "touch" && e.buttons === 0) { onUp(e); return; }
    const rect = plot.getBoundingClientRect();
    const size: PlotSize = { w: rect.width || 300, h: rect.height || 300 };
    if (drag.kind === "key") {
      const k = curve.keys[sel];
      if (!k) return;
      drag.st = dragMove(drag.st, e, rect, 0.15);
      const lockT = lockEnds && (sel === 0 || sel === curve.keys.length - 1);
      const nt = lockT ? k.t : clamp01(drag.st.x);
      const nv = clamp01(1 - drag.st.y);
      if (nt === k.t && nv === k.v) return;
      sel = moveKey(curve, sel, nt, nv, { lockT });
      changedInGesture = true;
      redraw(); o.onInput();
    } else {
      const k = curve.keys[sel];
      if (!k) return;
      const kp = dataToPx(clamp01(k.t), clamp01(k.v), size);
      const dx = e.clientX - rect.left - kp.x, dy = e.clientY - rect.top - kp.y;
      const slope = slopeFromHandlePx(dx, dy, drag.side, size);
      setTangent(curve, sel, drag.side, slope);
      changedInGesture = true;
      redraw(); o.onInput();
    }
  };
  const onUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    try { plot.releasePointerCapture(e.pointerId); } catch { /* 已释放 */ }
    drag = null;
    if (changedInGesture) o.onCommit();
    changedInGesture = false;
  };
  plot.addEventListener("pointerdown", onDown);
  plot.addEventListener("pointermove", onMove);
  plot.addEventListener("pointerup", onUp);
  plot.addEventListener("pointercancel", onUp);

  // overlay 钮
  const onAdd = () => {
    const t = pickInsertT(curve.keys, sel);
    sel = insertKey(curve, clamp01(t));
    redraw(); o.onInput(); o.onCommit();
  };
  const onDel = () => {
    if (!canRemoveKey(curve.keys.length, sel, lockEnds)) return;
    removeKey(curve, sel);
    sel = -1;
    redraw(); o.onInput(); o.onCommit();
  };
  const onBroken = () => {
    const k = curve.keys[sel];
    if (!k) return;
    setBroken(curve, sel, !k.broken);
    redraw(); o.onInput(); o.onCommit();
  };
  const onReset = () => {
    const id = identityCurve();
    curve.keys = id.keys;   // 原地换内容（宿主持同一 AnimCurve 引用）
    curve.preWrap = id.preWrap; curve.postWrap = id.postWrap;
    sel = -1;
    redraw(); o.onInput(); o.onCommit();
  };
  addBtn.addEventListener("click", onAdd);
  delBtn.addEventListener("click", onDel);
  brokenBtn.addEventListener("click", onBroken);
  resetBtn.addEventListener("click", onReset);

  // 键盘（桌面）：方向键微调选中 key（shift ×10）；Delete/Backspace 删
  const onKey = (e: KeyboardEvent) => {
    if (sel < 0 || !curve.keys[sel]) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); onDel(); return; }
    const n = keyboardNudge(e.key, e.shiftKey, keyStep);
    if (!n) return;
    e.preventDefault();
    const k = curve.keys[sel];
    const lockT = lockEnds && (sel === 0 || sel === curve.keys.length - 1);
    sel = moveKey(curve, sel, clamp01(k.t + (lockT ? 0 : n.dt)), clamp01(k.v + n.dv), { lockT });
    redraw(); o.onInput(); o.onCommit();
  };
  el.addEventListener("keydown", onKey);

  // gizmo 显隐两档（参考窗同款）：idle 淡 / hover 设备 away 全隐
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  function pokeIdle(): void {
    el.classList.remove("idle");
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => el.classList.add("idle"), IDLE_DIM_MS);
  }
  const hoverCapable = typeof matchMedia === "function" && matchMedia("(hover: hover)").matches;
  const onEnter = () => el.classList.remove("away");
  const onLeave = () => { if (!drag) el.classList.add("away"); };
  if (hoverCapable) {
    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointerleave", onLeave);
    el.classList.add("away");
  }
  pokeIdle();

  // 尺寸变了把手线要重算（面板拖宽 / 主题换字号）
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => redraw()) : null;
  ro?.observe(plot);

  redraw();

  return {
    el,
    setCurve(c: AnimCurve) { curve = c; sel = -1; redraw(); },
    redraw,
    selected: () => sel,
    select,
    dispose() {
      plot.removeEventListener("pointerdown", onDown);
      plot.removeEventListener("pointermove", onMove);
      plot.removeEventListener("pointerup", onUp);
      plot.removeEventListener("pointercancel", onUp);
      addBtn.removeEventListener("click", onAdd);
      delBtn.removeEventListener("click", onDel);
      brokenBtn.removeEventListener("click", onBroken);
      resetBtn.removeEventListener("click", onReset);
      el.removeEventListener("keydown", onKey);
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointerleave", onLeave);
      if (idleTimer) clearTimeout(idleTimer);
      ro?.disconnect();
      resizeGizmo.dispose();
      modeField.dispose();
      svg.remove();
    },
  };
}

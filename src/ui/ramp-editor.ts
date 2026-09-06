// ramp-editor —— color-ramp 的编辑器皮（Blender ColorRamp 形制：色带条 + 条下小旗色标 + ＋🗑 实体钮）。
// created 2026-09-05 by Claude Fable 5.1。提案 = ai-docs/20260830-curve-and-ramp-deep-module-proposal.md §2.5。
//
// · 色带条背景 = bakeRampLut 生成的 256 段硬边 CSS linear-gradient（任何色空间/插值都精确显示，constant 的硬边也对）。
// · 色标 = 条下小旗，tap 选中，1D 拖动（drag-value rel 状态机：抓取不跳变 + shift 细调），可越过邻居重排。
// · ＋/🗑 实体钮同曲线编辑器形制（28px 圆钮），但**不 overlay 在条上**——条只有 36px 高、渐变本身就是内容，盖住起点色
//   等于遮内容（截图实测）；放读数行右侧。＋ = 选中与右邻中点插入，颜色 = evaluateRamp。
// · 行：插值 select（Linear/Constant/Ease）· 色彩空间 select（sRGB/OKLab）· 翻转。
// · 色标颜色**不在这里编辑**：选中色标 → 宿主经 onSelect 把它挂成 color-panel 的 ColorTarget，色轮/吸管直接改它
//   （user 2026-09-05「use foreground color 不对……把 color window 抽象复用」；原「取前景色」钮撤）。
// · 数学全在 common/color-ramp.ts；本模块只调 verb。宿主持 ColorRamp 引用，原地改。

import {
  type ColorRamp, type Rgba8, type RampInterp, type RampSpace, RAMP_INTERPS, RAMP_SPACES,
  bakeRampLut, evaluateRamp, insertStop, removeStop, moveStop, flipRamp, rgba8ToCss,
} from "../common/color-ramp.ts";
import { dragMove, type DragState } from "./drag-value.ts";
import { createSelectField, type SelectField } from "./select-field.ts";
import { iconHtml } from "./icon.ts";
import { t as tr } from "../i18n/index.ts";
import { keyboardNudge } from "./curve-editor.ts";

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** 256 段硬边渐变：第 i 段覆盖 [i/256, (i+1)/256]（双位置色标语法）。 */
export function rampCssGradient(lut: Uint8ClampedArray): string {
  const parts: string[] = [];
  for (let i = 0; i < 256; i++) {
    const o = i * 4;
    const a = lut[o + 3];
    const col = a >= 255 ? `rgb(${lut[o]},${lut[o + 1]},${lut[o + 2]})` : `rgba(${lut[o]},${lut[o + 1]},${lut[o + 2]},${(a / 255).toFixed(3)})`;
    parts.push(`${col} ${((i / 256) * 100).toFixed(4)}% ${(((i + 1) / 256) * 100).toFixed(4)}%`);
  }
  return `linear-gradient(90deg,${parts.join(",")})`;
}

/** ＋ 钮插入位置：选中与右邻中点；选中末位 → 与左邻中点；无选中 → 最大间隔中点。 */
export function pickInsertStopT(stops: readonly { t: number }[], selected: number): number {
  const n = stops.length;
  if (n === 0) return 0.5;
  if (n === 1) return stops[0].t < 0.5 ? 1 : 0;
  if (selected >= 0 && selected < n - 1) return (stops[selected].t + stops[selected + 1].t) / 2;
  if (selected === n - 1) return (stops[n - 2].t + stops[n - 1].t) / 2;
  let bi = 0, bg = -1;
  for (let i = 0; i < n - 1; i++) { const g = stops[i + 1].t - stops[i].t; if (g > bg) { bg = g; bi = i; } }
  return (stops[bi].t + stops[bi + 1].t) / 2;
}

export function rgba8ToHex(c: Rgba8): string {
  const h = (v: number) => v.toString(16).padStart(2, "0");
  return `#${h(c[0])}${h(c[1])}${h(c[2])}${c[3] < 255 ? h(c[3]) : ""}`;
}

export interface RampEditorOpts {
  ramp: ColorRamp;
  onInput(): void;
  onCommit(): void;
  onSelect?(i: number): void;   // 选中色标变了（-1 = 无）；宿主接 color target / 刷色板显示
}
export interface RampEditorHandle {
  el: HTMLElement;
  setRamp(r: ColorRamp): void;
  redraw(): void;
  selected(): number;
  select(i: number): void;
  dispose(): void;
}

export function makeRampEditor(o: RampEditorOpts): RampEditorHandle {
  let ramp = o.ramp;
  let sel = -1;

  const el = document.createElement("div");
  el.className = "ramp-editor";
  el.tabIndex = 0;
  el.innerHTML =
    `<div class="re-bar-wrap"><div class="re-bar"></div></div>` +
    `<div class="re-stops"></div>` +
    `<div class="ce-row ce-row-readout"><span class="ce-readout"></span>` +
      `<span class="re-tools">` +
        `<button type="button" class="ce-gizmo" data-act="add">${iconHtml("new")}</button>` +
        `<button type="button" class="ce-gizmo" data-act="del">${iconHtml("trash-can")}</button>` +
      `</span>` +
    `</div>` +
    `<div class="ce-row"><span class="ce-label" data-k="interp"></span><span class="ce-select-slot" data-k="interp"></span>` +
      `<span class="ce-label" data-k="space"></span><span class="ce-select-slot" data-k="space"></span></div>` +
    `<div class="ce-row ce-row-end">` +
      `<button type="button" class="ce-btn" data-act="flip"></button>` +
    `</div>`;

  const q = <T extends Element = HTMLElement>(s: string) => el.querySelector(s) as T;
  const bar = q(".re-bar");
  const stopsEl = q(".re-stops");
  const addBtn = q<HTMLButtonElement>('.ce-gizmo[data-act="add"]');
  const delBtn = q<HTMLButtonElement>('.ce-gizmo[data-act="del"]');
  const readout = q(".ce-readout");
  const flipBtn = q<HTMLButtonElement>('.ce-btn[data-act="flip"]');

  q('.ce-label[data-k="interp"]').textContent = tr("ramp.interp");
  q('.ce-label[data-k="space"]').textContent = tr("ramp.space");
  flipBtn.textContent = tr("ramp.flip");
  addBtn.title = tr("ramp.addStop"); addBtn.setAttribute("aria-label", tr("ramp.addStop"));
  delBtn.title = tr("ramp.removeStop"); delBtn.setAttribute("aria-label", tr("ramp.removeStop"));

  const INTERP_LABEL: Record<RampInterp, string> = { linear: tr("ramp.interp.linear"), constant: tr("ramp.interp.constant"), ease: tr("ramp.interp.ease") };
  const SPACE_LABEL: Record<RampSpace, string> = { srgb: "sRGB", oklab: "OKLab" };
  const interpField: SelectField = createSelectField({
    className: "generic-sheet-input",
    items: () => RAMP_INTERPS.map((v) => ({ value: v, label: INTERP_LABEL[v] })),
    value: () => ramp.interp,
    onChange: (v) => { ramp.interp = v as RampInterp; redraw(); o.onInput(); o.onCommit(); },
  });
  const spaceField: SelectField = createSelectField({
    className: "generic-sheet-input",
    items: () => RAMP_SPACES.map((v) => ({ value: v, label: SPACE_LABEL[v] })),
    value: () => ramp.space,
    onChange: (v) => { ramp.space = v as RampSpace; redraw(); o.onInput(); o.onCommit(); },
  });
  q('.ce-select-slot[data-k="interp"]').appendChild(interpField.el);
  q('.ce-select-slot[data-k="space"]').appendChild(spaceField.el);

  function redraw(): void {
    const stops = ramp.stops;
    if (sel >= stops.length) sel = -1;
    bar.style.background = rampCssGradient(bakeRampLut(ramp));
    while (stopsEl.children.length > stops.length) stopsEl.removeChild(stopsEl.lastChild!);
    while (stopsEl.children.length < stops.length) {
      const s = document.createElement("div");
      s.className = "re-stop";
      stopsEl.appendChild(s);
    }
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      const sel_ = stopsEl.children[i] as HTMLElement;
      sel_.dataset.i = String(i);
      sel_.dataset.t = s.t.toFixed(4);
      sel_.dataset.rgba = s.rgba.join(",");
      sel_.style.left = `${clamp01(s.t) * 100}%`;
      sel_.style.setProperty("--stop-color", rgba8ToCss(s.rgba));
      sel_.classList.toggle("selected", i === sel);
    }
    const k = sel >= 0 ? stops[sel] : null;
    readout.textContent = k ? `${tr("ramp.pos")} ${Math.round(k.t * 100)}% · ${rgba8ToHex(k.rgba)}` : "";
    delBtn.disabled = !k || stops.length <= 1;
    interpField.refresh(); spaceField.refresh();
    el.dataset.stopCount = String(stops.length);
    el.dataset.selected = String(sel);
    if (sel !== lastSel) { lastSel = sel; o.onSelect?.(sel); }
  }
  let lastSel = -2;

  function select(i: number): void { sel = i >= 0 && i < ramp.stops.length ? i : -1; redraw(); }

  // ---- 手势（1D）----
  let drag: { id: number; st: DragState } | null = null;
  let changed = false;
  const onDown = (e: PointerEvent) => {
    const stopEl = (e.target as HTMLElement).closest?.(".re-stop") as HTMLElement | null;
    if (!stopEl) return;
    e.preventDefault();
    try { stopsEl.setPointerCapture(e.pointerId); } catch { /* 容忍 */ }
    const i = parseInt(stopEl.dataset.i || "-1", 10);
    if (i < 0 || !ramp.stops[i]) return;
    sel = i;
    changed = false;
    el.focus?.({ preventScroll: true });
    drag = { id: e.pointerId, st: { mode: "rel", x: clamp01(ramp.stops[i].t), y: 0, lastPx: e.clientX, lastPy: e.clientY } };
    redraw();
  };
  const onMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (e.pointerType !== "touch" && e.buttons === 0) { onUp(e); return; }
    const s = ramp.stops[sel];
    if (!s) return;
    drag.st = dragMove(drag.st, e, bar.getBoundingClientRect(), 0.15);
    const nt = clamp01(drag.st.x);
    if (nt === s.t) return;
    sel = moveStop(ramp, sel, nt);
    changed = true;
    redraw(); o.onInput();
  };
  const onUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    try { stopsEl.releasePointerCapture(e.pointerId); } catch { /* 已释放 */ }
    drag = null;
    if (changed) o.onCommit();
    changed = false;
  };
  stopsEl.addEventListener("pointerdown", onDown);
  stopsEl.addEventListener("pointermove", onMove);
  stopsEl.addEventListener("pointerup", onUp);
  stopsEl.addEventListener("pointercancel", onUp);

  const commitChange = () => { redraw(); o.onInput(); o.onCommit(); };
  const onAdd = () => { sel = insertStop(ramp, clamp01(pickInsertStopT(ramp.stops, sel))); commitChange(); };
  const onDel = () => { if (sel < 0 || !removeStop(ramp, sel)) return; sel = -1; commitChange(); };
  const onFlip = () => { flipRamp(ramp); if (sel >= 0) sel = ramp.stops.length - 1 - sel; commitChange(); };
  addBtn.addEventListener("click", onAdd);
  delBtn.addEventListener("click", onDel);
  flipBtn.addEventListener("click", onFlip);

  const onKey = (e: KeyboardEvent) => {
    if (sel < 0 || !ramp.stops[sel]) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); onDel(); return; }
    const n = keyboardNudge(e.key, e.shiftKey, 1 / 255);
    if (!n || n.dt === 0) return;
    e.preventDefault();
    sel = moveStop(ramp, sel, clamp01(ramp.stops[sel].t + n.dt));
    commitChange();
  };
  el.addEventListener("keydown", onKey);

  redraw();

  return {
    el,
    setRamp(r: ColorRamp) { ramp = r; sel = -1; redraw(); },
    redraw,
    selected: () => sel,
    select,
    dispose() {
      stopsEl.removeEventListener("pointerdown", onDown);
      stopsEl.removeEventListener("pointermove", onMove);
      stopsEl.removeEventListener("pointerup", onUp);
      stopsEl.removeEventListener("pointercancel", onUp);
      addBtn.removeEventListener("click", onAdd);
      delBtn.removeEventListener("click", onDel);
      flipBtn.removeEventListener("click", onFlip);
      el.removeEventListener("keydown", onKey);
      interpField.dispose(); spaceField.dispose();
    },
  };
}

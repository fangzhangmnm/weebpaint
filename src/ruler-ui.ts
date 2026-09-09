// ruler-ui —— 尺子模型的 app 层（ADR-0013，2026-09-09）。created 2026-09-09 by Claude Fable 5.1
//
// user 2026-09-09：「形状笔同意 1（尺子），用左栏放在笔架按钮下面，左栏应该 context smart sense 不要暴露不必要的东西。同意形状笔不是笔而是辅助」。
// 职责：
//   ① 放置态 rulerPlace（edit-mode transient）+ DOM 捕获层 #rulerPlaceLayer：画布拖 = 放尺（平行线 / 矩形 / 格线），画一圈 = 放椭圆尺；
//      再拖 = 换掉（策划稿 §5 Q2：无手柄）。透视尺不用放置——透视框本身就是尺（模式在条上开）。
//   ② 尺子条 #rulerToolbar（ui/context-toolbar 工厂）：尺种下拉 · 约束 · 格线行列 · 透视四件（模式 / 平面 / 编辑消失点 / 显示 gizmo，从
//      形状条搬来，persp-edit 不动）· 清尺 · ✓。只在放置态显示。
//   ③ 左栏尺钮语义（app.ts 接线）：tap = 有尺 → 开/关吸附，无尺 → 进放置；长按 = 进放置；S 键 = tap。
//   ④ board overlay provider（非透视尺的线段：放置中橙色草稿、吸附开蓝、关灰）；透视尺走 persp-edit 的 gizmo，显示门由本模块注入。
//   ⑤ input 的投影器提供方 guideForStroke（唯一切口在 input.ts _move；谁吸尺 = ruler.ts RULER_ROLES，Q4 讨论中）。
// 状态 SSoT = desk.ruler（per-doc，跟画走）；本模块只是它的 UI。放置不进 undo（重拖即换；doc 变换 remap 在 workbench-state）。

import { desk } from "./workbench-state.ts";
import { mountContextToolbar, type ContextToolbarHandle, type ToolbarItem } from "./ui/context-toolbar.ts";
import { guideFor, placeFromDrag, placeFromLoop, rulerSegments, sanitizeRuler, shapePixels, shapePolylines, RULER_KINDS, type Ruler, type RulerKind, type StrokeGuide } from "./ruler.ts";
import { configFromModeState, defaultVpsForMode, planesForMode, type PerspMode, type PerspConfig } from "./perspective-frame.ts";
import { togglePerspEdit, setPerspGizmoLiveGate } from "./persp-edit.ts";
import { closeExclusive } from "./panel-state.ts";
import { t, tLatin } from "./i18n/index.ts";
import type { AppContext } from "./app-context.ts";
import type { Pt } from "./shape-geometry.ts";
import type { GuideOverlay } from "./board.ts";

let _ctx: AppContext | null = null;
let _bar: ContextToolbarHandle | null = null;
let _layer: HTMLElement | null = null;
let _placing = false;
let _draft: Ruler | null = null;
let _drag: { id: number; p0: Pt; last: Pt; pts: Pt[] } | null = null;

const KIND_ICON: Record<RulerKind, string> = { parallel: "line", persp: "persp-2p", ellipse: "ellipse", rect: "rectangle", grid: "grid" };
const KIND_KEY = { parallel: "rl.kind.parallel", persp: "rl.kind.persp", ellipse: "rl.kind.ellipse", rect: "rl.kind.rect", grid: "rl.kind.grid" } as const;
const PERSP_MODES = ["off", "p1", "p2", "p3", "iso"] as const;
const PERSP_MODE_ICON: Record<string, string> = { off: "persp-viewport", p1: "persp-1p", p2: "persp-2p", p3: "persp-3p", iso: "persp-iso" };
const PERSP_MODE_KEY = { off: "sb.modeViewport", p1: "sb.mode1p", p2: "sb.mode2p", p3: "sb.mode3p", iso: "sb.modeIso" } as const;
const PLANE_ICON: Record<string, string> = { ground: "plane-ground", wall: "plane-wall", wallL: "plane-wall-left", wallR: "plane-wall-right" };
const PLANE_KEY = { ground: "sb.planeGround", wall: "sb.planeWall", wallL: "sb.planeWallL", wallR: "sb.planeWallR" } as const;
type LatinKey = Parameters<typeof tLatin>[0];

function _kind(): RulerKind { const k = desk.ruler.kind as RulerKind; return (RULER_KINDS as readonly string[]).includes(k) ? k : "parallel"; }
function _perspMode(): PerspMode { const m = desk.persp.mode; return (m === "p1" || m === "p2" || m === "p3" || m === "iso") ? m : "off"; }
function _frame(): PerspConfig | null { return _perspMode() === "off" ? null : configFromModeState(desk.persp); }
/** 拖画模式（user 2026-09-09「拖动模式看谁舒服」）：拖一下整形落笔、不留尺。透视尺无形可拖 → 恒描尺。 */
function _useDrag(): boolean { return desk.ruler.use === "drag" && _kind() !== "persp"; }
const PAD = 64;
function _clipBox() { const { doc } = _ctx!; return { x0: -PAD, y0: -PAD, x1: doc.width + PAD, y1: doc.height + PAD }; }
/** 平行线尺在拖画里是一段：起点 → 终点在尺方向上的投影（约束已在放置时吸过）。 */
function _dragSeg(r: Ruler): [Pt, Pt] | undefined {
  if (r.kind !== "parallel" || !_drag) return undefined;
  const dx = Math.cos(r.angle), dy = Math.sin(r.angle);
  const t = (_drag.last.x - r.anchor.x) * dx + (_drag.last.y - r.anchor.y) * dy;
  return [r.anchor, { x: r.anchor.x + dx * t, y: r.anchor.y + dy * t }];
}

/** 当前生效的尺：desk.ruler.geo 经校验且种类与 desk.ruler.kind 一致；透视尺 = 透视开着即有。 */
export function currentRuler(): Ruler | null {
  const k = _kind();
  if (k === "persp") return _perspMode() === "off" ? null : { kind: "persp" };
  const r = sanitizeRuler(desk.ruler.geo);
  return r && r.kind === k ? r : null;
}
export function rulerPlacing(): boolean { return _placing; }
/** 吸附是否生效（有尺且开关开）。 */
export function rulerSnapping(): boolean { return desk.ruler.on && !!currentRuler(); }

/** input 的投影器提供方（app.ts 接 input.setRulerGuideProvider）。放置态 canDraw=false 结构上到不了这。
 *  pixel = 当前笔是像素画模式 → 整数像素链投影器（Q5，user「必须用整数的像素算法」）；裁剪盒 = doc + 64px 出血（透视链端点可飞远）。 */
export function guideForStroke(_role: string, pixel: boolean): StrokeGuide | null {
  if (!desk.ruler.on || !_ctx) return null;
  const r = currentRuler();
  if (!r) return null;
  return guideFor(r, _frame(), pixel ? { box: _clipBox() } : undefined);
}

function _canUseRuler(): boolean {
  const em = _ctx?.editMode;
  return !!em && !em.isTransient() && em.canDraw();
}
// 透视 gizmo 绘图态显示门（persp-edit 注入）：放置态选的是透视尺 → 显；否则 透视尺吸附开 + showGizmo + 能画。
function _perspGizmoLive(): boolean {
  if (_placing) return _kind() === "persp";
  return desk.ruler.on && _kind() === "persp" && desk.persp.showGizmo && _canUseRuler();
}

// ---- board overlay（非透视尺）----
function _overlay(): GuideOverlay | null {
  if (!_ctx) return null;
  const { doc } = _ctx;
  if (_placing) {
    if (_useDrag()) {
      // 拖画预览 = 这一下要落的形（像素画模式连要落的格都画出来）；不显旧尺
      if (!_draft) return null;
      const seg = _dragSeg(_draft);
      const pixel = _ctx.input.currentBrushPixelMode();
      return {
        segments: _draft.kind === "parallel" ? (seg ? [seg] : []) : rulerSegments(_draft, doc.width, doc.height),
        style: "draft",
        ...(pixel ? { pixels: shapePixels(_draft, _clipBox(), seg) } : {}),
      };
    }
    const r = _draft ?? currentRuler();
    if (!r || r.kind === "persp") return null;
    return { segments: rulerSegments(r, doc.width, doc.height), style: _draft ? "draft" : "active" };
  }
  if (!_canUseRuler()) return null;
  const r = currentRuler();
  if (!r || r.kind === "persp") return null;
  return { segments: rulerSegments(r, doc.width, doc.height), style: desk.ruler.on ? "active" : "dim" };
}

// ---- 放置态 ----
function _placeOpts() {
  const { board, doc, input } = _ctx!;
  const shift = !!(input as unknown as { shiftDown?: boolean }).shiftDown;   // Shift 按住 = 临时反转约束（形状笔时代同义）
  return { constrain: desk.ruler.constrain !== shift, frame: _frame(), rot: board.viewport.rot || 0, docW: doc.width, docH: doc.height };
}
function _onDown(e: PointerEvent): void {
  if (!_ctx || _drag) return;                                  // 只跟第一根指针
  if (e.pointerType === "mouse" && e.button !== 0) return;
  const p0 = _ctx.board.screenToDoc(e.clientX, e.clientY);
  _drag = { id: e.pointerId, p0, last: p0, pts: [p0] };
  _draft = null;
  try { _layer!.setPointerCapture(e.pointerId); } catch { /* 极少数浏览器不支持 */ }
  e.preventDefault();
}
function _onMove(e: PointerEvent): void {
  if (!_ctx || !_drag || e.pointerId !== _drag.id) return;
  const p = _ctx.board.screenToDoc(e.clientX, e.clientY);
  _drag.last = p;
  const k = _kind();
  if (k === "ellipse") { _drag.pts.push(p); _draft = placeFromLoop(_drag.pts, _placeOpts()); }
  else if (k === "parallel" || k === "rect" || k === "grid") _draft = placeFromDrag(k, _drag.p0, p, _placeOpts(), { nu: desk.ruler.gridNu, nv: desk.ruler.gridNv });
  _ctx.board.requestRender();
}
function _onUp(e: PointerEvent): void {
  if (!_ctx || !_drag || e.pointerId !== _drag.id) return;
  try { _layer!.releasePointerCapture(e.pointerId); } catch { /* 已释放 */ }
  if (_draft) {
    if (_useDrag()) _commitShape(_draft);   // 拖画：落笔不留尺，留在放置态继续拖下一个
    else desk.ruler.geo = _draft;
  }
  _draft = null; _drag = null;
  _rerender();
}
/** 拖画落笔：整形走 input.drawShape（正常 stroke 事务；像素画 = 整数像素集，否则折线组）。 */
function _commitShape(r: Ruler): void {
  if (!_ctx) return;
  const seg = _dragSeg(r);
  const pixel = _ctx.input.currentBrushPixelMode();
  const ok = _ctx.input.drawShape(pixel ? { pixels: shapePixels(r, _clipBox(), seg) } : { polylines: shapePolylines(r, seg) });
  if (!ok) _ctx.setStatus(t("rl.dragNoTool"), true);
}

export function enterRulerPlace(): void {
  if (!_ctx || _placing) return;
  const em = _ctx.editMode;
  if (em.isTransient()) return;   // 变换/裁切/调整/VP 编辑期间不硬切（左栏尺钮本就藏着；S 键忽略）
  closeExclusive();
  _placing = true;
  em.enterTransient("rulerPlace", { apply: () => _finish(), abort: () => _finish() });
  _layer?.classList.remove("hidden");
  _bar?.replaceRows(_rows()); _bar?.show();
  _ctx.setStatus(t(_useDrag() ? "rl.dragHint" : "rl.placeHint"));
  syncRulerUi();
  _ctx.board.requestRender();
}
function _finish(): void {
  if (!_placing) return;
  _placing = false; _draft = null; _drag = null;
  _layer?.classList.add("hidden");
  _bar?.hide();
  if (currentRuler()) desk.ruler.on = true;   // 放完就吸
  syncRulerUi();
  _ctx?.board.requestRender();
}
export function exitRulerPlace(): void {
  if (!_ctx || !_placing) return;
  _finish();
  _ctx.editMode.exitTransient();
}
/** 左栏尺钮 tap / S 键：放置态 → 收（吸附开）；有尺 → 开/关吸附；无尺 → 进放置。 */
export function rulerTap(): void {
  if (!_ctx) return;
  if (_placing) { exitRulerPlace(); return; }
  if (!_canUseRuler()) return;
  if (currentRuler()) {
    desk.ruler.on = !desk.ruler.on;
    _ctx.setStatus(t(desk.ruler.on ? "rl.on" : "rl.off"));
    syncRulerUi();
    _ctx.board.requestRender();
    return;
  }
  enterRulerPlace();
}
export function rulerLongpress(): void { if (!_placing && _canUseRuler()) enterRulerPlace(); }

// ---- 透视模式（从形状条搬来：切模式补默认 VP、平面合法化）----
function _setPerspMode(mode: PerspMode): void {
  const { doc } = _ctx!;
  const g = desk.persp;
  g.mode = mode;
  if (mode !== "off") {
    const def = defaultVpsForMode(mode, doc.width, doc.height);
    if (mode === "p1") { if (!g.p1.vp1 && def.vp1) g.p1.vp1 = def.vp1; }
    else if (mode === "p2") { if (!g.p2.vp1 && def.vp1) g.p2.vp1 = def.vp1; if (!g.p2.vp2 && def.vp2) g.p2.vp2 = def.vp2; }
    else if (mode === "p3") { if (!g.p3.vp1 && def.vp1) g.p3.vp1 = def.vp1; if (!g.p3.vp2 && def.vp2) g.p3.vp2 = def.vp2; if (!g.p3.vp3 && def.vp3) g.p3.vp3 = def.vp3; }
    const planes = planesForMode(mode) as string[];
    if (!planes.includes(g.plane)) g.plane = "ground";
  }
}
function _constrainIcon(k: RulerKind, mode: PerspMode): string {
  if (k === "parallel") return mode !== "off" ? "snap-vanishing-point" : "snap-angle";
  if (k === "rect") return "square";
  if (k === "ellipse") return "circle";
  return "grid";
}
// 格线行列 stepper（尺子条里的 custom 件；改了就写回已放的格线尺）
function _mountGridCtl(host: HTMLElement): () => void {
  host.className = "ct-custom rl-grid-ctl";
  const mk = (label: string, axis: "gridNu" | "gridNv") => {
    const wrap = document.createElement("span");
    wrap.className = "lasso-section";
    const lab = document.createElement("span"); lab.className = "lasso-tool-text"; lab.textContent = label;
    const minus = document.createElement("button"); minus.type = "button"; minus.className = "lasso-tool-btn"; minus.textContent = "−"; minus.setAttribute("aria-label", "−");
    const val = document.createElement("span"); val.className = "lasso-tool-text rl-grid-val";
    const plus = document.createElement("button"); plus.type = "button"; plus.className = "lasso-tool-btn"; plus.textContent = "＋"; plus.setAttribute("aria-label", "＋");
    const render = () => { val.textContent = String(desk.ruler[axis]); };
    const step = (d: number) => {
      desk.ruler[axis] = Math.max(1, Math.min(24, desk.ruler[axis] + d));
      const r = sanitizeRuler(desk.ruler.geo);
      if (r && r.kind === "grid") desk.ruler.geo = { ...r, nu: desk.ruler.gridNu, nv: desk.ruler.gridNv };
      render(); _ctx?.board.requestRender();
    };
    minus.addEventListener("click", (e) => { e.stopPropagation(); step(-1); });
    plus.addEventListener("click", (e) => { e.stopPropagation(); step(+1); });
    render();
    wrap.append(lab, minus, val, plus);
    return wrap;
  };
  host.append(mk(tLatin("rl.rows"), "gridNv"), mk(tLatin("rl.cols"), "gridNu"));
  return () => { host.replaceChildren(); };
}

function _rows(): ToolbarItem[][] {
  const k = _kind();
  const mode = _perspMode();
  const items: ToolbarItem[] = [];
  items.push({ kind: "select", id: "rulerKindSel", title: tLatin("rl.kind"), pin: true,
    items: () => RULER_KINDS.map((id) => ({ value: id, label: tLatin(KIND_KEY[id] as LatinKey), icon: KIND_ICON[id] })),
    value: () => _kind(),
    onChange: (v) => {
      const nk = v as RulerKind;
      if (nk === _kind()) return;
      desk.ruler.kind = nk;
      desk.ruler.geo = null;                                             // 换种 = 旧尺退场（重拖即换）
      if (nk === "persp" && _perspMode() === "off") _setPerspMode("p2"); // 选透视尺而透视关着 → 先给个二点（AI 加的默认，条上可改）
      _rerender();
    } });
  items.push({ kind: "button", id: "rulerUseDrag", icon: "shapes", title: tLatin("rl.useDrag"), pin: true,
    pressed: () => desk.ruler.use === "drag", disabled: () => k === "persp",
    onClick: () => { desk.ruler.use = desk.ruler.use === "drag" ? "trace" : "drag"; _ctx?.setStatus(t(_useDrag() ? "rl.dragHint" : "rl.placeHint")); _rerender(); } });
  if (k !== "persp") {
    items.push({ kind: "button", id: "rulerConstrain", icon: _constrainIcon(k, mode), title: tLatin("rl.constrain"),
      pressed: () => desk.ruler.constrain, disabled: () => k === "grid",
      onClick: () => { desk.ruler.constrain = !desk.ruler.constrain; _rerender(); } });
  }
  if (k === "grid") items.push({ kind: "custom", id: "rulerGridCtl", mount: _mountGridCtl });
  items.push({ kind: "sep" });
  items.push({ kind: "select", id: "rulerPerspSel", title: tLatin("sb.perspModeSlot"),
    items: () => PERSP_MODES.map((m) => ({ value: m, label: tLatin(PERSP_MODE_KEY[m] as LatinKey), icon: PERSP_MODE_ICON[m] })),
    value: () => _perspMode(),
    onChange: (v) => { _setPerspMode(v as PerspMode); _rerender(); } });
  if (mode !== "off") {
    // 平面：只对落在平面上的尺有意义（矩形 / 格线 / 椭圆）；平行线尺吸 VP 射线、透视尺吸 VP 族，都不吃平面（形状笔时代同规则）
    if (k === "rect" || k === "grid" || k === "ellipse") {
      for (const p of planesForMode(mode) as Array<keyof typeof PLANE_KEY>) {
        items.push({ kind: "button", id: `rulerPlane-${p}`, icon: PLANE_ICON[p], title: tLatin(PLANE_KEY[p] as LatinKey),
          pressed: () => desk.persp.plane === p, onClick: () => { desk.persp.plane = p; _rerender(); } });
      }
    }
    items.push({ kind: "button", id: "rulerVpEdit", icon: "vanishing-point-edit", title: tLatin("sb.vpEdit"), onClick: () => togglePerspEdit() });
    items.push({ kind: "button", id: "rulerShowGizmo", icon: desk.persp.showGizmo ? "visibility-show" : "visibility-hide", title: tLatin("sb.showGizmo"),
      pressed: () => desk.persp.showGizmo, onClick: () => { desk.persp.showGizmo = !desk.persp.showGizmo; _rerender(); } });
  }
  items.push({ kind: "sep" });
  items.push({ kind: "button", id: "rulerClear", icon: "trash-can", title: tLatin("rl.clear"), disabled: () => !currentRuler(),
    onClick: () => { if (_kind() === "persp") _setPerspMode("off"); else desk.ruler.geo = null; desk.ruler.on = false; _rerender(); }, foldPriority: -1 });
  items.push({ kind: "button", id: "rulerPlaceDone", icon: "check", title: tLatin("common.exit"), onClick: () => exitRulerPlace(), foldPriority: -2 });
  return [items];
}
function _rerender(): void {
  if (_placing) { _bar?.replaceRows(_rows()); _bar?.show(); }
  syncRulerUi();
  _ctx?.board.requestRender();
}

/** 反应式镜像给左栏（尺钮显隐 / 开关态 / 放置态）。toolbar._syncEditModeUI 与本模块的每次状态变化都调。 */
export function syncRulerUi(): void {
  if (!_ctx) return;
  const dr = _ctx.dialReactive;
  dr.rulerOn = rulerSnapping();
  dr.rulerPlacing = _placing;
}

export function initRulerUi(ctx: AppContext): void {
  _ctx = ctx;
  _layer = document.getElementById("rulerPlaceLayer");
  if (_layer) {
    _layer.addEventListener("pointerdown", _onDown);
    _layer.addEventListener("pointermove", _onMove);
    _layer.addEventListener("pointerup", _onUp);
    _layer.addEventListener("pointercancel", _onUp);
  }
  _bar = mountContextToolbar({ id: "rulerToolbar", rows: [], ariaLabel: tLatin("rl.bar") });
  ctx.board.setGuideProvider(_overlay);
  setPerspGizmoLiveGate(_perspGizmoLive);
  window.addEventListener("wp:ruler-tap", () => rulerTap());                       // input.ts S 键
  window.addEventListener("wp:ruler-sync", () => _rerender());                     // persp-edit 收口（VP/锁/重置变了 → 条重画）
  window.addEventListener("wp:applyEditorState", () => { if (_placing) _finish(); syncRulerUi(); ctx.board.requestRender(); });   // 换文档
  syncRulerUi();
}

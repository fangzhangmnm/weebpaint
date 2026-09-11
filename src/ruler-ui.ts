// ruler-ui —— 「几何」extension 的 app 层（ADR-0013；2026-09-10 修订 ③ 重写）。created 2026-09-09 by Claude Fable 5.1
//
// 2026-09-10 user 真机打回 09-09 版（左栏尺钮 + 放置态捕获层 + 默认描尺）：「几何笔移到左栏之后退化严重。其实只是一个 ui refactor，交互逻辑不应该
//   大变的……ui 还玩消失」「左边栏太拥挤了。不应该有那个尺按钮。笔架按钮也撤了吧」「之前的行为也就是复制了一份画笔，然后加上了这个 extension。
//   现在是要把这个 extension 抽出来，然后我希望画笔，橡皮，套索，选区笔，甚至手指，都能享受得到」「如果 geometry engine related 脚本突然不见了，
//   其他地方只要最小的修复程序也能跑」「入口候选：先试试 A 吧，用几天看看」。
// 几何 = 与动词正交的**修饰模式**（desk.ruler.use = off | drag | trace，per-doc）：
//   drag（拖画，默认）= 旧形状笔手势活在任何工具上：拖一下 / 画一圈 → 抬手用**当前工具**一次落整形（画笔 / 橡皮 = 一笔 stroke；手指 = 沿形揉一遍；
//       选区笔 = 形的色带进选区）。笔触本身就是预览（内引擎每个输入事件批从头重驱，shape-stroke.ts），没有草稿层。
//   trace（留尺）= 拖出来的形留在画布当尺（desk.ruler.geo），吸尺开；关掉几何后画笔 / 橡皮 / 手指 / 选区笔沿尺走（input 的 StrokeGuide 切口）。
// 入口 A：几何条 #rulerToolbar 是上下文条区的**固定尾位**（右对齐；有别的动词条时挂到它下面一行）——关着 = 一颗「几何」chip；开着 = 全条
//   （种类 ▾ · 约束 · 格线行列 · 留尺 · 透视四件）；有尺时另露 [吸尺][清]。任何工具下都在同一位置，不随工具消失。S 键 = 开关。
// 职责：① 几何条；② input 的两个 provider（guideForStroke 描尺 / strokeShaper 拖画·留尺）；③ 已放尺 overlay；④ 透视 gizmo 显示门。
// 可拔：本文件 + shape-stroke.ts + ruler.ts 删掉，app.ts 三行、workbench-state remapDeskRuler 一行改 no-op，程序照跑。

import { desk } from "./workbench-state.ts";
import { mountContextToolbar, contextToolbarBottomExcept, type ContextToolbarHandle, type ToolbarItem } from "./ui/context-toolbar.ts";
import { guideFor, rulerSegments, sanitizeRuler, RULER_KINDS, RULER_ROLES, type Ruler, type RulerKind, type StrokeGuide, type PlaceOpts } from "./ruler.ts";
import { ShapeGesture, shapedStroke } from "./shape-stroke.ts";
import { configFromModeState, defaultVpsForMode, planesForMode, type PerspMode, type PerspConfig } from "./perspective-frame.ts";
import { togglePerspEdit, setPerspGizmoLiveGate } from "./persp-edit.ts";
import { t, tLatin } from "./i18n/index.ts";
import type { AppContext } from "./app-context.ts";
import type { StrokeShaper } from "./input.ts";
import type { GuideOverlay } from "./board.ts";

let _ctx: AppContext | null = null;
let _bar: ContextToolbarHandle | null = null;
let _draft: Ruler | null = null;              // 留尺放置中的草稿（overlay 画）
let _lastUse: "drag" | "trace" = "drag";      // 关几何前的用法（再开时回到它）

type Use = "off" | "drag" | "trace";
const KIND_ICON: Record<RulerKind, string> = { parallel: "line", persp: "persp-2p", ellipse: "ellipse", rect: "rectangle", grid: "grid" };
const KIND_KEY = { parallel: "rl.kind.parallel", persp: "rl.kind.persp", ellipse: "rl.kind.ellipse", rect: "rl.kind.rect", grid: "rl.kind.grid" } as const;
const PERSP_MODES = ["off", "p1", "p2", "p3", "iso"] as const;
const PERSP_MODE_ICON: Record<string, string> = { off: "persp-viewport", p1: "persp-1p", p2: "persp-2p", p3: "persp-3p", iso: "persp-iso" };
const PERSP_MODE_KEY = { off: "sb.modeViewport", p1: "sb.mode1p", p2: "sb.mode2p", p3: "sb.mode3p", iso: "sb.modeIso" } as const;
const PLANE_ICON: Record<string, string> = { ground: "plane-ground", wall: "plane-wall", wallL: "plane-wall-left", wallR: "plane-wall-right" };
const PLANE_KEY = { ground: "sb.planeGround", wall: "sb.planeWall", wallL: "sb.planeWallL", wallR: "sb.planeWallR" } as const;
type LatinKey = Parameters<typeof tLatin>[0];
const PAD = 64;

function _use(): Use { const u = desk.ruler.use; return u === "drag" || u === "trace" ? u : "off"; }
/** 几何开着（拖画或留尺）。 */
export function shapeOn(): boolean { return _use() !== "off"; }
function _kind(): RulerKind { const k = desk.ruler.kind as RulerKind; return (RULER_KINDS as readonly string[]).includes(k) ? k : "parallel"; }
function _perspMode(): PerspMode { const m = desk.persp.mode; return (m === "p1" || m === "p2" || m === "p3" || m === "iso") ? m : "off"; }
function _frame(): PerspConfig | null { return _perspMode() === "off" ? null : configFromModeState(desk.persp); }
function _clipBox() { const { doc } = _ctx!; return { x0: -PAD, y0: -PAD, x1: doc.width + PAD, y1: doc.height + PAD }; }
/** 编辑态（非 transient）才谈几何：变换 / 裁切 / 调整 / VP 编辑期间条藏、不吸、不整形。 */
function _canUse(): boolean { const em = _ctx?.editMode; return !!em && !em.isTransient(); }
function _barApplies(): boolean { const m = _ctx?.editMode.current(); return _canUse() && m !== "picker" && m !== "hand"; }

/** 当前生效的尺：desk.ruler.geo 经校验且种类与 desk.ruler.kind 一致；透视尺 = 透视开着即有。 */
export function currentRuler(): Ruler | null {
  const k = _kind();
  if (k === "persp") return _perspMode() === "off" ? null : { kind: "persp" };
  const r = sanitizeRuler(desk.ruler.geo);
  return r && r.kind === k ? r : null;
}
/** 吸尺是否生效（有尺且开）。 */
export function rulerSnapping(): boolean { return desk.ruler.on && !!currentRuler(); }

// ---- input 的两个 provider ----
/** 描尺：像素笔 / 选区笔起笔取投影器（唯一切口在 input._move）。谁吸尺 = RULER_ROLES。pixel = 整数像素链投影器（Q5）。 */
export function guideForStroke(role: string, pixel: boolean): StrokeGuide | null {
  if (!_ctx || !desk.ruler.on || !RULER_ROLES.has(role) || !_canUse()) return null;
  const r = currentRuler();
  if (!r) return null;
  return guideFor(r, _frame(), pixel ? { box: _clipBox() } : undefined);
}
function _placeOpts(): PlaceOpts {
  const { board, doc, input } = _ctx!;
  const shift = !!input.shiftDown;   // Shift 按住 = 临时反转约束（形状笔时代同义；每帧读，重驱即时生效）
  return { constrain: desk.ruler.constrain !== shift, frame: _frame(), rot: board.viewport.rot || 0, docW: doc.width, docH: doc.height };
}
/** 拖画 / 留尺：起笔问一次（几何开 + 该 role 在册）；wrap 把内引擎包成「拖一下 = 整形」。 */
export const strokeShaper: StrokeShaper = {
  mode(role) {
    if (!_ctx || !_canUse() || !RULER_ROLES.has(role)) return null;
    const u = _use();
    if (u === "off") return null;
    if (u === "trace" && _kind() === "persp") return null;   // 透视尺 = 透视框本身，无形可放：本笔照常（吸尺按 on）
    return u;
  },
  wrap(io) {
    const g = new ShapeGesture({ kind: _kind(), place: _placeOpts, grid: () => ({ nu: desk.ruler.gridNu, nv: desk.ruler.gridNv }) });
    const placing = !io;
    return shapedStroke(g, io, {
      onDraft: (r) => { if (placing) { _draft = r; _ctx?.board.requestRender(); } },
      onEnd: (r) => { _draft = null; if (placing) _placeRuler(r); _rerender(); },
      onCancel: () => { _draft = null; _ctx?.board.requestRender(); },
    });
  },
};
function _placeRuler(r: Ruler | null): void {
  if (!_ctx || !r) return;
  desk.ruler.geo = r;
  desk.ruler.on = true;
  _ctx.setStatus(t("rl.placed"));
}

// ---- overlay / 透视 gizmo 门 ----
function _overlay(): GuideOverlay | null {
  if (!_ctx || !_canUse()) return null;
  const { doc } = _ctx;
  if (_draft) return _draft.kind === "persp" ? null : { segments: rulerSegments(_draft, doc.width, doc.height), style: "draft" };
  const r = currentRuler();
  if (!r || r.kind === "persp") return null;
  return { segments: rulerSegments(r, doc.width, doc.height), style: desk.ruler.on ? "active" : "dim" };
}
// 绘图态 gizmo（persp-edit 注入）：几何开着（形状笔时代同款）或透视尺吸附开，且 showGizmo
function _gizmoLive(): boolean {
  return _canUse() && desk.persp.showGizmo && (shapeOn() || (desk.ruler.on && _kind() === "persp"));
}

// ---- 状态动作 ----
function _setUse(u: Use): void {
  desk.ruler.use = u;
  if (u !== "off") _lastUse = u;
  if (u === "trace" && _kind() === "persp") desk.ruler.on = true;
  if (u === "drag") desk.ruler.on = false;   // 拖画时尺不吸（关几何后要吸再点 [吸尺]）
  if (_ctx) _ctx.setStatus(u === "drag" ? t("rl.dragHint") : u === "trace" ? t("rl.traceHint") : "");
  _rerender();
}
/** 几何开关（chip / S 键）。 */
export function toggleShape(): void {
  if (!_ctx || !_canUse()) return;
  _setUse(shapeOn() ? "off" : _lastUse);
}
function _setKind(nk: RulerKind): void {
  if (nk === _kind()) return;
  desk.ruler.kind = nk;
  desk.ruler.geo = null;                                             // 换种 = 旧尺退场
  desk.ruler.on = false;
  if (nk === "persp") {
    if (_perspMode() === "off") _setPerspMode("p2");                 // 选透视而透视关着 → 先给个二点（条上可改）
    if (_use() === "trace") desk.ruler.on = true;
  }
  _rerender();
}
function _clear(): void {
  if (_kind() === "persp") _setPerspMode("off"); else desk.ruler.geo = null;
  desk.ruler.on = false;
  _rerender();
}
// 透视模式（从形状条搬来：切模式补默认 VP、平面合法化）
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
// 格线行列 stepper（custom 件；改了就写回已放的格线尺）
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

// ---- 几何条 ----
function _rows(): ToolbarItem[][] {
  const items: ToolbarItem[] = [];
  const on = shapeOn(), k = _kind(), mode = _perspMode();
  // chip：永远在（入口 A 的固定尾位）
  items.push({ kind: "button", id: "rulerShapeToggle", icon: "shapes", title: tLatin("rl.toggle"), pin: true, pressed: () => shapeOn(), onClick: () => toggleShape() });
  if (on) {
    items.push({ kind: "select", id: "rulerKindSel", title: tLatin("rl.kind"), pin: true,
      items: () => RULER_KINDS.map((id) => ({ value: id, label: tLatin(KIND_KEY[id] as LatinKey), icon: KIND_ICON[id] })),
      value: () => _kind(),
      onChange: (v) => _setKind(v as RulerKind) });
    if (k !== "persp") {
      items.push({ kind: "button", id: "rulerConstrain", icon: _constrainIcon(k, mode), title: tLatin("rl.constrain"),
        pressed: () => desk.ruler.constrain, disabled: () => k === "grid",
        onClick: () => { desk.ruler.constrain = !desk.ruler.constrain; _rerender(); } });
    }
    if (k === "grid") items.push({ kind: "custom", id: "rulerGridCtl", mount: _mountGridCtl });
    items.push({ kind: "button", id: "rulerUseTrace", icon: "ruler", title: tLatin("rl.useTrace"),
      pressed: () => _use() === "trace", onClick: () => _setUse(_use() === "trace" ? "drag" : "trace") });
    items.push({ kind: "sep" });
    items.push({ kind: "select", id: "rulerPerspSel", title: tLatin("sb.perspModeSlot"),
      items: () => PERSP_MODES.map((m) => ({ value: m, label: tLatin(PERSP_MODE_KEY[m] as LatinKey), icon: PERSP_MODE_ICON[m] })),
      value: () => _perspMode(),
      onChange: (v) => { _setPerspMode(v as PerspMode); if (_kind() === "persp") desk.ruler.on = _use() === "trace" && v !== "off"; _rerender(); } });
    if (mode !== "off") {
      // 平面：只对落在平面上的形有意义（矩形 / 格线 / 椭圆）；平行线吸 VP 射线、透视尺吸 VP 族，都不吃平面（形状笔时代同规则）
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
  }
  if (currentRuler()) {
    // 有尺就露它的两颗钮（借套索条「其他工具下有选区只露取消选区」的先例）——关吸附 / 清尺不用先开几何
    items.push({ kind: "sep" });
    items.push({ kind: "button", id: "rulerSnap", icon: "ruler-snap", title: tLatin("rl.snap"), pressed: () => desk.ruler.on,
      onClick: () => { desk.ruler.on = !desk.ruler.on; _ctx?.setStatus(t(desk.ruler.on ? "rl.on" : "rl.off")); _rerender(); } });
    items.push({ kind: "button", id: "rulerClear", icon: "trash-can", title: tLatin("rl.clear"), onClick: () => _clear(), foldPriority: -1 });
  }
  return [items];
}
function _rerender(): void {
  _bar?.replaceRows(_rows());
  syncShapeToolbar();
  _ctx?.board.requestRender();
}
/** 显隐 + 位置：编辑态（非 transient、非吸色 / 抓手）常显；有别的上下文条可见就挂到它下面一行（入口 A：固定尾位）。
 *  wp:modechange / lassochange / histchange / resize 都调（本模块自己听，toolbar 不认识本模块）。 */
export function syncShapeToolbar(): void {
  if (!_ctx || !_bar) return;
  if (!_barApplies()) { _bar.hide(); return; }
  _bar.show();
  const others = contextToolbarBottomExcept("rulerToolbar");
  _bar.el.style.top = others > 0 ? `${others + 4}px` : "";
}

export function initRulerUi(ctx: AppContext): void {
  _ctx = ctx;
  _lastUse = _use() === "trace" ? "trace" : "drag";
  _bar = mountContextToolbar({ id: "rulerToolbar", rows: _rows(), ariaLabel: tLatin("rl.bar") });
  _bar.el.classList.add("ct-tail");   // 上下文条区的固定尾位（右对齐；styles.css）
  ctx.board.setGuideProvider(_overlay);
  setPerspGizmoLiveGate(_gizmoLive);
  window.addEventListener("wp:ruler-tap", () => toggleShape());                 // input.ts S 键
  window.addEventListener("wp:ruler-sync", () => _rerender());                 // persp-edit 收口（VP/锁/重置变了 → 条重画）
  for (const ev of ["wp:modechange", "wp:lassochange", "wp:histchange"]) window.addEventListener(ev, () => syncShapeToolbar());   // 其他条显隐变了 → 重定位
  window.addEventListener("resize", () => syncShapeToolbar());
  window.addEventListener("wp:applyEditorState", () => { _draft = null; _lastUse = _use() === "trace" ? "trace" : "drag"; _rerender(); });   // 换文档
  _rerender();
}

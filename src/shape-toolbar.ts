// shape-toolbar —— 形状笔的上下文条 + desk.shapeBrush ↔ 引擎回灌（ADR-0005）。created 2026-09-18 by Claude Fable 5.1
//
// user 2026-09-18：「形状笔：单独一个顶栏按钮，总之就是行为回滚到那时候。不当笔刷模式了。所以几乎就是回滚。只是需要接新UI」
//   → 引擎 src/shape-brush.ts 原样复活（git 30e8a5c^，v0.14.6 末版）；入口 = 顶栏第五个动词位 data-verb="shape"（common/verbs.ts，单子工具，
//   再点 = 开共享画笔笔架）；本文件 = 原 toolbar.ts 形状段（v0.14.6：静态 DOM + 五个 popup 菜单）改写成 ui/context-toolbar 工厂条
//   （2026-09-06 U1 起的家规：上下文条不再手写 DOM；多条叠放归工厂）。ADR-0013 几何 extension（ruler / shape-stroke / ruler-ui）已删。
// 条（行为 = v0.14.6 形状条，UI 件 = 现行标准件）：
//   [线 | 矩 | 圆 | 格]  子工具平铺（user v0.6.13：图形切换高频，不折叠；pin 永不折进「…」）。钮面 = 当前变体图标（v0.6.25：
//                     line 约束开 = line-snap / 透视下 snap-vanishing-point；rect 约束开 = square；circle 约束开 = circle，关 = ellipse）。
//                     已选中再点 / 长按 = 变体菜单（工厂 button.variants，v0.6.31 语义）；Shift 按住 = 临时反转约束（引擎 setConstrainInvert）。
//   [格线：行 −N＋ · 列 −N＋ · 外框]（只在 grid） | [透视模式 ▾（select-field）][平面（透视开 + 非 line）][编辑消失点][作画时显示 gizmo]
// 显隐：editMode.current() === "shapeBrush" 即显（其他动词条同规则；transient 期间不是 shapeBrush 自然藏）。
// 状态：desk.shapeBrush（per-doc）是 SSoT，UI 改 → 写 desk + 灌引擎；换文档 wp:applyEditorState 回灌。
//   画一半改子工具 / 变体 / 格线 / 透视 = cancel 不进 undo（user 2026-07-25 拍板，同两指手势接管语义）。

import { desk } from "./workbench-state.ts";
import { mountContextToolbar, type ContextToolbarHandle, type ToolbarItem } from "./ui/context-toolbar.ts";
import { configFromModeState, defaultVpsForMode, planesForMode, type PerspMode } from "./perspective-frame.ts";
import { togglePerspEdit } from "./persp-edit.ts";
import { tLatin } from "./i18n/index.ts";
import type { AppContext } from "./app-context.ts";
import type { ShapeSubTool } from "./shape-brush.ts";
import type { PopupMenuItem } from "./ui/popup-menu.ts";

let _ctx: AppContext | null = null;
let _bar: ContextToolbarHandle | null = null;

const SUBS: readonly ShapeSubTool[] = ["line", "rect", "circle", "grid"];
const SUB_KEY = { line: "sb.line", rect: "sb.rect", circle: "sb.circle", grid: "sb.grid" } as const;
const CONSTRAIN_KEY = { line: "constrainLine", rect: "constrainRect", circle: "constrainCircle" } as const;
const PERSP_MODES = ["off", "p1", "p2", "p3", "iso"] as const;
const PERSP_MODE_ICON: Record<string, string> = { off: "persp-viewport", p1: "persp-1p", p2: "persp-2p", p3: "persp-3p", iso: "persp-iso" };
const PERSP_MODE_KEY = { off: "sb.modeViewport", p1: "sb.mode1p", p2: "sb.mode2p", p3: "sb.mode3p", iso: "sb.modeIso" } as const;
const PLANE_ICON: Record<string, string> = { ground: "plane-ground", wall: "plane-wall", wallL: "plane-wall-left", wallR: "plane-wall-right" };
const PLANE_KEY = { ground: "sb.planeGround", wall: "sb.planeWall", wallL: "sb.planeWallL", wallR: "sb.planeWallR" } as const;
type LatinKey = Parameters<typeof tLatin>[0];

function _sub(): ShapeSubTool { const s = desk.shapeBrush.sub as ShapeSubTool; return SUBS.includes(s) ? s : "line"; }
function _perspMode(): PerspMode { const m = desk.persp.mode; return (m === "p1" || m === "p2" || m === "p3" || m === "iso") ? m : "off"; }
function _active(): boolean { return _ctx?.editMode.current() === "shapeBrush"; }
/** 描边中改任何形状参数 = cancel 不进 undo（同两指手势接管）。 */
function _abortIfDrawing(): void { if (_ctx?.input.isStrokeActive()) _ctx.input.abortActiveStroke(); }

// 变体钮面 / 变体菜单图标（v0.6.25：变体是并列可选项要成对可辨图标）
function _lineSnapIcon(mode: PerspMode): string { return mode !== "off" ? "snap-vanishing-point" : "line-snap"; }
function _subIcon(s: ShapeSubTool, mode: PerspMode): string {
  const es = desk.shapeBrush;
  if (s === "line") return es.constrainLine ? _lineSnapIcon(mode) : "line";
  if (s === "rect") return es.constrainRect ? "square" : "rectangle";
  if (s === "circle") return es.constrainCircle ? "circle" : "ellipse";
  return "grid";
}
function _variants(s: "line" | "rect" | "circle", mode: PerspMode): PopupMenuItem[] {
  const on = desk.shapeBrush[CONSTRAIN_KEY[s]];
  const [freeKey, freeIcon, conKey, conIcon] = s === "line" ? ["sb.varLineFree", "line", "sb.varLineSnap", _lineSnapIcon(mode)]
    : s === "rect" ? ["sb.varRect", "rectangle", "sb.varSquare", "square"]
    : ["sb.varEllipse", "ellipse", "sb.varCircle", "circle"];
  return [
    { id: "free", label: tLatin(freeKey as LatinKey), icon: freeIcon, checked: !on },
    { id: "constrain", label: tLatin(conKey as LatinKey), icon: conIcon, checked: on },
  ];
}

// ---- desk → 引擎 ----
function _pushGrid(): void {
  _ctx?.input.shapeBrush.setGridConfig({ nu: desk.shapeBrush.gridNu, nv: desk.shapeBrush.gridNv, border: desk.shapeBrush.gridBorder });
}
/** 换文档 / 启动：desk.shapeBrush 整包灌进引擎（对齐魔棒阈值样板）。 */
function _syncEngineFromDesk(): void {
  const eng = _ctx?.input.shapeBrush;
  if (!eng) return;
  eng.setSubTool(_sub());
  eng.setConstrainFor("line", desk.shapeBrush.constrainLine);
  eng.setConstrainFor("rect", desk.shapeBrush.constrainRect);
  eng.setConstrainFor("circle", desk.shapeBrush.constrainCircle);
  _pushGrid();
}

// ---- 状态动作 ----
function _setSub(s: ShapeSubTool): void {
  if (s === _sub()) return;
  _abortIfDrawing();
  desk.shapeBrush.sub = s;
  _ctx?.input.shapeBrush.setSubTool(s);
  _rerender();
}
function _setConstrain(s: "line" | "rect" | "circle", on: boolean): void {
  _abortIfDrawing();
  desk.shapeBrush[CONSTRAIN_KEY[s]] = on;
  _ctx?.input.shapeBrush.setConstrainFor(s, on);
  _rerender();
}
// 透视模式（ADR-0006 UI v2.1）：切模式时缺的 VP 按默认位补齐（per-mode 槽位，调过的保留）、平面合法化；引擎起笔时经 configFromModeState 拉取
function _setPerspMode(mode: PerspMode): void {
  if (!_ctx) return;
  _abortIfDrawing();
  const { doc } = _ctx;
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
  _rerender();
}

// 格线行列 stepper（custom 件；行在前 列在后 = v0.6.8「行−6＋ 列−2＋」，加号在右）
function _mountGridCtl(host: HTMLElement): () => void {
  host.className = "ct-custom sb-grid-ctl";
  const mk = (label: string, axis: "gridNu" | "gridNv") => {
    const wrap = document.createElement("span");
    wrap.className = "lasso-section";
    const lab = document.createElement("span"); lab.className = "lasso-tool-text"; lab.textContent = label;
    const minus = document.createElement("button"); minus.type = "button"; minus.className = "lasso-tool-btn"; minus.textContent = "−"; minus.setAttribute("aria-label", "−");
    const val = document.createElement("span"); val.className = "lasso-tool-text sb-grid-val";
    const plus = document.createElement("button"); plus.type = "button"; plus.className = "lasso-tool-btn"; plus.textContent = "＋"; plus.setAttribute("aria-label", "＋");
    const render = () => { val.textContent = String(desk.shapeBrush[axis]); };
    const step = (d: number) => {
      _abortIfDrawing();
      desk.shapeBrush[axis] = Math.max(1, Math.min(24, desk.shapeBrush[axis] + d));
      _pushGrid();
      render();
    };
    minus.addEventListener("click", (e) => { e.stopPropagation(); step(-1); });
    plus.addEventListener("click", (e) => { e.stopPropagation(); step(+1); });
    render();
    wrap.append(lab, minus, val, plus);
    return wrap;
  };
  host.append(mk(tLatin("sb.rows"), "gridNv"), mk(tLatin("sb.cols"), "gridNu"));
  return () => { host.replaceChildren(); };
}

// ---- 形状条 ----
function _rows(): ToolbarItem[][] {
  const items: ToolbarItem[] = [];
  const sub = _sub(), mode = _perspMode();
  for (const s of SUBS) {
    items.push({
      kind: "button", id: `shapeSub-${s}`, icon: _subIcon(s, mode), title: tLatin(SUB_KEY[s] as LatinKey), pin: true,
      pressed: () => _sub() === s,
      onClick: () => _setSub(s),
      ...(s === "grid" ? {} : { variants: { items: () => _variants(s, mode), onPick: (id: string) => _setConstrain(s, id === "constrain") } }),
    });
  }
  if (sub === "grid") {
    items.push({ kind: "sep" });
    items.push({ kind: "custom", id: "shapeGridCtl", mount: _mountGridCtl });
    items.push({ kind: "button", id: "shapeGridBorder", icon: "grid-border", title: tLatin("sb.border"), pressed: () => desk.shapeBrush.gridBorder,
      onClick: () => { _abortIfDrawing(); desk.shapeBrush.gridBorder = !desk.shapeBrush.gridBorder; _pushGrid(); } });
  }
  items.push({ kind: "sep" });
  items.push({ kind: "select", id: "shapePerspSel", title: tLatin("sb.perspModeSlot"),
    items: () => PERSP_MODES.map((m) => ({ value: m, label: tLatin(PERSP_MODE_KEY[m] as LatinKey), short: tLatin(`${PERSP_MODE_KEY[m]}Short` as LatinKey), icon: PERSP_MODE_ICON[m] })),
    value: () => _perspMode(),
    onChange: (v) => _setPerspMode(v as PerspMode) });
  if (mode !== "off") {
    // 平面：只对落在平面上的形有意义（矩形 / 格线 / 圆）；line 吸 VP 射线不吃平面（形状笔时代同规则）。平面钮展开常驻（user：画画高频，不收 flyout）
    if (sub !== "line") {
      for (const p of planesForMode(mode) as Array<keyof typeof PLANE_KEY>) {
        items.push({ kind: "button", id: `shapePlane-${p}`, icon: PLANE_ICON[p], title: tLatin(PLANE_KEY[p] as LatinKey),
          pressed: () => desk.persp.plane === p, onClick: () => { _abortIfDrawing(); desk.persp.plane = p; } });
      }
    }
    items.push({ kind: "button", id: "shapeVpEdit", icon: "vanishing-point-edit", title: tLatin("sb.vpEdit"), onClick: () => togglePerspEdit() });
    items.push({ kind: "button", id: "shapeShowGizmo", icon: desk.persp.showGizmo ? "visibility-show" : "visibility-hide", title: tLatin("sb.showGizmo"),
      pressed: () => desk.persp.showGizmo, onClick: () => { desk.persp.showGizmo = !desk.persp.showGizmo; _rerender(); } });
  }
  return [items];
}
function _rerender(): void {
  _bar?.replaceRows(_rows());
  updateShapeToolbar();
  _ctx?.board.requestRender();   // 绘图态 gizmo 跟着显隐
}
/** 显隐派生（对齐 updateLassoToolbar 的「统一同步点」纪律）：shapeBrush 模式即显。位置 / 叠放归工厂。 */
export function updateShapeToolbar(): void {
  if (!_bar) return;
  if (_active()) _bar.show(); else _bar.hide();
}

export function initShapeToolbar(ctx: AppContext): void {
  _ctx = ctx;
  ctx.input.shapeBrush.setPerspProvider(() => configFromModeState(desk.persp));
  _bar = mountContextToolbar({ id: "shapeToolbar", rows: _rows(), ariaLabel: tLatin("sb.stack") });
  window.addEventListener("wp:modechange", () => updateShapeToolbar());
  window.addEventListener("wp:shape-sync", () => _rerender());                 // persp-edit 收口（VP/锁/重置变了 → 条重画）
  window.addEventListener("wp:applyEditorState", () => { _syncEngineFromDesk(); _rerender(); });   // 换文档回灌
  _syncEngineFromDesk();
  _rerender();
}

// 曲线——UI 面（通道 tab + ui/curve-editor 编辑器皮）。
// 数学 = common/anim-curve.ts（Unity 式关键帧曲线）；bake = backend/filters/curves-kernel.ts（bakeLut8 同源，所见即所烤）。
// 2026-09-05 重写（user 0820「v0.1时代的算法债：曲线完全不能用。非常funky。重做，对标Unity的animation curve」；
//   0830 拍板：Unity 把手 / ＋🗑 实体钮 / SVG）。旧 canvas 版（拖点/加点/长按删）整块作废；hiddenInMenu 撤。
//   edited by Claude Fable 5.1

import { registerFilter } from "../filters.ts";
import { t } from "../i18n/index.ts";
import { CurvesKernel, curveOf, CURVE_CHANNELS, type CurvesParams, type CurveChannel } from "../backend/filters/curves-kernel.ts";
import { makeCurveEditor, DEFAULT_PLOT_SIZE, type CurveEditorHandle } from "../ui/curve-editor.ts";
import type { AnimCurve } from "../common/anim-curve.ts";
import { preferences } from "../app-prefs.ts";   // 2026-09-06 绘图区边长 device 偏好 curve-plot-size（整窗拖大时回写）

interface CurvesBuildState {
  params: CurvesParams;
  _curveEditor?: CurveEditorHandle;   // 重建 body 时 dispose 上一只
  _body?: HTMLElement;                // onBodyResize 量「非绘图区」高度用
}

/** 曲线编辑器绘图区边长（device 偏好；坏值回 DEFAULT_PLOT_SIZE）。 */
export function plotSizePref(): number {
  const v = preferences.get("curve-plot-size");
  return typeof v === "number" && Number.isFinite(v) && v >= 120 ? v : DEFAULT_PLOT_SIZE;
}
const MIN_PLOT = 120;
const CH_COLOR: Record<CurveChannel, string> = { comp: "var(--ink)", r: "#e44", g: "#3a3", b: "#46e", a: "#999" };

export class CurvesFilter {
  static id = "curves";
  static title = t("flt.curves.title");
  static category = "adjustment";
  static modes = ["region"];
  static bleedRadius = CurvesKernel.bleedRadius;
  static defaults = CurvesKernel.defaults;
  static bake = CurvesKernel.bake;

  static disposeBody(state: CurvesBuildState): void { state._curveEditor?.dispose(); state._curveEditor = undefined; }

  // 2026-09-06 晚 user「我说的是 resize curves window，而不是 resize 曲线窗」：整个调整浮窗右下角拖 → 这里收 body 可用尺寸，
  //   绘图区取正方形贴满（宽高取小），持久化边长（device 偏好）。宿主 filters-adjust 只在声明了本钩子的滤镜上露 grip。
  static onBodyResize(state: CurvesBuildState, avail: { w: number; h: number }): void {
    const ed = state._curveEditor;
    if (!ed) return;
    // body 里绘图区以外的高（通道 tab + 读数行 + 切线行 + 边距）= 现 body 高 − 现绘图区边长
    const nonPlot = state._body ? Math.max(0, state._body.offsetHeight - ed.plotSize()) : 0;
    const px = Math.max(MIN_PLOT, Math.round(Math.min(avail.w - 4, avail.h - nonPlot)));
    ed.setPlotSize(px);
    preferences.set("curve-plot-size", px);
  }

  static buildBody(container: HTMLElement, state: CurvesBuildState, onChange: () => void): void {
    container.innerHTML = "";
    state._curveEditor?.dispose();
    state._body = container;
    const p = state.params;
    // 参数归一（Reset 后 defaults 已是 AnimCurve；MCP 等外部灌入的旧点表也在此转正，编辑器只吃 AnimCurve）
    for (const ch of CURVE_CHANNELS) p[ch] = curveOf(p[ch]);
    if (!CURVE_CHANNELS.includes(p.active)) p.active = "comp";

    const tabs = document.createElement("div");
    tabs.className = "curves-tabs";
    const LABEL: Record<CurveChannel, string> = { comp: t("flt.curves.all"), r: "R", g: "G", b: "B", a: "A" };
    const tabEls = new Map<CurveChannel, HTMLButtonElement>();
    for (const ch of CURVE_CHANNELS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "curves-tab";
      b.textContent = LABEL[ch];
      b.style.borderBottomColor = CH_COLOR[ch];
      b.dataset.ch = ch;
      b.setAttribute("aria-pressed", p.active === ch ? "true" : "false");
      b.addEventListener("click", () => switchChannel(ch));
      tabs.appendChild(b);
      tabEls.set(ch, b);
    }
    container.appendChild(tabs);

    const editor = makeCurveEditor({
      curve: p[p.active] as AnimCurve,
      plotSize: plotSizePref(),
      lockEndpointsT: true,
      accent: CH_COLOR[p.active],
      fmt: (tt, v) => `${Math.round(tt * 255)} → ${Math.round(v * 255)}`,
      onInput: onChange,
      onCommit: () => { /* 历史合并点 = 面板 Apply（adjust 面板整次一步入栈） */ },
    });
    state._curveEditor = editor;
    container.appendChild(editor.el);

    function switchChannel(ch: CurveChannel): void {
      p.active = ch;
      for (const [k, b] of tabEls) b.setAttribute("aria-pressed", k === ch ? "true" : "false");
      editor.el.style.setProperty("--curve-accent", CH_COLOR[ch]);
      editor.setCurve(p[ch] as AnimCurve);
    }
  }
}

registerFilter(CurvesFilter);

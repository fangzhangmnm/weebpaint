// 曲线——UI 面（通道 tab + ui/curve-editor 编辑器皮）。
// 数学 = common/anim-curve.ts（Unity 式关键帧曲线）；bake = backend/filters/curves-kernel.ts（bakeLut8 同源，所见即所烤）。
// 2026-09-05 重写（user 0820「v0.1时代的算法债：曲线完全不能用。非常funky。重做，对标Unity的animation curve」；
//   0830 拍板：Unity 把手 / ＋🗑 实体钮 / SVG）。旧 canvas 版（拖点/加点/长按删）整块作废；hiddenInMenu 撤。
//   edited by Claude Fable 5.1

import { registerFilter } from "../filters.ts";
import { t } from "../i18n/index.ts";
import { CurvesKernel, curveOf, CURVE_CHANNELS, type CurvesParams, type CurveChannel } from "../backend/filters/curves-kernel.ts";
import { makeCurveEditor, type CurveEditorHandle } from "../ui/curve-editor.ts";
import type { AnimCurve } from "../common/anim-curve.ts";

interface CurvesBuildState {
  params: CurvesParams;
  _curveEditor?: CurveEditorHandle;   // 重建 body 时 dispose 上一只
}

const CH_COLOR: Record<CurveChannel, string> = { comp: "var(--ink)", r: "#e44", g: "#3a3", b: "#46e", a: "#999" };

export class CurvesFilter {
  static id = "curves";
  static title = t("flt.curves.title");
  static category = "adjustment";
  static modes = ["region"];
  static bleedRadius = CurvesKernel.bleedRadius;
  static defaults = CurvesKernel.defaults;
  static bake = CurvesKernel.bake;

  static buildBody(container: HTMLElement, state: CurvesBuildState, onChange: () => void): void {
    container.innerHTML = "";
    state._curveEditor?.dispose();
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

// 渐变映射——UI 面（ui/ramp-editor 色带编辑器）。created 2026-09-05 by Claude Fable 5.1
// 数学 = common/color-ramp.ts；bake = backend/filters/gradient-map-kernel.ts（luma → 色带查色，alpha 原样）。
// user 2026-08-30 实战：旧夏音色稿转二分——[0: 红肉影][θ: 皮肤色] constant 模式，拖第二色标 = 拖阈值。

import { registerFilter, filterForegroundColor } from "../filters.ts";
import { t } from "../i18n/index.ts";
import { GradientMapKernel, type GradientMapParams } from "../backend/filters/gradient-map-kernel.ts";
import { makeRampEditor, type RampEditorHandle } from "../ui/ramp-editor.ts";
import { sanitizeRamp, grayRamp, hexToRgba8, type Rgba8 } from "../common/color-ramp.ts";

interface GradientMapBuildState {
  params: GradientMapParams;
  _rampEditor?: RampEditorHandle;
}

export class GradientMapFilter {
  static id = "gradientMap";
  static title = t("flt.gm.title");
  static category = "adjustment";
  static modes = ["region"];
  static bleedRadius = GradientMapKernel.bleedRadius;
  static defaults = GradientMapKernel.defaults;
  static bake = GradientMapKernel.bake;

  static buildBody(container: HTMLElement, state: GradientMapBuildState, onChange: () => void): void {
    container.innerHTML = "";
    state._rampEditor?.dispose();
    const p = state.params;
    p.ramp = sanitizeRamp(p.ramp) ?? grayRamp();   // 外部灌入（MCP / 旧参数）在此转正，编辑器只吃合法 ColorRamp
    const editor = makeRampEditor({
      ramp: p.ramp,
      getForeground: (): Rgba8 => hexToRgba8(filterForegroundColor()) ?? [0, 0, 0, 255],
      onInput: onChange,
      onCommit: () => { /* 历史合并点 = 面板 Apply */ },
    });
    state._rampEditor = editor;
    container.appendChild(editor.el);
  }
}

registerFilter(GradientMapFilter);

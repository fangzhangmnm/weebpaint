// 渐变映射——UI 面（ui/ramp-editor 色带编辑器）。created 2026-09-05 by Claude Fable 5.1
// 数学 = common/color-ramp.ts；bake = backend/filters/gradient-map-kernel.ts（luma → 色带查色，alpha 原样）。
// user 2026-08-30 实战：旧夏音色稿转二分——[0: 红肉影][θ: 皮肤色] constant 模式，拖第二色标 = 拖阈值。
//
// 色标颜色怎么改（2026-09-05 晚 user「use foreground color 不对……把 color window 抽象复用一下让它不是只绑定画笔颜色」）：
//   选中色标 → 注册成 color-panel 的 ColorTarget（journal 20260802「color 窗口可以指向不同的 color 值进行编辑」的第二个消费者，
//   第一个是 fill 的 PendingFill）。色轮 / 吸管 / 色词写的就是这枚色标；取消选中或关面板 → 注销，色板回笔刷色。

import { registerFilter } from "../filters.ts";
import { t } from "../i18n/index.ts";
import { registerColorTarget, refreshColorDisplay } from "../color-panel.ts";
import { GradientMapKernel, type GradientMapParams } from "../backend/filters/gradient-map-kernel.ts";
import { makeRampEditor, rgba8ToHex, type RampEditorHandle } from "../ui/ramp-editor.ts";
import { sanitizeRamp, grayRamp, hexToRgba8, setStopColor } from "../common/color-ramp.ts";

interface GradientMapBuildState {
  params: GradientMapParams;
  _rampEditor?: RampEditorHandle;
  _unregisterTarget?: () => void;
}

export class GradientMapFilter {
  static id = "gradientMap";
  static title = t("flt.gm.title");
  static category = "adjustment";
  static modes = ["region"];
  static bleedRadius = GradientMapKernel.bleedRadius;
  static defaults = GradientMapKernel.defaults;
  static bake = GradientMapKernel.bake;

  /** 关面板 / 重置重建前：注销 color target、dispose 编辑器、色板显示回笔刷色。 */
  static disposeBody(state: GradientMapBuildState): void {
    state._unregisterTarget?.(); state._unregisterTarget = undefined;
    state._rampEditor?.dispose(); state._rampEditor = undefined;
    refreshColorDisplay();
  }

  static buildBody(container: HTMLElement, state: GradientMapBuildState, onChange: () => void): void {
    container.innerHTML = "";
    GradientMapFilter.disposeBody(state);
    const p = state.params;
    p.ramp = sanitizeRamp(p.ramp) ?? grayRamp();   // 外部灌入（MCP / 旧参数）在此转正，编辑器只吃合法 ColorRamp
    const editor = makeRampEditor({
      ramp: p.ramp,
      onInput: onChange,
      onCommit: () => { /* 历史合并点 = 面板 Apply */ },
      onSelect: () => refreshColorDisplay(),   // 选中变 → 色板 swatch/色轮显示跟着换（target 生灭）
    });
    state._rampEditor = editor;
    container.appendChild(editor.el);
    // 选中色标 = 色板编辑目标（alpha 保留色标原值：色轮只给 RGB）
    state._unregisterTarget = registerColorTarget(() => {
      const i = editor.selected();
      const stop = p.ramp.stops[i];
      if (!stop) return null;
      return {
        get: () => rgba8ToHex(stop.rgba).slice(0, 7),
        set: (hex) => {
          const c = hexToRgba8(hex);
          const j = editor.selected();
          const cur = p.ramp.stops[j];
          if (!c || !cur) return;
          setStopColor(p.ramp, j, [c[0], c[1], c[2], cur.rgba[3]]);
          editor.redraw();
          onChange();
        },
      };
    });
    refreshColorDisplay();
  }
}

registerFilter(GradientMapFilter);

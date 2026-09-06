// 手指 / 涂抹（Smudge）—— filter brush 模式插件。created 2026-09-05 by Claude Fable 5.1。
//
// 包装 SmudgeEngine（plugins/smudge-engine.ts），实现 Filter brush 契约（同 liquify.ts 形）：
//   - 入口两处：工具栏「手指」按钮（toolbar setTool("smudge") → `wp:enter-filter-brush` 事件 → filters-adjust
//     _enterFilterBrushMode）和 fx 菜单笔刷类（category adjustment + modes brush 自动列出）。
//   - variants：smear（手指 = 拖像素块）/ dull（混色 = 揉平均色）/ paint（带颜料的手指 = smear + 掺画笔色）。
//     user 2026-09-05「建议带颜料的手指和手指工具分开来」——同引擎两入口：手指 colorRate=0，带颜料 colorRate>0。
//   - mixModes：混色空间下拉（srgb / oklab 保饱和度 / spectral 颜料谱），持久化 preferences "smudge-mix"（gallery scope，
//     由 filters-adjust 读写；引擎只认 params.mix）。
//   - 强度 = flow × opacity（左栏两滑杆相乘；user 2026-09-05「问题4随你便」）× 压感（opaCoeff/γ 随笔）；
//     size / hardness / spacing / 压感系数来自滤镜笔架当前选的笔（getResolvedBrush）；lockAlpha 跟图层属性。
// 数学与候选比较：ai-docs/20260905-smudge-math-survey.md。

import { sanitizeCurve } from "../common/anim-curve.ts";
import { registerFilter } from "../filters.ts";
import { t, tLatin } from "../i18n/index.ts";
import type { Filter, FilterParams, BrushLayer, BrushSettings, BrushSelection, DirtyRect } from "../filters.ts";
import { SmudgeEngine, type SmudgeSettings, type SmudgeMode, type SmudgeLayer, type SmudgeSelection } from "./smudge-engine.ts";
import { isMixSpace } from "../backend/algorithms/color-mix.ts";

interface SmudgeBrushState { engine: SmudgeEngine; }

const clamp01 = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v);
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** "#rrggbb" → straight sRGB 0..1（解析失败 → 黑）。 */
export function parseHexColor(hex: unknown): [number, number, number] {
  if (typeof hex !== "string") return [0, 0, 0];
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const v = parseInt(m[1], 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

/** 纯函数：variant params + 当前笔（ResolvedBrush 形）+ 图层 → 引擎设置（可单测）。 */
export function smudgeSettingsFrom(params: FilterParams, bs: BrushSettings, layer: { lockAlpha?: boolean }): SmudgeSettings {
  const modeRaw = params.mode;
  const mode: SmudgeMode = modeRaw === "dull" || modeRaw === "paint" ? modeRaw : "smear";
  // 间距沿笔（滤镜笔出厂 2%，user 2026-09-05 拍板）；地板 1% 只防 0/负值，不再设 5% 地板。
  const spacing = Math.max(0.01, num(bs.spacing, num(bs.spacingValue, 0.02)));
  return {
    mode,
    dull: clamp01(num(params.dull, mode === "dull" ? 1 : 0)),   // 旋钮缺省按 variant：手指 0 / 混色 1
    size: Math.max(1, num(bs.size, 32)),
    hardness: clamp01(num(bs.hardness, 0.6)),
    spacing,
    strength: clamp01(num(bs.flow, 1) * num(bs.opacity, 1) * num(params.strengthScale, 1)),
    sizeCoeff: num(bs.sizeCoeff, 0),
    flowCoeff: num(bs.flowCoeff, 0),
    opaCoeff: num(bs.opaCoeff, 0),
    pressureGamma: num(bs.pressureGamma, 1),
    pressureCurve: bs.pressureCurve == null ? null : sanitizeCurve(bs.pressureCurve),   // 2026-09-05 压感曲线透传
    colorRate: mode === "paint" ? clamp01(num(params.colorRate, 0.5)) : 0,
    color: parseHexColor(bs.color),
    mix: isMixSpace(params.mix) ? params.mix : "srgb",
    lockAlpha: !!layer.lockAlpha,
  };
}

export class SmudgeFilter {
  static id = "smudge";
  static title = t("flt.smudge.title");
  static category = "adjustment";   // 与 liquify / sharpenBlur 同组（fx 菜单「笔刷类」自动列出）
  static modes = ["brush"];
  static bleedRadius(_p: FilterParams): number { return 0; }
  static defaults() { return { mode: "smear", colorRate: 0, dull: 0 }; }
  // 单叶语义（色彩类同）：组进来 = 上游路由错，响亮拒绝
  static supportsLayerGroup = false;

  static brushVariants = [
    { id: "smear", title: tLatin("flt.smudge.smear"), params: { mode: "smear", colorRate: 0, dull: 0 } },
    { id: "dull",  title: tLatin("flt.smudge.dull"),  params: { mode: "dull",  colorRate: 0, dull: 1 } },
    { id: "paint", title: tLatin("flt.smudge.paint"), params: { mode: "paint", colorRate: 0.5, dull: 0 } },
  ];
  // 2026-09-05 user「嗯 smear dull 连续量」：滤镜笔条上的「揉匀」旋钮，0 = 纯搬块 … 1 = 纯揉平均色（值经 params.dull）。
  static brushSliders = [
    { key: "dull", title: tLatin("flt.smudge.dullKnob"), min: 0, max: 1, step: 0.05, fmt: (v: number) => `${Math.round(v * 100)}%` },
  ];
  // 混色空间（filters-adjust 通用渲染第 2 个下拉；值经 params.mix 透传，持久化 preferences "smudge-mix"）
  static mixModes = [
    { id: "srgb",     title: tLatin("flt.smudge.mix.srgb") },
    { id: "oklab",    title: tLatin("flt.smudge.mix.oklab") },
    { id: "spectral", title: tLatin("flt.smudge.mix.spectral") },
  ];

  static beginBrushStroke(layers: readonly BrushLayer[], params: FilterParams, brushSettings: BrushSettings, selection: BrushSelection | null, x: number, y: number, pressure: number): SmudgeBrushState {
    if (layers.length !== 1) throw new Error(`Filter smudge: single-leaf only (got ${layers.length} targets)`);
    const layer = layers[0] as unknown as SmudgeLayer & { lockAlpha?: boolean };
    if (!(typeof layer.docW === "number" && typeof layer.docH === "number")) throw new Error("Filter smudge: target leaf has no doc size");
    const engine = new SmudgeEngine();
    engine.beginStroke(layer, smudgeSettingsFrom(params, brushSettings, layer), x, y, pressure, selection as unknown as SmudgeSelection | null);
    return { engine };
  }
  static extendBrushStamp(state: SmudgeBrushState, x: number, y: number, pressure: number): void { state.engine.extendStroke(x, y, pressure); }
  static endBrushStroke(state: SmudgeBrushState): void { state.engine.endStroke(); }
  static cancelBrushStroke(state: SmudgeBrushState): void { state.engine.cancelStroke(); }
  static flushDirty(state: SmudgeBrushState): DirtyRect | null { return state.engine.flushDirty(); }
}

registerFilter(SmudgeFilter as unknown as Filter);

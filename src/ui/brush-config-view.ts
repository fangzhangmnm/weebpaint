// 笔设置编辑器（UI 深化 candidate 1 · 第二个 Vue 子系统）。
//
// 取代 app.js 的 _renderBrushSettings（~165 行命令式 form builder，每次改 shape kind 都 innerHTML
// 全量重建）。现在 draft 是 reactive，条件 row 走 v-if，数值走 v-model —— 全量重建消失。
//
// **leaf-by-value + local-reactive-draft**（不是全局 reactive-SSoT）：编辑器只改一个 draft（app 传进来的
// preset 深拷贝），改动经 reactive 代理写回该对象；app 的 header 保存键读同一对象落 rack（_closeBrushSettings）。
// 组件唯一对外 emit = delete / export（这俩按钮在 body 里，但要 app 编排 confirm/落 trash/下载文件）。
// 保存/取消是 view header 的事（仍在 app），不经组件。
//
// 工具链同色轮：vendor vue.esm-browser.prod + template 字符串 + esbuild bundle。

import { createApp, defineComponent, ref, toRaw, onMounted, onUnmounted } from "../../vendor/vue/vue.esm-browser.prod.js";
import { VUE_RENDER } from "../vue-render.ts";   // #89：模板构建时编好（SSoT = src/vue-templates.ts），运行时零 eval
import { SelectFieldVue } from "./select-field.ts";   // 2026-09-02 C6 下拉标准件（Vue v-model 包装）
import { quantizeSize } from "./brush-size.ts";
import { t } from "../i18n/index.ts";
import { ensureBrushConfigDefaults } from "../common/current-brush-config.ts";
import type { BrushDraft } from "../common/current-brush-config.ts";
import { makeCurveEditor, type CurveEditorHandle } from "./curve-editor.ts";   // 2026-09-05 批 4：压感曲线
import { curveFromGamma } from "../common/pressure-curve.ts";
import type { AnimCurve } from "../common/anim-curve.ts";

// （brush-settings 的 class 名常量 2026-10-21 随模板搬进 src/vue-templates.ts）

// 压感曲线编辑器的 Vue 壳（DOM 工厂 ui/curve-editor 挂进来；曲线**原地改 raw 对象**——形状不进模板，不需要反应式，
//   也免得拖一帧触发一次整表 patch）。draft.pressureCurve 由「改用曲线」写入 / 「改回 gamma」删键（opt-in，不迁移旧笔）。
const CurveEditorVue = defineComponent({
  name: "CurveEditor",
  props: { curve: { type: Object, required: true } },
  setup(props: { curve: AnimCurve }) {
    const host = ref<HTMLElement | null>(null);
    let h: CurveEditorHandle | null = null;
    onMounted(() => {
      if (!host.value) return;
      h = makeCurveEditor({
        curve: toRaw(props.curve) as AnimCurve,
        lockEndpointsT: true,
        fmt: (t, v) => `${Math.round(t * 100)}% → ${Math.round(v * 100)}%`,
        onInput: () => {},
        onCommit: () => {},
      });
      host.value.appendChild(h.el);
    });
    onUnmounted(() => { h?.dispose(); h = null; });
    return { host };
  },
  render: VUE_RENDER.curveEditor,
});

export const BrushSettings = defineComponent({
  name: "BrushSettings",
  props: {
    draft: { type: Object, required: true },
    blendModes: { type: Object, default: () => ({}) },   // { mode: 中文label }
  },
  emits: ["delete", "export"],
  components: { SelectField: SelectFieldVue, CurveEditor: CurveEditorVue },
  setup(props: { draft: BrushDraft }) {
    // i18n：t() 在 setup 建 L manifest（§5a，key 受 tsc 检查），模板引 L.*。
    // 纯 latin 参数名(size/opacity/flow/streamline/stabilization/pressure LPF/pressureGamma/
    //   pixelMode/compositeMode)有意不译——它们在中文 UI 里本就是 latin identifier。
    const L = {
      basic: t("bs.basic"), name: t("bs.name"), tool: t("bs.tool"), toolBrush: t("bs.toolBrush"), toolEraser: t("bs.toolEraser"),
      blendMode: t("bs.blendMode"), folder: t("bs.folder"), shape: t("bs.shape"), shapeKind: t("bs.shapeKind"),
      round: t("bs.round"), ellipse: t("bs.ellipse"), aspect: t("bs.aspect"), rotation: t("bs.rotation"), hardness: t("bs.hardness"),
      sizeTitle: t("bs.sizeTitle"), sizeBase: t("bs.sizeBase"), sizeMax: t("bs.sizeMax"), dynamics: t("bs.dynamics"),
      defaults: t("bs.defaults"), defaultOpa: t("bs.defaultOpa"), smooth: t("bs.smooth"), advanced: t("bs.advanced"),
      composite: t("bs.composite"), wash: t("bs.wash"), buildup: t("bs.buildup"), pixelModeHelp: t("bs.pixelModeHelp"),
      spacingTitle: t("bs.spacingTitle"), spacing: t("bs.spacing"), taper: t("bs.taper"), taperIn: t("bs.taperIn"), taperOut: t("bs.taperOut"), taperFloor: t("bs.taperFloor"),
      exportBrush: t("bs.exportBrush"), deleteBrush: t("bs.deleteBrush"), on: t("common.on"), off: t("common.off"),
      pressureCurve: t("bs.pressureCurve"), useCurve: t("bs.useCurve"), useGamma: t("bs.useGamma"),
    };
    // 压感曲线 opt-in：起点 = 现 gamma 采样成 5 key（gamma 1 → 精确恒等）；改回 = 删键（引擎回落 gamma 路径）
    const useCurve = () => { props.draft.pressureCurve = curveFromGamma(props.draft.pressureGamma ?? 1); };
    const dropCurve = () => { delete props.draft.pressureCurve; };
    // quantizeSize 暴露给 template（size base/max 的 fmt + onInput 都用它）
    return { quantizeSize, L, useCurve, dropCurve };
  },
  render: VUE_RENDER.brushSettings,
});

export interface BrushSettingsHandle {
  open(draft: object): void;   // draft = app 拥有的 preset 深拷贝；组件原地编辑它
  close(): void;
}

// 曲线编辑器绘图区边长的持久化钩（宿主注入；ui/ 不 import app-prefs）

export function mountBrushSettings(
  el: HTMLElement,
  opts: { blendModes: Record<string, string>; onDelete: () => void; onExport: () => void },
): BrushSettingsHandle {
  const draft = ref<object | null>(null);
  const app = createApp(defineComponent({
    components: { BrushSettings },
    setup() {
      return { draft, blendModes: opts.blendModes, onDelete: opts.onDelete, onExport: opts.onExport };
    },
    // :key=draft.id → 换笔时整块 form remount（等价旧 _renderBrushSettings 重建，但只在换笔时）
    render: VUE_RENDER.brushSettingsHost,
  }));
  app.mount(el);
  return {
    open(d: object) { ensureBrushConfigDefaults(d as BrushDraft); draft.value = d; },
    close() { draft.value = null; },
  };
}

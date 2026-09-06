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
import { SelectFieldVue } from "./select-field.ts";   // 2026-09-02 C6 下拉标准件（Vue v-model 包装）
import { quantizeSize } from "./brush-size.ts";
import { t } from "../i18n/index.ts";
import { ensureBrushConfigDefaults } from "../common/current-brush-config.ts";
import type { BrushDraft } from "../common/current-brush-config.ts";
import { makeCurveEditor, type CurveEditorHandle } from "./curve-editor.ts";   // 2026-09-05 批 4：压感曲线
import { curveFromGamma } from "../common/pressure-curve.ts";
import type { AnimCurve } from "../common/anim-curve.ts";

const SECTION = "brush-settings-section";
const TITLE = "brush-settings-section-title";
const ROW = "brush-settings-row";
const ROW_FULL = "brush-settings-row brush-settings-row-full";
const VAL = "brush-settings-val";

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
  template: `<div ref="host" class="brush-settings-curve"></div>`,
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
  template: `
  <div>
    <!-- 基本 -->
    <div class="${SECTION}">
      <div class="${TITLE}">{{ L.basic }}</div>
      <div class="${ROW_FULL}"><label>{{ L.name }}</label><input type="text" v-model="draft.name"></div>
      <div class="${ROW_FULL}"><label>{{ L.tool }}</label>
        <SelectField v-model="draft.tool" :options="{ brush: L.toolBrush, eraser: L.toolEraser }" band="modal" />
      </div>
      <div class="${ROW_FULL}"><label>{{ L.blendMode }}</label>
        <SelectField v-model="draft.blendMode" :options="blendModes" band="modal" />
      </div>
      <div class="${ROW_FULL}"><label>{{ L.folder }}</label><input type="text" v-model="draft.folder"></div>
    </div>

    <!-- 形状 -->
    <div class="${SECTION}">
      <div class="${TITLE}">{{ L.shape }}</div>
      <div class="${ROW_FULL}"><label>{{ L.shapeKind }}</label>
        <SelectField v-model="draft.shape.kind" :options="{ round: L.round, ellipse: L.ellipse }" band="modal" />
      </div>
      <template v-if="draft.shape.kind === 'ellipse'">
        <div class="${ROW}"><label>{{ L.aspect }}</label><input type="range" min="0.1" max="1" step="0.05" v-model.number="draft.shape.aspect"><span class="${VAL}">{{ draft.shape.aspect.toFixed(2) }}</span></div>
        <div class="${ROW}"><label>{{ L.rotation }}</label><input type="range" min="0" max="180" step="1" v-model.number="draft.shape.rotation"><span class="${VAL}">{{ Math.round(draft.shape.rotation) }}°</span></div>
      </template>
      <div class="${ROW}"><label>{{ L.hardness }}</label><input type="range" min="0" max="1" step="0.05" v-model.number="draft.shape.hardness"><span class="${VAL}">{{ draft.shape.hardness.toFixed(2) }}</span></div>
    </div>

    <!-- 粗细 -->
    <div class="${SECTION}">
      <div class="${TITLE}">{{ L.sizeTitle }}</div>
      <div class="${ROW}"><label>{{ L.sizeBase }}</label><input type="range" min="1" :max="draft.size.max || 200" step="1" :value="draft.size.base" @input="e => draft.size.base = quantizeSize(+e.target.value)"><span class="${VAL}">{{ draft.size.base }} px</span></div>
      <div class="${ROW}"><label>{{ L.sizeMax }}</label><input type="range" min="10" max="1000" step="1" :value="draft.size.max" @input="e => draft.size.max = quantizeSize(+e.target.value)"><span class="${VAL}">{{ draft.size.max }} px</span></div>
    </div>

    <!-- 压感 dynamics -->
    <div class="${SECTION}">
      <div class="${TITLE}">{{ L.dynamics }}</div>
      <div class="${ROW}"><label>size</label><input type="range" min="-1" max="1" step="0.05" v-model.number="draft.sizeCoeff"><span class="${VAL}">{{ draft.sizeCoeff.toFixed(2) }}</span></div>
      <div class="${ROW}"><label>opacity</label><input type="range" min="-1" max="1" step="0.05" v-model.number="draft.opaCoeff"><span class="${VAL}">{{ draft.opaCoeff.toFixed(2) }}</span></div>
      <div class="${ROW}"><label>flow</label><input type="range" min="-1" max="1" step="0.05" v-model.number="draft.flowCoeff"><span class="${VAL}">{{ draft.flowCoeff.toFixed(2) }}</span></div>
    </div>

    <!-- 默认值 -->
    <div class="${SECTION}">
      <div class="${TITLE}">{{ L.defaults }}</div>
      <div class="${ROW}"><label>{{ L.defaultOpa }}</label><input type="range" min="0" max="1" step="0.05" v-model.number="draft.defaultOpa"><span class="${VAL}">{{ Math.round(draft.defaultOpa*100) }}%</span></div>
    </div>

    <!-- 笔画平滑 -->
    <div class="${SECTION}">
      <div class="${TITLE}">{{ L.smooth }}</div>
      <div class="${ROW}"><label>streamline</label><input type="range" min="0" max="1" step="0.05" v-model.number="draft.smooth.streamline"><span class="${VAL}">{{ draft.smooth.streamline.toFixed(2) }}</span></div>
      <div class="${ROW}"><label>stabilization</label><input type="range" min="0" max="1" step="0.05" v-model.number="draft.smooth.stabilization"><span class="${VAL}">{{ draft.smooth.stabilization.toFixed(2) }}</span></div>
      <div class="${ROW}"><label>pressure LPF</label><input type="range" min="0" max="200" step="5" v-model.number="draft.pressureLPF"><span class="${VAL}">{{ Math.round(draft.pressureLPF) }} ms</span></div>
    </div>

    <!-- 高级 -->
    <div class="${SECTION}">
      <div class="${TITLE}">{{ L.advanced }}</div>
      <div class="${ROW_FULL}"><label>{{ L.composite }}</label>
        <SelectField v-model="draft.compositeMode" :options="{ wash: L.wash, buildup: L.buildup }" band="modal" />
      </div>
      <!-- 压感曲线（2026-09-05 批 4，user 0830「压感同意用anim-curve」）：有曲线 → 编辑器替代 gamma 行；无 → gamma 滑条 + 「改用曲线」 -->
      <template v-if="draft.pressureCurve">
        <div class="${ROW_FULL}"><label>{{ L.pressureCurve }}</label><button type="button" class="brush-rack-action" style="justify-self:end;" @click="dropCurve">{{ L.useGamma }}</button></div>
        <CurveEditor :curve="draft.pressureCurve" />
      </template>
      <template v-else>
        <div class="${ROW}"><label>pressureGamma</label><input type="range" min="0.2" max="3" step="0.05" v-model.number="draft.pressureGamma"><span class="${VAL}">{{ draft.pressureGamma.toFixed(2) }}</span></div>
        <div class="${ROW_FULL}"><label>{{ L.pressureCurve }}</label><button type="button" class="brush-rack-action" style="justify-self:end;" @click="useCurve">{{ L.useCurve }}</button></div>
      </template>
      <div class="${ROW_FULL}">
        <label>pixelMode<br><span style="font-size:11px;color:var(--ink-soft);">{{ L.pixelModeHelp }}</span></label>
        <button type="button" class="brush-rack-action" style="justify-self:end;" :aria-pressed="draft.pixelMode" @click="draft.pixelMode = !draft.pixelMode">{{ draft.pixelMode ? L.on : L.off }}</button>
      </div>
    </div>

    <!-- 间距 -->
    <div class="${SECTION}">
      <div class="${TITLE}">{{ L.spacingTitle }}</div>
      <div class="${ROW}"><label>{{ L.spacing }}</label><input type="range" min="1" max="200" step="1" :value="Math.round(draft.spacing*100)" @input="e => draft.spacing = (+e.target.value)/100"><span class="${VAL}">{{ Math.round(draft.spacing*100) }}%</span></div>
    </div>

    <!-- 收尾 taper -->
    <div class="${SECTION}">
      <div class="${TITLE}">{{ L.taper }}</div>
      <div class="${ROW}"><label>{{ L.taperIn }}</label><input type="range" min="0" max="5" step="0.1" v-model.number="draft.taper.in"><span class="${VAL}">{{ draft.taper.in.toFixed(1) }}</span></div>
      <div class="${ROW}"><label>{{ L.taperOut }}</label><input type="range" min="0" max="5" step="0.1" v-model.number="draft.taper.out"><span class="${VAL}">{{ draft.taper.out.toFixed(1) }}</span></div>
      <!-- taperFloor：收尾包络能压到的最低压感系数。1 = 不收（taper 失效），0 = 收到全无。
           v415 接线时才发现它一直没有 UI —— 存了、同步了，却没人能改。 -->
      <div class="${ROW}"><label>{{ L.taperFloor }}</label><input type="range" min="0" max="1" step="0.05" v-model.number="draft.taperFloor"><span class="${VAL}">{{ draft.taperFloor.toFixed(2) }}</span></div>
    </div>

    <!-- 导出 / 删除（编排在 app：confirm / 落 trash / 下载文件） -->
    <div class="${SECTION}">
      <button type="button" class="brush-rack-action" @click="$emit('export')">{{ L.exportBrush }}</button>
    </div>
    <div class="${SECTION}">
      <button type="button" class="brush-rack-action" style="background:rgba(220,38,38,0.1);color:#dc2626;border-color:#dc2626;" @click="$emit('delete')">{{ L.deleteBrush }}</button>
    </div>
  </div>
  `,
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
    template: `<BrushSettings v-if="draft" :key="draft.id" :draft="draft" :blend-modes="blendModes" @delete="onDelete" @export="onExport" />`,
  }));
  app.mount(el);
  return {
    open(d: object) { ensureBrushConfigDefaults(d as BrushDraft); draft.value = d; },
    close() { draft.value = null; },
  };
}

// SelectField —— 下拉标准件：原生 <select> 的替身（按钮 + popup-menu compact 弹层）。created 2026-09-02 by Claude Fable 5.1（UI 纪元 C6）。
//
// 考古 T6（原生控件在 PWA 里不受控 ×4，代码自陈「第三次出现」）：<select> 的打开态是 chrome 域——iPad 弹层系统字体（UCSUR 豆腐）、
//   夜间白底白字、装不了 SVG；全局 option 主题规则只是续命。user 2026-07-30 家规「dropdown, slider 都用我们做的标准件」。
//   inline-select（主题/语言/词库）已是 popup-menu 适配；本模块把它泛化成「有 value 的字段」：分组（optgroup）、当前项勾选、
//   受控值（label 永远从 value() 派生，refresh() 重画）。build.sh lint 禁 index.html 再出现 <select>/<option>。
// 用法：静态节点 = index.html 里一个 <button class="select-field" id="…">（module 补 label+caret）；动态 = createSelectField。

import { togglePopupMenu, type PopupBand, type PopupMenuItem } from "./popup-menu.ts";
import { defineComponent, ref, watch, onMounted, onUnmounted } from "../../vendor/vue/vue.esm-browser.prod.js";

export interface SelectItem { value: string; label: string; group?: string; disabled?: boolean }
export interface SelectFieldOpts {
  items: () => SelectItem[];
  value: () => string;                 // 受控：当前值由消费者持有
  onChange: (v: string) => void;
  band?: PopupBand;                    // sheet 内传 "modal"（压过 sheet 500）；默认 menu
  align?: "left" | "right";
  ariaLabel?: string;
}
export interface SelectField {
  readonly el: HTMLElement;
  readonly value: string;
  refresh(): void;                     // 值在外面改了 → 重画 label
  dispose(): void;
}

function _itemsToMenu(items: SelectItem[], cur: string): PopupMenuItem[] {
  const out: PopupMenuItem[] = [];
  let group: string | undefined;
  for (const it of items) {
    if (it.group !== group) { group = it.group; if (group) out.push({ id: `__group:${group}`, label: group, header: true }); }
    out.push({ id: it.value, label: it.label, checked: it.value === cur, disabled: it.disabled });
  }
  return out;
}

export function mountSelectField(el: HTMLElement, opts: SelectFieldOpts): SelectField {
  el.classList.add("select-field");
  el.setAttribute("aria-haspopup", "listbox");
  if (opts.ariaLabel) el.setAttribute("aria-label", opts.ariaLabel);
  let label = el.querySelector<HTMLElement>(".select-field-label");
  if (!label) {
    label = document.createElement("span");
    label.className = "select-field-label";
    el.appendChild(label);
    el.insertAdjacentHTML("beforeend", '<svg class="menu-inline-caret" viewBox="0 0 24 24" aria-hidden="true"><use href="#chevron-down"/></svg>');
  }
  const refresh = () => {
    const v = opts.value();
    label!.textContent = opts.items().find((it) => it.value === v)?.label ?? v;
  };
  const onClick = (e: Event) => {
    e.stopPropagation();
    togglePopupMenu<string>({
      anchor: el, variant: "compact", band: opts.band ?? "menu", align: opts.align ?? "left", offsetY: 4,
      items: () => _itemsToMenu(opts.items(), opts.value()),
      onPick: (v) => { if (v.startsWith("__group:")) return "keep"; opts.onChange(v); refresh(); },
    });
  };
  el.addEventListener("click", onClick);
  refresh();
  return {
    el,
    get value() { return opts.value(); },
    refresh,
    dispose() { el.removeEventListener("click", onClick); },
  };
}

/** 现建一个下拉按钮（工具条里动态生成的场合）。 */
export function createSelectField(opts: SelectFieldOpts & { id?: string; className?: string }): SelectField {
  const b = document.createElement("button");
  b.type = "button";
  if (opts.id) b.id = opts.id;
  if (opts.className) b.className = opts.className;
  return mountSelectField(b, opts);
}

/** Vue 包装（v-model）：`<SelectField v-model="draft.tool" :options="{ brush: '…', eraser: '…' }" />`；options 也可给 SelectItem[]。 */
export const SelectFieldVue = defineComponent({
  name: "SelectField",
  props: {
    modelValue: { type: String, default: "" },
    options: { type: [Object, Array], default: () => ({}) },
    band: { type: String, default: "menu" },
    disabled: { type: Boolean, default: false },
  },
  emits: ["update:modelValue"],
  setup(props: { modelValue: string; options: Record<string, string> | SelectItem[]; band: PopupBand; disabled: boolean }, { emit }: { emit: (e: "update:modelValue", v: string) => void }) {
    const btn = ref<HTMLElement | null>(null);
    let f: SelectField | null = null;
    const items = (): SelectItem[] => Array.isArray(props.options)
      ? props.options
      : Object.entries(props.options).map(([value, label]) => ({ value, label: String(label) }));
    onMounted(() => {
      if (!btn.value) return;
      f = mountSelectField(btn.value, { items, value: () => props.modelValue, onChange: (v) => emit("update:modelValue", v), band: props.band });
    });
    onUnmounted(() => { f?.dispose(); f = null; });
    watch(() => [props.modelValue, props.options], () => f?.refresh(), { deep: true });
    return { btn };
  },
  template: `<button ref="btn" type="button" class="select-field" :disabled="disabled"></button>`,
});

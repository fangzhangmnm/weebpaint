// SelectField —— 下拉标准件：原生 <select> 的替身（按钮 + popup-menu compact 弹层）。created 2026-09-02 by Claude Fable 5.1（UI 纪元 C6）。
//
// 考古 T6（原生控件在 PWA 里不受控 ×4，代码自陈「第三次出现」）：<select> 的打开态是 chrome 域——iPad 弹层系统字体（UCSUR 豆腐）、
//   夜间白底白字、装不了 SVG；全局 option 主题规则只是续命。user 2026-07-30 家规「dropdown, slider 都用我们做的标准件」。
//   inline-select（主题/语言/词库）已是 popup-menu 适配；本模块把它泛化成「有 value 的字段」：分组（optgroup）、当前项勾选、
//   受控值（label 永远从 value() 派生，refresh() 重画）。build.sh lint 禁 index.html 再出现 <select>/<option>。
// 用法：静态节点 = index.html 里一个 <button class="select-field" id="…">（module 补 label+caret）；动态 = createSelectField。
// 钮面三档（2026-09-11，user「工具条上的自定义下拉框应该定宽，不然遇到英文会被撑的很宽」「加入定宽的缩写用来显示」「手指的第一个下拉框只显示图标」）：
//   face = "label"（默认；sheet 里有地方，全名）/ "short"（**定宽**钮面画 SelectItem.short 缩写，没缩写退回 label 省略号；工具条、图层模式）
//        / "icon"（只画当前项图标；该项没图标就退回缩写——钮面永不空白）。弹层永远画全名（+图标）。
//   定宽的「宽」= **本下拉自己量**：所有项缩写里最宽的一条 + 自己的左右 padding/border（+ 图标位）——换项不抖，也不为别的下拉的长标签留空
//   （user 2026-09-11「推 / Twirl L 这里还可以再窄一点，其他的也是……怀疑多算了一个常数」：此前是全家统一 84px 常量，按日文 5 字标签定的）。
//   量不到（未入树 / 无布局环境）就留 CSS 兜底宽 --select-fixed-w。
//   角标 = 右下角小三角（ui/icon slotCaretHtml；下箭头 chevron 退役）：与工具条变体槽同一颗，「有三角 = 有菜单」。

import { togglePopupMenu, type PopupBand, type PopupMenuItem } from "./popup-menu.ts";
import { iconHtml, slotCaretHtml } from "./icon.ts";
import { defineComponent, ref, watch, onMounted, onUnmounted } from "../../vendor/vue/vue.esm-browser.prod.js";

// 2026-09-09 icon（sprite symbol id，可选）：弹层项与钮面都带图标（user「手指的几种工具用下拉框吧，图标太打哑谜了」——图标 + 文字并列才读得懂）。
// 2026-09-11 short（可选）：定宽钮面用的缩写（"正片" / "Mult"）；弹层仍画 label 全名。
export interface SelectItem { value: string; label: string; short?: string; icon?: string; group?: string; disabled?: boolean }
export type SelectFace = "label" | "short" | "icon";
export interface SelectFieldOpts {
  items: () => SelectItem[];
  value: () => string;                 // 受控：当前值由消费者持有
  onChange: (v: string) => void;
  band?: PopupBand;                    // sheet 内传 "modal"（压过 sheet 500）；默认 menu
  align?: "left" | "right";
  ariaLabel?: string;
  face?: SelectFace;                   // 钮面档（见文件头）；默认 label
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
    out.push({ id: it.value, label: it.label, icon: it.icon, checked: it.value === cur, disabled: it.disabled });
  }
  return out;
}

// 文字量宽用的隐藏 span（全库一只，挂 body；只量缩写宽度，字节/像素不经它）
let _measurerEl: HTMLElement | null = null;
function _measurer(): HTMLElement {
  if (!_measurerEl || !_measurerEl.isConnected) {
    _measurerEl = document.createElement("span");
    _measurerEl.setAttribute("aria-hidden", "true");
    _measurerEl.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap;pointer-events:none;";
    document.body.appendChild(_measurerEl);
  }
  return _measurerEl;
}

export function mountSelectField(el: HTMLElement, opts: SelectFieldOpts): SelectField {
  const face: SelectFace = opts.face ?? "label";
  el.classList.add("select-field");
  el.classList.toggle("select-field--fixed", face === "short");   // 定宽（styles.css --select-fixed-w）
  el.classList.toggle("select-field--icon", face === "icon");
  el.dataset.face = face;
  el.setAttribute("aria-haspopup", "listbox");
  if (opts.ariaLabel) el.setAttribute("aria-label", opts.ariaLabel);
  // 已有 label（同一节点二次 mount）就复用：扫直系子节点而非 querySelector——node shim 的 querySelector 自动顺从返回游离节点，会把 label 建在树外
  let label = ([...el.childNodes] as HTMLElement[]).find((n) => (n.className || "").split(" ").includes("select-field-label")) ?? null;
  if (!label) {
    label = document.createElement("span");
    label.className = "select-field-label";
    el.appendChild(label);
    const caret = document.createElement("span");   // 右下角小三角（与变体槽同一颗；节点建而非 insertAdjacentHTML——node shim 也落树，测试看得见）
    caret.className = "select-field-caret";
    caret.innerHTML = slotCaretHtml("");
    el.appendChild(caret);
  }
  let iconEl: HTMLElement | null = null;   // 钮面图标位（闭包跟踪，不 querySelector：mount 时必不存在）
  let sizedKey = "";                        // 上次定宽量的是哪组缩写（项没变就不重量）
  const sizeFixed = (items: SelectItem[]) => {
    if (face !== "short" || !el.isConnected) return;
    const anyIcon = items.some((it) => !!it.icon);
    const key = items.map((it) => it.short ?? it.label).join("\u0001") + (anyIcon ? "\u0002" : "");
    if (key === sizedKey) return;
    const cs = getComputedStyle(el);
    const m = _measurer();
    m.style.fontFamily = cs.fontFamily; m.style.fontSize = cs.fontSize; m.style.fontWeight = cs.fontWeight; m.style.fontStyle = cs.fontStyle; m.style.letterSpacing = cs.letterSpacing;
    let maxW = 0;
    for (const it of items) { m.textContent = it.short ?? it.label; maxW = Math.max(maxW, m.getBoundingClientRect().width); }
    if (!(maxW > 0)) return;   // 量不到 → 留 CSS 兜底宽
    sizedKey = key;
    const px = (v: string) => parseFloat(v) || 0;
    const chrome = px(cs.paddingLeft) + px(cs.paddingRight) + px(cs.borderLeftWidth) + px(cs.borderRightWidth);
    const iconW = anyIcon ? (iconEl?.getBoundingClientRect().width || 18) + px(cs.columnGap || cs.gap) : 0;
    el.style.width = `${Math.ceil(maxW + chrome + iconW)}px`;
  };
  const refresh = () => {
    const v = opts.value();
    const items = opts.items();
    const cur = items.find((it) => it.value === v);
    const full = cur?.label ?? v;
    const brief = cur?.short ?? full;
    el.dataset.value = v;   // 当前值落 DOM（探针 / 测试读；只图标档没文字可读）
    // 钮面图标 = 当前项的 icon（有才画；换成无图标项就摘掉，宽度跟着项走）
    if (cur?.icon) {
      if (!iconEl) { iconEl = document.createElement("span"); iconEl.className = "select-field-icon"; el.insertBefore(iconEl, label); }
      iconEl.innerHTML = iconHtml(cur.icon);
    } else if (iconEl) { iconEl.remove(); iconEl = null; }
    // 文字：label 档全名；short 档缩写；icon 档只有在**没图标可画**时才退回缩写（钮面永不空白）
    const text = face === "label" ? full : (face === "short" || !cur?.icon) ? brief : "";
    label!.textContent = text;
    label!.hidden = text === "";
    sizeFixed(items);
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
    face: { type: String, default: "label" },
    disabled: { type: Boolean, default: false },
  },
  emits: ["update:modelValue"],
  setup(props: { modelValue: string; options: Record<string, string> | SelectItem[]; band: PopupBand; face: SelectFace; disabled: boolean }, { emit }: { emit: (e: "update:modelValue", v: string) => void }) {
    const btn = ref<HTMLElement | null>(null);
    let f: SelectField | null = null;
    const items = (): SelectItem[] => Array.isArray(props.options)
      ? props.options
      : Object.entries(props.options).map(([value, label]) => ({ value, label: String(label) }));
    onMounted(() => {
      if (!btn.value) return;
      f = mountSelectField(btn.value, { items, value: () => props.modelValue, onChange: (v) => emit("update:modelValue", v), band: props.band, face: props.face });
    });
    onUnmounted(() => { f?.dispose(); f = null; });
    watch(() => [props.modelValue, props.options], () => f?.refresh(), { deep: true });
    return { btn };
  },
  template: `<button ref="btn" type="button" class="select-field" :disabled="disabled"></button>`,
});

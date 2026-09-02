// 可见性原语：「藏 / 显」只有一种写法。created 2026-09-02 by Claude Fable 5.1（UI 纪元 C5）。
//
// 考古（T4 图标静默消失 ×5、T5 CSS 特异度外溢 ×4）：隐藏有三种写法（classList("hidden") 213 处 / hidden 属性 / style.display），
//   组件的 display:flex 会压过 .hidden 基类 → 41 条 `.x.hidden{display:none}` 补丁、`.menu-item[hidden]` 补丁；tsc 绿、测试绿、
//   真机肉眼才看得见。结构解：styles.css 里 `.hidden` / `[hidden]` 都带 !important（永远赢，补丁全删），build.sh lint 禁再加补丁；
//   动画类面（sheet / backdrop）不再借用 .hidden，改状态属性 data-open（ui/sheet 管）。本文件 = 语义入口，模块内部一律用它。
export function show(el: HTMLElement | null, on: boolean): void { el?.classList.toggle("hidden", !on); }
export function isShown(el: HTMLElement | null): boolean { return !!el && !el.classList.contains("hidden"); }

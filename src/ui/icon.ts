// 本仓只剩 slotCaretHtml（2026-10-21 收 @internal/workbench-elements 0.1.3：iconHtml / IconName 进包了——包只拼 <use>，sprite 仍在 index.html 顶部，
//   tools/inline-sprites.py 生成；图标名 = 共享库（20260708 SVG Icons）的 symbol id 或 assets/weebpaint_legacy.svg 的本地补丁）。
//   小三角不在包里：它是 WeebPaint 09-11 三角纪律的记号（有三角 = 有菜单），要不要提给包等 user。
/** 右下角小三角 = 「这里有菜单」记号（v0.6.31 三角纪律：有三角 = 有菜单；user 2026-09-11「比起用下箭头不如复用小三角」）。
 *  唯一出处——上下文条变体槽 / select-field 钮面 / index.html 静态槽都是这一颗；cls 默认 lasso-slot-caret（宿主 .lasso-slot 定位）。
 *  edited by Claude Fable 5.1 2026-09-11 */
export function slotCaretHtml(cls = "lasso-slot-caret"): string {
  return `<svg${cls ? ` class="${cls}"` : ""} viewBox="0 0 8 8" aria-hidden="true"><path d="M7.2 2.8 V7.2 H2.8 Z" fill="currentColor" stroke="none"/></svg>`;
}

// in-app 下拉（v0.5.40 从 settings-menu 提取——图库菜单成为第二消费者）。
// 为什么不用原生 <select>：打开态是 chrome 域（iPad 弹层系统字体→UCSUR 豆腐、夜间白底、装不了 SVG）。
// 形态：按钮（调用方自备 label span+caret）→ 锚定紧凑 list 弹层；条目**开时现建**（label 永远新鲜，
//   tok 字体门迟到翻转后自动带字形）。
// 2026-09-02（user 2026-07-25 点名的「收成 popover 深模块」落地）：弹层不再是 index.html 里的静态节点，
//   全走 ui/popup-menu（挂 body / 锚定 / z band / 外点关 / Escape / 单例）。本文件只剩「值列表 → 菜单项」的适配。
//   z：默认 popover（菜单内再弹，压过 --z-menu）；sheet(modal) 内的下拉传 band:"modal"。edited by Claude Fable 5.1

import { togglePopupMenu, type PopupBand } from "./ui/popup-menu.ts";

export function wireInlineSelect<V extends string>(
  btnId: string,
  items: () => { value: V; label: string }[],
  current: () => V,
  onPick: (v: V) => void,
  opts: { band?: PopupBand } = {},
): void {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener("click", (e: Event) => {
    e.stopPropagation();
    togglePopupMenu<V>({
      anchor: btn, variant: "compact", band: opts.band ?? "popover", align: "right", offsetY: 4,
      items: () => items().map((it) => ({ id: it.value, label: it.label, checked: it.value === current() })),
      onPick: (v) => onPick(v),
    });
  });
}

export type IconName = string;
/** 图标的 HTML 字符串（给 innerHTML / v-html / 模板拼接用）。 */
export declare function iconHtml(name: IconName, opts?: {
    size?: number;
    cls?: string;
}): string;
/** 图标 DOM 节点（给 appendChild 用）。 */
/** 右下角小三角 = 「这里有菜单」记号（v0.6.31 三角纪律：有三角 = 有菜单；user 2026-09-11「比起用下箭头不如复用小三角」）。
 *  唯一出处——上下文条变体槽 / select-field 钮面 / index.html 静态槽都是这一颗；cls 默认 lasso-slot-caret（宿主 .lasso-slot 定位）。
 *  edited by Claude Fable 5.1 2026-09-11 */
export declare function slotCaretHtml(cls?: string): string;

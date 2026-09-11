import { type SelectItem, type SelectFace } from "./select-field.ts";
import { type PopupMenuItem } from "./popup-menu.ts";
import { type IconName } from "./icon.ts";
/** owner 在 init 时登记（幂等）。静态条用；工厂 mount 自动登记。
 *  2026-09-11：静态条的显隐（owner 自己 toggle .hidden）用 MutationObserver 接进叠放重排——不靠 owner 记得通知、不吃事件监听顺序。 */
export declare function registerContextToolbar(el: HTMLElement | null): void;
/** 已登记 id（测试/诊断）。 */
export declare function contextToolbarIds(): string[];
/** 可见顶栏条的最大 bottom（anchored-popup belowToolbars 用）；无可见 = 0。 */
export declare function contextToolbarBottom(): number;
/** 立即重排一次（测试/探针用；运行时走 scheduleRelayout 合帧）。 */
export declare function relayoutContextToolbars(): void;
export type ToolbarItem = {
    kind: "title";
    text: string;
} | {
    kind: "sep";
} | {
    kind: "button";
    id: string;
    icon: IconName;
    title: string;
    pressed?: () => boolean;
    disabled?: () => boolean;
    onClick(): void;
    /** 角上小三角 = 有变体菜单：已选中再点 / 长按 → popup-menu（形状变体槽语义，v0.6.25）。 */
    variants?: {
        items: () => PopupMenuItem[];
        onPick(id: string): void;
    };
    /** 溢出时的折叠优先级（大 = 先折）；缺省按位置（越靠右越先折）。 */
    foldPriority?: number;
    /** 钉住：永不折进「…」（这条工具条的身份件，如手指位子工具下拉）。折完所有可折项仍放不下 → 行自身横滚兜底。2026-09-09 */
    pin?: boolean;
} | {
    kind: "select";
    id: string;
    items: () => SelectItem[];
    value: () => string;
    onChange(v: string): void;
    title?: string;
    foldPriority?: number;
    pin?: boolean;
    /** 钮面档（ui/select-field）：工具条缺省 "short"（定宽缩写，英文不撑条）；"icon" = 只图标（手指位子工具，六项同一只手指）。2026-09-11 */
    face?: SelectFace;
} | {
    kind: "slider";
    id: string;
    label: string;
    min: number;
    max: number;
    step: number;
    value: () => number;
    fmt?: (v: number) => string;
    onInput(v: number): void;
} | {
    kind: "custom";
    id: string;
    mount(host: HTMLElement): () => void;
};
export interface ContextToolbarSpec {
    id: string;
    rows: ToolbarItem[][];
    ariaLabel?: string;
}
export interface ContextToolbarHandle {
    el: HTMLElement;
    show(): void;
    hide(): void;
    isVisible(): boolean;
    refresh(): void;
    replaceRows(rows: ToolbarItem[][]): void;
    dispose(): void;
}
/** 建一条上下文工具条：chrome 复用 .lasso-toolbar-stack（固定顶栏下缘、居中、宽 ≤ 视口−24）；行内放不下 → 尾项折进「…」。 */
export declare function mountContextToolbar(spec: ContextToolbarSpec): ContextToolbarHandle;

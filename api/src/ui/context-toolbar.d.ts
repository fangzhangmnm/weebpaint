import { type SelectItem } from "./select-field.ts";
import { type PopupMenuItem } from "./popup-menu.ts";
import { type IconName } from "./icon.ts";
/** owner 在 init 时登记（幂等）。静态条用；工厂 mount 自动登记。 */
export declare function registerContextToolbar(el: HTMLElement | null): void;
/** 已登记 id（测试/诊断）。 */
export declare function contextToolbarIds(): string[];
/** 可见顶栏条的最大 bottom（anchored-popup belowToolbars 用）；无可见 = 0。 */
export declare function contextToolbarBottom(): number;
/** 同上，但不算 exceptId 那条（一条「挂在别的条下面」的尾位条给自己定位用，2026-09-10 几何条）。 */
export declare function contextToolbarBottomExcept(exceptId: string | null): number;
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

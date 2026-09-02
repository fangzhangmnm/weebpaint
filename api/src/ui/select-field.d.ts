import { type PopupBand } from "./popup-menu.ts";
export interface SelectItem {
    value: string;
    label: string;
    group?: string;
    disabled?: boolean;
}
export interface SelectFieldOpts {
    items: () => SelectItem[];
    value: () => string;
    onChange: (v: string) => void;
    band?: PopupBand;
    align?: "left" | "right";
    ariaLabel?: string;
}
export interface SelectField {
    readonly el: HTMLElement;
    readonly value: string;
    refresh(): void;
    dispose(): void;
}
export declare function mountSelectField(el: HTMLElement, opts: SelectFieldOpts): SelectField;
/** 现建一个下拉按钮（工具条里动态生成的场合）。 */
export declare function createSelectField(opts: SelectFieldOpts & {
    id?: string;
    className?: string;
}): SelectField;
/** Vue 包装（v-model）：`<SelectField v-model="draft.tool" :options="{ brush: '…', eraser: '…' }" />`；options 也可给 SelectItem[]。 */
export declare const SelectFieldVue: any;

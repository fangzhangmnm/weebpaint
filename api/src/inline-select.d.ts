import { type PopupBand } from "@internal/workbench-elements";
export declare function wireInlineSelect<V extends string>(btnId: string, items: () => {
    value: V;
    label: string;
}[], current: () => V, onPick: (v: V) => void, opts?: {
    band?: PopupBand;
}): void;

import { type PopupBand } from "./ui/popup-menu.ts";
export declare function wireInlineSelect<V extends string>(btnId: string, items: () => {
    value: V;
    label: string;
}[], current: () => V, onPick: (v: V) => void, opts?: {
    band?: PopupBand;
}): void;

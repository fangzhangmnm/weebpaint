export declare const RESAMPLE_MODES: {
    id: string;
    labelKey: string;
    shortKey: string;
    contexts: string[];
}[];
export declare function resampleItems(context: string | null, label?: (key: string) => string): {
    value: string;
    label: string;
    short: string;
}[];

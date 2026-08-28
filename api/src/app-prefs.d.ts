import type { Collection } from "./app-store.ts";
export declare const PREF_REGISTRY: {
    readonly "color-theme": {
        readonly scope: "device";
        readonly def: string;
    };
    readonly "single-finger-draw": {
        readonly scope: "device";
        readonly def: boolean;
    };
    readonly "stylus-smooth-params": {
        readonly scope: "device";
        readonly def: Record<string, number>;
    };
    readonly "cloud-enabled": {
        readonly scope: "device";
        readonly def: boolean;
    };
    readonly lang: {
        readonly scope: "gallery";
        readonly def: string | null;
    };
    readonly "gen-ai": {
        readonly scope: "gallery";
        readonly def: boolean;
    };
    readonly "show-fps": {
        readonly scope: "session";
        readonly def: boolean;
    };
};
export type PrefKey = keyof typeof PREF_REGISTRY;
type PrefValue<K extends PrefKey> = (typeof PREF_REGISTRY)[K]["def"];
export declare const PREF_DEFAULTS: { [K in PrefKey]: PrefValue<K>; };
export declare function wirePreferences(local: Collection, synced: Collection): void;
export declare function setGalleryLayerLive(v: boolean): void;
export declare function initPreferences(): Promise<void>;
export declare function preferencesReady(): Promise<void>;
/** 导航前屏障（gallery 层；device 层同步写无需 flush）：写完就 reload/关页的路径必须 await。 */
export declare function flushPreferences(): Promise<void>;
/** 前台/online 重拉云端（gallery 层 per-key LWW）。 */
export declare function refreshPreferences(): Promise<void>;
export declare const preferences: {
    get<K extends PrefKey>(k: K): PrefValue<K>;
    set<K extends PrefKey>(k: K, v: PrefValue<K>): void;
    /** gallery 层云端变更回灌钩（device/session 层无远端，不经此）。 */
    onChange(cb: (changedIds: string[]) => void): () => void;
};
export declare function seedDevicePrefsFromLegacy(): void;
export {};

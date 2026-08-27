declare const KEYS: {
    readonly lang: "weebpaint.boot.lang";
};
export type BootSnapshotKey = keyof typeof KEYS;
export declare function readBootSnapshot(k: BootSnapshotKey): string | null;
export declare function writeBootSnapshot(k: BootSnapshotKey, v: string | null): void;
export {};

export declare const thumbCache: import("@internal/gallery").ThumbCache;
export declare const stats: {
    hits: number;
    misses: number;
    errors: number;
};
export declare const config: {
    skipCache: boolean;
};
export declare function resetStats(): void;
export declare const readCachedThumb: (name: string) => Promise<import("@internal/gallery").CachedThumb | null>;
export declare const writeCachedThumb: (name: string, token: string, blob: Blob) => Promise<void>;
export declare const onThumbInvalidated: (fn: (key: string) => void) => void;
export declare const invalidateCachedThumb: (name: string) => Promise<void>;
export declare const getOrFetchCloudThumb: (name: string, token: string, source: "local" | "cloud") => Promise<{
    blob: Blob;
    fromCache: boolean;
}>;
export declare const clearCloudThumbCache: () => Promise<number>;

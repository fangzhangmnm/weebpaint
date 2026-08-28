import type { Collection } from "@internal/store";
export declare function detectStoreAbsent(): boolean;
type InitItem = {
    id: string;
    value: unknown;
};
export declare function createMemoryCollection(opts?: {
    getInitData?: () => InitItem[] | Promise<InitItem[]>;
}): Collection;
export {};

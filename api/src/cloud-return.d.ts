export type ReturnPlan = {
    kind: "none";
} | {
    kind: "list";
    total: number;
} | {
    kind: "ask";
    neverUploaded: number;
    others: number;
};
/** dirty = 库 dirty.count()；neverUploaded = 列举里 float 的份数。 */
export declare function planReturn(dirty: number, neverUploaded: number): ReturnPlan;
/** 列举里「从没传过且有字节要传」的身份。local-only 是干净的（pushAll 不推它），不算。 */
export declare function neverUploadedIds(files: readonly {
    identifier: string;
    syncState?: string | null;
}[]): Set<string>;

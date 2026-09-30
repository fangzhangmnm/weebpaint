export declare const SUBSTRUCTURE_VERSIONS: {
    readonly desk: 1;
};
export type Substructure = keyof typeof SUBSTRUCTURE_VERSIONS;
export type MigrationStep = (json: Record<string, unknown>) => Record<string, unknown>;
export declare class FormatTooNewError extends Error {
    readonly substructure: string;
    readonly fileVersion: number;
    readonly appVersion: number;
    constructor(substructure: string, fileVersion: number, appVersion: number);
}
/** 读到的子结构 JSON 从文件版本链式升到当前版；缺 version 视为 1（首版）。不是对象 → 原样返回（壳层按缺失处理）。 */
export declare function migrateSubstructure(sub: Substructure, json: unknown): unknown;

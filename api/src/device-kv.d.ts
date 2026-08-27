export declare function deviceKvGet(key: string): string | null;
/** v=null 删键。写失败（配额/隐私模式中途翻脸）→ 落内存层，绝不 throw（device 层是便利不是红线）。 */
export declare function deviceKvSet(key: string, v: string | null): void;
export declare function deviceKvGetJson<T>(key: string, fallback: T): T;
export declare function deviceKvSetJson(key: string, v: unknown): void;

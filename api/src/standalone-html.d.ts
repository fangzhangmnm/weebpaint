/** 单文件形态？（= 打包器灌过资产。⚠ 不等于 file://——单文件也可能被 http 服（itch/逃生舱）。） */
export declare const isStandaloneHtml: () => boolean;
/** 文本资产原文（json/js 源）。缺 = null（常规 build 恒 null → 调用方走 fetch 原路）。 */
export declare function embeddedText(name: string): string | null;
/** 二进制资产（打包器存 base64）。 */
export declare function embeddedBytes(name: string): Uint8Array | null;
export declare function embeddedBlobUrl(name: string, mime: string): string | null;

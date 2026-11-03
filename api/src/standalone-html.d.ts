/** 资产内嵌了没（= 打包器灌过资产）。**只回答这一件事**——2026-11-03 起（家族规则书 §1 第 9 条，工单 B）不再拿它做部署决定：
 *  装在哪 / 被套着没有问 deployment.ts，给不给某功能问 deployment-policy.ts。仍合法的读法 = 「旁边有没有别的文件」
 *  （pwa-shell：单文件旁边没有 service-worker.js）。⚠ 不等于 file://——单文件也可能被 http 服（itch / 逃生舱）。 */
export declare const isStandaloneHtml: () => boolean;
/** 文本资产原文（json/js 源）。缺 = null（常规 build 恒 null → 调用方走 fetch 原路）。 */
export declare function embeddedText(name: string): string | null;
/** 二进制资产（打包器存 base64）。 */
export declare function embeddedBytes(name: string): Uint8Array | null;
export declare function embeddedBlobUrl(name: string, mime: string): string | null;

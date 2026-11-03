export type Deployment = "site" | "itch" | "local";
/** 打包器烤进 itch 那份 index.html 的标记（scripts/pack-standalone.mjs 写同一串；test/deployment-guard.test.mjs 核两边一致）。 */
export declare const DEPLOYMENT_META = "<meta name=\"deployment\" content=\"itch\" />";
/** 纯判定（单测逐条钉）：协议 + 标记 → 部署方式。 */
export declare function classifyDeployment(protocol: string | undefined, marker: string | null | undefined): Deployment;
/** 这一份装在哪。 */
export declare function deployment(): Deployment;
/** 被套在别人页面里（window.self !== window.top；跨源访问 top 抛异常也算被套着）。没有 window（node）= 没被套。
 *  消费者：文件选择器 / 选文件夹框（浏览器在跨源子框里一律禁，itch 实锤 2026-08-28）。
 *  注意比旧的 pickerAllowedInFrame 严一点：同源 iframe 现在也算被套着（家族同一个定义；WeebPaint 没有被同源页面套着用的出货形态）。 */
export declare function embedded(): boolean;
/** 备用版（file:）时这个 html 的文件名（逃生舱说明里要提它：「在这个文件所在的文件夹起本地服务器」）；不是本地文件 = null。 */
export declare function localFileName(): string | null;

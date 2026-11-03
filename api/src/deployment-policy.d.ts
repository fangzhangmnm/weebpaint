import { type Deployment } from "./deployment.ts";
export interface DeploymentPolicy {
    /** 网盘（OneDrive）。false = 不载 MSAL、不 initAuth；入口画灰 +「去官网」。 */
    readonly cloud: boolean;
    /** 选本地文件夹当图库（还要叠浏览器能力：有选文件夹框、没被跨源套着）。 */
    readonly folderGallery: boolean;
    /** 在这台设备上记住图库密码（≤ 30 天，库上限）。 */
    readonly rememberPassword: boolean;
    /** 记住口令的勾旁要说一句「这台电脑上双击打开的别的网页也拿得到这把钥匙」（Chromium 里所有双击打开的网页共一个存储桶）。 */
    readonly rememberPasswordSharedBucket: boolean;
    /** 离线壳（service worker）。 */
    readonly serviceWorker: boolean;
    /** 开局一行 + 灰入口副标题里的「去官网」（SITE_URL）。 */
    readonly siteHint: boolean;
}
/** 某种部署方式的开关（纯函数；单测逐格钉）。 */
export declare function policy(d: Deployment): DeploymentPolicy;
/** 这一份的开关（= policy(deployment())）。 */
export declare function currentPolicy(): DeploymentPolicy;

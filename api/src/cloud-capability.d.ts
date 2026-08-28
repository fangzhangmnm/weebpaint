/** 能力变更广播（window 事件；消费方自己重读 isCloudEnabled()）。P3 起由换库事件驱动。 */
export declare const CLOUD_CAPABILITY_EVENT = "wp:cloud-capability-changed";
/** 当前库「在线可推」谓词（0828 bug 修：folder 挂着仍显无云——isSignedIn 是 MSAL 词，folder 库别问它）。
 *  SSoT = attachment 器官的 online 旗（folder=权限已授，**本地即在线与网络无关**；onedrive=登录态）；
 *  onedrive 额外 && navigator.onLine（浏览器离线推不动）。全 app 问「云腿现在能不能推」只准问这里。 */
export declare function galleryOnline(): boolean;
/** 图库能力真状态：有活店 = true（folder 库不需要登录也是有库）；无库模式/absent = false。 */
export declare function isCloudEnabled(): boolean;

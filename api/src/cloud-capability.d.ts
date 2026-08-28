/** 能力变更广播（window 事件；消费方自己重读 isCloudEnabled()）。P3 起由换库事件驱动。 */
export declare const CLOUD_CAPABILITY_EVENT = "wp:cloud-capability-changed";
/** 退役 pref 的播种源读口（见头注释；除播种外别再消费）。 */
export declare function cloudPrefEnabled(): boolean;
/** 图库能力真状态：有活店 = true（folder 库不需要登录也是有库）；无库模式/absent = false。 */
export declare function isCloudEnabled(): boolean;

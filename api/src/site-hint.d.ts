/** 开局调一次。说了 → true；官网 / 已经说过 → false。 */
export declare function sayHintOnce(opts: {
    folderGallery: boolean;
}): boolean;
/** 浏览器不给存（app-store storeAbsentReason === "storage-blocked"；规则书 §1 第 12 条，工单 B2）：开局一句「这个浏览器我们没测过、
 *  存不住设置和崩溃备份、作品存成文件、有问题去 issues」+ 一个「去报告」钮（新标签开 ISSUES_URL）。警告级、不自己收、一页一次、不弹窗。
 *  开发开关（?nostore）不走这里——那不是「浏览器不行」。 */
export declare function sayStorageBlockedOnce(): boolean;

export declare const OWN_CACHE_PREFIX = "weebpaint-";
/** 注销管着当前页面的 SW + 删自己前缀的 Cache Storage。失败只吞单项（壳清不干净不该挡住 reload）。 */
export declare function clearOwnShell(): Promise<void>;

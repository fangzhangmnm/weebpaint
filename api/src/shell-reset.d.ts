export declare const OWN_CACHE_PREFIX = "weebpaint-";
export declare const DEV_CACHE_PREFIX = "weebpaint-dev-";
/** 这个缓存是不是这个频道自己的壳（纯函数，测试直接测）。 */
export declare function isOwnShellCache(key: string, dev: boolean): boolean;
/** 注销管着当前页面的 SW + 删自己前缀的 Cache Storage。失败只吞单项（壳清不干净不该挡住 reload）。 */
export declare function clearOwnShell(): Promise<void>;

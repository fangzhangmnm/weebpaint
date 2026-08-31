export type DiagLevel = "error" | "warning" | "info" | "log" | "note";
export interface DiagEntry {
    t: number;
    l: DiagLevel;
    m: string;
}
/** 立即落盘（pagehide / 清空时调；平时 250ms 合并）。存储不可用时 device-kv 内存降级，本函数不抛。 */
export declare function flush(): void;
/** 记一条。msg 截到 600 字符；环满丢最旧。 */
export declare function record(level: DiagLevel, msg: string): void;
/** 面包屑（非错误的时间线事件）。tag 短词：boot / auth / gallery / page / net。 */
export declare function note(tag: string, msg: string): void;
export declare function entries(): readonly DiagEntry[];
export declare function clear(): void;
/** 复制/展示用的整段文本：环境头 + 每条一行「MM-DD HH:MM:SS.mmm L msg」（旧在上、新在下）。 */
export declare function toText(): string;
/** boot 期调一次：页面生命周期 / 在线态面包屑 + pagehide flush。record() 不依赖它（懒加载）。 */
export declare function initDiagLog(): void;

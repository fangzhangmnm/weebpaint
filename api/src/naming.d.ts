/** 画的默认名 = yyyymmdd-hex4（v217 惯例：同步生成无延迟；冲突概率 1/65536，
 *  真撞由调用方的 uniqueNameFor / mode:"new" 护栏兜）。 */
export declare function galleryDefaultName(now?: Date): string;
/** 下载版本时间戳 = YYYYMMDD-HHMM（分钟粒度：同分连导靠 sink 侧后缀/浏览器 (1) 消歧）。 */
export declare function downloadStamp(now?: Date): string;
/** 下载/导出文件基名 = `名-YYYYMMDD-HHMM`（不含扩展名）。 */
export declare function downloadName(base: string, now?: Date): string;

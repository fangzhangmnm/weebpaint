export declare function configureFormatNotice(sink: (msg: string) => void, message: () => string): void;
/** 开一张画（任何来源：图库 / 本地文件 / 导入 / 崩溃恢复）之前调：这张画还没说过。 */
export declare function beginFormatNotice(): void;
/** 某个子结构读到 minor 比本版新：这张画第一次 = 状态行说一句；之后只记黑匣子。 */
export declare function noteNewerMinor(part: string, fileStamp: string, appStamp: string): void;

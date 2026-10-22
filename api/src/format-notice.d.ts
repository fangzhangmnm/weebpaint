export type FormatNoticeKind = "newer-minor" | "part-too-new" | "newer-app";
export declare function configureFormatNotice(sink: (kind: FormatNoticeKind, msg: string, part: string) => void, message: (kind: FormatNoticeKind, part: string) => string): void;
/** 开一张画（任何来源：图库 / 本地文件 / 导入 / 崩溃恢复）之前调：这张画还没说过。 */
export declare function beginFormatNotice(): void;
/** 某个子结构读到 minor 比本版新：这张画第一次 = 通知条说一句；之后只记黑匣子。 */
export declare function noteNewerMinor(part: string, fileStamp: string, appStamp: string): void;
/** 写这画的 app 版本比本版新：这张画第一次 = 说一句（警告级）；覆盖确认在 session-state。 */
export declare function noteNewerApp(writer: string, app: string): void;
/** 某个子结构的 major 比本版新（desk / 录像 / 参考清单）：那部分按默认显示、原字节带着存回。这张画第一次 = 说一句。 */
export declare function noteTooNewPart(part: string, fileStamp: string, appStamp: string): void;

// 黑匣子 = @internal/gallery 的 diag-log（2026-09-10 收货；实现在包里，这里只注入 app 名/版本 + 转发名字，让 5 个消费点零改动）。
import { diagLog } from "@internal/gallery";
import { WEEBPAINT_VERSION } from "./version.ts";
export type DiagLevel = Parameters<typeof diagLog.record>[0];
export type DiagEntry = ReturnType<typeof diagLog.entries>[number];
export const { record, note, entries, clear, toText, flush } = diagLog;
export function initDiagLog(): void { diagLog.initDiagLog({ app: "WeebPaint", version: WEEBPAINT_VERSION }); }

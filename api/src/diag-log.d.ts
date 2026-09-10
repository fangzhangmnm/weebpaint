import { diagLog } from "@internal/gallery";
export type DiagLevel = Parameters<typeof diagLog.record>[0];
export type DiagEntry = ReturnType<typeof diagLog.entries>[number];
export declare const record: typeof diagLog.record, note: typeof diagLog.note, entries: typeof diagLog.entries, clear: typeof diagLog.clear, toText: typeof diagLog.toText, flush: typeof diagLog.flush;
export declare function initDiagLog(): void;

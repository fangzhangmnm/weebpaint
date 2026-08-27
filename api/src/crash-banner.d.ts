import type { AppContext } from "./app-context.ts";
/** boot 接线（app.ts 调，gallery-shell init 之后）：扫库 → 逐条问（新→旧，一次一条）。 */
export declare function initCrashBanner(ctx: AppContext): void;

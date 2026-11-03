// legacy-app-db.ts —— 老库 `weebpaint` → `weebpaint-bd6cece69075d759.app` 的搬家排期（家族工单 B2，Fable 2026-11-03 裁定；created by Claude Opus 5.5）。
//   搬家本体（IDB 读写、逐键核、删老库）在 src/storage.ts migrateLegacyAppDb——那是持久层白名单里的文件；本模块零 IDB，只管：
//   ① 什么时候跑：开机开完上次那幅画之后、浏览器空闲的时候，一页一次（启动速度优先：不和开画抢）；
//   ② 结果进黑匣子（diag-log）：搬了几条、没搬成为什么——没搬成老库留着，下次开机再来（同源的老 bundle 还会写老库，所以这事会重复发生）。
//   不弹任何东西：用户看得见的变化只有「缩略图重建一次」，发版说明里说（release-notes/v0.14.51.md）。
import { migrateLegacyAppDb, LEGACY_DB_NAME, type LegacyAppDbMigration } from "./storage.ts";
import { note as diagNote } from "./diag-log.ts";
import { reportError } from "./error-badge.ts";

let _scheduled = false;

function _say(r: LegacyAppDbMigration): void {
  if (r.outcome === "none") return;
  const counts = `ring ${r.moved["checkpoint-ring"] ?? 0} (new ${r.copied["checkpoint-ring"] ?? 0}), checkpoints ${r.moved["checkpoints"] ?? 0} (new ${r.copied["checkpoints"] ?? 0})`;
  if (r.outcome === "migrated") { diagNote("storage", `legacy app DB ${LEGACY_DB_NAME} migrated and deleted: ${counts}`); return; }
  diagNote("storage", `legacy app DB ${LEGACY_DB_NAME} kept (${r.why}): ${counts}`);
  reportError(new Error(`[storage] legacy app DB migration deferred to next boot: ${r.why}`), "log");
}

/** 开机链最后调一次：等一个空闲片再搬（一页只排一次）。 */
export function migrateLegacyAppDbWhenIdle(): void {
  if (_scheduled) return;
  _scheduled = true;
  const go = (): void => {
    migrateLegacyAppDb().then(_say, (e) => {
      diagNote("storage", "legacy app DB migration failed (old DB kept, retry next boot): " + String(e));
      reportError(new Error("[storage] legacy app DB migration failed (old DB kept): " + String(e)), "log");
    });
  };
  if (typeof requestIdleCallback === "function") requestIdleCallback(go, { timeout: 15_000 });
  else setTimeout(go, 3000);
}

// 云端 ora 缩略图缓存 = @internal/gallery createThumbCache（2026-09-10 收货）。存储 = 本仓 storage.ts 的 gallery-thumbs 专用 object store
//   （key = store 身份 identifier（全名 X.ora），多库前缀 galleryId，legacy "default" 无前缀）；取图 = cloud-thumbs.fetchOraThumbnail。
//   2026-10-21 迁库：入口参数从裸名改成身份（gallery 0.6.0 起包递身份）——缓存 key 以前就是 sessionFileName(裸名) = 同一个串，存量条目零迁移。
//   诚实不变量（QA 2026-08-21「新 token 配旧字节」）在包里。
import { createThumbCache, thumbKeyFor, activeGalleryId } from "@internal/gallery";
import { getThumb, setThumb, deleteThumb, clearThumbs } from "../storage.ts";
import { fetchOraThumbnail } from "./cloud-thumbs.ts";
import { reportError } from "../error-badge.ts";
export const thumbCache = createThumbCache({
  store: { get: getThumb, set: setThumb, delete: deleteThumb, clear: clearThumbs },
  fetch: fetchOraThumbnail,
  keyOf: (identifier) => thumbKeyFor(activeGalleryId(), identifier),
  report: (e) => reportError(e instanceof Error ? e : new Error(String(e)), "log"),
});
export const stats = thumbCache.stats;
export const config = thumbCache.config;
export function resetStats(): void { stats.hits = 0; stats.misses = 0; stats.errors = 0; }
export const readCachedThumb = (identifier: string) => thumbCache.read(identifier);
export const writeCachedThumb = (identifier: string, token: string, blob: Blob | null) => thumbCache.write(identifier, token, blob);
export const onThumbInvalidated = (fn: (key: string) => void): void => { thumbCache.onInvalidated(fn); };
export const invalidateCachedThumb = (identifier: string) => thumbCache.invalidate(identifier);
export const getOrFetchCloudThumb = (identifier: string, token: string, source: "local" | "cloud") => thumbCache.getOrFetch(identifier, token, source);
export const clearCloudThumbCache = () => thumbCache.clear();

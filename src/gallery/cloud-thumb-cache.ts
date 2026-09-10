// 云端 ora 缩略图缓存 = @internal/gallery createThumbCache（2026-09-10 收货）。存储 = 本仓 storage.ts 的 gallery-thumbs 专用 object store
//   （key = store 身份 = sessionFileName(裸名)，多库前缀 galleryId，legacy "default" 无前缀 → 存量条目零迁移）；取图 = cloud-thumbs.fetchOraThumbnail。
//   诚实不变量（QA 2026-08-21「新 token 配旧字节」）在包里。本文件保留旧函数名，4 个消费点零改动。
import { createThumbCache, thumbKeyFor, activeGalleryId } from "@internal/gallery";
import { getThumb, setThumb, deleteThumb, clearThumbs } from "../storage.ts";
import { fetchOraThumbnail } from "./cloud-thumbs.ts";
import { sessionFileName } from "../config.ts";
import { reportError } from "../error-badge.ts";
export const thumbCache = createThumbCache({
  store: { get: getThumb, set: setThumb, delete: deleteThumb, clear: clearThumbs },
  fetch: fetchOraThumbnail,
  keyOf: (name) => thumbKeyFor(activeGalleryId(), sessionFileName(name)),
  report: (e) => reportError(e instanceof Error ? e : new Error(String(e)), "log"),
});
export const stats = thumbCache.stats;
export const config = thumbCache.config;
export function resetStats(): void { stats.hits = 0; stats.misses = 0; stats.errors = 0; }
export const readCachedThumb = (name: string) => thumbCache.read(name);
export const writeCachedThumb = (name: string, token: string, blob: Blob) => thumbCache.write(name, token, blob);
export const onThumbInvalidated = (fn: (key: string) => void): void => { thumbCache.onInvalidated(fn); };
export const invalidateCachedThumb = (name: string) => thumbCache.invalidate(name);
export const getOrFetchCloudThumb = (name: string, token: string, source: "local" | "cloud") => thumbCache.getOrFetch(name, token, source);
export const clearCloudThumbCache = () => thumbCache.clear();

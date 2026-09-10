// gallery-attachment-host.ts —— attachment 器官的浏览器装配（真 deps；纯核心在 gallery-attachment.ts）。
// created 2026-08-27 by Claude Fable 5.
//
// import 图：本文件 → app-store（seam）+ gallery-registry + instance-locks；app-store 不 import 本文件（无环）。
// 收口开画 gate 晚绑（session/doc 侧 import app-store 会成环，故由 app.ts setAttachmentGate 注入）；
//   未绑定 = 恒 true = 保守拒卸（宁可卸不掉，不可带着开画拆家）。

import { createGalleryAttachment } from "@internal/gallery";
import type { SwappableStore } from "@internal/gallery";
import type { GalleryEntry } from "@internal/gallery";
import { galleryRegistry } from "@internal/gallery";
import { storeAbsent, _swapStoreForGallery, _buildStoreForGalleryEntry, requestGalleryPersist } from "./app-store.ts";
import { setActiveGalleryId } from "@internal/gallery";
import { reportError } from "./error-badge.ts";
import type { Store } from "@internal/store";

let _hasOpenGalleryDoc: () => boolean = () => true;   // 未接线默认保守（拒卸）
export function setAttachmentGate(hasOpenGalleryDoc: () => boolean): void { _hasOpenGalleryDoc = hasOpenGalleryDoc; }

export const galleryAttachment = createGalleryAttachment({
  storeAbsent,
  buildStore: (entry: GalleryEntry) => _buildStoreForGalleryEntry(entry) as SwappableStore,
  swap: (next) => _swapStoreForGallery((next as Store | null)),
  registry: galleryRegistry,
  hasOpenGalleryDoc: () => _hasOpenGalleryDoc(),
  requestPersist: requestGalleryPersist,
  setActiveGalleryId,
  reportError: (e) => reportError(e instanceof Error ? e : new Error(String(e)), "warning"),   // 簿记失败出声（残留审计 G）
});

// cloud-capability —— 「云端/图库能力」判定的**单一接缝**（2026-08-21 立；P3 sunset 2026-08-27 换真相源；2026-09-10 实现进 @internal/gallery，本文件 = 工厂喂真相源）。
//   hasGallery() = 有活店（attachment attached / legacy 预建店在岗）；folder 库无需登录也是有库。判定纯读，零数据变更。
import { createGalleryCapability, wireCapabilityBroadcast, GALLERY_CAPABILITY_EVENT } from "@internal/gallery";
import { hasLiveStore } from "./app-store.ts";
import { galleryAttachment } from "./gallery-attachment-host.ts";
export { GALLERY_CAPABILITY_EVENT };
const cap = createGalleryCapability({ attachment: galleryAttachment, hasLiveStore });
export function galleryOnline(): boolean { return cap.galleryOnline(); }
export function hasGallery(): boolean { return cap.hasGallery(); }
try { wireCapabilityBroadcast(window); } catch { /* node 测试环境无 window */ }

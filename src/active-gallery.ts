// active-gallery.ts —— 「当前 gallery id」的唯一真相（P3；tab 级，attachment 器官是唯一写手）。
// created 2026-08-27 by Claude Fable 5.
//
// 消费方：instance-locks（锁名 gallery 域）/ resume-slate（回执条默认键）/ session-state（安家铸户口）。
// legacy 连续性：播种的 legacy OneDrive 库 id 就是 "default"（= SOLE_GALLERY_ID）——锁名、回执条键
//   与 P3 前逐字节相同，零迁移（gallery-registry seed 契约）。未挂库 = 回落 SOLE_GALLERY_ID
//   （Editor-only 的 transient/file 家不消费 gallery 域，回落值只是让默认参数有地可站）。

import { SOLE_GALLERY_ID } from "./doc-home.ts";

let _id: string = SOLE_GALLERY_ID;

export function activeGalleryId(): string { return _id; }
export function setActiveGalleryId(id: string | null): void { _id = id ?? SOLE_GALLERY_ID; }

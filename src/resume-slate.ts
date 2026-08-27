// resume-slate.ts —— 设备的回执条器官（P5；设计 = ai-docs/20260827-p5-settings-destore-proposal.md §9.6）。
// created 2026-08-27 by Claude Fable 5.
//
// 「上次开着什么」不是设置，是设备书签——**每个 gallery 一张回执条**（兄妹共用电脑：各库各条）。
// 一石五鸟（§9.6）：①三态字符串哨兵（null/""/名）→ tagged union（DocHome 同手法）②per-gallery
// 天然（P3 多库白送）③restoreAttempt（崩溃环断路标记）并入同记录 = **同步原子单键写**——
// v0.10.9 的 flushMarker 400ms 防抖舞蹈永久退役 ④preferences/state 两表 scope 格保纯净
// ⑤驱逐守卫（activeFileName）读本机回执 = 本机真相（v438 毒化案的结构化根治：**本器官永不同步**）。
//
// 存储 = device-kv 单键单记录（localStorage 同步写 = 天然原子）；无地降级随 device-kv（纯内存）。

import { deviceKvGetJson, deviceKvSetJson } from "./device-kv.ts";
import { SOLE_GALLERY_ID } from "./doc-home.ts";

/** 上次离开时开着什么（boot 三态的 typed 形；P1.5 user 拍板「首次新画布，上次图库则图库」）。 */
export type ResumeOpened =
  | { kind: "doc"; path: string }   // 上次开着这张画（库裸名） → boot 恢复它
  | { kind: "gallery" }             // 上次有意停在图库 → boot 回图库
  | null;                           // 首次/从未绑定 → boot 新画布
  // 扩展位（P3 registry 能持久化文件句柄后）：{ kind: "file"; ... }

export interface ResumeSlate {
  opened: ResumeOpened;
  /** 崩溃环断路标记（boot-restore 纪律③）：boot 自动开画前写目标名，优雅收场清 null。
   *  与 opened 同记录同原子写——「写标记必须先于 restore 落盘」由同步写直接保证。 */
  restoreAttempt: string | null;
}

const EMPTY: ResumeSlate = { opened: null, restoreAttempt: null };
const _key = (galleryId: string) => `resume:${galleryId}`;

export function readSlate(galleryId: string = SOLE_GALLERY_ID): ResumeSlate {
  const raw = deviceKvGetJson<ResumeSlate | null>(_key(galleryId), null);
  return raw && typeof raw === "object" ? { opened: raw.opened ?? null, restoreAttempt: raw.restoreAttempt ?? null } : { ...EMPTY };
}
function _write(slate: ResumeSlate, galleryId: string): void {
  deviceKvSetJson(_key(galleryId), slate);
}

/** 唯一写点①：活动身份持久化（原 setCurrentSessionName 的持久层）。
 *  开画成功 = app 活着且真拿住画 → 崩溃环标记一并解除（原 appState.restoreAttempt=null 语义）。 */
export function setOpened(opened: ResumeOpened, galleryId: string = SOLE_GALLERY_ID): void {
  const cur = readSlate(galleryId);
  _write({ opened, restoreAttempt: opened?.kind === "doc" ? null : cur.restoreAttempt }, galleryId);
}

/** 唯一写点②：崩溃环标记（boot-restore 纪律③）。同步落盘——无需 flush。 */
export function setRestoreAttempt(name: string | null, galleryId: string = SOLE_GALLERY_ID): void {
  const cur = readSlate(galleryId);
  _write({ ...cur, restoreAttempt: name }, galleryId);
}

/** 一次性播种（幂等）：从 legacy 双态迁入——currentFile 三态字符串（null=首次/""=图库/名=画）+
 *  restoreAttempt。已有回执条（含播种过的空条）→ 不覆盖。boot 在 collection hydrate 后调一次。 */
export function seedSlateFromLegacy(legacy: { currentFile: string | null; restoreAttempt: string | null }, galleryId: string = SOLE_GALLERY_ID): void {
  if (deviceKvGetJson<ResumeSlate | null>(_key(galleryId), null) != null) return;   // 已有条 → 不动
  const opened: ResumeOpened = legacy.currentFile == null ? null
    : legacy.currentFile === "" ? { kind: "gallery" }
    : { kind: "doc", path: legacy.currentFile };
  _write({ opened, restoreAttempt: legacy.restoreAttempt ?? null }, galleryId);
}

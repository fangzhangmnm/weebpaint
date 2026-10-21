// 图库屏幕 = @internal/gallery mountGalleryScreen（2026-09-10 收货：Vue 深模块 959 行搬进包，WeebPaint 行为 = spec；2026-10-21 收 0.8.5，迁库 doc ai-docs/20261021-store-2x-gallery-08x-migration.md §4）。
// 本文件 = 宿主适配：Vue 注入、DocHost（session-state 的 open/rename/setName/unload/exit/dropCheckpoint 直调收成一个端口）、
//   数据面（包的 createGalleryDataFace 吃 store.identifiers + Item.syncState；WeebPaint 只补「哪些非文档算图片」）、缩略图缓存、加密（crypto-state + enc-thumbs）、当前夹记忆（appState）。
// **身份边界**（gallery 0.6.0 起包里只有身份 identifier = 全名 X.ora；app 内部仍用裸名 X）：包 → app 一律 bare()；app → 包一律 sessionFileName()。
//   边界只在这个文件 + createStore 的 activeIdentifier（app-store.ts）；缩略图缓存 / 换密码 / 全库备份已改成直接吃身份。
import * as Vue from "../../vendor/vue/vue.esm-browser.prod.js";   // 整个模块原样递给 gallery（0.8.4：有全部 helper = 用构建时编好的 render、运行时零 eval；CSP 不放行 eval 也能开图库 —— 总账 #89）
import { mountGalleryScreen, createGalleryDataFace, isImagePath, type GalleryHandle, type GItem, type VueRuntime, type GalleryDocHost, type GalleryEncryption, type VerbStore, type DataFaceStore } from "@internal/gallery";
import { galleryBackend } from "../app-store.ts";
import { appEncryption } from "../encryption.ts";
import { thumbCache } from "./cloud-thumb-cache.ts";
import { getOrFetchImageThumb } from "./image-thumbs.ts";
import { importImageAsNewDoc } from "../import-image.ts";
import { reportError } from "../error-badge.ts";
import { openDiagLogSheet } from "../diag-log-sheet.ts";
import { isUnlocked, onLockChange, setPassword } from "../crypto-state.ts";
import { localPeekThumb, decryptCloudPeekThumb, ensureNewPassword, isFreshPasswordSetup, rollbackFreshPassword } from "../enc-thumbs.ts";
import { stripSessionExt, sessionFileName } from "../config.ts";
import { ORA_KIND } from "../identifiers.ts";
import { session } from "../session-state.ts";
import { appState } from "../app-state.ts";
import { iconHtml } from "@internal/workbench-elements";
export type { GalleryHandle };

export interface GalleryHost {
  signedIn(): boolean;
  online(): boolean;
  activeName(): string | null;   // 裸名（app 内部身份）
  confirm(title: string, msg: string): Promise<boolean>;
  input(title: string, def: string, opts?: { placeholder?: string }): Promise<string | null>;
  chooseFolder(title: string, msg: string, options: { label: string; value: string }[]): Promise<string | null>;
  status(msg: string, isError?: boolean): void;
  busy<T>(label: string, fn: () => Promise<T>): Promise<T>;
  /** 本地字节是不是加密容器（纯本地 IDB 读文件头，无网络）。gallery 按夹探测锁态用。name = 裸名。 */
  isEncrypted(name: string): Promise<boolean>;
  /** 交互解锁（busy 外弹密码 + verifyPassword）。成功 → true。name = 裸名。 */
  unlock(name: string): Promise<boolean>;
}
const bare = stripSessionExt;   // 包的身份（X.ora）→ app 裸名（X）
const liveStore = (): (VerbStore & DataFaceStore) | null => { const b = galleryBackend(); return b.kind === "live" ? (b.store as unknown as VerbStore & DataFaceStore) : null; };

export function mountGallery(el: HTMLElement, host: GalleryHost): GalleryHandle {
  const vue = Vue as unknown as VueRuntime;
  const data = createGalleryDataFace({ store: liveStore, policy: { isImage: isImagePath } });   // 哪些是文档由 store 的 docKinds 表说（只有 .ora）
  const doc: GalleryDocHost = {
    open: (item: GItem) => session.open({ name: bare(item.identifier) }),
    renameActive: async () => { const n = await session.rename(); return n == null ? null : sessionFileName(n); },   // 包要新身份
    setIdentifier: (id) => session.setName(bare(id)),
    // 「推送到云端」不在词汇表上（user 2026-10-16「禁止越狱」）：gallery ≥ 0.8.1 不再调这个端口，没同步好的文件只有「处理…」→ store file.resolve()。
    //   端口是包的必填项，接的是响亮 throw——真有谁调了 = 包违约，要看见，不要静默推。
    push: async (item: GItem) => { throw new Error(`[gallery] push(${item.identifier}) is not a sync verb (vocabulary = resolve / 三选一 in the sheet); gallery >= 0.8.1 must not call it`); },
    unload: (item: GItem) => session.unload({ name: bare(item.identifier) }),
    exit: () => session.exit(),
    dropCheckpoint: (id) => { void session.dropCheckpoint(bare(id)); },
    importImageAsDoc: (file, o) => importImageAsNewDoc(file, o),
  };
  const encryption: GalleryEncryption = {
    isUnlocked, onLockChange: (cb) => { onLockChange(cb); },
    isEncryptedPeekBlob: (b) => appEncryption.isEncryptedPeekBlob(b),
    localPeekThumb: (id) => localPeekThumb(bare(id)),
    decryptCloudPeekThumb: (id, enc) => decryptCloudPeekThumb(bare(id), enc),
    isEncrypted: (id) => host.isEncrypted(bare(id)),
    ensureUnlocked: (id) => host.unlock(bare(id)),
    ensureNewPassword: async () => (await ensureNewPassword()) ?? null,
    isFreshPasswordSetup, rollbackFreshPassword,
    setPassword: (pw) => setPassword(pw),
  };
  return mountGalleryScreen(el, {
    vue, store: liveStore, data, doc,
    host: {
      signedIn: () => host.signedIn(), online: () => host.online(),
      activeIdentifier: () => { const n = host.activeName(); return n == null ? null : sessionFileName(n); },
      confirm: (a, b) => host.confirm(a, b), input: (a, b, c) => host.input(a, b, c), chooseFolder: (a, b, c) => host.chooseFolder(a, b, c), status: (m, e) => host.status(m, e), busy: (l, fn) => host.busy(l, fn),
    },
    ui: { iconHtml },
    // 缩略图（ora 容器里的 Thumbnails/thumbnail.png 尾读）只给画这一种文档；缓存 = 本仓 cloud-thumb-cache（按身份键）
    thumbKinds: [ORA_KIND],
    thumbs: thumbCache, imageThumbs: { getOrFetch: getOrFetchImageThumb },
    encryption,
    folderMemory: { get: () => { try { return appState.currentDirectory || ""; } catch { return ""; } }, set: (p) => { try { appState.currentDirectory = p; } catch { /* ignore */ } } },
    isGalleryVisible: () => document.body.dataset.mode === "gallery",
    reportError: (e, level) => reportError(e instanceof Error ? e : new Error(String(e)), level ?? "error"),
    openDiag: () => openDiagLogSheet(),
    reloadApp: () => location.reload(),
  });
}

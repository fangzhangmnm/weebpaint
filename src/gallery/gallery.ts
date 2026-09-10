// 图库屏幕 = @internal/gallery mountGalleryScreen（2026-09-10 收货：Vue 深模块 959 行搬进包，WeebPaint 行为 = spec）。
// 本文件 = 宿主适配：Vue 注入、DocHost（session-state 的 open/rename/setName/push/unload/exit/dropCheckpoint 七处直调收成一个端口）、
//   数据面（store + WeebPaint 的 ora/图片扩展名白名单 + 裸名↔全名边界）、缩略图缓存、加密（crypto-state + enc-thumbs）、当前夹记忆（appState）。
//   对外 API（mountGallery / GalleryHost / GalleryHandle）与收货前逐字相同 → app.ts / app-context / shell 零改动。
import { createApp, defineComponent, reactive, ref, computed, watch, onMounted, onUnmounted, nextTick } from "../../vendor/vue/vue.esm-browser.prod.js";
import { mountGalleryScreen, createGalleryDataFace, isDocPath, isImagePath, type GalleryHandle, type GItem, type GalleryItem, type VueRuntime, type GalleryDocHost, type GalleryEncryption, type VerbStore, type DataFaceStore } from "@internal/gallery";
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
import { session } from "../session-state.ts";
import { appState } from "../app-state.ts";
import { iconHtml } from "../ui/icon.ts";
export type { GalleryHandle };

export interface GalleryHost {
  signedIn(): boolean;
  online(): boolean;
  activeName(): string | null;
  confirm(title: string, msg: string): Promise<boolean>;
  input(title: string, def: string, opts?: { placeholder?: string }): Promise<string | null>;
  chooseFolder(title: string, msg: string, options: { label: string; value: string }[]): Promise<string | null>;
  status(msg: string, isError?: boolean): void;
  busy<T>(label: string, fn: () => Promise<T>): Promise<T>;
  /** 本地字节是不是加密容器（纯本地 IDB 读文件头，无网络）。gallery 按夹探测锁态用。 */
  isEncrypted(name: string): Promise<boolean>;
  /** 交互解锁（busy 外弹密码 + verifyPassword）。成功 → true。 */
  unlock(name: string): Promise<boolean>;
}
const NAMING = { bare: stripSessionExt, full: sessionFileName };
const liveStore = (): (VerbStore & DataFaceStore) | null => { const b = galleryBackend(); return b.kind === "live" ? (b.store as unknown as VerbStore & DataFaceStore) : null; };

export function mountGallery(el: HTMLElement, host: GalleryHost): GalleryHandle {
  const vue = { createApp, defineComponent, reactive, ref, computed, watch, onMounted, onUnmounted, nextTick } as unknown as VueRuntime;
  const data = createGalleryDataFace({ store: liveStore, policy: { isDoc: isDocPath, isImage: isImagePath, naming: NAMING } });
  const doc: GalleryDocHost = {
    open: (item: GItem) => session.open(item as unknown as GalleryItem),
    renameActive: async () => (await session.rename()) ?? null,
    setName: (n) => session.setName(n),
    push: (item: GItem) => session.push(item as unknown as GalleryItem),
    unload: (item: GItem) => session.unload(item as unknown as GalleryItem),
    exit: () => session.exit(),
    dropCheckpoint: (n) => { void session.dropCheckpoint(n); },
    importImageAsDoc: (file, o) => importImageAsNewDoc(file, o),
  };
  const encryption: GalleryEncryption = {
    isUnlocked, onLockChange: (cb) => { onLockChange(cb); },
    isEncryptedPeekBlob: (b) => appEncryption.isEncryptedPeekBlob(b),
    localPeekThumb, decryptCloudPeekThumb,
    isEncrypted: (n) => host.isEncrypted(n),
    ensureUnlocked: (n) => host.unlock(n),
    ensureNewPassword: async () => (await ensureNewPassword()) ?? null,
    isFreshPasswordSetup, rollbackFreshPassword,
    setPassword: (pw) => setPassword(pw),
  };
  return mountGalleryScreen(el, {
    vue, store: liveStore, data, doc,
    host: { signedIn: () => host.signedIn(), online: () => host.online(), activeName: () => host.activeName(), confirm: (a, b) => host.confirm(a, b), input: (a, b, c) => host.input(a, b, c), chooseFolder: (a, b, c) => host.chooseFolder(a, b, c), status: (m, e) => host.status(m, e), busy: (l, fn) => host.busy(l, fn) },
    ui: { iconHtml },
    naming: NAMING, isZipDoc: () => true,
    thumbs: thumbCache, imageThumbs: { getOrFetch: getOrFetchImageThumb },
    encryption,
    folderMemory: { get: () => { try { return appState.currentDirectory || ""; } catch { return ""; } }, set: (p) => { try { appState.currentDirectory = p; } catch { /* ignore */ } } },
    isGalleryVisible: () => document.body.dataset.mode === "gallery",
    reportError: (e, level) => reportError(e instanceof Error ? e : new Error(String(e)), level ?? "error"),
    openDiag: () => openDiagLogSheet(),
    reloadApp: () => location.reload(),
  });
}

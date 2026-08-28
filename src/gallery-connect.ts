// gallery-connect.ts —— P3 连接/切换动词中心（UI 调这里，不自己攒流程）。
// created 2026-08-27 by Claude Fable 5. 拍板 = ai-docs/20260827-p3-gallery-multiinstance-grill-verdicts.md。
//
// 动词：连接本地文件夹（picker→mint→attach）/ 连接 OneDrive（signIn account-picker→mint→attach）/
//   boot 静默重挂（lastActive；legacy 条目领养预建实例=零换店，folder 只 query 不 request 权限——
//   boot 永不弹窗，verdicts §1.7）。
// 权限掉 = 离线态不算 logoff：attach 照挂（缓存照看照画、dirty 攒着），online 旗子给 UI 画 chip/横幅（Slice D）。

import type { GalleryEntry, DirHandleLike } from "./gallery-registry.ts";
import { galleryRegistry } from "./gallery-registry.ts";
import { galleryAttachment } from "./gallery-attachment-host.ts";
import { storeAbsent, _swapStoreForGallery, signIn, getActiveAccount, isSignedIn } from "./app-store.ts";
import { reportError } from "./error-badge.ts";

// ---- FSA 权限（folder 库）----
type _PermHandle = { queryPermission?: (o: { mode: string }) => Promise<string>; requestPermission?: (o: { mode: string }) => Promise<string> };
/** 权限确保：granted → true；prompt 且 opts.request（手势上下文）→ requestPermission；否则 false（离线态）。 */
export async function ensureFolderPermission(entry: GalleryEntry, opts: { request: boolean }): Promise<boolean> {
  const h = entry.handle as unknown as _PermHandle | undefined;
  try {
    if (!h?.queryPermission) return true;                     // 无权限 API 的平台/假件 = 视为可用
    if ((await h.queryPermission({ mode: "readwrite" })) === "granted") return true;
    if (opts.request && h.requestPermission) return (await h.requestPermission({ mode: "readwrite" })) === "granted";
    return false;
  } catch { return false; }
}

// ---- 动词 ----
const _picker = () => (globalThis as { showDirectoryPicker?: (o?: unknown) => Promise<unknown> }).showDirectoryPicker;
export const canPickFolderGallery = (): boolean => !storeAbsent && typeof _picker() === "function";

/** 铸/复用 = 与挂载分离（UI 在两步之间问「继承 or 出厂」并走绿灯门）。created = 这次真铸了新条目。 */
export interface MintResult { entry: GalleryEntry; created: boolean }
const _withCreated = async (mint: () => Promise<GalleryEntry>): Promise<MintResult> => {
  const before = new Set((await galleryRegistry.list()).map((e) => e.id));
  const entry = await mint();
  return { entry, created: !before.has(entry.id) };
};

/** 本地文件夹 picker（手势）：选哪就是哪（VS Code 姿态）；同夹二挂 isSameEntry 复用 id。用户取消 = null。 */
export async function mintFolderByPicker(): Promise<MintResult | null> {
  const picker = _picker();
  if (!picker) throw new Error("FSA directory picker unavailable on this platform");
  let handle: unknown;
  try { handle = await picker({ mode: "readwrite" }); } catch { return null; }   // AbortError = 用户取消，不是错误
  return _withCreated(() => galleryRegistry.mintFolder(handle as DirHandleLike));
}

/** OneDrive（手势）：signIn 走 account picker——选哪个账号铸哪个账号的库（多账号=多条目，结构支持）。 */
export async function mintOneDriveByAccount(): Promise<MintResult | null> {
  await signIn();
  const acct = getActiveAccount() as { homeAccountId?: string; username?: string; name?: string } | null;
  if (!acct?.homeAccountId) return null;
  return _withCreated(() => galleryRegistry.mintOneDrive(acct.homeAccountId as string, acct.username || acct.name || ""));
}

/** 挂载既有条目（手势上下文；调用方保证已过绿灯门 detach）。folder 缺权限当场 request 一次。 */
export async function attachGallery(entry: GalleryEntry): Promise<void> {
  const online = entry.kind === "folder" ? await ensureFolderPermission(entry, { request: true }) : isSignedIn();
  await galleryAttachment.attach(entry, { online });
}

/** boot 静默重挂（app.ts prefsReady 链头，fixup/restore 之前）。店懒出生（2026-08-27）后只剩一问：
 *  registry lastActive 有条目吗？有 → 普通 attach（建店+换入；gesture:false 不 requestPersist、folder 权限
 *  只 query 不弹）；无/读不出 → 什么都不做（eval 起点就是 kind:"none"，无预建实例可拆）——
 *  「无账号无文件不应该有 gallery」（user 2026-08-27）由出生姿势直接保证，不再靠 boot 拆迁。
 *  attach 失败 → 响亮上报 + 回落无库（绝不让 app 骑在半挂的店上）。 */
export async function bootAttachFromRegistry(): Promise<void> {
  if (storeAbsent) return;
  let e: GalleryEntry | null = null;
  try { e = await galleryRegistry.lastActive(); } catch (err) {
    reportError(new Error("[gallery-connect] registry read failed at boot — staying in no-gallery mode: " + String(err)), "error");
  }
  if (!e) return;
  try {
    const online = e.kind === "folder" ? await ensureFolderPermission(e, { request: false }) : isSignedIn();
    await galleryAttachment.attach(e, { online, gesture: false });
  } catch (err) {
    reportError(new Error("[gallery-connect] boot attach failed — falling back to no-gallery mode: " + String(err)), "error");
    try { await _swapStoreForGallery(null); } catch { /* 已在 null 态 */ }
  }
}

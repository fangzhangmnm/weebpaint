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
import { deviceKvGet, deviceKvSet } from "./device-kv.ts";
import { pickerAllowedInFrame } from "./local-file-session.ts";
import { reportError } from "./error-badge.ts";
import { createFlowLock } from "./flow-lock.ts";

/** attach/detach 流程单飞道（案卷 20260830 §BUG D）：boot 领养 / redirect 续办 / 切库 / 卸库全走这条，
 *  流程间不再交错（gallery-manage-ui 的 switchFlow/detachFlow 同用）。⚠ 不可重入：锁内别 await 走锁的流程。 */
export const galleryFlow = createFlowLock();

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
export const canPickFolderGallery = (): boolean => !storeAbsent && pickerAllowedInFrame() && typeof _picker() === "function";   // 跨源 iframe 禁 picker（itch 内嵌实锤 0828）

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

/** OneDrive（手势）。**redirect 事实**（2026-08-28 iPad 实锤「点两次」破案）：signIn = loginRedirect =
 *  整页跳走，本函数后半段死在跳转点——回来后 seed 只写 registry、没人 attach，第二次点才靠
 *  「再跳一次 → boot 领养」侥幸出库。修法两半：
 *  ① 已登录 → **不再 signIn**，直接用 active 账号同步续 mint（零跳转，connect 一次到位）；
 *  ② 未登录 → redirect 前落「待续连接」标记（device-kv + 时间戳），回程 auth-changed 由
 *    resumePendingOneDriveConnect 续办 mint+attach（gallery-manage-ui 接线）。 */
export async function mintOneDriveByAccount(): Promise<MintResult | null> {
  if (!isSignedIn()) {
    markPendingOneDriveConnect();
    await signIn();                       // loginRedirect：正常情况下页面已离开，下面代码不会跑到
  }
  const acct = getActiveAccount() as { homeAccountId?: string; username?: string; name?: string } | null;
  if (!acct?.homeAccountId) return null;
  clearPendingOneDriveConnect();          // 已拿到账号（silent/罕见非跳转路径）：标记用不上了
  return _withCreated(() => galleryRegistry.mintOneDrive(acct.homeAccountId as string, acct.username || acct.name || ""));
}

/** 换一个账号连接（0.9.0 口子，user 0828「加口子」）：强制微软账号选择页。必在点击同步栈调
 *  （signIn=loginRedirect 页面即离开）；回程由 resumePendingOneDriveConnect 用新 active 账号续办
 *  mint+attach——多账号「铸第二账号」的唯一入口（P3 §1.10）。 */
export async function mintOneDriveSwitchAccount(): Promise<MintResult | null> {
  markPendingOneDriveConnect();
  await signIn({ prompt: "select_account" });   // redirect：正常情况下页面已离开
  return null;                                  // 罕见非跳转路径：本次不续（标记在，下次 auth-changed 兜）
}

// ── 待续连接标记（P3 iOS redirect 续办；形制=device-kv 标量 + TTL，不是 crash-store 的字节记录）──
const PENDING_CONNECT_KEY = "pending-onedrive-connect-at";
const PENDING_CONNECT_TTL_MS = 10 * 60_000;   // 用户在微软页取消/走神：过期作废，绝不隔天幽灵自动连库
export function markPendingOneDriveConnect(): void { deviceKvSet(PENDING_CONNECT_KEY, String(Date.now())); }
export function clearPendingOneDriveConnect(): void { deviceKvSet(PENDING_CONNECT_KEY, null); }
/** 读并判新鲜；不清除（清除归续办成功/作废方调 clear——读写分离防半路丢标记）。 */
export function hasFreshPendingOneDriveConnect(): boolean {
  const raw = deviceKvGet(PENDING_CONNECT_KEY);
  const at = raw ? Number(raw) : NaN;
  return Number.isFinite(at) && Date.now() - at < PENDING_CONNECT_TTL_MS;
}

/** 挂载既有条目（手势上下文；调用方保证已过绿灯门 detach）。folder 缺权限当场 request 一次。 */
export async function attachGallery(entry: GalleryEntry): Promise<void> {
  const online = entry.kind === "folder" ? await ensureFolderPermission(entry, { request: true }) : isSignedIn();
  await galleryAttachment.attach(entry, { online });
  // online 旗收口（案卷 20260830 §BUG A）：attach 期间 auth 可能翻转，翻在 detached 上的 setOnline 会被丢；
  //   落地后按当下登录态重读一次 → 旗的最终值=最后完成的一方所见，lost-update 定义性关闭。folder=权限语义不动。
  if (entry.kind === "onedrive") galleryAttachment.setOnline(isSignedIn());
}

/** boot 静默重挂（app.ts prefsReady 链头，fixup/restore 之前）。店懒出生（2026-08-27）后只剩一问：
 *  registry lastActive 有条目吗？有 → 普通 attach（建店+换入；gesture:false 不 requestPersist、folder 权限
 *  只 query 不弹）；无/读不出 → 什么都不做（eval 起点就是 kind:"none"，无预建实例可拆）——
 *  「无账号无文件不应该有 gallery」（user 2026-08-27）由出生姿势直接保证，不再靠 boot 拆迁。
 *  attach 失败 → 响亮上报 + 回落无库（绝不让 app 骑在半挂的店上）。 */
export async function bootAttachFromRegistry(): Promise<void> {
  if (storeAbsent) return;
  await galleryFlow(async () => {
    // 单飞道内再查一次：redirect 续办等别的流程已把库挂好 → boot 领养目的已达，直接退
    //   （0.11.37 只考虑了「boot 赢」的半边；输家继续 attach 会 throw 进 catch、兜底误拆赢家的店——案卷 §BUG D）。
    if (galleryAttachment.state().kind === "attached") return;
    let e: GalleryEntry | null = null;
    try { e = await galleryRegistry.lastActive(); } catch (err) {
      reportError(new Error("[gallery-connect] registry read failed at boot — staying in no-gallery mode: " + String(err)), "error");
    }
    if (!e) return;
    try {
      const online = e.kind === "folder" ? await ensureFolderPermission(e, { request: false }) : isSignedIn();
      await galleryAttachment.attach(e, { online, gesture: false });
      // online 旗收口（案卷 §BUG A）：boot attach 与 initAuth 赛跑，attach 期间 auth-changed 的翻牌
      //   打在 detached 上会被丢——落地后按当下登录态重读，旗死锁根除。
      if (e.kind === "onedrive") galleryAttachment.setOnline(isSignedIn());
    } catch (err) {
      reportError(new Error("[gallery-connect] boot attach failed — falling back to no-gallery mode: " + String(err)), "error");
      // 兜底只救「自己半挂」：别的流程已把店挂好（attached）时绝不 swap(null) 拔活店（案卷 §BUG D）。
      if (galleryAttachment.state().kind !== "attached") {
        try { await _swapStoreForGallery(null); } catch { /* 已在 null 态 */ }
      }
    }
  });
}

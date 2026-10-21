// factory-reset.ts —— P7 还原出厂设置（0825 案卷 §2.10；store 0.7.0 maintenance 口子收货）。
// created 2026-08-28 by Claude Fable 5.
//
// 范围 = 本机全部足迹：store 命名空间（`weebpaint.*` 全实例——库内 typed-consent 口子，红线口径 =
//   报告只含命名空间级库名+键计数、永不透文件名）+ app 自家足迹（裸 "weebpaint" 库 = 缩略图/
//   checkpoint ring、GUID 前缀库 = gallery-registry/crash、device-kv localStorage 键）。
// **云端与磁盘文件永不碰**（还原出厂 ≠ 删作品——正本在云/盘上；这是「公用电脑离开前清痕」+调试双用）。
// 2026-10-21 起连自己的离线壳一起清（shell-reset.ts）；「强制更新」仍是另一颗只清缓存的钮，两钮不合并。
// 护栏（家族根 CLAUDE.md 2½，user 2026-10-21「全家swipe的语义统一，然后full swipe应该有二次确定护栏，而且是开发者菜单里面」；
//   统筹稿问题 7 答「只提示一次、可取消、不硬拦」）= 两步：① 说明 sheet——有 N 份没传上去会一起删、不造逃生副本（没有就说没有）、
//   当前画未保存的改动也会丢，可取消；② 逐字确认（库内比对）。**没有硬门**：以前「先关画 / 先去图库页卸库」那两道改成 ① 里的一句话。
//   挂着库时先 forceDetach 关掉 IDB 连接（不关 deleteDatabase 会被堵），不 drain、不造逃生副本——① 已经说清了。
import { wipeAppNamespace, scanAppNamespace, galleryBackend, requireStore } from "./app-store.ts";   // maintenance 面经接缝（B 分层 lint 守）
import { galleryAttachment } from "./gallery-attachment-host.ts";
import { docHome } from "./doc-home.ts";
import { session } from "./session-state.ts";
import { openConfirmSheet, openInputSheet } from "./sheets.ts";
import { clearOwnShell } from "./shell-reset.ts";   // 2026-10-21：变成新的 = 数据 + 自己的离线壳一起清（统筹转述 user「点了之后变成新的」）
import { t } from "./i18n/index.ts";
import { reportError } from "./error-badge.ts";

const APP_ID = "weebpaint";
const BARE_APP_DB = "weebpaint";                              // storage.ts：缩略图缓存 + checkpoint ring
const GUID_DB_PREFIX = "weebpaint-bd6cece69075d759.";         // crash / gallery-registry（verdicts §2.9 命名空间）
const GUID_LS_PREFIX = "weebpaint-bd6cece69075d759:";         // device-kv（P5 器官）
const BLOCKED_TIMEOUT_MS = 2000;

const _isOurDb = (name: string) => name === BARE_APP_DB || name.startsWith(GUID_DB_PREFIX);

function _deleteDbOrBlocked(name: string): Promise<"deleted" | "blocked"> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: "deleted" | "blocked") => { if (!settled) { settled = true; resolve(r); } };
    const timer = setTimeout(() => done("blocked"), BLOCKED_TIMEOUT_MS);
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => { clearTimeout(timer); done("deleted"); };
    req.onerror = () => { clearTimeout(timer); done("blocked"); };
  });
}

async function _listOurDbs(): Promise<string[]> {
  try {
    if (typeof indexedDB.databases !== "function") return [];   // 老平台枚举不了——诚实缺口，扫描报 0 但不谎报「验证归零」
    return (await indexedDB.databases()).map((d) => d.name ?? "").filter(_isOurDb);
  } catch { return []; }
}
function _listOurLsKeys(): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(GUID_LS_PREFIX)) out.push(k);
    }
  } catch { /* file:// Safari 等：localStorage 访问器可抛 → 无键可清 */ }
  return out;
}

/** app 自家足迹深清（store 命名空间由库口子负责）。 */
async function _wipeAppFootprint(): Promise<{ deleted: string[]; blocked: string[]; lsRemoved: number }> {
  const report = { deleted: [] as string[], blocked: [] as string[], lsRemoved: 0 };
  for (const name of await _listOurDbs()) {
    (await _deleteDbOrBlocked(name) === "deleted" ? report.deleted : report.blocked).push(name);
  }
  const keys = _listOurLsKeys();
  try { for (const k of keys) localStorage.removeItem(k); report.lsRemoved = keys.length; } catch { /* 同上 */ }
  return report;
}

/** 还原出厂主流程（topbar-menu 的 menuFactoryReset 调）。全程 in-app sheet（无系统对话框红线）。 */
export async function runFactoryReset(setStatus: (msg: string, persist?: boolean) => void): Promise<void> {
  // ① 说明 sheet（不硬拦：有什么会丢就说什么，人看完能取消）。wipe + reload 会连 T-crash 快照一起清，没传上去的 / 没保存的都是真丢。
  const attached = galleryBackend().kind !== "none";
  let dirtyN = 0;
  if (attached) { try { dirtyN = await requireStore().files.dirty.count(); } catch (e) { reportError(new Error("[factory-reset] dirty.count failed: " + String(e)), "log"); } }
  const openUnsaved = docHome() != null && session.dirty;
  const intro = [t("fr.introMsg"), dirtyN > 0 ? t("fr.introDirty", { n: String(dirtyN) }) : t("fr.introNoDirty")];
  if (openUnsaved) intro.push(t("fr.introOpenUnsaved"));
  if (!(await openConfirmSheet(t("fr.introTitle"), intro.join("\n")))) return;
  // 打字 consent（0825 拍板：typing check 在库内做；这里收集，库比对不过=拒绝执行）
  const phrase = t("fr.consentPhrase");
  const typed = await openInputSheet(t("fr.introTitle"), "", { placeholder: phrase, message: t("fr.consentPrompt", { phrase }) });
  if (typed == null) return;
  try {
    // 挂着库 → 先关连接（attachment 器官的显式逃生：swap(null) + dispose，不 drain）。reload 在几秒内，期间别的消费点撞 StoreDisposedError 是契约不是事故。
    if (attached) await galleryAttachment.forceDetach();
    const storeReport = await wipeAppNamespace({ appId: APP_ID, consent: { expected: phrase, typed } });
    const appReport = await _wipeAppFootprint();
    // 无痕扫（验证归零；报告永不含文件名——库口子红线口径，app 侧同口径）
    const storeScan = await scanAppNamespace(APP_ID);
    const appResidue = (await _listOurDbs()).length + _listOurLsKeys().length;
    const blocked = storeReport.blockedDatabases.length + appReport.blocked.length;
    const residue = storeScan.databases.length + storeScan.localStorageKeys + appResidue;
    if (blocked > 0) {
      await openConfirmSheet(t("fr.introTitle"), t("fr.blocked", { n: String(blocked) }));
      return;   // 不 reload：让用户关掉其他标签页后重跑（wipe 幂等）
    }
    const db = storeReport.deletedDatabases.length + appReport.deleted.length;
    const ls = storeReport.localStorageKeysRemoved + appReport.lsRemoved;
    await openConfirmSheet(t("fr.introTitle"),
      residue === 0 ? t("fr.doneClean", { db: String(db), ls: String(ls) }) : t("fr.residue", { db: String(storeScan.databases.length + appResidue), ls: String(storeScan.localStorageKeys) }));
    // 「变成新的」连离线壳一起：只注销自己的 SW、只删 weebpaint- 前缀缓存（和「强制更新」同一个器官；两个钮不合并——强制更新只清缓存不动数据）。
    //   壳清失败不挡 reload：数据已归零，reload 后 SW 会按新壳重装。
    try { await clearOwnShell(); } catch (e) { reportError(e instanceof Error ? e : new Error(String(e)), "log"); }
    location.reload();   // 出厂态重启（内存里残余的单例/缓存全部清零的唯一诚实方式）
  } catch (e) {
    if ((e as { name?: string })?.name === "WipeConsentError") { setStatus(t("fr.mismatch"), true); return; }
    reportError(e instanceof Error ? e : new Error(String(e)), "error");
  }
}

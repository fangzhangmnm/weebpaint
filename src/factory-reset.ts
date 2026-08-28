// factory-reset.ts —— P7 还原出厂设置（0825 案卷 §2.10；store 0.7.0 maintenance 口子收货）。
// created 2026-08-28 by Claude Fable 5.
//
// 范围 = 本机全部足迹：store 命名空间（`weebpaint.*` 全实例——库内 typed-consent 口子，红线口径 =
//   报告只含命名空间级库名+键计数、永不透文件名）+ app 自家足迹（裸 "weebpaint" 库 = 缩略图/
//   checkpoint ring、GUID 前缀库 = gallery-registry/crash、device-kv localStorage 键）。
// **云端与磁盘文件永不碰**（还原出厂 ≠ 删作品——正本在云/盘上；这是「公用电脑离开前清痕」+调试双用）。
// SW 预缓存不在此（menuForcePwaReset 另有门）。
// 前置（结构性，不造逃生复本）：无开画（docHome=null）+ 无挂库（kind:none）——卸库走图库页正门
//   （那里有绿灯门 + dirty 逃生 sheet），本器官不重复造第二套。
import { wipeAppNamespace, scanAppNamespace, galleryBackend } from "./app-store.ts";   // maintenance 面经接缝（B 分层 lint 守）
import { docHome } from "./doc-home.ts";
import { session } from "./session-state.ts";
import { openConfirmSheet, openInputSheet } from "./sheets.ts";
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
  // 结构前置：gallery 家开画/挂库走各自正门收口（那里有真护栏），本器官不开旁门。
  //   ⚠ canvas-first 下无库恒有 transient 在场（boot 即画布）——transient/file 家走既有三键挽留门
  //   （保存/丢弃/取消；wipe+reload 会连 T-crash 快照一起清，未收口就等于焚画）。
  const home = docHome();
  if (home?.kind === "gallery") { setStatus(t("fr.needClose"), true); return; }
  if (galleryBackend().kind !== "none") { setStatus(t("fr.needDetach"), true); return; }
  if (home != null && !(await session.leaveLocalDoc())) return;   // 取消 = 整个还原中止
  if (!(await openConfirmSheet(t("fr.introTitle"), t("fr.introMsg")))) return;
  // 打字 consent（0825 拍板：typing check 在库内做；这里收集，库比对不过=拒绝执行）
  const phrase = t("fr.consentPhrase");
  const typed = await openInputSheet(t("fr.introTitle"), "", { placeholder: phrase, message: t("fr.consentPrompt", { phrase }) });
  if (typed == null) return;
  try {
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
    location.reload();   // 出厂态重启（内存里残余的单例/缓存全部清零的唯一诚实方式）
  } catch (e) {
    if ((e as { name?: string })?.name === "WipeConsentError") { setStatus(t("fr.mismatch"), true); return; }
    reportError(e instanceof Error ? e : new Error(String(e)), "error");
  }
}

// crash-banner.ts —— T-crash boot 恢复横幅（P2；verdicts §2.2「boot 非模态横幅叠画布，不是 start screen」）。
// created 2026-08-26 by Claude Fable 5.
//
// 职责（单一）：boot 扫 crash 库 → 有 crash 态记录 → 顶部非模态浮卡（画布照常可用）；
//   [恢复] = 领养字节 → 导入为**新身份**（uniqueNameFor 消歧；恢复出的 doc 视为 dirty 直到首次
//   真保存——adoptAsNew 的 es 记脏语义天然满足，Blockbench #2684/#2003 两坑）；
//   [丢弃] = 显式 discard（用户明确决定）；[×] = 本次不管（记录留着，下次 boot 再问）。
// 领养流产安全：adopt 是事务化取删——gates 被取消/恢复失败必须把记录 put 回去，绝不让「点了恢复
//   但中途取消」变成静默丢画。pending-adoption 态不归本横幅（P3 领养流程）。
// 附加层纪律：全路径 catch——本层坏死不许影响 boot。

import { unlockImportedContainer } from "./enc-thumbs.ts";
import { appEncryption } from "./encryption.ts";
import { crashStore, type CrashRecordMeta } from "./crash-store.ts";
import { session } from "./session-state.ts";
import { decodeOraToPainting } from "./backend/ora.ts";
import { uniqueNameFor, setGalleryOpen } from "./gallery/gallery-shell.ts";
import { withBusy } from "./fullscreen-busy.ts";
import { stripSessionExt } from "./config.ts";
import { reportError } from "./error-badge.ts";
import { showNotice, closeNotice } from "./ui/notice.ts";   // 2026-09-02 C7 通知栈
import { t } from "./i18n/index.ts";
import { hasGallery } from "./gallery-capability.ts";
import type { AppContext } from "./app-context.ts";

const errMsg = (e: unknown): string => String((e as { message?: unknown })?.message || e);
let setStatus: AppContext["setStatus"];

// （inline BAR_CSS/BTN_CSS 2026-09-02 C7 退役：呈现归 ui/notice 通知栈）

function _dismiss() { closeNotice("crash-recover"); }

function _show(m: CrashRecordMeta, onDone: () => void) {
  // 非模态浮卡（P2 2026-08-26 拍板）：通知栈 warning 档，带两个动作；✕ = 本次不管（记录留着，下次 boot 再问）
  showNotice({
    id: "crash-recover", level: "warning", tapToDismiss: false,
    text: t("cb.crashFound", { name: m.name }),
    actions: [
      { label: t("cb.recover"), primary: true, onClick: () => { void _recover(m).finally(onDone); } },
      { label: t("cb.discard"), onClick: () => { void crashStore.discard(m.tag).catch(() => {}).then(() => { setStatus(t("cb.discarded")); onDone(); }); } },
    ],
    dismissLabel: t("common.close.aria"),
  });
}

async function _recover(m: CrashRecordMeta): Promise<void> {
  const bytes = await crashStore.adopt(m.tag);
  if (!bytes) { setStatus(t("cb.alreadyAdopted"), true); return; }
  // 领养流产 → 放回（同 tag 同 meta；快照本就单帧，put 回去无副作用）。
  const putBack = () => crashStore.put(m.tag, bytes, { state: m.state, name: m.name, at: m.at, homeKind: m.homeKind }).catch(() => {});
  try {
    if (!(await session.gateFillOnSwitch())) { void putBack(); return; }   // fill 预览挂着 → 三选；取消=不恢复
    if (!(await session.leaveLocalDoc())) { void putBack(); return; }     // file/transient 家且脏 → 三键挽留；取消=不恢复
    if (session.dirty) await session.save();                               // 当前画先落盘（openItem 同款）
    // 加密 file 家的快照=容器（0828 扩域：明文永不落 IDB）→ 恢复先解锁（busy 外交互；取消=放回）。
    let recBytes = bytes;
    if (await appEncryption.isEncryptedBlob(bytes)) {
      const got = await unlockImportedContainer(bytes);
      if (!got) { void putBack(); setStatus(t("mi.importCancelledNeedPw"), true); return; }
      recBytes = got.plain;
    }
    const base = stripSessionExt(m.name) || t("nd.untitled");
    if (!hasGallery()) {
      // 云关（Editor Only 姿态）：图库不可见——恢复为 transient（立即标脏 + 重挂 T-crash），
      //   用户经保存按钮 settle 成文件。落进看不见的图库 = 数据蟑螂旅馆，不做。
      const loaded = await withBusy(t("cb.recoveringBusy", { name: base }), () => decodeOraToPainting(recBytes));
      session.adoptAsTransient(loaded, base);
      setStatus(t("cb.recoveredTransient", { name: base }), true);
      return;
    }
    const name = await uniqueNameFor(`${base}${t("cb.recoveredSuffix")}`);
    const loaded = await withBusy(t("cb.recoveringBusy", { name }), () => decodeOraToPainting(recBytes));
    session.adoptAsNew(loaded, name);   // 新身份 + es 记脏：恢复出的 doc 视为 dirty 直到首次真保存
    await setGalleryOpen(false);
    setStatus(t("cb.recovered", { name }), true);
  } catch (e) {
    void putBack();
    reportError(new Error("[t-crash] recover failed: " + String(e)), "warning");
    setStatus(t("cb.recoverFailed", { err: errMsg(e) }), true);
  }
}

/** boot 接线（app.ts 调，gallery-shell init 之后）：扫库 → 逐条问（新→旧，一次一条）。 */
export function initCrashBanner(ctx: AppContext): void {
  setStatus = ctx.setStatus;
  void (async () => {
    try {
      let queue = (await crashStore.listAtBoot()).filter((m) => m.state === "crash");
      const next = () => { const m = queue.shift(); if (m) _show(m, next); };
      next();
    } catch (e) { reportError(new Error("[t-crash] boot scan failed (best-effort): " + String(e)), "log"); }
  })();
}

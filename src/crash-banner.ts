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

import { crashStore, type CrashRecordMeta } from "./crash-store.ts";
import { session } from "./session-state.ts";
import { decodeOraToPainting } from "./backend/ora.ts";
import { uniqueNameFor, setGalleryOpen } from "./gallery/gallery-shell.ts";
import { withBusy } from "./fullscreen-busy.ts";
import { stripSessionExt } from "./config.ts";
import { reportError } from "./error-badge.ts";
import { t } from "./i18n/index.ts";
import type { AppContext } from "./app-context.ts";

const errMsg = (e: unknown): string => String((e as { message?: unknown })?.message || e);
let setStatus: AppContext["setStatus"];

const BAR_CSS =
  "position:fixed;left:50%;transform:translateX(-50%);top:max(env(safe-area-inset-top,0px), 52px);" +
  "z-index:9000;max-width:min(640px,calc(100% - 24px));box-sizing:border-box;padding:10px 14px;" +
  "border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.35);background:#34495e;color:#fff;" +
  "font:13px/1.5 system-ui;display:flex;gap:10px;align-items:center;flex-wrap:wrap";
const BTN_CSS = "font:inherit;border:1px solid rgba(255,255,255,.4);background:transparent;color:#fff;border-radius:7px;padding:4px 12px;cursor:pointer";

let _bar: HTMLElement | null = null;
function _dismiss() { _bar?.remove(); _bar = null; }

function _show(m: CrashRecordMeta, onDone: () => void) {
  _dismiss();
  const bar = document.createElement("div");
  bar.style.cssText = BAR_CSS;
  const txt = document.createElement("span");
  txt.textContent = t("cb.crashFound", { name: m.name });
  const mk = (label: string, primary: boolean, fn: () => void) => {
    const b = document.createElement("button");
    b.style.cssText = BTN_CSS + (primary ? ";background:rgba(255,255,255,.18);font-weight:600" : "");
    b.textContent = label;
    b.addEventListener("click", () => { _dismiss(); fn(); });
    return b;
  };
  bar.append(txt,
    mk(t("cb.recover"), true, () => { void _recover(m).finally(onDone); }),
    mk(t("cb.discard"), false, () => { void crashStore.discard(m.tag).catch(() => {}).then(() => { setStatus(t("cb.discarded")); onDone(); }); }),
    mk("✕", false, () => { /* 本次不管：记录留着，下次 boot 再问 */ }));
  document.body.appendChild(bar);
  _bar = bar;
}

async function _recover(m: CrashRecordMeta): Promise<void> {
  const bytes = await crashStore.adopt(m.tag);
  if (!bytes) { setStatus(t("cb.alreadyAdopted"), true); return; }
  // 领养流产 → 放回（同 tag 同 meta；快照本就单帧，put 回去无副作用）。
  const putBack = () => crashStore.put(m.tag, bytes, { state: m.state, name: m.name, at: m.at, homeKind: m.homeKind }).catch(() => {});
  try {
    if (!(await session.gateFillOnSwitch())) { void putBack(); return; }   // fill 预览挂着 → 三选；取消=不恢复
    if (!(await session.leaveLocalFile())) { void putBack(); return; }     // file 家且脏 → 先问；取消=不恢复
    if (session.dirty) await session.save();                               // 当前画先落盘（openItem 同款）
    const base = stripSessionExt(m.name) || t("nd.untitled");
    const name = await uniqueNameFor(`${base}${t("cb.recoveredSuffix")}`);
    const loaded = await withBusy(t("cb.recoveringBusy", { name }), () => decodeOraToPainting(bytes));
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

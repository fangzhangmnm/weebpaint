// StoreUI adapter —— WeebPaint 给 sync-store 的 ui bundle（createStore 必填 busy/resolveConflict/reportError + 可选 offlineEscape）。
//   cutover：freshness 逻辑进引擎（freshness.ts）后，旧 cloud-freshness.ts 幸存的那点 UI——
//   ① 冲突二选一 sheet（ADR-0009 冲突必 surface）② 「跳过到离线」逃生闸（iOS 老 token fetchMeta 挂死的唯一逃生）
//   ③ 错误 surface——塌进这一个模块。app 只在 app-store 装配时把它传进 createStore。
import type { StoreUI, StoreTextKey, StoreTextParams } from "@internal/store";
import { withBusy } from "./fullscreen-busy.ts";
import { showNotice, type NoticeHandle } from "./ui/notice.ts";
import { lockSyncGate, settleSyncGate } from "./sheets.ts";
import { t, type Key } from "./i18n/index.ts";
import { stripSessionExt } from "./config.ts";
import { reportError } from "./error-badge.ts";

// StoreTextKey（库 0.3.0 的 14 个 busy 文案 key）→ 本仓 i18n SSoT 键。穷举 Record：库加 key 本表漏映 = 编译错。
//   zh 文案 = 库内 0.3.0 之前的中文原文逐字（strings.ts st.* 节）；params（{name}）由 t() 插值，原样转交。
const STORE_TEXT_KEYS: Record<StoreTextKey, Key> = {
  "sync.pushing": "st.syncPushing",
  "file.renaming": "st.fileRenaming",
  "file.pulling": "st.filePulling",
  "cloud.checking": "st.cloudChecking",
  "file.deleting": "st.fileDeleting",
  "trash.restoring": "st.trashRestoring",
  "trash.purging": "st.trashPurging",
  "trash.emptyTrash": "st.trashEmptyTrash",
  "trash.emptyBackups": "st.trashEmptyBackups",
  "file.encrypting": "st.fileEncrypting",
  "file.decrypting": "st.fileDecrypting",
  "file.reuploading": "st.fileReuploading",
  "folder.creating": "st.folderCreating",
  "folder.deleting": "st.folderDeleting",
};

// busy 按 key 路由（store 0.11.4 第三参数；审计 L1 家族级，同 WebXiaoHeiWu QUIET_KEYS；edited by Claude Fable 5.1 2026-09-04）：
//   · sync.pushing（保存的自动/显式推云）与 file.renaming（tryMove）是后台节律——**不上全屏遮罩**（遮罩吃输入，推云那几秒
//     不能画 = 不可接受）。但「有事在飞」仍必须可见：走 2026-09-02 UI 纪元的 notice 栈（非模态、不抢输入、同 id 原地更新、
//     完成即收——不像状态行那样没有「收回」语义、会把「正在同步…」永久留在那）。显式保存时顶栏徽章的 saving 态
//     （save-status.ts ICON_CLOUD_SAVING，判据 session.saving）照旧并行呈现。
//   · 其余 key（加解密 / 回收站 / 建删夹 / 拉取）= 用户动作，遮罩合理，仍走 withBusy（可重入 ref-count）。
//   · 老宿主忽略第三参数照常；这里 key 缺席（库更老/未知路径）= 保守走遮罩。
const QUIET_KEYS = new Set<StoreTextKey>(["sync.pushing", "file.renaming"]);
let _quietDepth = 0;
let _quietNotice: NoticeHandle | null = null;
async function quietBusy<T>(label: string, fn: () => Promise<T>): Promise<T> {
  _quietDepth++;
  if (_quietNotice?.isOpen()) _quietNotice.setText(label);   // 并发/嵌套的后台操作共用一条，显最新文案
  else _quietNotice = showNotice({ id: "store-quiet-busy", level: "info", text: label, dismissible: false, tapToDismiss: false });
  try { return await fn(); }
  finally {
    _quietDepth--;
    if (_quietDepth <= 0) { _quietDepth = 0; _quietNotice?.close(); _quietNotice = null; }
  }
}

export const storeUI: StoreUI = {
  // 用户态写流：按 key 路由——后台节律走 notice（不遮罩），用户动作走全屏遮罩（可重入 ref-count）。
  busy: (label, fn, key) => (key && QUIET_KEYS.has(key) ? quietBusy(label, fn) : withBusy(label, fn)),

  // busy 文案翻译注入（库 0.3.0 出库的 14 处硬编码中文 → 宿主 i18n SSoT）。未知 key（库新加、
  //   本表还没跟上——理论上被上面的穷举 Record 编译期挡死）返回 undefined = 落回库内英文缺省。
  text: (key: StoreTextKey, params?: StoreTextParams): string | undefined => {
    const k = STORE_TEXT_KEYS[key];
    return k ? t(k, params) : undefined;
  },

  // 冲突必 surface（ADR-0009）：绝不静默 cancel——引擎强制真 sheet。
  //   注：引擎 ResolveChoice = keepMine|takeCloud|cancel（旧的「keep both/branch」不在此模型，见收敛报告）。
  //   2026-08-21 grill 拍板：按 occasion 分两套按钮/正文（标题统一「云端有新版本」+ 留底安心小字）——
  //   push（保存 412/撞名）三键：本地覆盖云端(=keepMine 立即强推) / 云端覆盖本地 / 取消；
  //   open（打开时）两键：打开本地(=cancel，暂不解决保存时再裁) / 云端覆盖本地。按钮写实，语义不再漂移。
  resolveConflict: async ({ name, occasion }): Promise<"keepMine" | "takeCloud" | "cancel"> => {
    const n = stripSessionExt(name);
    const choice = occasion === "open"
      ? await lockSyncGate<"cancel" | "takeCloud">({
          title: t("cf.cloudNewerTitle"),
          message: t("cf.body.open", { name: n }),
          note: t("cf.note.keptSafe"),
          showSpinner: false,
          actions: [
            { label: t("cf.act.openLocal"), value: "cancel", primary: true },
            { label: t("cf.act.cloudWins"), value: "takeCloud" },
          ],
        })
      : await lockSyncGate<"keepMine" | "takeCloud" | "cancel">({
          title: t("cf.cloudNewerTitle"),
          message: t("cf.body.push", { name: n }),
          note: t("cf.note.keptSafe"),
          showSpinner: false,
          actions: [
            { label: t("cf.act.localWins"), value: "keepMine", primary: true },
            { label: t("cf.act.cloudWins"), value: "takeCloud" },
            { label: t("common.cancel"), value: "cancel" },
          ],
        });
    return choice ?? "cancel";
  },

  // 错误必 surface（ADR-0009 绝不吞 console）。接统一 error-badge：error/warning→顶层 banner、info→状态栏、log→仅 console。
  //   CloudNetworkError（库 2026-08-25 起：provider fetch 网络层 throw 的类型化封装，Safari 原文是裸
  //   `TypeError: Load failed`）→ 用户可见换 i18n 人话（级别不降：保存失败必须显眼），原始错误进 console 供诊断。
  reportError: (err: unknown, level): void => {
    if ((err as { name?: string } | null)?.name === "CloudNetworkError") {
      reportError(err, "log");                                    // 诊断轨：原错（含 Graph 路径/cause）只进 console
      reportError(new Error(t("err.cloudNetwork")), level ?? "error");   // 用户轨：人话 banner，级别照旧
      return;
    }
    reportError(err, level ?? "error");
  },

  // 「跳过到离线」逃生闸（对齐旧 cloud-freshness）：引擎 freshness.open 拿 {probe, settle}，probe 与 fetchMeta race，
  //   finally 调 settle。用户点「跳过到离线」→ probe resolve → 读本地（无硬超时，用户即超时）。
  offlineEscape: (): { probe: Promise<unknown>; settle: () => void } => {
    let onSkip!: () => void;
    const probe = new Promise<unknown>((res) => { onSkip = () => res(undefined); });
    void lockSyncGate<"skip" | null>({
      title: t("cf.checkingCloud"), message: "", showSpinner: true,
      actions: [{ label: t("cf.skipToOffline"), value: "skip" }],
    }).then((v) => { if (v === "skip") onSkip(); });
    return { probe, settle: (): void => settleSyncGate(null) };
  },
};

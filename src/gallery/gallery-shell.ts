// 职责（单一）：图库全屏外壳 —— 开/关图库 + chrome（视图按钮可见性）+ 新建作品 sheet +
//   IDB 占用/配额 + 加号·云·菜单 popup 按钮接线 + 名字唯一化。
//   （2026-08-28 by Claude Opus 5 (subagent)：菜单多一颗「下载全库备份…」——**只装端口**，
//    逻辑全在 ./library-backup.ts，本壳不长第二套业务。）
//
// 从 app.js god-file 切出「图库这层壳怎么开关、壳上那几个 popup 按钮怎么接、新建作品走哪条
//   sheet」那一轴。<Gallery> 深模块本身（src/gallery/gallery.ts）仍由 app.js mountGallery 组装并经
//   ctx.gallery 注入本壳；本壳只管「围着它的全屏外壳 + chrome + 入口按钮」。
//
// **红线（CRITICAL）**：setGalleryOpen / 新建确认 等编排里对 session.* / _store.* 的调用全部
//   RELOCATE 原样（参数/顺序/语义保持），绝不改。要改 store/session 行为 → STOP，escalate。
//
// 对外导出：setGalleryOpen / checkQuotaAndWarn / uniqueNameFor（这三个经 ctx 注入 app，
//   由 session-state / import-image 消费）。updateIdbUsage / openNewDocSheet 只在本模块内用
//   （v415 核实：不在 AppContext 里、app.ts 也不 import——旧注释说它们对外是错的）。
//
// 依赖：editMode / board / gallery / store(_store) / setStatus 经 initGalleryShell(ctx) 绑入；
//   doc 同样经 ctx（openNewDocSheet 读 doc.width/height）。session / els / isSignedIn /
//   anchorPopupToBtn / setAddImportAsNewDoc / importImageAsNewDoc / readImageFromClipboard
//   直接 import（leaf/singleton）。

import { session } from "../session-state.ts";
import { hasGallery } from "../gallery-capability.ts";
import { reportError } from "../error-badge.ts";
import { els } from "../els.ts";
import { readImageFromClipboard, triggerDownload } from "../session.ts";
import { showFullscreenBusy } from "../fullscreen-busy.ts";   // #18 备份进度：withBusy 期间换文案（leaf singleton）
import { zipPack } from "../backend/zip.ts";                  // #18 备份包（STORE 不压缩；ora/png 本就是压缩流）
import { snapshotFolderOnce, walkLibrary, runLibraryBackup, BACKUP_BUDGET_BYTES } from "./library-backup.ts";
import { uniqueBareName } from "./gallery-model.ts";   // 撞名后缀兜底（纯·已 pin）；占用检查按库身份（全名 X.ora）查
import { galleryDefaultName } from "../naming.ts";     // P1 命名器官：yyyymmdd-hex4（v217 惯例）+ 禁「未命名」
import { humanSize } from "./gallery-view-model.ts";   // 展示格式化（纯·KiB/MiB）；此前本模块私有一份逐字节拷贝，2026-08-21 收敛
import { requireStore, galleryBackend, isCachedSyncState } from "../app-store.ts";
import { galleryOnline } from "../gallery-capability.ts";
import { toggleAdoptedPopup, closePopupMenuOf, isPopupOpen } from "../ui/popup-menu.ts";   // 2026-09-02 C1：图库四 popup 收养
import { wireInlineSelect } from "../inline-select.ts";
import { applyTheme, themeLabel, THEMES, currentTheme } from "../theme.ts";
import { lang, setLang, LANGS, langDisplayName } from "../i18n/index.ts";
import { openInputSheet, openConfirmSheet } from "../sheets.ts";
import { pathJoin } from "./gallery-path.ts";
import { setAddImportAsNewDoc, importImageAsNewDoc } from "../import-image.ts";
import { isUnlocked, lock, setPassword, promptPassword } from "../crypto-state.ts";
import { hasVerifier, checkVerifier, clearVerifier } from "../password-verifier.ts";
import { t } from "../i18n/index.ts";
import { loadCanvasTemplates, fillTemplateSelect, templateById, templatePx } from "../canvas-templates.ts";
import { bindInstallButton } from "../install-prompt.ts";

import type { AppContext } from "../app-context.ts";
const errMsg = (e: unknown): string => String((e as { message?: unknown })?.message || e);

// ---- ctx-bound 协作件（app 拥有，boot 时 initGalleryShell(ctx) 注入）----
let editMode: AppContext["editMode"], board: AppContext["board"], gallery: AppContext["gallery"], doc: AppContext["doc"], setStatus: AppContext["setStatus"], withBusy: AppContext["withBusy"];

// trash-bar / add / trash 按钮的可见性随视图（旧 renderGallery 内联，现 app chrome 显式管）。
function _galleryChrome(view: string) {
  els.galleryTrashBar?.classList.toggle("hidden", view !== "trash");
  els.galleryAddBtn?.classList.toggle("hidden", view === "trash");
  els.galleryTrashBtn?.classList.toggle("hidden", view === "trash");
}

export async function setGalleryOpen(open: boolean) {
  if (open) {
    // 云功能关（cloud-capability v1.1）：图库整体停用——入口都已显隐/短路，这里是**中央兜底闸**
    //   （防未来新增调用点漏 gate；关=false 分支永不拦，回画布必须永远可行）。纯 UI gating 零数据变更。
    if (!hasGallery()) { setStatus(t("gs.cloudDisabledNoGallery"), true); return; }
    // 进图库 = 用户离开编辑场景 → apply 所有 pending transient（套索浮层等）+ 保存。
    // implicit（QA 2026-08-21 P0）：这句是兜底保存，不是用户显式动作——boot 失败路径也会走到这里，
    //   无地模式下必须 no-op（saveNow 的 implicit 门），否则会在无用户手势时静默写用户磁盘文件
    //   （违反无地 spec §7.1「Alt+F4=不保存」拍板）。显式退出的保存在 exitCanvasToGallery 已做完。
    editMode.applyPendingTransient();
    if (session.dirty) await session.save({ implicit: true });
    await session.awaitCloudPushIdle();   // 等 cloud push 完，防 status race
    document.body.dataset.mode = "gallery";
    els.galleryFull.classList.remove("hidden");
    _galleryChrome("files");      // 每次进默认 files 视图（避免上次留在 trash 里的混乱）
    gallery.setView("files");     // setView 内含 reload
    updateIdbUsage();
  } else {
    editMode.applyPendingTransient();
    if (session.dirty) await session.save({ implicit: true });   // 同上：兜底非显式，无地必须 no-op
    els.galleryFull.classList.add("hidden");
    delete document.body.dataset.mode;
    // 关闭可能打开的 popup
    closePopupMenuOf(els.galleryAddPopup);
    closePopupMenuOf(els.cloudAccountPopup);
    closePopupMenuOf(els.galleryMenuPopup);
    board.requestRender();
  }
}

// 新建作品 sheet
// v217 惯例 yyyymmdd-hex4 → P1 2026-08-26 提拔进命名器官（src/naming.ts），此处只消费。
export function openNewDocSheet() {
  // #22（2026-08-28）：无库新建 = transient 画布——不上户口，名字行藏（诚实：transient 没有名字身份）。
  const noGallery = galleryBackend().kind === "none";
  const nameRow = els.newDocName.closest("label") as HTMLElement | null;
  if (nameRow) nameRow.style.display = noGallery ? "none" : "";
  const base = galleryDefaultName();
  const folder = noGallery ? "" : gallery.getFolder();
  els.newDocName.value = folder ? `${folder}/${base}` : base;
  _selectPreset(DEFAULT_PRESET);
  els.newDocCustomRow.style.display = "none";
  els.newDocW.value = String(doc.width);
  els.newDocH.value = String(doc.height);
  els.newDocBackdrop.classList.remove("hidden");
  els.newDocSheet.classList.remove("hidden");
  setTimeout(() => { els.newDocName.focus(); els.newDocName.select(); }, 50);
}
function closeNewDocSheet() {
  els.newDocBackdrop.classList.add("hidden");
  els.newDocSheet.classList.add("hidden");
}
const DEFAULT_PRESET = "screen-1024sq";   // user 2026-08-19：2048 默认护栏没意义，每次都手动改回 1024
let _presetVal = DEFAULT_PRESET;   // #21：preset 单一真相（confirm 读它）。值 = 模板 id 或 "custom"。
// #21 终版（v0.5.10）：全部预设进一个下拉框（#newDocPreset，三 optgroup + 自定义）——chips 已删。
// v0.7.32：option 由 canvas-templates.json 投影（不再手写在 index.html——那是和裁切分叉的第二份表）。
function _selectPreset(val: string) {
  _presetVal = val;
  const sel = document.getElementById("newDocPreset") as HTMLSelectElement | null;
  if (sel && sel.value !== val) sel.value = val;
  els.newDocCustomRow.style.display = val === "custom" ? "" : "none";
}

// 作品占用 = store 本地缓存 files 分区的字节和件数（**不**走 storage.estimate —— 它把 SW
// 预缓存 / localStorage 算进去虚高几 MB）。
//   口径诚实交代：这是「本地存了多少作品」，**不含**缩略图缓存（在 app 自己的 weebpaint 库）、
//   不含回收站/备份箱、不含纯云端未缓存的作品。所以文案是「作品占用」不是「本地占用」。
//   （v415 前这里读的是早已没有写入者的 sessions 库 → 恒显 0 B / 0 件。）
// quota 来自 storage.estimate，是**浏览器愿意分配的上限**（iOS Safari 通常 ~ 60-80% 可用
// 磁盘；动辄几十 GB），不是 "我们申请了多少"。所以放 title 里给好奇用户看，不主显。
// ⚠ 只在图库打开/刷新时调：内部是一次全表 cursor（本地、无网络，但别挂每帧）。
const USAGE_TIMEOUT_MS = 8000;   // A3（2026-08-31 案）：usage() 是一次 IDB 全表 cursor；IDB 挂死时它永不 settle，「计算中…」就永远挂着
export async function updateIdbUsage() {
  try {
    const usageP = requireStore().files.usage();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error(`[gallery] files.usage() timed out after ${USAGE_TIMEOUT_MS}ms (IDB not responding?)`)), USAGE_TIMEOUT_MS); });
    let res: { bytes: number; count: number };
    try { res = await Promise.race([usageP, timeout]); }
    catch (e) {
      usageP.catch(() => { /* 超时后原 promise 的结局不再关心（reject 也别成 unhandled） */ });
      if (String(e).includes("timed out")) reportError(e, "warning");   // 超时是本案症状，值得一条横幅 + 黑匣子
      throw e;
    } finally { if (timer != null) clearTimeout(timer); }
    const { bytes, count } = res;
    let label = t("gs.footUsage", { size: humanSize(bytes), count });
    let level = "ok";   // ok | warn | critical
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      if (est && est.quota) {
        const ratio = (est.usage || 0) / est.quota;
        const pct = Math.round(ratio * 100);
        els.galleryFootUsage.title =
          t("gs.footUsageTitle", { size: humanSize(est.quota), pct });
        if (ratio > 0.95) { level = "critical"; label += t("gs.usedSuffix", { pct }); }
        else if (ratio > 0.8) { level = "warn"; label += t("gs.usedSuffix", { pct }); }
      }
    }
    els.galleryFootUsage.textContent = label;
    els.galleryFootUsage.classList.toggle("usage-warn", level === "warn");
    els.galleryFootUsage.classList.toggle("usage-critical", level === "critical");
  } catch {
    els.galleryFootUsage.textContent = t("gs.usageUnknown");
  }
}

// 每次保存后检查一次配额；> 80% 弹状态条提示用户去图库整理。
// 同一阈值短时间内不重复弹（避免每笔 stroke 后骚扰）。
let _lastQuotaWarnLevel = "ok";
export async function checkQuotaAndWarn() {
  try {
    if (!navigator.storage || !navigator.storage.estimate) return;
    const est = await navigator.storage.estimate();
    if (!est || !est.quota) return;
    const ratio = (est.usage || 0) / est.quota;
    const pct = Math.round(ratio * 100);
    let level = "ok";
    if (ratio > 0.95) level = "critical";
    else if (ratio > 0.8) level = "warn";
    if (level === _lastQuotaWarnLevel) return;
    _lastQuotaWarnLevel = level;
    if (level === "critical") {
      setStatus(t("gs.quotaCritical", { pct }), true);
    } else if (level === "warn") {
      setStatus(t("gs.quotaWarn", { pct }), true);
    }
  } catch {}
}

// （humanTime 死码已删 2026-06：gallery-shell 无调用者；展示用的 humanTime 在 gallery-view-model.ts。
//   本地那份逐字节复制的 humanSize 也删了 2026-08-21——统一 import gallery-view-model 那份，单位 KiB/MiB。）

// 拿一个不占用的名字（X / X 1 / X 2 / ...）。
//   走 store.files.nameOccupied = **唯一权威**占用检查（本地 + 在线时云端；本地命中即短路，
//   常见 0-1 次网络往返）。不列举任何文件夹——全库 list 是被否决的退化设计。
//   （旧名 uniqueLocalName 撒谎：它现在也查云端。且旧实现读死了的 sessions 库 → 恒不撞名。）
//   上限 20（旧 100）：每次未命中最坏一次 fetchMeta，别让「新建」确认卡在上百次往返上；
//   兜底加时间戳，保证一定返回一个名字。
//   ⚠ 返回**归一化后**的裸名（v437）：以前查占用用 sessionFileName(stem)（归一）却把**原始** stem
//   返回去，于是 newDoc 拿着 `a:b` 当活动名，而 store/gallery 那边是 `a_b` → 五处 `===` 比较失配。
//   归一化必须发生在名字**诞生的地方**，不是比较的地方。
// 逻辑本体 = gallery-model.uniqueBareName（纯·已 pin）；此处只绑 store 的占用谓词。
export async function uniqueNameFor(stem: string) {
  return uniqueBareName(stem, (n) => requireStore().files.nameOccupied(n));   // gallery 命名专用（无库铸户口不可达）
}

// ---- #18 全库备份（2026-08-28）：逻辑内核 = ./library-backup.ts（纯·可测），这里只装端口 + 说人话。----
//   路线：store 的唯一列举面是 watchFolder（订阅当前夹）→ 逐夹一次性快照 + 递归拿全库清单。
//   **只读**：每件只走 getEncryptedBlob()（加密件给密文原样，明文永不落备份包）→ 回落 open()。
//   进图库即有库（setGalleryOpen 的 hasGallery 闸 = hasLiveStore），故此路径 requireStore() 合法。
//   ⚠ 诚实交代一个副作用：store 配了 autoCacheOpenedFile → 备份读纯云端件会顺手把它留成本地副本
//     （residency 变了，内容/同步态没变）。这是「备份要包含纯云端件」的固有代价——不读就备不到它。
async function runFullLibraryBackup(): Promise<void> {
  if (!(await openConfirmSheet(t("bk.title"), t("bk.msg", { size: humanSize(BACKUP_BUDGET_BYTES) })))) return;
  const now = new Date();
  try {
    await withBusy(t("bk.scanning"), async () => {
      const manifest = await walkLibrary(
        (folder) => snapshotFolderOnce((f, cb) => requireStore().files.watchFolder(f, cb), folder),
        { onFolder: (_f, n) => showFullscreenBusy(t("bk.scanningFolders", { n })) },
      );
      if (!manifest.files.length) { setStatus(t("bk.empty"), true); return; }
      const cachedBefore = new Map(manifest.files.map((fr) => [fr.path, fr.syncState != null && isCachedSyncState(fr.syncState as never)]));
      const report = await runLibraryBackup(manifest.files, {
        readBytes: async (path) => {
          const f = requireStore().file(path, { isZip: true, mode: "existing" });
          // 红线修（0828）：加密+纯云端件旧路走 `?? open()` 兜底 = 解锁态**明文进备份包**。
          //   正解：先 open 暖 at-rest 缓存（明文只在内存，引用即弃），再取密文；锁定 → null = failed（诚实）。
          let bytes: Blob | null = await f.getEncryptedBlob();   // EncryptedBlob 是 Blob 的 brand 子类，宽化只读安全
          if (!bytes) {
            if (await f.isEncrypted()) {
              const warmed = await f.open();
              bytes = warmed ? await f.getEncryptedBlob() : null;
            } else {
              bytes = await f.open();
            }
          }
          // 配额归还（0828 user：「抢救时炸配额不好」）：备份前本无缓存的件，读完立即 offload——
          //   clean∧可重取 = 库的合法驱逐口径；峰值占用 ≈ 单件。best-effort：还不掉只记账不阻断。
          if (bytes && cachedBefore.get(path) === false) {
            try { await f.offload(); } catch (e) { reportError(new Error(`[library-backup] offload after read failed for ${path}: ` + String(e)), "log"); }
          }
          return bytes;
        },
        pack: (entries) => zipPack(entries, { lastModDate: now }),
        deliver: (blob, filename) => triggerDownload(blob, filename),
        onProgress: (done, total) => showFullscreenBusy(t("bk.packing", { done: done + 1, total })),
        onError: (path, e) => reportError(new Error(`[library-backup] read failed for ${path}: ` + String(e)), "log"),
      }, { now, renderManifest: (r) => [
        `WeebPaint backup ${now.toISOString()}`,
        ``,
        `[in this zip] (${r.zipped.length})`, ...r.zipped,
        ``,
        `[delivered as individual downloads — over the ${humanSize(BACKUP_BUDGET_BYTES)} zip budget, nothing dropped] (${r.spilled.length})`, ...r.spilled,
        ``,
        `[FAILED to read — NOT in this backup] (${r.failed.length})`, ...r.failed,
      ].join("\n") });
      // 诚实回执：拿到多少说多少；取不到的 / 列不全的单独成清单，绝不静默跳过。
      const good: string[] = [];
      if (report.archiveName) good.push(t("bk.done", { name: report.archiveName, n: report.zipped }));
      if (report.spilled) good.push(t("bk.spilled", { n: report.spilled }));
      const problems: string[] = [];
      if (report.failed.length) problems.push(t("bk.failedN", { n: report.failed.length }));
      if (manifest.partialFolders.length) problems.push(t("bk.partialN", { n: manifest.partialFolders.length }));
      if (manifest.truncated) problems.push(t("bk.truncated", { n: manifest.foldersVisited }));
      setStatus([...good, ...problems].join(" · "), true);
      // 备份不完整 = 数据安全级别的事实 → 顶层 banner，不只状态行（用户可见文案走 i18n SSoT）。
      if (problems.length) reportError(new Error(problems.join(" · ")), "warning");
      // 透明回执（0828 user：溢出/失败必须说清是哪些）：名单 sheet（截 12 件 + 等 N 件；全量在包内 manifest.txt）。
      const listSome = (names: string[]) => names.slice(0, 12).join("\n") + (names.length > 12 ? "\n" + t("bk.andMore", { n: String(names.length - 12) }) : "");
      if (report.spilledNames.length || report.failed.length) {
        const parts: string[] = [];
        if (report.spilledNames.length) parts.push(t("bk.spilledDetail", { n: String(report.spilledNames.length) }) + "\n" + listSome(report.spilledNames));
        if (report.failed.length) parts.push(t("bk.failedDetail", { n: String(report.failed.length) }) + "\n" + listSome(report.failed));
        await openConfirmSheet(t("bk.title"), parts.join("\n\n"));
      }
    });
  } catch (e) {
    reportError(new Error(t("bk.failed", { err: errMsg(e) })), "error");
  }
}

export function initGalleryShell(ctx: AppContext) {
  editMode = ctx.editMode;
  board = ctx.board;
  gallery = ctx.gallery;
  doc = ctx.doc;
  setStatus = ctx.setStatus;
  withBusy = ctx.withBusy;

  // 加号 popup
  // 2026-09-02 C1：四个 popup 收养进 popup-menu——定位/外点关/Escape/互斥（开一个关别的）全在 module。
  const _wireGalleryPopup = (btn: HTMLElement | null, popup: HTMLElement | null, beforeOpen?: () => void) => {
    if (!btn || !popup) return;
    btn.addEventListener("click", (e: Event) => {
      e.stopPropagation();
      const opening = !isPopupOpen(popup);
      if (opening) beforeOpen?.();
      toggleAdoptedPopup(popup, { anchor: btn, onClose: () => btn.setAttribute("aria-expanded", "false") });
      btn.setAttribute("aria-expanded", opening ? "true" : "false");
    });
  };
  // v0.9.25：编辑器「新建…」入口复用本 popup 时会藏起「新建文件夹」（图库视图操作）——图库侧打开时恢复
  _wireGalleryPopup(els.galleryAddBtn, els.galleryAddPopup, () => { els.addNewFolder.hidden = false; });
  // 云 icon popup
  _wireGalleryPopup(els.cloudIconBtn, els.cloudAccountPopup);
  // 回收站视图：进/出 + 清空。v211/v214 把图库收成 Vue 深模块时，trash 按钮的接线漏搬
  // （setView/getView/emptyTrash 已在 GalleryHandle 上，只是 chrome 这层没人调）→「回收站打不开」。
  // chrome 可见性 _galleryChrome + 视图切 gallery.setView 两件一起（与 setGalleryOpen 进库同模式）。
  const _switchView = (view: "files" | "trash") => { _galleryChrome(view); gallery.setView(view); };
  els.galleryTrashBtn?.addEventListener("click", () => _switchView("trash"));
  els.galleryTrashBack?.addEventListener("click", () => _switchView("files"));
  _wireGalleryPopup(els.galleryTrashMenuBtn, els.galleryTrashMenuPopup);
  els.galleryEmptyTrashLocalBtn?.addEventListener("click", () => {
    closePopupMenuOf(els.galleryTrashMenuPopup);
    gallery.emptyTrash("local");
  });
  els.galleryEmptyTrashCloudBtn?.addEventListener("click", () => {
    closePopupMenuOf(els.galleryTrashMenuPopup);
    gallery.emptyTrash("cloud");
  });

  // 图库菜单 popup（版本号 + 强制更新 + 文件无关设置）
  _wireGalleryPopup(els.galleryMenuBtn, els.galleryMenuPopup, () => {
    // 解锁/锁定按钮的标签随锁态（每次开菜单刷一次即可）
    const lockLabel = els.galleryMenuLock?.querySelector(".menu-item-label");
    if (lockLabel) lockLabel.textContent = isUnlocked() ? t("gs.lockLabel") : t("gs.unlockLabel");
  });

  // v0.9.26 PWA 安装入口（user 2026-08-20；capture 在 settings-menu init 挂，这里只绑图库那颗按钮）
  bindInstallButton(document.getElementById("galleryMenuInstallApp"), () => closePopupMenuOf(els.galleryMenuPopup));

  // 加密作品 解锁/锁定（ADR-0012 统一图库密码；密码只在内存，锁定 = 清掉）
  els.galleryMenuLock?.addEventListener("click", async () => {
    closePopupMenuOf(els.galleryMenuPopup);
    if (isUnlocked()) {
      lock();
      setStatus(t("gs.locked"));
      gallery.refresh();
      return;
    }
    // 在**当前夹**找一件本地加密作品 → 交互解锁（busy 外 prompt + verifyPassword 验 peek + 记忆）。
    //   本夹一件都没有 → 收下未验证的密码当统一密码（用到时自然验证，错了会重问）。
    //   刻意只看当前夹：列举唯一面 = watchFolder，不做全库扫描。
    //   （v415 前这里读死了的 sessions 库 → 恒找不到，永远走下面的未验证分支。）
    try {
      if (await gallery.requestUnlock()) { setStatus(t("gs.unlocked")); gallery.refresh(); return; }
    } catch (_) {}
    // v0.4.11（真机 2.3）：有 verifier（跟账号走）→ 输入并校验；三错给唯一的重置出口。
    //   旧病：本夹无本地加密件时未验证密码被直接坐实成全局——错密码随后被 encrypt 复用 = 两套密码 softlock。
    if (hasVerifier()) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const pw = await promptPassword({ title: t("gs.unlockTitle"), message: attempt > 0 ? t("gs.pwWrongRetry") : t("gs.unlockVerifierMsg") });
        if (pw == null) return;
        if ((await checkVerifier(pw)) === "ok") { setPassword(pw); setStatus(t("gs.unlocked")); gallery.refresh(); return; }
      }
      if (await openConfirmSheet(t("gs.resetPwTitle"), t("gs.resetPwMsg"))) { clearVerifier(); setStatus(t("gs.pwResetDone")); }
      return;
    }
    const pw = await promptPassword({ title: t("gs.unlockTitle"), message: t("gs.unlockNoLocalMsg") });
    if (pw != null) { setPassword(pw); setStatus(t("gs.pwRecorded")); gallery.refresh(); }
  });

  // #18 全库备份（2026-08-28）：只读，整库打一个 zip；库太大改逐件下载。逻辑 = ./library-backup.ts
  els.galleryMenuBackup?.addEventListener("click", () => {
    closePopupMenuOf(els.galleryMenuPopup);
    void runFullLibraryBackup();
  });

  // 加号 → 新建：弹 sheet 选名字 + 分辨率
  els.addNew.addEventListener("click", () => {
    closePopupMenuOf(els.galleryAddPopup);
    openNewDocSheet();
  });
  els.addImportPhoto.addEventListener("click", () => {
    closePopupMenuOf(els.galleryAddPopup);
    // 复用 oraFileInput 但限定 accept = image only。实际上 oraFileInput accept 包含 image
    els.oraFileInput.value = "";
    els.oraFileInput.click();
    // 上面的 onchange 会路由到 importImageAsLayer / decodeOraToDoc
    // 但用户语义是"新建作品打底"，所以新建一个 doc 把 image 当 base layer 放进去
    // 标记一个 pending flag（flag 归 import-image 模块）
    setAddImportAsNewDoc(true);
  });
  els.addImportClipboard.addEventListener("click", async () => {
    closePopupMenuOf(els.galleryAddPopup);
    try {
      const blob = await readImageFromClipboard();
      if (!blob) { setStatus(t("gs.clipboardNoImage")); return; }
      // 命名规范「有名保名，无名日期」（spec 20260820 §7）：剪贴板无来源名 → 走新建同款
      // yyyymmdd-xxxx 生成器（旧 "clipboard" 死名产出 clipboard 1/2/3… 分叉，已废）。
      const file = new File([blob], `${galleryDefaultName()}.png`, { type: blob.type || "image/png" });
      await importImageAsNewDoc(file);
      setGalleryOpen(false);
    } catch (e) {
      reportError(new Error(t("gs.clipboardNewFailed", { err: errMsg(e) })), "warning");   // #34：iPad 权限被拒要看得见
    }
  });

  // （「从云盘新建」＋菜单入口已删 v0.9.34：图片直接显示在图库当次级 tile、点击=孪生语义
  //   （gallery.ts openImageTile），不再需要第二个 picker 门。图层/参考窗入口的 picker 照旧。）

  // 新建作品 sheet 接线
  // #21 终版（v0.5.10）：唯一的尺寸下拉框（v217 的 chips 按钮组已删）
  const presetSel = document.getElementById("newDocPreset") as HTMLSelectElement | null;
  // v0.7.32：option 来自 canvas-templates.json（async fetch）。先同步投影一次——此刻表可能还空着，
  // 但「自定义…」这条立刻就在，下拉框不会有一段完全空白的窗口；json 回来再投影一次并选回默认。
  if (presetSel) {
    fillTemplateSelect(presetSel, t("nd.custom"));
    void loadCanvasTemplates().then(() => {
      fillTemplateSelect(presetSel, t("nd.custom"));
      _selectPreset(_presetVal);
    });
  }
  presetSel?.addEventListener("change", () => { if (presetSel.value) _selectPreset(presetSel.value); });
  els.newDocBackdrop.addEventListener("click", closeNewDocSheet);
  els.newDocCancel.addEventListener("click", closeNewDocSheet);
  // v0.5.40（user：「确认总是要点好几下」）：名字输入框聚焦时点按钮，pointerdown 默认行为先 blur →
  //   键盘收起 → 底部 sheet 位移 → click 落空。preventDefault 挡掉焦点转移，按钮原位吃到 click。
  for (const b of [els.newDocConfirm, els.newDocCancel]) {
    b.addEventListener("pointerdown", (e: Event) => e.preventDefault());
  }

  els.newDocConfirm.addEventListener("click", async () => {
    const nameRaw = (els.newDocName.value || "").trim() || galleryDefaultName();   // 禁「未命名」（verdicts §2.1）：空输入落日期名
    let w, h;
    const presetVal = _presetVal || DEFAULT_PRESET;
    // v0.7.32：preset 值 = canvas-templates.json 的模板 id（此前是 "WxH" 字面量）。模板查不到
    // （json 没加载到）→ 退到自定义输入框里的当前画布尺寸，而不是静默造一张 2048²。
    const tpl = presetVal === "custom" ? null : templateById(presetVal);
    if (tpl) {
      const px = templatePx(tpl);
      w = Math.max(16, Math.min(8192, px.w));
      h = Math.max(16, Math.min(8192, px.h));
    } else {
      w = Math.max(16, Math.min(8192, parseInt(els.newDocW.value, 10) || 2048));
      h = Math.max(16, Math.min(8192, parseInt(els.newDocH.value, 10) || 2048));
    }
    // #22：无库 → transient 画布（不上户口不落盘；返回值同样必须看——三键挽留取消=什么都没建）。
    if (galleryBackend().kind === "none") {
      closeNewDocSheet();
      if (!(await session.newTransientDoc({ w, h }))) return;
      setStatus(t("gs.createdTransient", { w: String(w), h: String(h) }));
      return;
    }
    const name = await uniqueNameFor(nameRaw);
    closeNewDocSheet();
    // doc 替换 + 落盘 + 切指针 + checkpoint + 关库全在 session.newDoc（session-state.ts）。
    // 返回值必须看（QA 2）：无地脏离开确认被取消 → 什么都没建，别谎报「已新建」。
    if (!(await session.newDoc({ name, w, h }))) return;
    setStatus(t("gs.created", { name, w, h }));
  });

  // 回收站入口（0828 收进菜单；header 图标已撤，els.galleryTrashBtn 两处 ?. 兼容空缺）。
  document.getElementById("galleryMenuTrash")?.addEventListener("click", () => {
    closePopupMenuOf(els.galleryMenuPopup);
    _switchView("trash");
  });
  // 图库菜单 popup 内动作代理到主菜单已有 handler（.click() 即触发，不重复逻辑/状态）。
  els.galleryMenuForceUpdate?.addEventListener("click", () => {
    closePopupMenuOf(els.galleryMenuPopup);
    els.menuForcePwaReset?.click();
  });
  // v0.5.40：主题/语言 in-app 下拉（同设置页机制）；gen-AI 代理主菜单同一 handler。
  wireInlineSelect("galleryThemeBtn",
    () => THEMES.map((th) => ({ value: th, label: themeLabel(th) })),
    () => currentTheme(),
    (th) => { applyTheme(th); });
  const galLangLabel = document.getElementById("galleryLanguageBtnLabel");
  if (galLangLabel) galLangLabel.textContent = langDisplayName(lang());
  wireInlineSelect("galleryLanguageBtn",
    () => LANGS.map((l) => ({ value: l, label: langDisplayName(l) })),
    () => lang(),
    (l) => { void setLang(l).catch((e) => reportError(e)); });
  // （四个 popup 的外点关 2026-09-02 C1 归 popup-menu；这里那份删）

  // + 新建文件夹（云端真文件夹为准：在 OneDrive 上建真文件夹，需登录+在线）
  els.addNewFolder?.addEventListener("click", async () => {
    closePopupMenuOf(els.galleryAddPopup);
    // 文件夹模型「远端真文件夹为准」→ 库必须在线才能建（folder 库=磁盘权限已授即在线；0828 修）
    if (!galleryOnline()) {
      setStatus(t("gs.folderNeedSignin"), true);
      return;
    }
    const stem = await openInputSheet(t("gs.newFolderTitle"), t("gs.newFolderDefault"), { placeholder: t("gs.folderNamePlaceholder") });
    if (stem == null) return;
    const trimmed = stem.trim();
    if (!trimmed) { setStatus(t("gs.folderNameEmpty"), true); return; }
    if (trimmed.includes("/")) { setStatus(t("gs.folderNameNoSlash"), true); return; }
    const fullPath = pathJoin(gallery.getFolder(), trimmed);
    // 点确定即刻锁屏（含「已存在」预检的网络往返也在锁内）——修「新建文件夹延迟锁屏 F」。
    //   withBusy 可重入（ref-count），内层 store.flow.newFolder 再包一层 busy 不会提前解锁。
    await withBusy(t("gs.creatingFolder", { name: trimmed }), async () => {
      // 统一走 store.nameOccupied（唯一占用检查）：同名文件占了 → 提示；纯文件夹已存在则 ensureFolder 幂等（复用无害）。
      if (await requireStore().files.nameOccupied(fullPath)) { setStatus(t("gs.folderExists", { name: trimmed }), true); return; }
      // 走 store.flow.newFolder（深模块窄接口）而非裸 ensureSubfolder——锁屏/单飞守卫由库内强制。
      try { await requireStore().files.newFolder(fullPath); setStatus(t("gs.folderCreated", { name: trimmed })); }
      catch (e) { reportError(new Error("[folder] cloud ensure failed: " + String(e)), "log"); setStatus(t("gs.folderCreateFailed", { err: errMsg(e) }), true); }
    });
    gallery.refresh();
  });
}

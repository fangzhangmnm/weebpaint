// Session —— 活动文档（active-document）的 app 编排。**editor-session 的消费者 + ora editor 适配器宿主**。
//
// cutover（2026-07-09）：持久化编排全塌进家族共享模块 **editor-session**（open/存/推/失焦/退出/autosave 通用逻辑）。
//   本模块只剩 **app 编排**：ora editor 适配器（adopt/encode/onChange 包画图引擎）、相位/懒空白/版本降级守卫/
//   加密切换/rename & exit 的 UI 循环/gallery 耦合。**sync 机制全在 sync-store 库、生命周期在 editor-session**——
//   本模块不碰 If-Match/parentBase/freshness（进库了）、不碰 busy/autosave 节律（进 editor-session 了）。
//
// 三层：session（本模块，app 编排 + ora 适配器）→ editor-session（生命周期，共享）→ sync-store（文件系统，库）。
//
// ⚠ 已删依赖：gateCloudSyncOnOpen（freshness 进 store.file.open）、getKnownETag/clearCloudState/isCloudDirty
//   （dirty 分层：内存脏=es.isDirty，sync 脏=listAllItems）、_store.busy/edits/session/autosave/flow.*/adoptBase/seal。

import { reactive } from "../vendor/vue/vue.esm-browser.prod.js";
import { WEEBPAINT_VERSION } from "./version.ts";
import { reportError } from "./error-badge.ts";
import { setBrushColor } from "./color-panel.ts";
import { thumbBlobFromBytes, setCurrentSessionName, triggerDownload } from "./session.ts";
import { renderNodesToBytes } from "./backend/doc-render.ts";
import { encodeDocToOra, decodeOraToPainting, paintingDataToEncodeDoc, parseAppVersion, type DecodedPainting } from "./backend/ora.ts";
import { ORA_FORMAT_VERSION } from "./backend/ora-stack-xml.ts";
import { flattenViewLeaves } from "./backend/workpiece/painting-view.ts";
import { tLatin } from "./i18n/index.ts";
import { isSignedIn, requireStore, galleryBackend } from "./app-store.ts";
import { appEncryption } from "./encryption.ts";
import type { EncryptedBlob } from "./app-store.ts";   // 密文 at-rest 字节（branded）；B2：类型经接缝转口
import { openInputSheet, openConfirmSheet, openChoiceSheet, lockSyncGate, settleSyncGate } from "./sheets.ts";
import { readHandleFile, writeHandleBlob, handleMtime, hasWeebPaintTraces, supportsSaveFilePicker, pickSaveOraFile, type LocalFileHandle } from "./local-file-session.ts";
import { claimHomeAuthority, docHome, fileDirty, saveRoute } from "./doc-home.ts";
import { activeGalleryId } from "./active-gallery.ts";   // P3：安家铸户口用当前挂载库 id（legacy="default" 零迁移）
import { galleryDefaultName } from "./naming.ts";
import { sessionNameConflict } from "./session-name.ts";   // A1 安家铸名预检
import { crashStore, mintLuggageTag, type LuggageTag } from "./crash-store.ts";
import { pathFolder } from "./gallery/gallery-path.ts";
import { invalidateCachedThumb } from "./gallery/cloud-thumb-cache.ts";
import { sessionFileName, sessionBareName, stripSessionExt } from "./config.ts";
import { serializedToolStatePatch, desk } from "./workbench-state.ts";
import { getBlenderSyncState, applyBlenderSyncState } from "./blender-sync.ts";
import { ensureNewPassword, ensureUnlocked } from "./enc-thumbs.ts";
import { setPassword, getPassword } from "./crypto-state.ts";
import { shouldCapture, checkpointKey, planRingEviction, ringBudget, isNewSitting, type CheckpointTrigger, type RingEntryMeta } from "./checkpoint-policy.ts";
import { getCheckpoint, deleteCheckpoint, ringPut, ringGet, ringAll, ringDelete, ringDeleteByDoc, mintRingId } from "./storage.ts";
import { els } from "./els.ts";
import type { AppContext } from "./app-context.ts";
import type { GalleryItem } from "./gallery/gallery-model.ts";
import { t } from "./i18n/index.ts";
import { createEditorSession, type EditorSession, type StoreLike } from "./editor-session/index.ts";
import { timelapseDetach, timelapseAdopt, timelapseForSave } from "./timelapse-session.ts";
import { holdDocLock, releaseDocLock, isDocLockedElsewhere } from "./instance-locks.ts";
import { commitFillNow, gateFillOnDocSwitch } from "./fill-mode.ts";

const errMsg = (e: unknown): string => String((e as { message?: unknown })?.message || e);

interface OraWeebpaintState {
  reference?: unknown; color?: string; toolStates?: Record<string, unknown>;
  palette?: unknown; checkerboard?: boolean; activeId?: number; activeLayerIndex?: number;
  viewport?: { scale?: number } & Record<string, unknown>;
  blender?: unknown;
}
type LoadedDoc = DecodedPainting;

// ---- ctx-bound 协作件（app 拥有，boot 时 initSession(ctx) 注入）----
let state: AppContext["state"], doc: AppContext["doc"], board: AppContext["board"];
let wp2: AppContext["wp2"];
let input: AppContext["input"], editMode: AppContext["editMode"], rack: AppContext["rack"];
let referenceWindow: AppContext["referenceWindow"], paletteWindow: AppContext["paletteWindow"];
let setStatus: AppContext["setStatus"], withBusy: AppContext["withBusy"];
let updateSaveStatus: AppContext["updateSaveStatus"], updateNewerBanner: AppContext["updateNewerBanner"];
let pullSettingsAndState: AppContext["pullSettingsAndState"];
let applyCheckerboard: AppContext["applyCheckerboard"], renderLayersPanel: AppContext["renderLayersPanel"];
let setGalleryOpen: AppContext["setGalleryOpen"];
let checkQuotaAndWarn: AppContext["checkQuotaAndWarn"];
// C2 记账：gallery↔session 双向依赖的反向半边（refresh×5 + invalidateEncrypted×2 经此句柄）——
//   E 骑士开工清单，详 src/gallery/gallery.ts 文件头。
let gallery: AppContext["gallery"];

// ---- doc 的家（P1 2026-08-26）：SSoT 迁入 doc-home keeper，本模块 module-init 持走唯一 authority ----
// 旧三根平行状态（_activeSessionName / _localFile / 隐式 null=无 doc）塌缩成一个 DocHome 联合值：
//   gallery 家 ⇔ 旧 _activeSessionName 非空；file 家 ⇔ 旧 _localFile 非空；null ⇔ 无 doc（图库态）。
//   不变量（原代码已成立，联合类型把它变成结构事实）：两者永不同时在场。
//   transient 家：类型/派发已就绪（doc-home.ts + 矩阵测试），本 slice 无产者——产者随 P1 后续
//   canvas-first boot / P2 Editor-only 落地。
const _homeAuth = claimHomeAuthority();
// 幽灵 path 保护：boot 成功/主动 open/new/save-as 才升级真名。初始占位「未命名」沿旧制直赋
//   （不走 _setActive：module load 期不许持 Web Lock / 碰持久层）。
_homeAuth.setHome({ kind: "gallery", galleryId: activeGalleryId(), path: t("nd.untitled") });
/** gallery 家的库裸名；非 gallery 家（file/transient/无 doc）= null（旧 _activeSessionName 语义原样）。 */
function _activeName(): string | null { const h = docHome(); return h?.kind === "gallery" ? h.path : null; }
/** file 家快照；非 file 家 = null（旧 _localFile 语义原样，dirty 拆去 keeper 的 fileDirty()）。 */
function _fileHome() { const h = docHome(); return h?.kind === "file" ? h : null; }
let _isLazyBlankSession = false;
let _loadedDocIsNewer = false;
let _loadedDocWriterVer: string | null = null;
let _loadedDocNewerConfirmed = false;
let _loadingDoc = false;

const AUTOSAVE_IDLE_MS = 30_000;   // v0.4.11 用户拍板：停笔 30 秒即落盘（旧 3min 墙钟 gate 删——dirty 门已足够：存完即净，再编辑本身重置空闲时钟）

const _phase = reactive<{ current: "gallery" | "editing" | "lazyblank" }>({ current: "gallery" });
function _recomputePhase() { _phase.current = !_activeName() ? "gallery" : _isLazyBlankSession ? "lazyblank" : "editing"; }

const _enc = reactive<{ encrypted: boolean }>({ encrypted: false });
// 边界（薄库身份=全名）：app 内部 _activeName() 是**裸** session 名；跨到库/editor-session 前统一 sessionFileName
//   转全名（X→X.ora）。加密件 .zip 由库内部据字节态翻转，app 只传明文全名。OUT 侧（itemToG）用 stripSessionExt 还原。
const toFull = (name: string) => sessionFileName(name);
// **活动文档名的唯一写入口**（v437）。在这里归一化一次，之后全 app 的 `item.name === session.name`
//   比较就恒等可比 —— 而不是在五个比较点各自补 sessionFileName()（补漏一个就是一个 bug）。
//   为什么必须归一：store 那边的身份是 sessionBareName 之后的；app 若存用户敲进来的原始名，
//   `a:b` 与 `a_b` 会永久失配（详见 config.ts 的长注释）。
function _setActive(name: string | null): void {
  const bare = name == null ? null : sessionBareName(name);
  _homeAuth.setHome(bare == null ? null : { kind: "gallery", galleryId: activeGalleryId(), path: bare });
  setCurrentSessionName(bare ?? "");
  // 双实例互认（2026-08-21）：身份唯一写入口 = 锁收口点。持有 doc ⇔ 长持它的 Web Lock
  //   （open/restore/newDoc/saveAs/adopt/rename 全从这收口；null=退图库/无地接管 → 释放。
  //   无地**不持锁**：无 store 身份、FS handle 拿不到全路径无稳定唯一键，且已有 mtime 陈旧对表兜底）。
  if (bare != null) holdDocLock(bare); else releaseDocLock();
}
const _file = (name: string) => requireStore().file(toFull(name), { isZip: true, mode: "existing" });   // WeebPaint work-file = ora-zip 容器（有 peek）
async function _refreshEncrypted() {
  const name = _activeName();
  try { _enc.encrypted = name ? await _file(name).isEncrypted() : false; }
  catch { _enc.encrypted = false; }
}

// ============ 无地本地文件模式（v0.9.24；spec ai-docs/20260819-clipboard-and-local-file-spec.md §7）============
// doc 的家 = 本地文件句柄而非 store 身份。session 级零持久化托底（human 拍板）：不进图库、
// 刷新即散、崩溃即丢（beforeunload 只拦 UI 层关闭，任务管理器/断电是拍板接受的逃生通道）。
//
// 【数据安全双墙】无地期间 _activeName() 恒 null → 所有 store 身份路径被既有守卫短路；
// 但 es 仍持有上一个 store doc 的名字，若无地编辑标脏了它，autosave 会把**无地画布的像素**
// encode 后写进旧 doc 名下（幽灵路径级事故，AtlasMaker 0.7.2 同类）。所以：
//   墙① _fileHome() 在场 → es 的 onChange/markEdited 改走本地脏轨，es 永不标脏；
//   墙② _esMuted 残影墙：无地退出后 canvas 像素 ≠ es._name 的内容，直到 es 重新绑定身份
//       （openItem/newDoc/adopt/saveAs/restore 任一成功）之前 es 仍不许标脏。
// Windows 对齐（拍板）：无自动保存、blur/pagehide 不落盘（es 干净 = persist 天然 no-op）、
// Ctrl+S 显式写回 + mtime 陈旧对表；beforeunload 的偷存在无地降级为 no-op（静默写用户文件违背文件语义）。
// （P1 2026-08-26：状态本体 = doc-home keeper 的 file 家 + fileDirty()；本节只剩残影墙旗子。）
let _esMuted = false;

// ── T-crash 行李牌（P2 2026-08-26；库/契约 = crash-store.ts，拍板 = verdicts §2.2）──
// file 家 doc 的灾难恢复快照收件地址：打开现铸、只活在 RAM+crash 库、正常关闭即焚。
// 附加层纪律：下面所有 crashStore 调用全 fire-and-forget + 内部 catch——本层坏死不许影响承重层。
let _luggageTag: LuggageTag | null = null;
let _editSerial = 0;    // file 家编辑计数（histchange/sidecarchange 驱动）
let _snapSerial = 0;    // 上次盲快照时的计数——「没新内容就不重拍」门
// P4 坐下判定（输入间隔 qualifier，§2.7）：上次输入时刻。换 doc 重置（adoptModel），防跨 doc 误判。
let _lastInputAt: number | null = null;

/** 新的一次坐下的首笔 → 封存「坐下前态」（copy-on-write：首笔还没被 autosave/写回追上，
 *  at-rest/磁盘字节此刻仍是坐下前的样子——与「真快进第一笔之前升 gate」同手法）。 */
async function _captureResumePoint(): Promise<void> {
  try {
    const name = _activeName();
    if (name && !_isLazyBlankSession) { await _captureCheckpoint(name, "resume-first-input"); return; }
    const fh = _fileHome();
    if (fh && _luggageTag) {   // file 家：磁盘字节 = 上次写回态 = 坐下前态
      const bytes = await readHandleFile(fh.handle);
      await _ringCapture(_luggageTag, "resume-first-input", bytes, false);
    }
    // transient / lazyblank：无 at-rest 可封（T-crash 盲快照另行兜底），跳过。
  } catch (e) { reportError(new Error("[checkpoint] resume capture failed: " + String(e)), "log"); }
}
/** 释放行李牌（离开 file/transient 家的每条路都要过这）：正常关闭即删（pending-adoption 由库内拒删）；
 *  该牌名下的 revert ring（file 家打开点快照等，session 级）随牌焚（拍板 §2.7）。 */
function _dropLuggage() {
  const tag = _luggageTag;
  _luggageTag = null;
  if (tag) {
    crashStore.dropOnCleanClose(tag).catch(() => {});   // best-effort：清扫失败顶多多一条陈旧横幅
    ringDeleteByDoc(tag).catch(() => {});
  }
}

/** file/transient 家快照判别（本地脏轨的门；P2 起 transient 与 file 同轨）。 */
function _localHomeKind(): "file" | "transient" | null {
  const k = docHome()?.kind;
  return k === "file" || k === "transient" ? k : null;
}
function _markLocalDirty() {
  _editSerial++;
  if (_localHomeKind() && !fileDirty()) { _homeAuth.markFileDirty(); updateSaveStatus(); }
}

// ── transient 家（P2 2026-08-26；user 拍板「关gallery进local first则要么双击打开进文件要么新画布」）──
// 产者 = 云关 boot 的空白画布（boot-restore.openBlankCanvas → beginTransientBlank）。
// 此前云关空白画布 = home:null 裸奔（Ctrl+S 死路「没打开作品」、崩溃全丢）；transient 化后：
//   Ctrl+S = settle 安家仪式（FSA 存成文件→file 家；无 FSA 落 download=责任移交，不清 dirty）、
//   T-crash 盲快照覆盖、离开时三键挽留（保存/丢弃/取消）。
// _transientName = 展示名（谥号模式日期名：横幅/建议文件名用）——**不是身份**（transient 无家无户口）。
let _transientName: string | null = null;
function beginTransientBlank(): void {
  _homeAuth.setHome({ kind: "transient" });
  _transientName = galleryDefaultName();
  _luggageTag = mintLuggageTag(); _snapSerial = _editSerial;
  _isLazyBlankSession = false; _recomputePhase();
  _enc.encrypted = false;
  updateSaveStatus();
}

/** 崩溃快照恢复为 transient（云关语境专用——云开走 adoptAsNew 进图库）：装入字节但**不安家**
 *  （云关的图库不可见，落进去=数据蟑螂旅馆），恢复出的 doc 立即标脏 + 重新挂 T-crash 保护，
 *  用户经 settle 存成文件。es 不绑（残影墙同 openLocalFile：_esMuted 立墙防跨写）。 */
function adoptAsTransient(loaded: LoadedDoc, displayName: string): void {
  _esMuted = true;   // 墙②先立再换内容（openLocalFile 同款）
  adoptModel(loaded);
  releaseDocLock();          // 不走 _setActive：云关自愈红线——currentFile 一个指头都不碰
  _isLazyBlankSession = false;
  _enc.encrypted = false;
  _homeAuth.setHome({ kind: "transient" });
  _transientName = displayName;
  _luggageTag = mintLuggageTag(); _snapSerial = _editSerial;
  _homeAuth.markFileDirty(); _editSerial++;   // 视为 dirty 直到首次真保存 + 立即重挂盲快照保护
  _recomputePhase();
  updateSaveStatus();
}

/** settle 安家仪式（transient 专用；verdicts §2.1 单按钮静默 fallback）：
 *  FSA → 系统另存框 → 写文件 → **家变 file**（keeper.setHome 换家即清 dirty=「回家才清」宪法条款）；
 *  无 FSA → download（责任移交 + toast；下载 ≠ 家 → dirty 不清、家不变）。
 *  返回 true = 真安家了。picker 取消（AbortError→null）= 取消，绝不降级重弹。 */
async function settleToFile(): Promise<boolean> {
  const suggested = `${_transientName ?? galleryDefaultName()}.ora`;
  _applyPendingForExplicitSave();   // settle 必是显式动作：fill 预览等 pending 一并收口
  try {
    if (supportsSaveFilePicker()) {
      // 顺序纪律：先开 OS 保存框再 encode（picker 要吃 user-gesture 活化，大画 encode 秒级不能排前面）。
      const h = await pickSaveOraFile(suggested);
      if (!h) { setStatus(t("ss.saveCancelled")); return false; }
      const { bytes } = await _encodeCurrentOraWithPeek();
      await writeHandleBlob(h, bytes);
      _homeAuth.setHome({ kind: "file", handle: h, fileName: h.name, lastSeenMtime: (await handleMtime(h)) ?? Date.now() });
      _transientName = null;
      if (_luggageTag) { crashStore.dropOnCleanClose(_luggageTag).catch(() => {}); _snapSerial = _editSerial; }
      else { _luggageTag = mintLuggageTag(); _snapSerial = _editSerial; }
      updateSaveStatus();
      setStatus(t("lf.saved", { name: h.name }));
      return true;
    }
    const { bytes } = await _encodeCurrentOraWithPeek();
    triggerDownload(bytes, suggested);
    setStatus(t("ss.settleDownloaded", { name: suggested }), true);   // 下载开始=责任移交（拍板）；没回家，dirty 如实留着
    return false;
  } catch (e) {
    reportError(new Error("[settle] save to file failed: " + String(e)), "warning");
    setStatus(t("lf.saveFailed", { error: errMsg(e) }), true);
    return false;
  }
}
/** es 重新绑定 store 身份（open/adopt/新建/另存成功）→ 解除残影墙。 */
function _esRebound() { _esMuted = false; }

/** 打开本地 .ora：明文 + 有 WeebPaint 痕迹 → 原位打开（返回 null）；
 *  加密容器 / 外来 ora → 不原位，把 File 还给调用方走导入路径（返回 File）。 */
async function openLocalFile(handle: LocalFileHandle): Promise<File | null> {
  const file = await readHandleFile(handle);
  // 加密容器：原位模式 v1 不吃密文（解锁/记忆密码/落库语义全在导入路径）→ 交还导入。
  //   加密器官无库也活着（@internal/encryption 0.1.0 立户闭环：kind:none 分叉床垫拆除）。
  if (await appEncryption.isEncryptedBlob(file)) return file;
  const loaded = await decodeOraToPainting(file) as LoadedDoc;
  if (!hasWeebPaintTraces(loaded)) return file;   // 外来 ora（Krita 等）→ 导入为新 doc，绝不原位覆写别人的文件
  if (!(await _gateFillOnSwitch())) return null; // 挽留门：fill 预览挂着 → 应用/丢弃/取消（user 2026-08-21）
  if (!(await leaveLocalDoc())) return null;    // 已在无地且脏 → 先问（保存/丢弃/取消）
  if (es.isDirty()) await saveNow();             // 旧 store doc 先落盘（openItem 同款；无地时已被上一行清场）
  _esMuted = true;   // 墙②先立再换内容：adoptModel 之后 canvas 就不再是 es._name 的像素了
  adoptModel(loaded);
  _setActive(null); _isLazyBlankSession = false;   // 先离旧家（释放锁 + 清持久 currentFile）
  _enc.encrypted = false;
  _homeAuth.setHome({ kind: "file", handle, fileName: file.name, lastSeenMtime: file.lastModified });
  _luggageTag = mintLuggageTag(); _snapSerial = _editSerial;   // T-crash：新家现铸新牌（旧牌上面 leaveLocalDoc 已焚）
  // 打开点快照（P4 §2.7：file 家 revert 锚；session 级挂行李牌，正常关闭随牌焚）——字节现成（刚读的文件），零重编码。
  void _ringCapture(_luggageTag, "local-open", file, false).catch((e) => reportError(new Error("[checkpoint] local-open capture failed: " + String(e)), "log"));
  _recomputePhase();
  updateSaveStatus();
  await setGalleryOpen(false);
  setStatus(t("lf.opened", { name: file.name }));
  return null;
}

/** Ctrl+S / save 按钮在无地模式的落点：encode → mtime 陈旧对表 → 原子写回句柄。 */
async function saveLocalFileNow(): Promise<boolean> {
  const fh = _fileHome();
  if (!fh) return false;
  _applyPendingForExplicitSave();   // 无地保存全部来自显式动作（implicit 在 saveNow 就 no-op 了）
  if (_loadedDocIsNewer && !_loadedDocNewerConfirmed) {
    const ok = await openConfirmSheet(t("ss.overwriteNewerTitle"), t("ss.overwriteNewerMsg", { writer: String(_loadedDocWriterVer), version: WEEBPAINT_VERSION }));
    if (!ok) { setStatus(t("ss.saveCancelled")); return false; }
    _loadedDocNewerConfirmed = true; updateNewerBanner();
  }
  try {
    // 陈旧对表（FS Access 无 etag，mtime 是零成本的 freshness 检查）：文件在我们打开后被外部改过 → 问。
    const mt = await handleMtime(fh.handle);
    if (mt != null && mt !== fh.lastSeenMtime) {
      const ok = await openConfirmSheet(t("lf.staleTitle"), t("lf.staleMsg", { name: fh.fileName }));
      if (!ok) { setStatus(t("ss.saveCancelled")); return false; }
    }
    const { bytes } = await _encodeCurrentOraWithPeek();
    await writeHandleBlob(fh.handle, bytes);
    // await 间隙家可能已换（挽留 sheet 期间新文件落地等）——只有仍是同一个家才前移对表基准/清脏
    //   （旧代码此处改的是已脱钩的对象快照，效果等价；keeper 动词换家后调会响亮 throw，故先对指纹）。
    if (docHome() === fh) {
      _homeAuth.patchFileMtime((await handleMtime(fh.handle)) ?? Date.now());
      _homeAuth.clearFileDirty();
      // T-crash：真保存成功 → 旧快照作废（磁盘上的字节已是最新；留着=boot 弹陈旧横幅）。牌不焚，续用。
      if (_luggageTag) { crashStore.dropOnCleanClose(_luggageTag).catch(() => {}); _snapSerial = _editSerial; }
    }
    updateSaveStatus();
    setStatus(t("lf.saved", { name: fh.fileName }));
    return true;
  } catch (e) {
    reportError(new Error("[local-file] save failed: " + String(e)), "warning");
    setStatus(t("lf.saveFailed", { error: errMsg(e) }), true);
    return false;
  }
}

/** 离开 file/transient 家（回图库/开别的画/新建/导入前必过的门；P2 起 = 三键挽留：保存/丢弃/取消）。
 *  脏 → 问；取消 → false（调用方中止）。file 家保存=写回；transient 保存=settle 安家仪式
 *  （settle 落 download=责任移交未安家 → 同样不放行离开，用户要么 FSA 真安家要么显式丢弃）。
 *  ⚠ 只清家，**不清 _esMuted**——残影墙要等 es 重新绑定身份（_esRebound）才解除。 */
async function leaveLocalDoc(): Promise<boolean> {
  const kind = _localHomeKind();
  if (!kind) return true;
  if (fileDirty()) {
    const label = kind === "file" ? _fileHome()!.fileName : (_transientName ?? "");
    const c = await openChoiceSheet<"save" | "discard">(t(kind === "file" ? "lf.leaveTitle" : "lf.leaveTransientTitle"), label, [
      { label: t("lf.leaveSave"), value: "save", primary: true },
      { label: t("lf.leaveDiscard"), value: "discard" },
    ]);
    if (!c) return false;
    if (c === "save") {
      if (!(kind === "file" ? await saveLocalFileNow() : await settleToFile())) return false;
    }
  }
  if (_localHomeKind()) { _homeAuth.setHome(null); _dropLuggage(); _transientName = null; }   // sheet 期间可能已被别的入口换家（原代码同样只清引用）
  updateSaveStatus();
  return true;
}

// ============ 编辑器状态 I/O（v267b；T5/v0.8.21 拆双轨：旧轨 webpaint/state.json **停写**）============
// 旧轨独有的三样（eraser/filterBrush/selPen dial、palette、blender）已迁 desk（toolDials/palette/blender
// 三组，存时 syncRuntimeForSave 捞进）；activeId 在 stack.xml weebpaint:active 原生携带。
// 读兼容：restoreEditorStateFromOra 仍吃存量 .ora 的 _weebpaintState（desk 后手赢），拔除另议。
function resetEditorState() {
  referenceWindow.clearBitmap?.(); referenceWindow.close?.();   // ?.=元素可能未升级（无 CE 环境），见 ReferenceWindowHandle 注
  paletteWindow.clear?.(); paletteWindow.close?.();
  setBrushColor("#000000"); applyCheckerboard(false); state.filterBrush = null; applyBlenderSyncState();   // restore 路径绕 target（v0.9.11）
  desk.reset();   // desk per-doc：开新文件/换画/卸载 → 重置 desk struct（stage4）
}

// desk apply-on-load（stage5）：desk.Unserialize/reset 后，把面板/视口等**回灌到 UI**。
//   各面板模块（color/layers/ref/blender panel）在 init 里监听 wp:applyEditorState，读 desk.<panel>
//   开/关/定位自己（**只读 desk + 裸 DOM 操作，不回写 desk**）。
function applyEditorStateToUI(): void { window.dispatchEvent(new CustomEvent("wp:applyEditorState")); }
function restoreEditorStateFromOra(loaded: LoadedDoc) {
  const ws = loaded?._weebpaintState as OraWeebpaintState | undefined;
  if (loaded?._referenceBlob) {
    // skipFit：ref 面板 open/位置/vp 由 desk.refPanel 经 wp:applyEditorState 恢复；bitmap 异步载入不覆盖已载入 vp。
    createImageBitmap(loaded._referenceBlob).then((bitmap: ImageBitmap) => {
      referenceWindow.setBitmap?.(bitmap, { persistBlob: loaded._referenceBlob, skipFit: true });
    }).catch(() => {});
  }
  if (ws?.color) setBrushColor(ws.color);   // 存档笔刷色写笔刷不写 target——fill 期载图曾被吞进 PendingFill 蒸发（v0.9.11）
  if (ws?.palette) { try { paletteWindow.applySerializedState(ws.palette); } catch (_) {} }
  // 旧轨（webpaint/state.json）：灌**全部**工具的 dial（eraser/filterBrush 只在这一轨；见 storeEditorStateToOra 的双轨注）。
  const savedToolStates = (ws?.toolStates && typeof ws.toolStates === "object") ? ws.toolStates : null;
  if (savedToolStates) {
    for (const tk of Object.keys(state.toolStates)) {
      const patch = serializedToolStatePatch(state.toolStates[tk], savedToolStates[tk]);
      if (patch) Object.assign(state.toolStates[tk], patch);
    }
  }
  applyBlenderSyncState(ws?.blender);   // checkboard 已迁 desk → 经 wp:applyEditorState 应用（settings-menu 订阅）
  if (ws?.activeId != null && wp2.layerTree!.setActive(ws.activeId!)) renderLayersPanel();
  else if (typeof ws?.activeLayerIndex === "number") {   // 兼容旧（扁平叶序 index）
    const leaf = flattenViewLeaves(doc.layers)[ws.activeLayerIndex!];
    if (leaf && wp2.layerTree!.setActive(leaf.id)) renderLayersPanel();
  }
  // 新轨（desk per-doc）：载入 .weebpaint/editor-state.json（缺失=老画作 → resetEditorState 已回默认）。
  //   **后手赢**：它会用 brushTool 覆盖 toolStates.brush + color。
  if (loaded._editorState != null) desk.Unserialize(loaded._editorState);
  // T5（v0.8.21）：旧轨停写后三样的新家（desk 后手赢——覆盖上面旧轨灌的值；存量老 .ora 无这三组 = null 跳过）。
  if (loaded._editorState != null) {
    const dials = desk.toolDials;
    if (dials && typeof dials === "object") {
      for (const tk of Object.keys(state.toolStates)) {
        const patch = serializedToolStatePatch(state.toolStates[tk], (dials as Record<string, unknown>)[tk]);
        if (patch) Object.assign(state.toolStates[tk], patch);
      }
    }
    if (desk.palette != null) { try { paletteWindow.applySerializedState(desk.palette); } catch (_) {} }
    if (desk.blender != null) applyBlenderSyncState(desk.blender);
  }
  // ⚠ applyToolState 必须排在 **Unserialize 之后**（v409 修）：它按 toolStates 的 activeBrushId 应用笔架，
  //   而新轨刚覆盖过那个值。v407-v408 把它放在 Unserialize 之前 —— 只因两轨由同一次 _buildOraMeta 同刻写出、
  //   值必然相同才没暴露，是"靠巧合正确"。任一轨的兼容映射漂移（serializedToolStatePatch 的 v98 逻辑只作用于
  //   旧轨）就会让笔架和 dial 不一致，且无任何报错。
  if (savedToolStates || loaded._editorState != null) rack.applyToolState(editMode.current());
}
function _buildOraMeta() {
  // 存前把运行时 board 视口 + checkboard 观感开关镜像进 desk（**不标脏**，见 syncRuntimeForSave 注）。
  desk.syncRuntimeForSave(
    { tx: board.viewport.tx, ty: board.viewport.ty, scale: board.viewport.scale, rot: board.viewport.rot },
    state.checkerboard,
    { toolDials: state.toolStates, palette: paletteWindow.getSerializedState(), blender: getBlenderSyncState() },
  );
  return { referenceImage: referenceWindow.getPersistBlob?.() ?? undefined, desk: desk.Serialize() };
}
// S8（spec:41 存档一致性）：encode 前**同步**冻结 {结构 + 每叶 tile 快照}（零拷贝），bytes 与 peek
//   读同一冻结视图 → encode 的 await 间隙里任何编辑（描边 commit / 层结构操作）都不撕存档，
//   且不阻塞用户（tile 不可变 ⇒ 后续编辑全是 CoW 新 tile）。达意实现 spec「保存阻塞锁写不锁读」，
//   比字面锁更强——待追认（S8 报告拍板清单）。
async function _encodeCurrentOraWithPeek(): Promise<{ bytes: Blob; peek: Blob | null }> {
  // merged（GL 合成字节，C3 全字节管线）与 freeze 在**同一同步刻**取自活 doc → mergedimage/缩略图/
  //   层数据三者一致。GL 不可用（context lost 中的 autosave）→ merged=null：ora 用透明占位、
  //   peek 省略——层数据照常落盘。
  const merged = renderNodesToBytes(doc.layers, doc.width, doc.height);
  // v2 冻结形（T3b-2）：exportData 当场拷出全部字节（同步刻，与 merged 同源一致）→ 编码期任何
  //   编辑都追不进快照；无句柄、无 dispose。paintingDataToEncodeDoc 只是纯切片视图。
  const frozen = paintingDataToEncodeDoc(wp2.exportData());
  const meta = _buildOraMeta();
  // timelapse：drain 运动帧 + 用**同一份 merged** 现编尾帧（与 mergedimage 同刻同源；merged=null → 冻结 passthrough）。
  //   在 frozen 之后 await——层快照已同步冻结，录像编码的 await 间隙不撕存档。自愈在内，绝不 throw。
  const timelapse = await timelapseForSave(merged);
  const bytes = await encodeDocToOra(frozen, { ...meta, mergedBytes: merged, wroteWith: WEEBPAINT_VERSION, timelapse }) as Blob;
  const peek = merged ? await thumbBlobFromBytes(merged, 256) : null;
  return { bytes, peek };
}

// ---- blank-unnamed 自检 ----
function _docIsBlankUnnamed() {
  if (_isLazyBlankSession) {
    for (const L of flattenViewLeaves(doc.layers)) if (L.bboxW > 0 && L.bboxH > 0) { _isLazyBlankSession = false; _recomputePhase(); return false; }
    return true;
  }
  if (_activeName() && _activeName() !== t("nd.untitled")) return false;
  for (const L of flattenViewLeaves(doc.layers)) if (L.bboxW > 0 && L.bboxH > 0) return false;
  return true;
}

// ============ ora editor 适配器 + editor-session ============
// 适配器：把画图引擎（doc/board）包成 editor-session 要的 adopt/encode/onChange。editor-session 不懂 ora。
let es: EditorSession;

// adoptModel：把解出的 doc 渲进画布（模型 + UI + 编辑器状态 + 版本降级检测）。**不碰 name/es/checkpoint**。
function adoptModel(loaded: LoadedDoc) {
  _loadingDoc = true;
  try {
    timelapseDetach();          // 串扰墙：换文档期间的 histchange（clearHistory/load）不得进旧录像
    input.clearHistory();       // 先清：弃开着的令牌 + drop floats + lasso 取消（load 要开新令牌）
    wp2.load(loaded.data);      // 令牌灌入 + 清栈 + markSaved（docRaw/adoptState 的后继，ADR-0008 §3）
    doc.clearSelectionOnLoad(); // 跨 session 不沿用选区（旧 adoptState 语义）
    resetEditorState();
    els.canvasSizeLabel.textContent = `${doc.width}×${doc.height}`;
    board.invalidateAll(); board.requestRender(); renderLayersPanel();
    // 版本降级检测：写这画的 WeebPaint 版本 > 当前，或 .ora 私有扩展 schema（weebpaint:format）
    // 比本版认识的新 → 警告（守卫 saveNow/saveAndPush 覆盖）。
    _loadedDocIsNewer = false; _loadedDocNewerConfirmed = false;
    const writerN = parseAppVersion(loaded._wroteWith), selfN = parseAppVersion(WEEBPAINT_VERSION);
    if ((writerN !== null && selfN !== null && writerN > selfN) || (loaded._formatVersion ?? 0) > ORA_FORMAT_VERSION) {
      _loadedDocIsNewer = true; _loadedDocWriterVer = loaded._wroteWith ?? null;
      setStatus(t("ss.docNewerWarning", { writer: String(loaded._wroteWith), version: WEEBPAINT_VERSION }), true);
    } else { _loadedDocWriterVer = null; }
    updateNewerBanner();
    restoreEditorStateFromOra(loaded);
    const vp = desk.viewport;   // 视口从 desk（.weebpaint/editor-state.json）回灌 board
    // #27：必须经 setViewport（scale 夹取 + _clampPan），不许 Object.assign 裸灌——大屏存的
    // viewport 换小屏/旋转后画布整体落屏外，且交互 pan 夹取之外没有任何路径能把它拉回。
    if (vp && typeof vp.scale === "number") {
      board.setViewport(vp.tx ?? 0, vp.ty ?? 0, vp.scale, typeof vp.rot === "number" ? vp.rot : undefined);
      board.invalidateAll();
    } else {
      // #26：没存过视口（新建 / 新设备首开）→ fit 到合适倍率（小画布 snap 整数倍），
      //   而不是沿用上一幅画留下的视口。
      board.fitToScreen();
    }
    applyEditorStateToUI();   // desk：Unserialize 后把面板/checkboard 回灌 UI（各模块订阅 wp:applyEditorState）
    timelapseAdopt(loaded);   // 录制态从 ora sidecar 回读（per-doc sticky；回读失败自愈=作废+info）
  } finally { _loadingDoc = false; _lastInputAt = Date.now(); }   // 换 doc = 坐下时钟归零（防跨 doc 误判新坐下）
}

// ── adopt 的两个意图，显式拆开（v415）────────────────────────────────────────────────────
// 以前只有一个 adoptLoadedDoc + 一个**被完全忽略**的 opts（adoptLoadedDocWithOpts 的 _opts 没人读），
// 两个语义相反的调用方共用它：
//   · 外部 import 一个 .ora  = **新身份**，首存必须 mode:"new"（撞名不覆盖）
//   · revert 回滚            = **既有身份**，首存 mode:"existing"（就是要写回原文件）
// 结果 import 走了 existing → **导入同名 .ora 会静默覆盖已有作品**（活的数据丢失）。
// 拆成两个函数后，意图写在名字里，调用方不可能选错。

/** 外部导入：装入一个解好的 doc，作为**新身份**。首存 mode:"new"（撞名抛，不静默覆盖）。 */
function adoptAsNew(loaded: LoadedDoc, name: string) {
  _adoptCommon(loaded, name, { create: true });
  // ⚠ 这里**刻意不封 checkpoint**：此刻这个新身份在磁盘上还没有任何字节
  //   （es.adopted 只是标脏，首存要等 autosave / Ctrl+S / 退出），
  //   _captureCheckpoint 取 at-rest 字节会拿到 null 而静默跳过 —— 那是个恒 no-op 的假动作。
  //   导入件的快照在它下一次从图库被打开时封（那时字节已在）。要改成"导入即封"得先 await 一次保存，
  //   属于行为变更，攒着 escalate，不在清理批里夹带。
}
/** A1（user 2026-08-28 拍板 a）：挂库成功后，开着的 transient 画自动安家进新图库——
 *  「有库时新画自动创建身份」既有拍板的延伸：连接图库的手势就是安家意图，不再问。
 *  file 家不动（已有家）；无开画/gallery 家 = no-op。返回新身份名（null = 无事可做）。 */
async function adoptTransientIntoGallery(): Promise<string | null> {
  if (session.home?.kind !== "transient") return null;
  let name = galleryDefaultName();
  for (let i = 0; i < 3 && (await sessionNameConflict(name)); i++) name = galleryDefaultName();   // hex4 撞名重铸（首存 mode:"new" 仍兜底）
  es.adopted(toFull(name), { create: true });   // es 接管：标脏 + 首存走 mode:"new"（撞名不静默覆盖）
  _esRebound();
  _dropLuggage();                               // transient 行李牌焚（同 saveAs 收编姿势）
  _transientName = null;
  _setActive(name);                             // home→gallery + 锁 + 回执条
  _isLazyBlankSession = false; _recomputePhase();
  updateSaveStatus();
  await saveNow();                              // 首存落盘（tryPush best-effort）
  void _captureCheckpoint(name, "new-doc");
  return name;
}

/** revert 回滚：装入一个解好的 doc，身份**不变**（首存 mode:"existing"，就是要写回原文件）。
 *  **不封存 checkpoint** —— 否则刚回滚掉的状态立刻把快照覆盖了，只能 revert 一次。 */
function adoptAsExisting(loaded: LoadedDoc, name: string) {
  _adoptCommon(loaded, name, {});
}
function _adoptCommon(loaded: LoadedDoc, name: string, opts: { create?: boolean }) {
  if (_fileHome()) { _homeAuth.setHome(null); _dropLuggage(); }   // 同步入口无法弹确认——调用方（import-image 的 .ora 分支）已过 leaveLocalDoc 门
  adoptModel(loaded);
  _setActive(name); _isLazyBlankSession = false; _recomputePhase();
  es.adopted(toFull(name), opts);
  _esRebound();
  updateSaveStatus(); _refreshEncrypted();
}

// ---- checkpoint / revert（v415 重接；prod 有、dev 在 store cutover 删 _store.seal 后成了 stub）----
// 落盘 = app 自己的 weebpaint 库的 checkpoints store；策略（key/何时封/加密怎么办）在纯模块 checkpoint-policy.ts。
/** ring 落盘共用段（P4 revert v2）：淘汰计划（字节预算，最旧先走）→ 删 → 写新档。
 *  docKey = 户口全名（gallery）或行李牌 tag（file 家，session 级）。 */
async function _ringCapture(docKey: string, trigger: CheckpointTrigger, bytes: Blob, encrypted: boolean): Promise<void> {
  const all = await ringAll();
  const budget = ringBudget(typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches);
  await ringDelete(planRingEviction(all, bytes.size, budget));
  const at = Date.now();
  await ringPut({ id: mintRingId(at), docKey, trigger, at, size: bytes.size, encrypted, bytes });
}
/** 封存 gallery 家快照（at-rest 字节）。fire-and-forget：**绝不阻塞开画**，失败只 log。
 *  加密作品存**密文容器**字节（getEncryptedBlob）——绝不退化成 encodeDocToOra 的明文（红线）。 */
async function _captureCheckpoint(name: string, trigger: CheckpointTrigger) {
  if (!shouldCapture(trigger)) return;
  try {
    const f = _file(name);
    const cipher = await f.getEncryptedBlob();          // 加密件 → at-rest 密文；明文件 → null
    const bytes: Blob | null = cipher ?? await f.open();   // 明文件取当前 at-rest 明文字节
    if (!bytes) return;                                 // 没字节可封（纯云端未缓存 / 锁定）→ 静默跳过
    await _ringCapture(toFull(name), trigger, bytes, cipher != null);
  } catch (e) { reportError(new Error("[checkpoint] capture failed (open unaffected): " + String(e)), "log"); }
}
/** 当前 doc 的 revert 列表（新→旧）。gallery 家按户口、file 家按行李牌；
 *  ring 空且 gallery 家 → legacy v1 单槽兜底（升级窗口期已开着的画还能「回到打开时」）。 */
async function _listCheckpoints(): Promise<RingEntryMeta[]> {
  try {
    const name = _activeName();
    const docKey = name ? toFull(name) : (_fileHome() && _luggageTag ? _luggageTag : null);
    if (!docKey) return [];
    const mine = (await ringAll()).filter((r) => r.docKey === docKey)
      .map(({ id, docKey: k, trigger, at, size, encrypted }) => ({ id, docKey: k, trigger, at, size, encrypted }))
      .sort((a, b) => b.at - a.at);
    if (mine.length || !name) return mine;
    const legacy = await getCheckpoint(checkpointKey(toFull(name)));
    return legacy ? [{ id: "legacy", docKey, trigger: "gallery-open", at: legacy.at, size: legacy.bytes?.size ?? 0, encrypted: legacy.encrypted }] : [];
  } catch (e) { reportError(new Error("[checkpoint] list failed: " + String(e)), "log"); return []; }
}
/** 按 id 读回一档。加密的先解壳（内存密码；锁定/错密码 → null 由调用方提示要密码）。 */
async function _readCheckpointEntry(id: string): Promise<{ blob: Blob; at: number } | null> {
  try {
    const name = _activeName();
    const rec = id === "legacy"
      ? (name ? await getCheckpoint(checkpointKey(toFull(name))) : null)
      : await ringGet(id);
    if (!rec || !rec.bytes) return null;
    if (!rec.encrypted) return { blob: rec.bytes, at: rec.at };
    if (!name) return null;                              // 加密档只可能是 gallery 家（file 家原位=明文件）
    const pw = getPassword(name);
    if (!pw) return null;                                // 锁定 → 调用方提示「需要密码」
    const plain = await appEncryption.tryDecryptEncryptedBlob(rec.bytes, pw);
    return plain ? { blob: plain, at: rec.at } : null;
  } catch (e) { reportError(new Error("[checkpoint] read failed: " + String(e)), "log"); return null; }
}
/** undo revert（拍板：revert 前自动拍当前态一档）。gallery 家：先 flush 再取 at-rest（加密=密文，红线安全）；
 *  file 家：live encode 直接进 ring（明文件；**不写用户磁盘**——写回是显式动作，pre-revert 不是）。 */
async function capturePreRevert(): Promise<void> {
  const name = _activeName();
  if (name) { await saveNow(); await _captureCheckpoint(name, "pre-revert"); return; }
  const fh = _fileHome();
  if (fh && _luggageTag) {
    const { bytes } = await _encodeCurrentOraWithPeek();
    await _ringCapture(_luggageTag, "pre-revert", bytes, false);
  }
}
/** 作品被删/改名 → 丢掉它的快照（legacy 单槽 + 整份 ring；按 docKey 精确清）。 */
async function _dropCheckpoint(name: string) {
  try {
    await deleteCheckpoint(checkpointKey(toFull(name)));
    await ringDeleteByDoc(toFull(name));
  } catch (e) { reportError(new Error("[checkpoint] cleanup failed: " + String(e)), "log"); }
}

// 显式保存前收口 pending 状态（QA 2026-08-21 像素图标事故）：fill 预览是第一类持久工具、不在
//   transient 轴上——此前**任何**保存路径都不 commit 它，「填色→保存」= 填色蒸发；且 Ctrl+S 一路
//   （saveAndPush）连 transient 都不 apply——浮层变换挂着时会把挖了洞的源层存出去。
//   只挂**显式**保存/退出：implicit（autosave / pagehide / beforeunload 偷存）保持 interrupt=cancel
//   语义，不背着用户 commit。换文档（open/new/导入）不走这里——走 _gateFillOnSwitch 挽留门
//   （user 2026-08-21，supersede 旧「切换=丢弃」拍板）。commitFillNow 预览没挂着时是 no-op。
function _applyPendingForExplicitSave() {
  if (editMode.hasPendingTransient()) editMode.applyPendingTransient();
  commitFillNow();
}

// ---- 显式换文档挽留门（user 2026-08-21：「换文档如果走丢弃，文案里要有提示，而且要弹窗挽留」）----
// 三选 sheet：应用并继续（commitFillNow 后走原流程）/ 丢弃并继续（原行为）/ 取消（中止切换，留在当前画）。
// 分支逻辑在 fill-mode.gateFillOnDocSwitch（node 可测），这里只组装 UI sheet。必须在 withBusy 外调
// （sheets 的 busy 内弹窗守卫会 throw）；且排在「保存旧 doc」之前——apply 分支 commit 的像素要搭原有
// `if (es.isDirty()) await saveNow()` 的车落盘。
//
// 浮层变换（hasFloating）**核实后不进这门**（2026-08-21 核实，别凭直觉补）：
//   ① float 只存在于 enterTransient("transform", { apply: _commitTransform }) 括号内——全部 4 个 lift
//      调用点（toolbar 变换按钮 / selection-ops Ctrl+D / import-image 导入为图层 / 粘贴越界直取）都成对进 transient；
//   ② lift 本身是令牌整点 → wp:histchange → es 必脏，且 autosave 被 isMidOperation（app.ts:321，含
//      hasFloating）挡着不会中途洗净；
//   ③ 于是 openItem/newDoc/openLocalFile 的 `if (es.isDirty()) await saveNow()`（显式、非 implicit）必然
//      走进 saveNow 的 applyPendingTransient（v0.10.15 起）→ 浮层被**自动应用**落盘，不丢、无需挽留。
//   已知例外：blur/pagehide 的崩溃 flush（es.start 的 persist(false)）会在浮层挂着时洗净 dirty——那是
//   crash-safety 语义（interrupt=cancel），不归此门管；fill 无此豁免正因为它连 saveNow 都不收口。
async function _gateFillOnSwitch(): Promise<boolean> {
  return gateFillOnDocSwitch(() =>
    openChoiceSheet<"apply" | "discard">(t("ss.fillPendingTitle"), t("ss.fillPendingMsg"), [
      { label: t("ss.fillPendingApply"), value: "apply", primary: true },
      { label: t("ss.fillPendingDiscard"), value: "discard" },
    ]));
}

// ---- 保存（本地）----
async function saveNow(opts: { implicit?: boolean; commitPending?: boolean } = {}) {
  // 保存 = 送回家（P1 2026-08-26）：按家派发，表 = doc-home.saveRoute（矩阵契约测试钉）。
  //   file+implicit=noop：静默写用户磁盘文件违背 Windows 文件语义（Alt+F4 = 不保存，human 拍板）。
  const route = saveRoute(docHome(), opts);
  if (route === "noop") return;
  if (route === "file-writeback") { await saveLocalFileNow(); return; }
  if (route === "settle") {   // transient 显式保存 = 安家仪式（P2）；空白不弹 picker（没内容可安）
    if (!_docIsBlankUnnamed()) await settleToFile(); else setStatus(t("ss.blankNothingToSave"));
    return;
  }
  if (!_activeName()) return;   // gallery 家恒有名；防御保持旧守卫
  if (_docIsBlankUnnamed()) return;
  if (editMode.hasPendingTransient()) { if (opts.implicit) return; editMode.applyPendingTransient(); }
  if (opts.commitPending && !opts.implicit) commitFillNow();   // 显式保存入口（Ctrl+Shift+S 等）自带收口
  if (_loadedDocIsNewer && !_loadedDocNewerConfirmed) {
    if (opts.implicit) return;
    const ok = await openConfirmSheet(t("ss.overwriteNewerTitle"), t("ss.overwriteNewerMsg", { writer: String(_loadedDocWriterVer), version: WEEBPAINT_VERSION }));
    if (!ok) { setStatus(t("ss.saveCancelled")); return; }
    _loadedDocNewerConfirmed = true; updateNewerBanner();
  }
  updateSaveStatus();
  try {
    await es.flushLocal();   // encode（+peek）→ store.file.save({tryPush:false})；只落本地（consent-safe）
                             // desk 不进 need：内容脏时顺手被 _buildOraMeta 捞走，不自己驱动落盘（v409）
    setStatus(t("ss.saved", { name: _activeName() ?? "" }));
    checkQuotaAndWarn();
  } catch (e) { reportError(new Error("[session] save failed: " + String(e)), "log"); setStatus(t("ss.saveFailed", { error: errMsg(e) })); }
  finally { updateSaveStatus(); }
}

// ---- 保存 + 推云（consent push）----
// v0.5.9（user）：保存/推送在飞标志——纯 app 层内存态，不碰 store 契约。
//   没有它，保存瞬间 dirty 已翻 false、pushPending 还挂着 → 徽章闪「问号虚云」（unpushed 终态），语义不对。
let _pushInFlight = false;
async function saveAndPush() {
  if (_fileHome()) { await saveLocalFileNow(); return; }   // file 家：Ctrl+S/save 按钮 = 写回文件（无云腿；= saveRoute 的 file-writeback）
  // 空白守卫先行（lazyblank / 空白 transient）：es 未绑或无内容——不拦的话 lazyblank 会谎报
  //   「已同步 <名>」（煤气灯）、空白 transient 会弹一个没内容的另存框。首笔后守卫自动失效。
  if (_docIsBlankUnnamed()) { setStatus(t("ss.blankNothingToSave")); return; }
  if (_localHomeKind() === "transient") { await settleToFile(); return; }   // transient：保存 = 安家仪式（P2）
  const name = _activeName();
  if (!name) { setStatus(t("ss.noDocCannotSave"), true); return; }
  _applyPendingForExplicitSave();   // Ctrl+S/save 按钮 = 显式保存：fill 预览 commit + transient apply（QA 2026-08-21）
  // 版本降级守卫：新版本文档未确认 → 只本地不推（saveNow 的 confirm 已挡本地覆盖，这里挡推）。
  if (_loadedDocIsNewer && !_loadedDocNewerConfirmed) {
    await saveNow();
    if (!_loadedDocNewerConfirmed) { setStatus(t("ss.notPushedNewer"), true); return; }
  }
  _pushInFlight = true;
  updateSaveStatus();
  try {
    // v409：用户**显式**按 save → forceSaveAndPush 无条件 encode+推，不脏也动。
    //   理由（user 2026-07-14）：「至少可以改时间戳，不然用户点了 save 看到时间戳没动会觉得坏了」。
    //   顺带把当前 desk 捞进 ora（_buildOraMeta → syncRuntimeForSave + Serialize）。
    //   冲突/错误经 store 的 ui bundle surface。
    await es.forceSaveAndPush();
    // 别无条件报「已同步」：push 失败在 store 内部被 catch 成 banner，这里**不会**抛。
    //   唯一可靠的判据是 es.isPushPending()（v433）——它是 save() 返回的 pushed 一路带上来的。
    setStatus(!isSignedIn() ? t("ss.savedLocalIdb", { name })
      : es.isPushPending() ? t("ss.savedNotPushed", { name })
      : t("ss.synced", { name }));
    gallery.refresh();
  } catch (e) { reportError(new Error("[cloud] push failed: " + String(e)), "log"); setStatus(t("ss.pushFailed", { error: errMsg(e) })); }
  finally { _pushInFlight = false; updateSaveStatus(); }
}

// ---- 加密 / 解除（对活动 doc；at-rest 字节换容器，内存态透明不动）----
async function encryptCurrent() {
  const name = _activeName();   // 快照一次（TS 无法跨调用窄化；语义同旧局部变量读法）
  if (!name || _isLazyBlankSession) { setStatus(t("ss.openOrSaveBeforeEncrypt"), true); return; }
  const online = () => isSignedIn() && navigator.onLine !== false;
  if (await _file(name).isEncrypted()) { setStatus(t("ss.alreadyEncrypted")); return; }
  const pw = await ensureNewPassword();
  if (pw == null) { setStatus(t("ss.cancelled")); return; }
  setPassword(pw);
  await withBusy(t("ss.encryptingBusy", { name }), async () => {
    try {
      await saveNow();   // flush 活 doc 明文 → store 读它打包
      const res = await _file(name).encrypt({ isOnline: online });
      if (res.status === "offline") { setStatus(t("ss.encryptNeedsOnline"), true); return; }
      if (res.status === "already") { setStatus(t("ss.alreadyEncrypted")); return; }
      await _refreshEncrypted(); updateSaveStatus();
      setStatus(res.status === "cloud-deferred" ? t("ss.encryptedDeferred", { name }) : t("ss.encrypted", { name }), res.status === "cloud-deferred");
      gallery?.invalidateEncrypted?.(name);   // #11：清图库锁态缓存（refresh 不清，probe 有缓存守卫）
      gallery?.refresh?.();
    } catch (e) { setStatus(t("ss.encryptFailed", { error: errMsg(e) }), true); }
  });
}
async function decryptCurrent() {
  const name = _activeName();
  if (!name) { setStatus(t("ss.noDocOpen"), true); return; }
  const online = () => isSignedIn() && navigator.onLine !== false;
  if (!(await _file(name).isEncrypted())) { setStatus(t("ss.notEncrypted")); return; }
  const ok = await openConfirmSheet(t("ss.decryptConfirmTitle"), t("ss.decryptConfirmMsg"));
  if (!ok) return;
  if (!(await ensureUnlocked(name))) { setStatus(t("ss.cancelledNeedPassword"), true); return; }
  await withBusy(t("ss.decryptingBusy", { name }), async () => {
    try {
      await saveNow();
      const res = await _file(name).decrypt({ isOnline: online });
      if (res.status === "offline") { setStatus(t("ss.decryptNeedsOnline"), true); return; }
      if (res.status === "locked") { setStatus(t("ss.cancelledNeedPassword"), true); return; }
      if (res.status === "not-encrypted") { setStatus(t("ss.notEncrypted")); return; }
      await _refreshEncrypted(); updateSaveStatus();
      setStatus(t("ss.decrypted", { name }));
      gallery?.invalidateEncrypted?.(name);   // #11：解除加密后小锁图标不清的病根——缓存守卫跳过已探项
      gallery?.refresh?.();
    } catch (e) { setStatus(t("ss.decryptFailed", { error: errMsg(e) }), true); }
  });
}

// ---- rename（UI 循环 + es.rename）----
async function renameCurrentSession({ suggested, reason }: { suggested?: string; reason?: string } = {}) {
  if (_fileHome()) { setStatus(t("lf.renameNotSupported"), true); return; }   // 无地：改名=文件系统操作，v1 不做（另存为可收编入库）
  editMode.applyPendingTransient();
  const oldName = _activeName()!;
  let candidate = suggested || oldName;
  let note = "";
  while (true) {
    const title = note ? t("ss.renameTitleWith", { detail: note }) : (reason ? t("ss.renameTitleWith", { detail: reason }) : t("ss.renameTitle"));
    const input2 = await openInputSheet(title, candidate, { placeholder: t("ss.artworkNamePlaceholder") });
    if (input2 === null) return null;
    const trimmed = input2.trim();
    if (!trimmed) { note = t("ss.nameCannotBeEmpty"); candidate = ""; continue; }
    if (trimmed === oldName) return oldName;
    const outcome: { conflict?: boolean; ok?: boolean } = await withBusy(t("ss.renamingBusy", { oldName, newName: trimmed }), async () => {
      try {
        const r = await es.rename(toFull(trimmed));   // es 先 flushLocal 旧内容 → store.tryMove（唯一入口，含占用检查）；边界转全名
        if (!r.ok) return { conflict: true };  // 目标占用（local/cloud）→ 循环重问；未改 _name
        // 改名 = 换身份 → 旧 key 的快照丢掉（不搬：搬要连密文一起复制，而"改名丢一次快照"是诚实的小代价）。
        void _dropCheckpoint(oldName);
        _setActive(trimmed); _recomputePhase();
        updateSaveStatus();
        // 别再无条件报「已重命名（含云端）」：store 现在会透出旧名到底怎么了。
        //   oldKept   谱系不明 → 改名降级为「另存」，云端旧名**原地留着** → 必须说清楚，否则用户以为旧的没了
        //   cloudDeferred 云端没推成 → 新名只在本地
        //   oldCloudOrphan 旧名进回收站失败 → 云端留了个孤儿
        if (r.cloudDeferred) setStatus(t("ss.renamedLocalOnly", { oldName, newName: trimmed }), true);
        else if (r.oldKept) setStatus(t("ss.renamedOldKept", { oldName, newName: trimmed }), true);
        else if (r.oldUnknown) setStatus(t("ss.renamedOldUnknown", { oldName, newName: trimmed }), true);
        else if (r.oldCloudOrphan) setStatus(t("ss.renamedOldOrphan", { oldName, newName: trimmed }), true);
        else setStatus(t("ss.renamedWithCloud", { oldName, newName: trimmed }));
        gallery.refresh();
        return { ok: true };
      } catch (e) { setStatus(t("ss.renameFailed", { error: errMsg(e) })); return {}; }
    });
    if (outcome.conflict) { setStatus(t("ss.localNameTakenStatus", { name: trimmed }), true); note = t("ss.nameTakenNote", { name: trimmed }); candidate = trimmed; continue; }
    return outcome.ok ? trimmed : null;
  }
}

// ---- 退出到图库（推 + 保存失败重试环）----
async function exitCanvasToGallery() {
  // 显式离开编辑场景：pending 先收口再落盘（QA 2026-08-21——此前 exit 是先 flushAndPush 再等
  //   setGalleryOpen 里 apply transient：浮层挖洞的半成品先被推上了云）。
  _applyPendingForExplicitSave();
  if (!(await leaveLocalDoc())) return;   // 无地且脏 → 问；取消 = 留在画布
  const name = _activeName();
  if (name) {
    // v409（D-Q6）：退出**只有内容脏/push-pending 才推**；只改 desk（无像素编辑）→ 不推不落本地，
    //   下次开 revert 到上次保存的快照。user 2026-07-14：「退出应该只有 contentdirty 才强制推云，workspace dirty 可抛」。
    await withBusy(t("ss.savingBusy", { name }), async () => {
      try { await es.flushAndPush(); } catch (e) { reportError(new Error("[exit] save failed: " + String(e)), "log"); }
    });
    // 内存脏没落成（保存失败/取消）→ 显式问重试/丢弃，绝不无条件宣布干净（K2 红线）。
    while (es.isDirty() && !_docIsBlankUnnamed()) {
      const choice = await lockSyncGate({
        title: t("ss.localSaveIncompleteTitle"), message: t("ss.localSaveIncompleteMsg", { name }), showSpinner: false,
        actions: [{ label: t("ss.retrySave"), value: "retry", primary: true }, { label: t("ss.exitDiscard"), value: "discard" }],
      });
      if (choice !== "retry") break;
      await withBusy(t("ss.savingBusy", { name }), async () => { try { await es.flushAndPush(); } catch (e) { reportError(new Error("[exit] retry failed: " + String(e)), "log"); } });
    }
    gallery.setFolder(pathFolder(name));
  }
  _setActive(null); _recomputePhase();
  _enc.encrypted = false; _isLazyBlankSession = false; updateSaveStatus();
  await setGalleryOpen(true);
}

// ---- 新建 doc ----
// layer0Pixels（导入图片/剪贴板为新文档）：整幅 RGBA（w*h*4），经 wp2.load 的 pixels 正门灌入
//   （令牌+suspend，不入 undo）。旧 fillLayer0 回调已废（v0.9.33）：它在 load **之后**裸写像素，
//   C7 焊死「留给 load 灌入」的静默口后就是违章（真机 LayerTiles tokenless throw，云盘导入首暴）。
// 返 boolean（v0.9.35，QA 2）：false = 没建（无地脏离开确认被取消）——调用方**必须看**，别在
//   取消路径照报「已新建」（谎报）。
async function newDoc({ name, w, h, layer0Name, layer0Pixels }: { name: string; w: number; h: number; layer0Name?: string; layer0Pixels?: Uint8ClampedArray }): Promise<boolean> {
  if (!(await _gateFillOnSwitch())) return false;   // 挽留门：fill 预览挂着 → 应用/丢弃/取消（user 2026-08-21）
  if (!(await leaveLocalDoc())) return false;   // 无地且脏 → 问；取消 = 不新建
  if (es.isDirty()) await saveNow();
  // 新 doc = 本版现写：清掉**旧 doc** 残留的「新版本写的」旗标（adoptModel 才复位它，newDoc 路径
  //   此前不清 → 下面 busy 内的 saveNow 会为一张全新的画弹「覆盖新版本文档」确认 —— 旗标跨 doc 泄漏，
  //   同时也是 sheets 的 busy 内弹窗守卫炸点）。
  _loadedDocIsNewer = false; _loadedDocNewerConfirmed = false; updateNewerBanner();
  // busy 普查（v0.10.3）：load 灌入 + 首存 encode 是重活（照片导入的 layer0Pixels 是整幅位图）；
  //   交互门（上面的无地确认/脏保存）已过，此段无 sheet。
  return await withBusy(t("ss.creatingDocBusy", { name }), async () => {
    timelapseDetach();   // 新建=新身份：旧录像绝不跟过来（per-doc 串扰墙）
    input.clearHistory();
    wp2.load({
      width: w, height: h,
      nodes: [{ name: layer0Name ?? `${tLatin("doc.layerName")} 1`, visible: true, opacity: 1, mode: "source-over", clippingMask: false, lockAlpha: false,
        pixels: layer0Pixels ? { rect: { x: 0, y: 0, w, h }, bytes: layer0Pixels } : null }],
    });
    doc.clearSelectionOnLoad();
    els.canvasSizeLabel.textContent = `${w}×${h}`;
    _setActive(name); _recomputePhase();
    _enc.encrypted = false; board.invalidateAll(); board.fitToScreen(); renderLayersPanel();
    resetEditorState();
    applyEditorStateToUI();   // desk：新建 → 面板回默认（关）
    timelapseAdopt({});       // 新文档 = 健康空录制态（默认关；可在这张画上开录）
    es.adopted(toFull(name), { create: true });   // 新建画布/import：es 记为当前 + 脏；首存 mode:"new"（撞名不静默覆盖）。边界转全名。
    _esRebound();
    updateSaveStatus();
    await saveNow();   // 落盘（tryPush:false；撞名 → saveNow try/catch surface）
    void _captureCheckpoint(name, "new-doc");   // 空白态封一份 → revert = 回到刚新建的样子
    setGalleryOpen(false);
    return true;
  });
}

/** 无库「新建」（#22 打扫屋子 2026-08-28）：transient 家新画布（选定尺寸；不上户口不落盘——
 *  doodle consent transient 拍板；T-crash 盲快照 + 三键挽留照常护；es 在无库本就 inert 不换绑）。 */
async function newTransientDoc({ w, h }: { w: number; h: number }): Promise<boolean> {
  if (!(await _gateFillOnSwitch())) return false;
  if (!(await leaveLocalDoc())) return false;   // 当前 transient/file 家脏 → 三键挽留；取消 = 不新建
  _loadedDocIsNewer = false; _loadedDocNewerConfirmed = false; updateNewerBanner();
  return await withBusy(t("ss.creatingDocBusy", { name: t("nd.untitled") }), async () => {
    timelapseDetach();
    input.clearHistory();
    wp2.load({
      width: w, height: h,
      nodes: [{ name: `${tLatin("doc.layerName")} 1`, visible: true, opacity: 1, mode: "source-over", clippingMask: false, lockAlpha: false, pixels: null }],
    });
    doc.clearSelectionOnLoad();
    els.canvasSizeLabel.textContent = `${w}×${h}`;
    beginTransientBlank();
    board.invalidateAll(); board.fitToScreen(); renderLayersPanel();
    resetEditorState();
    applyEditorStateToUI();
    timelapseAdopt({});
    updateSaveStatus();
    setGalleryOpen(false);
    return true;
  });
}

// pullCloudPath 已删（v415）：零调用者。打开云端项走 openItem —— es.open → store.file.open，
//   本地没有就自动拉云落本地，同一条路径同时覆盖本地项和纯云端项，不需要第二个平行入口。

// ---- 打开图库 item ----
async function openItem(item: GalleryItem) {
  if (item.name === _activeName()) { setGalleryOpen(false); return; }
  // 双实例互认（2026-08-21）：同画双开 = 本地字节互覆（store 层的修另行处理），入口拦住。
  //   警告 + 默认取消（openConfirmSheet 的 Esc/点背板都是取消），用户明确确认才继续。
  //   排在 leaveLocalDoc 之前：先警告再谈保存，取消时什么都没发生。
  if (await isDocLockedElsewhere(sessionBareName(item.name))) {
    if (!(await openConfirmSheet(t("ss.docLockedElsewhereTitle"), t("ss.docLockedElsewhereMsg", { name: item.name })))) return;
  }
  if (!(await _gateFillOnSwitch())) return;   // 挽留门：fill 预览挂着 → 应用/丢弃/取消（user 2026-08-21）
  if (!(await leaveLocalDoc())) return;   // 无地且脏 → 问；取消 = 不开
  if (es.isDirty()) await saveNow();
  // 开画顺带把 4 个 settings/state collection 拉云对齐（v409，user 2026-07-14：「开画作的时候可以顺便
  //   并行 pullandreconcile 下，fire and forget 不用 await」）。**绝不 await**：对齐是锦上添花，
  //   不该让开画等网络（且离线/local-only 内部本就 no-op）。
  pullSettingsAndState();

  try {
    // 加密且未解锁 → 先在 busy 外解锁（file.open 内部 unseal 要密码在内存）。
    if (await _file(item.name).isEncrypted()) {
      if (!(await ensureUnlocked(item.name))) { setStatus(t("ss.notOpenedNeedPasswordCancelled"), true); return; }
    }
    // ★ 返回值**必须**看（v417 修，优先级 1 = OneDrive 不丢画）：false = 字节没装进来
    //   （离线纯云端 / 文件锁定 / 本地副本没了）。旧版把它扔了，于是画布上还是**上一张画**、身份却换成了
    //   新名字、状态栏还报「已打开」——下次 autosave 就把上一张画的像素写进新身份，退出时推上 OneDrive
    //   覆盖掉目标那张画。es.open 现在失败即不改自身 _name，这里也必须不改活动名、留在图库。
    if (!(await es.open(toFull(item.name)))) { setStatus(t("ss.openFailed", { error: t("mi.lastNotFound", { name: item.name }) }), true); return; }
    _esRebound();
    _setActive(item.name); _isLazyBlankSession = false; _recomputePhase(); _refreshEncrypted();
    void _captureCheckpoint(item.name, "gallery-open");
    setGalleryOpen(false); setStatus(t("ss.opened", { name: item.name }));
  } catch (err) { setStatus(t("ss.openFailed", { error: errMsg(err) })); }
}

// ---- 图库「推到云」（非活动 item）：读本地字节 → 带 tryPush 重存（薄库无独立 push，re-save 触发推）----
async function pushItem(item: GalleryItem) {
  if (await _file(item.name).isEncrypted()) { if (!(await ensureUnlocked(item.name))) { setStatus(t("ss.notPushedNeedPassword"), true); return; } }
  await withBusy(t("ss.pushingToCloudBusy", { name: item.name }), async () => {
    try {
      const f = _file(item.name);
      const bytes = await f.open();
      if (!bytes) { setStatus(t("ss.notFound", { name: item.name })); return; }
      // 这个按钮的**全部意义**就是云端那条腿 —— 必须读 pushed（v436）。
      //   以前丢掉 SaveResult：离线 / 冲突面取消 / deferred 一律照报「已推送」。
      const res = await f.save(bytes, { tryPush: true });
      setStatus(res.pushed ? t("ss.pushed", { name: item.name }) : t("ss.pushNotDone", { name: item.name }), !res.pushed);
      gallery.refresh();
    } catch (err) { setStatus(t("ss.pushFailed", { error: errMsg(err) })); }
  });
}

// ---- 卸载本地副本（offload：清 shadow；非法=唯一副本→store 抛 OffloadIllegalError→banner）----
async function unloadItem(item: GalleryItem) {
  const isActive = item.name === _activeName();
  // ⚠ 顺序（v417 修）：**先退出画布（落盘+推云），再 offload**。反过来的后果是数据安全问题，不只是 badge 错：
  //   store 的 head dirty（head.isDirty，落盘才置）和 es 的**内容脏**（wp:histchange 驱动）是两个不同的东西
  //   —— 注意这里说的不是 desk/workspaceDirty，那个概念 v409 已撤销（editor-state.ts:117）。用户画了几笔但还没
  //   触发 autosave 时，head 仍是 clean —— offload 的「dirty 不驱逐」守卫看不见内存里的未保存编辑，于是
  //   一路放行把本地副本 hardDelete 掉。紧接着旧代码才调 exitCanvasToGallery，退出 flush 又把 doc 写回本地
  //   并 recordEdit 重新标脏；而 head.forget 刚清空谱系 → 这次 push 是 no-base → 409 → CloudNameCollisionError
  //   被 create-store 吞成 banner → dirty 永远清不掉 → item 钉死在「待推」而不是「云端 only」。
  //   先退出后 offload：head 此时才真实反映"还有没有未推字节"，守卫就能正常拦住（抛 OffloadIllegalError）。
  // ⚠ exitCanvasToGallery 必须在 withBusy **之外**调：它内部可能弹「重试/丢弃」sheet，而交互输入永不在 busy 内。
  if (isActive) await exitCanvasToGallery();
  await withBusy(t("ss.unloadingBusy", { name: item.name }), async () => {
    try {
      await _file(item.name).offload();
      setStatus(t("ss.unloaded", { name: item.name }));
      gallery.refresh();
    } catch (err) { setStatus(t("ss.unloadFailed", { error: errMsg(err) })); }
  });
}

// boot：按名恢复上次 doc（file.open 内含本地/云端 + freshness + unseal）。返回是否成功装入。
async function restoreSession(name: string): Promise<boolean> {
  // 双实例互认（2026-08-21）：**attempt 期就占坑**——慢加载窗口（等密码/等网络）正是双实例
  //   误判窗：此期间第二实例 query 必须看到「有人持有」，否则它读到我们在途的 restoreAttempt
  //   标记会误判崩溃环（boot-restore 纪律④只查得到锁，锁得先在）。锁被别人持有的路
  //   boot-restore 已在调用前挡掉（ifAvailable:true 拿不到也只是不持，无害）。
  //   成功 → _setActive(name) 同名续持（no-op）；失败 → 统一释放（本函数只有 boot 调用，
  //   失败时停图库，本 tab 不持有任何 doc）。
  holdDocLock(sessionBareName(name));
  const ok = await _restoreSessionAttempt(name);
  if (!ok) releaseDocLock();
  return ok;
}
async function _restoreSessionAttempt(name: string): Promise<boolean> {
  // 开画顺带把 4 个 settings/state collection 拉云对齐（v409，user 2026-07-14：「开画作的时候可以顺便
  //   并行 pullandreconcile 下，fire and forget 不用 await」）。**绝不 await**：对齐是锦上添花，
  //   不该让开画等网络（且离线/local-only 内部本就 no-op）。
  pullSettingsAndState();
  // 无地闸（QA 2026-08-21 P0）：restoreSession 曾是唯一没设 _fileHome() 闸的 es 重绑入口——
  //   双击 .ora 启动时 launchQueue 的 openLocalFile 先落地、boot 自动恢复慢半拍（等网络/密码）后落地，
  //   画布被换成上次 session 的画而保存目标仍是用户磁盘文件 → Ctrl+S 把别的画整体写进用户 .ora。
  //   每个 await 关口后都要重查（openLocalFile 的接管块是同步的，查到就是真接管了）；
  //   es 适配器的 adopt 里还有最后一道硬闸兜 es.open 内部的窗口。
  if (_fileHome()) return false;
  try {
    // 加密件的冷启动/tab 重开契约（v415 核对确认现状即正确，勿"优化"掉）：
    //   ① 先问密码（ensureUnlocked 在 busy 外弹，验的是 peek，便宜）；
    //   ② 取消 → 直接 return false，**在 es.open 之前**——所以这张画从头到尾没被装入编辑器：
    //      es 无 doc ⇒ session.dirty=false ⇒ 随后 boot 的 setGalleryOpen(true) 里那句
    //      `if (session.dirty) await session.save()` 不会触发 ⇒ **退出时不推**（不会拿空/旧状态盖云端）；
    //   ③ boot 收到 false 只把**内存**名降回 null，持久的 currentFile 有意保留（防幻影路径 +
    //      取消密码常是瞬态的，清了下次冷启动就再也不自动开这张画）——见 boot.ts。
    //   store 侧的两半已有 node 覆盖（seal.test.ts：无密码写抛 LOCKED 绝不静默存明文；锁定读返 null）。
    if (await _file(name).isEncrypted()) { if (!(await ensureUnlocked(name))) return false; }
    if (_fileHome()) return false;   // 密码框/加密探测悬着期间本地文件落地 → 让位
    if (!(await es.open(toFull(name)))) return false;   // 文件缺失/锁定 → 未装入。边界转全名。
    if (_fileHome()) return false;   // es.open 期间本地文件落地（adopt 硬闸已挡画布；这里别再抢身份）
    _esRebound();
    _setActive(name); _isLazyBlankSession = false; _recomputePhase(); _refreshEncrypted();
    updateSaveStatus();
    return true;
  } catch (e) { reportError(new Error("[session] restore failed: " + String(e)), "log"); return false; }
}

// ---- lazyblank 新画布（P1.5 2026-08-26 user 拍板「首次打开新画布」）----
// boot 的「可画新画布」落点（首次 / 恢复失败 / 崩溃断路 / 双实例锁 四条路，boot-restore.openFreshCanvas）。
// 形状：日期默认名（禁「未命名」）**memory-only**（currentFile 不写——空画布不算「上次开着的画」，
//   关掉重开还是新画布/图库照旧）；es **不绑**（空白永不落盘、不产生图库垃圾）；
//   首笔 → es 适配器 onChange 钩子安家：es.adopted(create) + _setActive 持久化身份（Procreate 性，
//   verdicts §1.2「涂鸦自动帮你进画布不需要 consent」）。空白期 Ctrl+S 由 saveAndPush 的
//   blankNothingToSave 守卫诚实回话。
function beginLazyBlank(): void {
  setName(galleryDefaultName(), { persist: false });
  _isLazyBlankSession = true; _recomputePhase();
  _enc.encrypted = false;
  _loadedDocIsNewer = false; _loadedDocNewerConfirmed = false; updateNewerBanner();
  updateSaveStatus();
}

// 另存为：当前内容写新身份（旧的不动）+ 切到新名继续编辑。
// 无地模式下另存为 = **收编入库**：无地 doc 获得 store 身份，本地文件留在原处不再跟踪。
async function saveAs(newName: string): Promise<void> {
  _applyPendingForExplicitSave();   // 显式保存：fill 预览也收口（topbar 侧只 apply 了 transient）
  const { bytes, peek } = await _encodeCurrentOraWithPeek();
  // 另存为=写**新身份** → mode:"new"（撞名不静默覆盖；topbar 已 nameOccupied 预检，这里 store 层再兜底红线）。
  await requireStore().file(toFull(newName), { isZip: true, mode: "new" }).save(bytes, { tryPush: true, hint: peek ? { peek } : undefined });
  if (_fileHome()) { _homeAuth.setHome(null); _dropLuggage(); }   // 收编：内容已进库（就是刚写的字节），不算丢弃，无需问
  _setActive(newName); _isLazyBlankSession = false; _recomputePhase();
  es.adopted(toFull(newName));   // es 切到新名（内容即新名的；下轮 autosave 若跑=同内容 re-save，无害）。边界转全名。
  _esRebound();
  void _captureCheckpoint(newName, "save-as");   // 新身份的「打开态」= 此刻
  updateSaveStatus(); gallery.refresh();
}

// ── 回线/回前台：打开中文档的显式快进（P1，user 2026-08-25 拍板；案卷 20260825-cloud-override-adopt-noop-case.md
//    第二案的修复；added by Claude Fable 5）─────────────────────────────────────────────────
// 旧姿势 = app.ts 裸调 pullIfClean() 不接结果：快进换掉 IDB 字节后画布照旧、UI 无声 → 用户在陈旧
//   世界线上画+保存，If-Match 恰好匹配刚被推进的 base → 云端新版被静默覆写（这条路连 .backup 都没有）。
// 新姿势：
//   · 平价段（绝大多数次）：一次 fetchMeta 比 etag，没变 → 静默完事，零下载零遮罩。
//   · 云端真动了才显式接管（onReplaceStart）：升全屏 sync gate——**护栏在用户第一笔之前**——
//     附「先继续画（另存新画）」逃生（JRP 慢网课：无硬超时，用户即超时）。
//   · fast-forwarded → 复用重开管线整体换装（与 takeCloud 同 B 形状：IDB/谱系/画布一起换世界线）
//     + 封 "cloud-refresh" checkpoint（revert 锚指向新世界线，堵孪生洞）。
//   · escaped → 分叉 consent（2026-08-25 拍板：逃生=显式开新画，不是「回头再弹 412」）：当前画面
//     saveAs 成新身份（mode:"new" 正门，红线全在）；原名旧字节留作缓存、云端新版仍是正主
//     （迟到完成的下载 = 原名缓存的静默刷新，画布已属新身份无从被碰）。之后推送全走新身份。
let _refreshInFlight = false;   // 回线+回前台常成对触发 → 去重
async function refreshOpenDoc(): Promise<void> {
  const name = _activeName();   // gallery 家专属（file 家/无家 name=null 即短路——旧 _localFile 闸吸收进联合类型）
  if (!name || _isLazyBlankSession || _refreshInFlight) return;
  if (!es || es.isDirty() || es.isPushPending()) return;   // 只干净快进；dirty 的分歧留给保存 412 冲突面（引擎 dirty-skip 双保险）
  _refreshInFlight = true;
  let gateUp = false;
  let onSkip: () => void = () => {};
  const probe = new Promise<void>((res) => { onSkip = res; });
  try {
    const r = await _file(name).pullIfClean({
      onReplaceStart: () => {
        gateUp = true;
        void lockSyncGate<"fork" | null>({
          title: t("cf.cloudNewerTitle"), message: t("cf.body.pulling", { name }), showSpinner: true,
          actions: [{ label: t("cf.act.forkContinue"), value: "fork" }],
        }).then((v) => { if (v === "fork") onSkip(); });
      },
      probe,
    });
    if (r?.status === "fast-forwarded") {
      if (gateUp) { settleSyncGate(null); gateUp = false; }   // 先落遮罩再重载（adoptModel 自带 _loadingDoc 门）
      const ok = await es.open(toFull(name));                 // 同名重开 = openInto 管线（freshness 刚 markSynced → in-sync 快路径 → readLocal → adopt 全量重建）
      if (!ok) { setStatus(t("ss.refreshReloadFailed", { name }), true); return; }   // 响亮，绝不静默留旧画布
      void _captureCheckpoint(name, "cloud-refresh");
      setStatus(t("ss.refreshedFromCloud", { name }));
      updateSaveStatus(); gallery.refresh();
    } else if (r?.status === "escaped") {
      if (gateUp) { settleSyncGate(null); gateUp = false; }   // fork 按钮自身已关 gate，settle 兜底无害
      await _forkAfterEscape(name);
    }
  } catch (e) { reportError(new Error("[session] refreshOpenDoc failed: " + String(e)), "log"); }
  finally { if (gateUp) settleSyncGate(null); _refreshInFlight = false; }
}

// 逃生分叉：saveAs = 现成深模块（mode:"new" 撞名护栏 + checkpoint + 切身份 + push）。秒级撞名重试一次。
async function _forkAfterEscape(origName: string): Promise<void> {
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  for (const forkName of [`${origName}（分叉 ${stamp}）`, `${origName}（分叉 ${stamp}-2）`]) {
    try {
      await saveAs(forkName);
      setStatus(t("ss.forkedFromRefresh", { name: forkName }));
      return;
    } catch (e) {
      if ((e as { name?: string })?.name === "CloudNameCollisionError") continue;
      throw e;
    }
  }
  throw new Error("[session] fork name collision twice - giving up");
}

// setName(name)：改活动身份（内存 + resume-slate 回执条两轨齐动）。
// setName(name, { persist: false })：**只动内存**——给 boot 加载失败用。
//   幽灵 path 纪律（feedback-phantom-current-path）：加载失败要把内存名降回 safe default（防 save 走 rename
//   路径把"加载失败的 path"当 oldName 删掉），但**持久的 currentFile 必须留着**，好让用户下次冷启动重试。
//   失败不只是"文件真没了"：加密画取消密码框 / 离线只有云端副本 都会返 false。清了它们就再也不自动开了。
function setName(name: string | null, opts: { persist?: boolean } = {}) {
  // 同样归一化（v437）：这条路是 gallery 移动文件后同步活动名的，不归一就会把用户敲的
  //   原始名塞回来，重新制造 `item.name === session.home.path` 的失配。
  const bare = name == null ? null : sessionBareName(name);
  _homeAuth.setHome(bare == null ? null : { kind: "gallery", galleryId: activeGalleryId(), path: bare });
  if (opts.persist !== false) setCurrentSessionName(bare ?? "");
  // 双实例互认：同 _setActive——换身份=换锁（gallery 移动文件同步活动名也算换身份）。
  if (bare != null) holdDocLock(bare); else releaseDocLock();
  _recomputePhase();
}

// ---- 公开 session 对象（app.js 兼容面）----
export const session = {
  enc: _enc,
  encryptCurrent, decryptCurrent,
  /** doc 的家（P1 2026-08-26，唯一身份读面）：null=无 doc（图库态）。消费点 switch home.kind
   *  （exhaustive + assertNever）——旧 `session.name`/`session.localFile` 已私有化，别加回来：
   *  两个平行可选字段就是当年「无地双墙」一类事故的温床，联合类型让错分支在编译期死。 */
  get home() { return docHome(); },
  get loadingDoc() { return _loadingDoc; },
  get loadedDocIsNewer() { return _loadedDocIsNewer; },
  get loadedDocNewerConfirmed() { return _loadedDocNewerConfirmed; },
  get dirty() { return _localHomeKind() ? fileDirty() : (es ? es.isDirty() : false); },   // 内存脏（save-status/beforeunload 用；file/transient 家走 keeper 脏轨）
  get pushPending() { return es ? es.isPushPending() : false; },   // 已落本地但没上云（徽章第四态；与 dirty 正交）
  get saving() { return _pushInFlight; },   // v0.5.9：saveAndPush 在飞（app 层过程态，徽章显转圈云）
  openLocalFile, leaveLocalDoc,
  // app 驱动内容变化（revert 回滚；blender 冗余双标无害）→ 标脏。参考图已迁 wp:sidecarchange（S5）。
  // 无地走本地轨；残影墙期间（_esMuted）es 绝不标脏（防跨写，见无地节注释）。
  markEdited() { if (_localHomeKind()) { _markLocalDirty(); return; } if (es && !_esMuted) es.markDirty(); },
  setName, restore: restoreSession, saveAs,
  beginLazyBlank,   // P1.5 boot「可画新画布」落点（boot-restore.openFreshCanvas 唯一调用方）
  beginTransientBlank,   // P2 云关 boot 落点（boot-restore.openBlankCanvas 唯一调用方）：transient 家新画布
  newTransientDoc,       // #22 无库「新建」（gallery-shell newDocConfirm 无库分支）：选尺寸的 transient 画布
  refreshOpenDoc,   // 回线/回前台的显式快进（P1 2026-08-25）——app.ts 事件侧唯一入口，别再裸调 pullIfClean
  // 显式换文档挽留门（fill 预览三选；user 2026-08-21）——给 session 外的换内容入口复用
  //   （import-image 的 .ora 导入为新身份）。session 内的 openItem/newDoc/openLocalFile 已内联。
  gateFillOnSwitch: _gateFillOnSwitch,
  save: saveNow, saveAndPush,
  // adopt 的两个意图显式分开（别再合成一个带 flag 的）：import=新身份 / revert=既有身份。
  adoptAsNew, adoptAsExisting,
  adoptAsTransient,   // P2：崩溃恢复的云关分支（不落看不见的图库；crash-banner 唯一调用方）
  adoptTransientIntoGallery,   // A1：挂库后 transient 自动安家（gallery-manage-ui attach 收尾调）
  rename: renameCurrentSession, exit: exitCanvasToGallery, newDoc, open: openItem, push: pushItem, unload: unloadItem,
  /** 当前作品的 at-rest **密文**字节（原样，不解壳、不要密码）。非加密件 → null。
   *  先 saveNow()：at-rest 字节是「上次保存」的内容，不先落盘就会导出成旧版本。 */
  async readEncryptedBytes(): Promise<EncryptedBlob | null> {
    const name = _activeName();
    if (!name) return null;
    await saveNow();                              // 未保存编辑先落盘（seal 会在写入前包壳 → 落地即密文）
    return await _file(name).getEncryptedBlob();
  },
  /** 当前 doc 的完整 .ora 字节（**明文**；2026-08-21「导出与另存」hub 的「存为本地 .ora」用）。
   *  与显式保存同一落盘形（_encodeCurrentOraWithPeek：meta+timelapse+mergedimage）；加密作品也出
   *  明文——内存本就是解密态，入口 sheet 文案已说清。纯导出副本：不落库、不碰 es/_fileHome() 身份。 */
  async encodeCurrentOra(): Promise<Blob> {
    _applyPendingForExplicitSave();   // 显式导出动作：fill 预览等 pending 一并收口（同 saveAs 首行）
    const { bytes } = await _encodeCurrentOraWithPeek();
    return bytes;
  },
  // revert v2（P4 2026-08-26）：列表/按档读/undo-revert 封存。旧 readCheckpoint(name) 单槽面已退役。
  listCheckpoints: _listCheckpoints, readCheckpointEntry: _readCheckpointEntry, capturePreRevert,
  dropCheckpoint: _dropCheckpoint,
  /** file 家 revert：内容换成快照、**家不变**（handle/牌照旧）、标脏（revert=相对磁盘的内容变化）。 */
  adoptIntoCurrentFileHome(loaded: LoadedDoc): void {
    if (!_fileHome()) throw new Error("[session] adoptIntoCurrentFileHome outside file home");
    adoptModel(loaded);
    _homeAuth.markFileDirty(); _editSerial++;   // 标脏 + 重新武装盲快照
    updateSaveStatus();
  },
  // （v415 删掉一批零读者的 facade 条目：current/lazyBlank/docLastSavedAt/sessionOpenedAt/
  //   loadedDocWriterVer/refreshEncrypted/encodeOra/buildOraMeta/markOpenedNow/markNewerConfirmed/
  //   markSavedNow/resetSavedAt。背后的私有实现该活的都还活着，只是不再从这个门面漏出去。）
  awaitCloudPushIdle: async () => { /* 薄库 push 内联 await，无独立在飞态 */ },
};

export function initSession(ctx: AppContext) {
  state = ctx.state; doc = ctx.doc; board = ctx.board; input = ctx.input; wp2 = ctx.wp2;   // 装载/换文档 = wp2.load（令牌写；T3b-2）
  editMode = ctx.editMode; rack = ctx.rack;
  referenceWindow = ctx.referenceWindow; paletteWindow = ctx.paletteWindow;
  setStatus = ctx.setStatus; withBusy = ctx.withBusy;
  updateSaveStatus = ctx.updateSaveStatus; updateNewerBanner = ctx.updateNewerBanner;
  pullSettingsAndState = ctx.pullSettingsAndState;
  applyCheckerboard = ctx.applyCheckerboard; renderLayersPanel = ctx.renderLayersPanel;
  setGalleryOpen = ctx.setGalleryOpen;
  checkQuotaAndWarn = ctx.checkQuotaAndWarn;
  gallery = ctx.gallery;

  // ora editor 适配器 + editor-session（生命周期编排全塌进这里）。
  es = createEditorSession({
    // 调用时解析（ambient 退役 2026-08-27）：es 不再捕获 store 实例——热插拔换库后 file 面永远新鲜
    //   （旧版 init 捕获 = 换库后 es 保存踩 stale 句柄的潜伏雷）。gallery 家以外的 saveRoute 分支摸不到这里。
    store: { file: (n, o) => requireStore().file(n, o) } as StoreLike,

    editor: {
      adopt: async (bytes: Blob) => {
        const loaded = await decodeOraToPainting(bytes) as LoadedDoc;
        // 无地硬闸（QA 2026-08-21 P0）：decode 的 await 期间本地文件接管了画布 → 这次 adopt 再落地
        //   就是「画布=store 画、保存目标=用户磁盘文件」的撕裂态（Ctrl+S 会把别的画写进用户 .ora）。
        //   抛错让 es.open 按「没开成」收场（restoreSession/openItem 都已按 false 处理）。
        if (_fileHome()) throw new Error("[session] adopt blocked: local-file session took over the canvas");
        adoptModel(loaded);
      },
      encode: async () => await _encodeCurrentOraWithPeek(),
      // 字节落盘成功 → 作废该画的缩略图缓存 + 广播（gallery 在世 tile 原地重取，getPeek 本地优先
      //   = 刚写的字节）。覆盖显式保存/autosave/退出 flush 全路径（v0.10.2 缩略图冻结根修）。
      onSaved: (fullName: string) => { void invalidateCachedThumb(stripSessionExt(fullName)); },
      // v0.8.5（S5）：sidecar 变更（参考图等「跟 ora 走 ∧ 不进 undo」态）与内容变更走同一内容脏门
      //   ——都要落盘/推云；差别只在不进 undo 栈（wp:sidecarchange 不碰 undo 按钮态）。
      // ⚠ wp:histchange 在 **window** 上 dispatch（history.ts）——绑 document 收不到 → 打开的文档编辑永不标脏、
      //   保存静默 no-op、编辑丢失（2026-07-12 真机抓到的数据丢失根因；其余监听者都用 window）。
      onChange: (cb: () => void) => {
        const h = () => {
          if (_loadingDoc) return;
          // P4 坐下判定（§2.7）：输入间隔 ≥ 阈值 → 这是新的一次坐下的首笔，先封「坐下前态」
          //   （fire-and-forget：capture 读 at-rest/磁盘，不碰画布，首笔零延迟）。
          const now = Date.now();
          if (isNewSitting(_lastInputAt, now)) void _captureResumePoint();
          _lastInputAt = now;
          if (_localHomeKind()) { _markLocalDirty(); return; }   // 墙①：file/transient 家编辑走本地脏轨，es 永不标脏
          if (_esMuted) return;                            // 墙②：无地残影——es 身份未重绑前 canvas ≠ es._name，标脏=跨写
          // P1.5 lazyblank 首笔安家（涂鸦自动进图库，verdicts §1.2）：真出现内容（bbox>0，
          //   _docIsBlankUnnamed 自翻旗）→ 此刻才绑 es（首存 mode:"new"）+ 持久化身份
          //   （currentFile 从此指它，boot 恢复得回来）。空白期 es 恒不绑 → 空白永不落盘。
          if (_isLazyBlankSession && !_docIsBlankUnnamed()) {
            const nm = _activeName();
            if (nm) { es.adopted(toFull(nm), { create: true }); _esRebound(); _setActive(nm); }
          }
          cb();
        };
        window.addEventListener("wp:histchange", h);
        window.addEventListener("wp:sidecarchange", h);
      },
    },
    isZip: true,
    policy: { autosaveMs: 0, pushOn: ["exit"] },   // S8：interval autosave 退役，改挂 bg-jobs（下方）
  });
  es.start();   // visibility/pagehide/blur 抢救 flush（崩溃安全直调，不受空闲节流）
  // S8/v0.4.11：autosave 挂 background-sync-jobs（minIdleMs=30s：停笔 30 秒才落盘，输入插队自动让路，
  //   不在描边中途 encode）。dirty 门足够防重复（flushLocal 后即净；encode 中的重入由 es._saving 挡）。
  //   encode 内部有冻结快照 → 即使 flushLocal 的 await 期间用户开画，存档也一致。
  //   v0.5.11（user pin）：操作做到一半（笔画/浮层变换/transient/fill 预览）时 autosave 让路——
  //   bgJobs 每轮重排队 = 天然 defer，谓词翻 false 后下个空闲窗自动补上。saveNow 的显式路径
  //   有自己的 hasPendingTransient 门（:284），此处是 idle 路径的对应门。crash-safety flush 不受此门。
  ctx.bgJobs.register("autosave", 5, () => {
    if (es.isDirty() && !ctx.isMidOperation()) void es.flushLocal();
    return "done";
  }, { minIdleMs: AUTOSAVE_IDLE_MS });
  // T-crash 盲快照（P2 2026-08-26，verdicts §2.2）：autosave 的「按家分发」T 腿——
  //   图库家 → 上面的 es.flushLocal（store crash-shadow）；file 家 → 这里进 crash 库（transient 产者归后续）。
  //   同 30s 空闲节律、同 isMidOperation 让路；serial 门 = 没新内容不重编码（fileDirty 到显式保存才清，
  //   不能当「有没有新东西」的门用）。与保存**完全同一** encodeDocToOra 字节（mp4 sidecar passthrough 顺带）。
  ctx.bgJobs.register("t-crash-snapshot", 6, () => {
    const homeAtStart = docHome();
    const kind = homeAtStart?.kind === "file" || homeAtStart?.kind === "transient" ? homeAtStart.kind : null;
    if (kind && _luggageTag && fileDirty() && _editSerial !== _snapSerial && !ctx.isMidOperation()) {
      const serial = _editSerial;
      const name = homeAtStart!.kind === "file" ? homeAtStart!.fileName : (_transientName ?? t("nd.untitled"));
      void (async () => {
        try {
          const { bytes } = await _encodeCurrentOraWithPeek();
          // encode 的 await 间隙可能换家/领养——对指纹再写，别把别的画写进这张牌。
          if (docHome() === homeAtStart && _luggageTag) {
            await crashStore.put(_luggageTag, bytes, { state: "crash", name, at: Date.now(), homeKind: kind });
            _snapSerial = serial;
          }
        } catch (e) { reportError(new Error("[t-crash] snapshot failed (best-effort, load-bearing layers unaffected): " + String(e)), "log"); }
      })();
    }
    return "done";
  }, { minIdleMs: AUTOSAVE_IDLE_MS });
  // 正常关闭即删（Blockbench 语义）：pagehide（非 bfcache 冻结）= 用户过完挽留门选择离开 =
  //   明确决定（Alt+F4=不保存，spec §7.1 同源拍板）→ 快照焚。真 crash（进程被杀/断电）不触发
  //   pagehide → 快照幸存 → 下次 boot 恢复横幅。pending-adoption 由库内拒删（redirect 起跳不误烧）。
  window.addEventListener("pagehide", (e: PageTransitionEvent) => {
    if (e.persisted) return;   // bfcache 冻结 ≠ 关闭
    if (_luggageTag) crashStore.dropOnCleanClose(_luggageTag).catch(() => {});   // 牌不清（页面将死，无所谓）
  });
  // （v409：无 desk 改动桥 —— desk 不标脏、不驱动落盘，只在顺路 encode 时被 _buildOraMeta 捞走。详 editor-state.ts ⚠）

  _recomputePhase();
  resetEditorState();
}

export function setSessionGallery(g: AppContext["gallery"]) { gallery = g; }

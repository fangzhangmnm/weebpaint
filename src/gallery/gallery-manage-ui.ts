// gallery-manage-ui.ts —— P3 图库管理面（VS Code 模型：库的生死管理全住 gallery 页）。
// created 2026-08-27 by Claude Fable 5. 拍板 = ai-docs/20260827-p3-gallery-multiinstance-grill-verdicts.md §1；
//   2026-08-30 user 重构拍板（edited by Claude Fable 5）：
//   · 语义只剩「连接 / 切换 / 断开」：**主动断开 = 卸库 + 退出登录**（signOut 的语义就是 disconnect）；
//     被动 offline（token 过期/断网/权限掉）才是「不卸库」的离线态。
//   · 有库：popup = 当前库行 + [离线时「重新连接」**排最上**] + 「切换图库…」（弹连接内容）+ 「断开连接」。
//   · 无库/编辑器入口：**同一份连接内容**（平权菜单项，无模态、无高亮偏袒；旧 choice-sheet 形制废除）：
//     连接 OneDrive…（唯一 OneDrive 动词，**永远弹账号选择页**防误点）/ 连接本地文件夹… /
//     分隔线 + 「最近连接过的」history（VS Code Open Recent 形制；✕=忘记，隐私掌握；
//     网盘组在前）。快速回常用库走 history，不走 SSO。编辑器里不提供断开（回图库才有）。
// 流程红线：切库/断开前置 = 收口开画（docHome≠gallery）+ 绿灯门（dirty=0）；dirty 逃生 sheet 三口 =
//   下载备份（pushAll 先推、推不上去的逐张 triggerDownload）/ 仍要切换（警告缓存可能被清）/ 取消。
// 离线态主动引导（verdicts §1.7）：attached 且 !online → `.toast` 横幅「图库已离线—重新连接」
//   （一键手势：OneDrive=已登录翻牌/未登录 signIn / folder=requestPermission），可关闭。

import { t } from "../i18n/index.ts";
import { els } from "../els.ts";
import { openChoiceSheet, openConfirmSheet } from "../sheets.ts";
import { openAdoptedPopup, closePopupMenuOf } from "../ui/popup-menu.ts";   // 2026-09-02 C1
import { iconHtml } from "../ui/icon.ts";
import { galleryAttachment } from "../gallery-attachment-host.ts";
import { galleryRegistry } from "../gallery-registry.ts";
import type { GalleryEntry } from "../gallery-registry.ts";
import { mintFolderByPicker, mintOneDriveByAccount, mintOneDriveSwitchAccount, oneDriveInteractMode, attachGallery, ensureFolderPermission, canPickFolderGallery, hasFreshPendingOneDriveConnect, clearPendingOneDriveConnect, galleryFlow, type MintResult } from "../gallery-connect.ts";
import { requireStore, signIn, signOut, isSignedIn, isAuthConfigured, _seedNextRackInitData, _buildStoreForGalleryEntry, brushRackCollection } from "../app-store.ts";
import { getAllBrushes, getMeta, RACK_META_ID } from "../brushes.ts";
import { preferences, PREF_REGISTRY, type PrefKey } from "../app-prefs.ts";
import { docHome } from "../doc-home.ts";
import { session } from "../session-state.ts";   // A1：attach 后 transient 自动安家
import { triggerDownload } from "../session.ts";
import { reportError } from "../error-badge.ts";
import type { AppContext } from "../app-context.ts";

let _ctx: AppContext | null = null;
const _status = (msg: string, persist = false) => _ctx?.setStatus(msg, persist);

const sourceLabel = (e: GalleryEntry): string => e.kind === "onedrive" ? t("gm.srcOneDrive") : t("gm.srcFolder");

// ---- 种子（「继承当前笔刷与设置」，verdicts §1.9：一次性拷贝即分叉）----
interface SeedBundle { rack: { id: string; value: unknown }[]; prefs: Partial<Record<PrefKey, unknown>> }
function captureSeed(): SeedBundle | null {
  try {
    const coll = brushRackCollection as unknown as { entries(): { id: string; value: unknown }[]; getItem(id: string, def?: unknown): unknown };
    const brushes = getAllBrushes(coll);
    const rack: { id: string; value: unknown }[] = [
      ...brushes.map((b) => ({ id: b.id, value: b as unknown })),
      { id: RACK_META_ID, value: getMeta(coll) as unknown },
    ];
    const prefs: SeedBundle["prefs"] = {};
    for (const k of Object.keys(PREF_REGISTRY) as PrefKey[]) {
      if (PREF_REGISTRY[k].scope === "gallery") prefs[k] = preferences.get(k);   // cascade 终值 = 「当前」的语义
    }
    return { rack: brushes.length ? rack : [], prefs };
  } catch (e) {
    reportError(new Error("[gallery-manage] seed capture failed (soft, factory-fresh instead): " + String(e)), "log");
    return null;
  }
}

/** 目标库 rack collection 云端探针（临时店纯读即拆，forgetFlow 同姿势；store 0.11.0 collectionPeek）。
 *  任何失败 = "unknown"（按旧库办：宁不问，绝不把离线误判成新库）。 */
async function _peekTargetRack(entry: GalleryEntry): Promise<"absent" | "present" | "unknown"> {
  try {
    const tmp = _buildStoreForGalleryEntry(entry);
    try { return await tmp.collectionPeek("brush-rack"); }   // 名字对齐 app-store 的 rack collection
    finally { await tmp.dispose({ drain: false }); }
  } catch (e) {
    reportError(new Error("[gallery-manage] rack peek failed (treat as unknown): " + String(e)), "log");
    return "unknown";
  }
}

// ---- 绿灯门 + 逃生（切库/卸库共用）----
/** 关掉当前店（挂载态走器官绿灯门；legacy 未领养态直接对当前 store 走同口径）。false = 用户取消/被 gate。 */
async function closeCurrentStoreWithGates(): Promise<boolean> {
  if (docHome()?.kind === "gallery") { _status(t("gm.closeDocFirst"), true); return false; }   // 收口开画
  const att = galleryAttachment.state();
  if (att.kind === "attached") {
    const r = await galleryAttachment.detach();
    if (r.ok) return true;
    if (r.reason === "doc-open") { _status(t("gm.closeDocFirst"), true); return false; }
    const go = await escapeSheet(r.dirtyCount);
    if (!go) return false;
    await galleryAttachment.forceDetach();
    return true;
  }
  // detached 态：店懒出生后的不变量 = detached ⇔ kind:none（无预建店无领养窗，无店可拆）。
  //   万一不变量被打破（backend live 却 detached）也宁可放行 attach（attach 自己有 attached 门），不在这吞。
  return true;
}

/** dirty 逃生 sheet：true = 仍要切换（用户已过警告）。「下载备份」跑完回到 sheet（数字会变小）。 */
async function escapeSheet(dirtyCount: number): Promise<boolean> {
  for (;;) {
    const v = await openChoiceSheet<"backup" | "force">(
      t("gm.dirtyTitle", { n: String(dirtyCount) }),
      t("gm.dirtyMsg"),
      [
        { label: t("gm.dirtyBackup"), value: "backup" },
        { label: t("gm.dirtyForce"), value: "force" },
      ],
    );
    if (v == null) return false;                       // 取消
    if (v === "force") return true;
    await backupDirty();                               // 备份后重扫再问（推上去的已不 dirty）
    dirtyCount = await requireStore().files.dirty.count();
    if (dirtyCount === 0) { _status(t("gm.dirtyAllPushed"), true); return true; }
  }
}

/** 下载备份：先 pushAll 尽力推（在线时最好的备份就是云）；推不上去的（failed=错误报告面）逐张下载。 */
async function backupDirty(): Promise<void> {
  try {
    const { failed } = await requireStore().files.dirty.pushAll();
    let saved = 0;
    for (const name of failed) {
      try {
        const blob = await requireStore().file(name, { isZip: false, mode: "existing" }).open();
        if (blob) { triggerDownload(blob, name.split("/").pop() || name); saved++; }
      } catch (e) { reportError(new Error(`[gallery-manage] backup download failed for ${name}: ` + String(e)), "log"); }
    }
    _status(t("gm.backupDone", { n: String(saved) }), true);
  } catch (e) {
    reportError(new Error("[gallery-manage] backupDirty failed: " + String(e)), "error");
  }
}

// ---- 切库 / 连接 / 卸下 / 忘记 ----
// 切库/卸库整体走 galleryFlow 单飞道（案卷 20260830 §BUG D）：与 boot 领养 / redirect 续办互斥，
//   detach→attach 序列不再被别的流程交错。锁内含用户 sheet（种子问/逃生）——串行等待属预期语义。
async function switchFlow(entry: GalleryEntry): Promise<void> {
  return galleryFlow(() => switchFlowBody(entry));
}
/** 播种（user 0830 拍板 abc + collectionPeek 机制，store 0.11.0；台账 park#2 结案）：
 *  永远静默捕种子（旧库还活着的此刻）；连接前探目标库 rack json——"absent"=真新库才弹「继承/出厂」
 *  （取消=出厂兜底，旧笔仍在旧库无损）；"present"/"unknown"（离线）不弹不播。
 *  旧判据 `askSeed: minted.created`（registry 条目新≠库新）退役——新设备连旧库误问的根因。 */
async function switchFlowBody(entry: GalleryEntry): Promise<void> {
  const att = galleryAttachment.state();
  if (att.kind === "attached" && att.entry.id === entry.id) { _status(t("gm.alreadyCurrent")); return; }
  const seed = captureSeed();
  let inherit = false;
  if (seed?.rack.length && (await _peekTargetRack(entry)) === "absent") {
    const v = await openChoiceSheet<"inherit" | "fresh">(t("gm.seedTitle"), t("gm.seedMsg"), [
      { label: t("gm.seedInherit"), value: "inherit", primary: true },
      { label: t("gm.seedFresh"), value: "fresh" },
    ]);
    inherit = v === "inherit";                         // 取消(null) = 出厂兜底（拍板 a），连接照常继续
  }
  if (!(await closeCurrentStoreWithGates())) return;
  if (inherit && seed) _seedNextRackInitData(seed.rack);
  try {
    await attachGallery(entry);
  } catch (e) {
    _seedNextRackInitData(null);
    reportError(new Error("[gallery-manage] attach failed: " + String(e)), "error");
    return;
  }
  if (inherit && seed) for (const [k, v] of Object.entries(seed.prefs)) preferences.set(k as PrefKey, v as never);
  // A1（user 0828 拍板 a）：开着的 transient 画自动安家进刚连上的图库（连接手势=安家意图，不再问）。
  //   0830 补拍板：未动过的 boot 空白不安家（"untouched-blank"）——空白件别塞进库，当 no-doc 办落图库页。
  let adopt: Awaited<ReturnType<typeof session.adoptTransientIntoGallery>> = { kind: "none" };
  try {
    adopt = await session.adoptTransientIntoGallery();
    if (adopt.kind === "adopted") { _status(t("gm.transientAdopted", { name: adopt.name }), true); }
    else _status(t("gm.switched", { label: entry.label }), true);
  } catch (e) {
    reportError(new Error("[gallery-manage] transient adopt after attach failed (doc 仍开着未丢): " + String(e)), "error");
    _status(t("gm.switched", { label: entry.label }), true);
  }
  // 切库后落 gallery 页（Q4 拍板：切库意图=去看那个库；不写回执条，boot 恢复不受影响）。
  //   ⚠ 仅当没有开着的画（docHome=null）或只是**未动过的 boot 空白**（丢弃零损失，user 0830）——
  //   2026-08-27 无痕事故：transient 脏画布被这行无门导航正常关闭焚毁（词典序②当前操作不丢）。
  //   有真画开着 = 留在编辑器：画照画，库已挂上，图库自己去点。
  if (docHome() == null || adopt.kind === "untouched-blank") {
    try { if (els.galleryFull.classList.contains("hidden")) _ctx?.setGalleryOpen(true); } catch { /* noop */ }
  }
  try { _ctx?.gallery.refresh(); } catch { /* gallery 未挂 */ }
  renderGalleryManage();
}

/** 编辑器无库单入口（topbar 文件菜单「连接图库…」）：打开**同一个**云 popup（user 0830「editor 里
 *  连接到库也用同一个菜单」）。popup 在 galleryFull 外层，编辑器态可显示；无库态内容=连接选项+账号行；
 *  编辑器里没有断开（断开只在图库页，user 0830）——本入口本就只在无库时可见（settings-menu 反相 gating）。 */
export function openConnectMenuFromEditor(anchor: HTMLElement): void {
  renderGalleryManage();
  openAdoptedPopup(els.cloudAccountPopup, { anchor });   // 2026-09-02 C1：收养（外点关/Escape/栈归 module）
}

/** redirect 回程续办（app.ts wp:auth-changed 接线；2026-08-28 iPad「点两次」修）：
 *  跳转前落的「待续连接」标记还新鲜 + 已登录 → 续走 mint+switchFlow，把连接一次办完。
 *  幂等：标记清了就不会重入。
 *  ⚠ 不设「已挂库就退」早退（0830 修）：换库场景（folder 库在挂、点连 OneDrive）redirect 回程
 *  boot 会先把旧库挂回去——此时必须继续 switchFlow 完成切换；同库目标由 switchFlow 的
 *  「已是当前图库」自己短路，异库走绿灯门（boot restore 开了画会被收口 gate 挡下，属预期）。 */
export async function resumePendingOneDriveConnect(): Promise<void> {
  if (!hasFreshPendingOneDriveConnect()) return;
  if (!isSignedIn()) return;                          // 回程未成号（用户取消）：标记留给 TTL 作废
  clearPendingOneDriveConnect();
  try {
    const minted = await mintOneDriveByAccount();     // 已登录：零跳转同步路径
    if (!minted) return;
    await switchFlow(minted.entry);
  } catch (e) {
    reportError(new Error("[gallery-manage] resume connect failed: " + String(e)), "error");
  }
}

// ---- 连接选项（user 0830 拍板：菜单项形制、平权、无模态；全 codebase 唯一 connect 路径）----
// 手势红线（sheets.ts 头注释）：signIn / FSA picker 都要活着的 user activation——菜单项 click 直调
//   mint*（同步栈起跳），旧 choice-sheet 的 onPick 补丁随模态一起退役。
function _closePopup(): void { closePopupMenuOf(els.cloudAccountPopup); }
function _menuItem(label: string, icon: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "menu-item menu-item-with-icon";
  b.setAttribute("role", "menuitem");
  b.innerHTML = iconHtml(icon);
  const span = document.createElement("span");
  span.className = "menu-item-label";
  span.textContent = label;
  b.appendChild(span);
  b.addEventListener("click", onClick);
  return b;
}
function renderConnectContent(box: HTMLElement): void {
  // 连接动词（网盘在前，user 0830）。OneDrive 只此一条、**永远弹微软账号选择页**（user 0830 终形拍板
  //   「永远都是 connect to another account，防止误点」）：快速回常用库走下面的 history——同时规避
  //   「SSO 静默连错账号」与 pinned 账号重连连错人两个坑；label 不用「换一个账号」相对措辞（唯一动词）。
  if (isAuthConfigured()) box.appendChild(_menuItem(t("gm.connectOneDrive"), "cloud", () => { void onOneDrivePick(); }));
  if (canPickFolderGallery()) box.appendChild(_menuItem(t("gm.connectFolder"), "folder-open", () => { void onFolderPick(); }));
  // history（VS Code「Open Recent」形制，user 0830 拍板回归）：分隔线 + 说明行 + 名册行（✕=忘记，
  //   「用户对隐私有掌握」）。folder 行=存的句柄直接复活（最多补权限），不走 picker——名册买回来的东西。
  //   异步填充进本次渲染私有的 histBox：重渲后旧 histBox 已离树，迟到的 fill 落在游离节点上 =
  //   天然免疫 0830 案卷 §BUG C 的双份竞态，无需 epoch 计数。
  const histBox = document.createElement("div");
  box.appendChild(histBox);
  const att = galleryAttachment.state();
  void galleryRegistry.list().then((entries) => {
    const others = entries
      .filter((e) => !(att.kind === "attached" && e.id === att.entry.id))   // 当前库不列
      .sort((a, b) => a.kind !== b.kind
        ? (a.kind === "onedrive" ? -1 : 1)                                                    // 网盘组在前（user 0830）
        : ((b.lastActive ?? 0) - (a.lastActive ?? 0) || b.createdAt - a.createdAt));          // 组内新近在前
    if (!others.length) return;
    const sep = document.createElement("div");
    sep.className = "menu-sep";
    const cap = document.createElement("div");
    cap.className = "menu-section-label";
    cap.textContent = t("gm.historyCaption");
    histBox.append(sep, cap);
    for (const e of others) {
      const row = document.createElement("div");
      row.className = "gm-row";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "menu-item";
      btn.textContent = `${e.label} — ${sourceLabel(e)}`;   // 卡标来源（撞名不设机制，user 拍板）
      btn.addEventListener("click", () => { _closePopup(); void switchFlow(e); });
      const x = document.createElement("button");
      x.type = "button";
      x.className = "gm-x";
      x.title = t("gm.forgetHint");
      x.textContent = "✕";
      x.addEventListener("click", (ev) => {
        ev.stopPropagation();
        void forgetFlow(e).then(() => { box.textContent = ""; renderConnectContent(box); });   // 留在 history 层刷新
      });
      row.append(btn, x);
      histBox.appendChild(row);
    }
  }).catch((e) => reportError(new Error("[gallery-manage] history list failed: " + String(e)), "log"));
}
async function onOneDrivePick(): Promise<void> {
  _closePopup();
  // 逃生舱 helper（0825 拍板→0828 落地）：file:// 下微软登录无解（redirect 需要 http origin）——
  //   不起跳，改弹「怎么开本地服务器」的文字指路。folder 图库不受影响。
  if (typeof location !== "undefined" && location.protocol === "file:") {
    const fn = (() => { try { return decodeURIComponent(location.pathname.split("/").pop() || "weebpaint-standalone.html"); } catch { return "weebpaint-standalone.html"; } })();
    await openConfirmSheet(t("gm.connectTitle"), t("gm.fileProtoCloudHelp", { file: fn }));
    return;
  }
  // 永远弹账号选择页（select_account；点击同步栈起跳保手势）。桌面 = popup：选完账号弹回，
  //   minted 直接续 switchFlow（全程不离页）；移动 = redirect：页面即离开，回程由
  //   resumePendingOneDriveConnect 续办 mint+switchFlow——选了同账号由「已是当前图库」短路。
  try {
    const minted = await mintOneDriveSwitchAccount();
    if (minted) await switchFlow(minted.entry);
  } catch (e) {
    if (String(e).includes("user_cancelled")) return;   // 用户自己关了登录弹窗：无事发生，静默即诚实
    reportError(new Error("[gallery-manage] connect failed: " + String(e)), "error");
  }
}
async function onFolderPick(): Promise<void> {
  _closePopup();
  const mintP = mintFolderByPicker();                  // 点击同步栈起跳（FSA picker）
  try {
    const minted: MintResult | null = await mintP;
    if (!minted) return;                               // 用户取消 picker
    await switchFlow(minted.entry);
  } catch (e) { reportError(new Error("[gallery-manage] connect failed: " + String(e)), "error"); }
}

/** 忘记（history 行尾 ✕；user 0830「忘记肯定要，用户对隐私有掌握」）：只删本机名册条目，不动库文件。
 *  孤儿 dirty surfaced（0825 案卷）：临时建店只读 dirty 标量再拆，有账写进确认文案；全量 GC 挂深清（P7）。 */
async function forgetFlow(entry: GalleryEntry): Promise<void> {
  let dirtyNote = "";
  try {
    const tmp = _buildStoreForGalleryEntry(entry) as unknown as { files: { dirty: { count(): Promise<number> } }; dispose(o?: { drain?: boolean }): Promise<void> };
    const n = await tmp.files.dirty.count();
    await tmp.dispose({ drain: false });
    if (n > 0) dirtyNote = "\n" + t("gm.forgetDirtyWarn", { n: String(n) });
  } catch { /* soft：建不出（无权限/absent）→ 不加注照常确认 */ }
  const ok = await openConfirmSheet(t("gm.forgetTitle", { label: entry.label }), t("gm.forgetMsg") + dirtyNote);
  if (!ok) return;
  await galleryRegistry.forget(entry.id);
  _status(t("gm.forgotten", { label: entry.label }));
}

/** 断开连接（user 0830 拍板：主动断开 = 卸库 + 退出登录；被动 offline 才是不卸库）。
 *  顺序：先绿灯门卸库（逃生 sheet 的「下载备份」pushAll 需要活着的登录态），后 signOut。 */
async function disconnectFlow(): Promise<void> {
  return galleryFlow(async () => {
    const att = galleryAttachment.state();
    if (att.kind !== "attached") return;
    if (!(await closeCurrentStoreWithGates())) return;
    if (att.entry.kind === "onedrive") {
      try { await signOut(); } catch (e) { reportError(new Error("[gallery-manage] signOut on disconnect failed (库已卸下): " + String(e)), "log"); }
    }
    _status(t("gm.disconnected"), true);
    try { _ctx?.gallery.refresh(); } catch { /* noop */ }
    renderGalleryManage();
  });
}

// ---- 渲染（popup 内容；updateCloudAuthUI 每次一并调）----
// 全同步渲染（名册异步填充随切换行一起退役 0830——曾经的「菜单双份」竞态从结构上消失）。
export function renderGalleryManage(): void {
  const box = els.galleryConnectBox; const cur = els.galleryCurrentInfo;
  if (!box || !cur) return;
  const att = galleryAttachment.state();
  box.textContent = "";
  if (att.kind === "attached") {
    cur.textContent = t("gm.current", { label: att.entry.label, src: sourceLabel(att.entry) }) + (att.online ? "" : t("gm.offlineSuffix"));
    cur.classList.remove("hidden");
    els.galleryDetachBtn.classList.remove("hidden");
    // 离线态：菜单里也给「重新连接」（横幅可被关掉；folder 权限补授需要手势入口）。
    if (!att.online) box.appendChild(_menuItem(t("gm.reconnect"), "refresh", () => { _closePopup(); void reconnectFlow(); }));
    // 「切换图库…」：点开原地换成连接选项（同一份菜单；popup 重开/事件重渲自动回到顶层）。
    box.appendChild(_menuItem(t("gm.switchEntry"), "gallery", () => { box.textContent = ""; renderConnectContent(box); }));
  } else {
    cur.classList.add("hidden");
    els.galleryDetachBtn.classList.add("hidden");
    renderConnectContent(box);   // 无库：连接选项直接就是菜单项（editor 入口同一份）
  }
  renderOfflineBanner();
}

// ---- 离线横幅（主动引导；动态 DOM）----
// UI 标准件 = `.toast`（更新 toast 同款：底部居中 pill、主题 token 反色、--z-toast band）。
//   旧版手搓 inline style 钉在 top:0——v0.9.4 早就拍过「顶部通栏压 iPad 无框顶栏」（error-badge 迁底部
//   的同一课），这条横幅踩了回去 → 位置差到点不到（user 2026-08-29）。2026-08-30 迁 toast 形制。
let _bar: HTMLDivElement | null = null;
let _dismissed = false;
function _ensureBar(): HTMLDivElement {
  if (_bar) return _bar;
  const bar = document.createElement("div");
  bar.id = "__galleryOfflineBar";
  bar.className = "toast";
  bar.setAttribute("role", "status");
  const txt = document.createElement("span");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.addEventListener("click", () => { void reconnectFlow(); });
  const x = document.createElement("button");
  x.type = "button";
  x.className = "dismiss";
  x.textContent = "✕";
  x.title = t("gm.dismiss");
  x.addEventListener("click", () => { _dismissed = true; renderOfflineBanner(); });
  bar.append(txt, btn, x);
  document.body.appendChild(bar);
  _bar = bar;
  return bar;
}
function renderOfflineBanner(): void {
  const att = galleryAttachment.state();
  const show = att.kind === "attached" && !att.online && !_dismissed;
  if (!show) { _bar?.remove(); _bar = null; return; }
  const bar = _ensureBar();
  (bar.children[0] as HTMLElement).textContent = t("gm.offlineBanner", { label: att.entry.label });
  (bar.children[1] as HTMLElement).textContent = t("gm.reconnect");
}
/** 重新连接（手势）：OneDrive=已登录原地翻牌 / 未登录才 signIn；folder=requestPermission。接通即翻牌+补推。 */
async function reconnectFlow(): Promise<void> {
  const att = galleryAttachment.state();
  if (att.kind !== "attached") return;
  try {
    if (att.entry.kind === "onedrive") {
      // 旧版无条件 signIn 在「已登录但旗死锁」（案卷 20260830 §BUG A）时=白跳微软一整圈、回程
      //   重掷竞态骰子的死循环（§BUG B）。已登录 → 原地翻牌即可；未登录才真登录——
      //   桌面 popup（store 0.10.0）：弹回即续，向下直接翻牌+补推；移动 redirect：页面即离开，
      //   回程由 boot attach 的 online 收口接住。
      if (!isSignedIn()) {
        if (oneDriveInteractMode() === "popup") await signIn({ mode: "popup" });
        else { await signIn(); return; }   // redirect：页面即离开，后续代码不跑
      }
      galleryAttachment.setOnline(true);
    } else {
      galleryAttachment.setOnline(await ensureFolderPermission(att.entry, { request: true }));
    }
    if (galleryAttachment.state().kind === "attached" && (galleryAttachment.state() as { online?: boolean }).online) {
      requireStore().files.drainOfflineQueue().catch(() => { /* 良性 */ });
      try { _ctx?.gallery.refresh(); } catch { /* noop */ }
      _status(t("gm.reconnected"));
    }
  } catch (e) {
    if (String(e).includes("user_cancelled")) return;   // 用户自己关了登录弹窗：无事发生，静默即诚实
    reportError(new Error("[gallery-manage] reconnect failed: " + String(e)), "error");
  }
}

export function initGalleryManageUI(ctx: AppContext): void {
  _ctx = ctx;
  els.galleryDetachBtn?.addEventListener("click", () => { _closePopup(); void disconnectFlow(); });
  galleryAttachment.onChange(() => { _dismissed = false; renderGalleryManage(); });
  renderGalleryManage();
}

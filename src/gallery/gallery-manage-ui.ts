// gallery-manage-ui.ts —— P3 图库管理面（VS Code 模型：库的生死管理全住 gallery 页）。
// created 2026-08-27 by Claude Fable 5. 拍板 = ai-docs/20260827-p3-gallery-multiinstance-grill-verdicts.md §1。
//
// 住处 = gallery header 云 popup（cloudAccountPopup）：当前库行 + 名册列表（卡标来源）+
//   「连接图库…」+「卸下图库」。低频动作（忘记条目）= 行尾 ✕ + 确认 sheet。
// 流程红线：切库/卸库前置 = 收口开画（docHome≠gallery）+ 绿灯门（dirty=0）；dirty 逃生 sheet 三口 =
//   下载备份（pushAll 先推、推不上去的逐张 triggerDownload）/ 仍要切换（警告缓存可能被清）/ 取消。
// 离线态主动引导（verdicts §1.7）：attached 且 !online → 顶部非模态横幅「图库已离线—重新连接」
//   （一键手势：OneDrive=signIn / folder=requestPermission），可关闭；banner DOM 动态建（同 error-badge 手法）。

import { t } from "../i18n/index.ts";
import { els } from "../els.ts";
import { openChoiceSheet, openConfirmSheet } from "../sheets.ts";
import { galleryAttachment } from "../gallery-attachment-host.ts";
import { galleryRegistry } from "../gallery-registry.ts";
import type { GalleryEntry } from "../gallery-registry.ts";
import { mintFolderByPicker, mintOneDriveByAccount, mintOneDriveSwitchAccount, attachGallery, ensureFolderPermission, canPickFolderGallery, hasFreshPendingOneDriveConnect, clearPendingOneDriveConnect, galleryFlow, type MintResult } from "../gallery-connect.ts";
import { requireStore, galleryBackend, signIn, isSignedIn, isAuthConfigured, _seedNextRackInitData, _buildStoreForGalleryEntry, brushRackCollection } from "../app-store.ts";
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
async function switchFlow(entry: GalleryEntry, opts: { askSeed: boolean }): Promise<void> {
  return galleryFlow(() => switchFlowBody(entry, opts));
}
async function switchFlowBody(entry: GalleryEntry, opts: { askSeed: boolean }): Promise<void> {
  const att = galleryAttachment.state();
  if (att.kind === "attached" && att.entry.id === entry.id) { _status(t("gm.alreadyCurrent")); return; }
  let seed: SeedBundle | null = null;
  if (opts.askSeed) {
    const v = await openChoiceSheet<"inherit" | "fresh">(t("gm.seedTitle"), t("gm.seedMsg"), [
      { label: t("gm.seedInherit"), value: "inherit", primary: true },
      { label: t("gm.seedFresh"), value: "fresh" },
    ]);
    if (v == null) return;                             // 取消整个连接流程（条目已铸无妨，名册可复用）
    if (v === "inherit") seed = captureSeed();         // 旧库还活着的此刻捕快照
  }
  if (!(await closeCurrentStoreWithGates())) return;
  if (seed?.rack.length) _seedNextRackInitData(seed.rack);
  try {
    await attachGallery(entry);
  } catch (e) {
    _seedNextRackInitData(null);
    reportError(new Error("[gallery-manage] attach failed: " + String(e)), "error");
    return;
  }
  if (seed) for (const [k, v] of Object.entries(seed.prefs)) preferences.set(k as PrefKey, v as never);
  // A1（user 0828 拍板 a）：开着的 transient 画自动安家进刚连上的图库（连接手势=安家意图，不再问）。
  try {
    const adopted = await session.adoptTransientIntoGallery();
    if (adopted) { _status(t("gm.transientAdopted", { name: adopted }), true); }
    else _status(t("gm.switched", { label: entry.label }), true);
  } catch (e) {
    reportError(new Error("[gallery-manage] transient adopt after attach failed (doc 仍开着未丢): " + String(e)), "error");
    _status(t("gm.switched", { label: entry.label }), true);
  }
  // 切库后落 gallery 页（Q4 拍板：切库意图=去看那个库；不写回执条，boot 恢复不受影响）。
  //   ⚠ 仅当没有开着的画（docHome=null）——2026-08-27 无痕事故：transient 脏画布被这行无门导航
  //   正常关闭焚毁（词典序②当前操作不丢）。有画开着 = 留在编辑器：画照画，库已挂上，图库自己去点。
  if (docHome() == null) {
    try { if (els.galleryFull.classList.contains("hidden")) _ctx?.setGalleryOpen(true); } catch { /* noop */ }
  }
  try { _ctx?.gallery.refresh(); } catch { /* gallery 未挂 */ }
  renderGalleryManage();
}

/** 编辑器无库单入口（topbar 文件菜单）也走同一条连接流程。 */
export const openGalleryConnectFlow = (): Promise<void> => connectFlow();

/** redirect 回程续办（app.ts wp:auth-changed 接线；2026-08-28 iPad「点两次」修）：
 *  跳转前落的「待续连接」标记还新鲜 + 已登录 → 续走 mint+switchFlow，把首次连接一次办完。
 *  已经挂上库（boot 领养赢了竞态/别的入口先到）→ 目的已达，只清标记。幂等：标记清了就不会重入。 */
export async function resumePendingOneDriveConnect(): Promise<void> {
  if (!hasFreshPendingOneDriveConnect()) return;
  if (!isSignedIn()) return;                          // 回程未成号（用户取消）：标记留给 TTL 作废
  clearPendingOneDriveConnect();
  if (galleryAttachment.state().kind === "attached") return;
  try {
    const minted = await mintOneDriveByAccount();     // 已登录：零跳转同步路径
    if (!minted) return;
    await switchFlow(minted.entry, { askSeed: minted.created });
  } catch (e) {
    reportError(new Error("[gallery-manage] resume connect failed: " + String(e)), "error");
  }
}

async function connectFlow(): Promise<void> {
  // iOS/手势红线（sheets.ts 头注释）：signIn popup / FSA picker 都要活着的 user activation——
  //   必须在 onPick（点击同步栈）起跳，不能等 `await openChoiceSheet` 回来再调。
  let mintP: Promise<MintResult | null> | null = null;
  // 逃生舱 helper（0825 拍板→0828「和 single html 一起」落地）：file:// 下微软登录无解（redirect 需要
  //   http origin）——OneDrive 选项不起跳，改弹「怎么开本地服务器」的文字指路。folder 图库不受影响。
  const fileProto = typeof location !== "undefined" && location.protocol === "file:";
  const src = await openChoiceSheet<"od" | "od-switch" | "folder">(t("gm.connectTitle"), "", [
    ...(isAuthConfigured() ? [{ label: t("gm.srcOneDrive"), value: "od" as const, primary: true, onPick: () => { if (!fileProto) mintP = mintOneDriveByAccount(); } }] : []),
    // 已登录才给「换一个账号」（0.9.0 口子）：铸第二账号入口——redirect 走微软账号选择页，回程续办。
    ...(isAuthConfigured() && isSignedIn() ? [{ label: t("gm.srcOneDriveSwitch"), value: "od-switch" as const, onPick: () => { mintP = mintOneDriveSwitchAccount(); } }] : []),
    ...(canPickFolderGallery() ? [{ label: t("gm.srcFolder"), value: "folder" as const, onPick: () => { mintP = mintFolderByPicker(); } }] : []),
  ]);
  if (src === "od" && fileProto) {
    const fn = (() => { try { return decodeURIComponent(location.pathname.split("/").pop() || "weebpaint-standalone.html"); } catch { return "weebpaint-standalone.html"; } })();
    await openConfirmSheet(t("gm.connectTitle"), t("gm.fileProtoCloudHelp", { file: fn }));
    return;
  }
  if (src == null || mintP == null) return;
  try {
    const minted = await (mintP as Promise<MintResult | null>);   // TS 看不见 onPick 副作用的窄化补丁
    if (!minted) return;                               // 用户取消 picker / 登录失败无账号
    await switchFlow(minted.entry, { askSeed: minted.created });
  } catch (e) {
    reportError(new Error("[gallery-manage] connect failed: " + String(e)), "error");
  }
}

async function detachFlow(): Promise<void> {
  return galleryFlow(async () => {
    if (galleryAttachment.state().kind !== "attached") return;
    if (!(await closeCurrentStoreWithGates())) return;
    _status(t("gm.detached"), true);
    try { _ctx?.gallery.refresh(); } catch { /* noop */ }
    renderGalleryManage();
  });
}

async function forgetFlow(entry: GalleryEntry): Promise<void> {
  // 孤儿 dirty surfaced（0825 案卷：忘记是孤儿缓存的主要出生点）：临时建店只读 dirty 标量再拆，
  //   有账就写进确认文案。建不出（无权限/absent）→ 不加注，照常确认。全量 GC 挂深清（P7）。
  let dirtyNote = "";
  try {
    const tmp = _buildStoreForGalleryEntry(entry) as unknown as { files: { dirty: { count(): Promise<number> } }; dispose(o?: { drain?: boolean }): Promise<void> };
    const n = await tmp.files.dirty.count();
    await tmp.dispose({ drain: false });
    if (n > 0) dirtyNote = "\n" + t("gm.forgetDirtyWarn", { n: String(n) });
  } catch { /* soft */ }
  const ok = await openConfirmSheet(t("gm.forgetTitle", { label: entry.label }), t("gm.forgetMsg") + dirtyNote);
  if (!ok) return;
  await galleryRegistry.forget(entry.id);
  _status(t("gm.forgotten", { label: entry.label }));
  renderGalleryManage();
}

// ---- 渲染（popup 内容；updateCloudAuthUI 每次一并调）----
let _rosterGen = 0;   // 名册异步填充的 epoch（§BUG C 竞态守卫）
export function renderGalleryManage(): void {
  const box = els.galleryListBox; const cur = els.galleryCurrentInfo;
  if (!box || !cur) return;
  const att = galleryAttachment.state();
  if (att.kind === "attached") {
    cur.textContent = t("gm.current", { label: att.entry.label, src: sourceLabel(att.entry) }) + (att.online ? "" : t("gm.offlineSuffix"));
    cur.classList.remove("hidden");
    els.galleryDetachBtn.classList.remove("hidden");
  } else {
    cur.classList.add("hidden");
    els.galleryDetachBtn.classList.add("hidden");
  }
  els.galleryConnectBtn.classList.remove("hidden");
  // 名册列表（当前库不列；卡标来源——撞名不设机制，user 拍板）。
  // epoch 守卫（案卷 20260830 §BUG C）：清空是同步的、填充是异步的——两次渲染落在同一个 IDB 往返窗口
  //   （boot 期 auth/attachment 事件密集）时，两个 fill 都往清空后的 box append = 名册整份×2（user 实锤）。
  //   旧 fill 过期即弃；填充时刻再清一次，杜绝跨窗残留。
  const gen = ++_rosterGen;
  void galleryRegistry.list().then((entries) => {
    if (gen !== _rosterGen) return;
    box.textContent = "";
    const others = entries.filter((e) => !(att.kind === "attached" && e.id === att.entry.id));
    for (const e of others) {
      const row = document.createElement("div");
      row.className = "gm-row";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "menu-item";
      btn.textContent = `${e.label} — ${sourceLabel(e)}`;
      btn.addEventListener("click", () => { void switchFlow(e, { askSeed: false }); });
      const x = document.createElement("button");
      x.type = "button";
      x.className = "gm-x";
      x.title = t("gm.forgetHint");
      x.textContent = "✕";
      x.addEventListener("click", (ev) => { ev.stopPropagation(); void forgetFlow(e); });
      row.append(btn, x);
      box.appendChild(row);
    }
  }).catch((e) => reportError(new Error("[gallery-manage] list failed: " + String(e)), "log"));
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
      // signIn = loginRedirect **整页跳走**（0.11.37 实锤），不是 popup——旧版无条件 signIn 在
      //   「已登录但旗死锁」（案卷 20260830 §BUG A）时=白跳微软一整圈、回程重掷竞态骰子的死循环（§BUG B）。
      //   已登录 → 原地翻牌即可；未登录才真跳（回程由 boot attach 的 online 收口接住）。
      if (!isSignedIn()) { await signIn(); return; }   // redirect：页面即离开，后续代码不跑
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
    reportError(new Error("[gallery-manage] reconnect failed: " + String(e)), "error");
  }
}

export function initGalleryManageUI(ctx: AppContext): void {
  _ctx = ctx;
  els.galleryConnectBtn?.addEventListener("click", () => { void connectFlow(); });
  els.galleryDetachBtn?.addEventListener("click", () => { void detachFlow(); });
  galleryAttachment.onChange(() => { _dismissed = false; renderGalleryManage(); });
  renderGalleryManage();
}

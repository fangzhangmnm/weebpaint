// app-store —— WeebPaint 装配 sync-store 的唯一点（cutover：薄库 + editor-session）。
//   只做 config 注入（provider / ui bundle / crypto codec / crypt / validateAdopt）+ auth 转发 + gallery 列举适配。
//   app 只碰 store 两面（**file / collection**）+ editor-session。绝不裸碰 kv/IDB/graph/vendor。
//   （localSettings/syncedSettings 那两面已于 2026-07-13 删除 —— 全部 KV 化进 collection。别照旧注释找。）
import { createStore, createOneDriveProvider, createFolderProvider, isCached, isDirty, requestStoragePersistence } from "@internal/store";
import { detectStoreAbsent, createNullStore, createDormantAuth } from "./store-absent.ts";
import { embeddedBlobUrl } from "./single-file.ts";   // P6 单文件内嵌读口（msal 逃生舱）
import type { Store, Collection as _Coll } from "@internal/store";
import { stripSessionExt, sessionFileName } from "./config.ts";
import { storeUI } from "./store-ui.ts";
import { CLIENT_ID, SCOPES, AUTHORITY } from "./config.ts";
import { zipReadEntry, zipPack, zipUnpack } from "./backend/zip.ts";
import { pack7z, unpack7z } from "./sevenzip.ts";
import { getPassword } from "./crypto-state.ts";
import { wirePreferences, initPreferences, setGalleryLayerLive } from "./app-prefs.ts";
import { wireAppState, initAppState, appState } from "./app-state.ts";
import { readSlate } from "./resume-slate.ts";   // activeFileName 守卫输入（P5：本机回执条真相）
import { builtinBrushInitData } from "./brushes.ts";
import { isDocPath, isImagePath, imageBasename } from "./gallery/cloud-image-model.ts";
import { naturalCompare } from "./gallery/natural-order.ts";

// ============ 显式装配（v0.8.7 · B 骑士）============
// store = 插件不是地基：装配收进 _assemble()，按 detectStoreAbsent()（?nostore / localStorage 开关）
// 选真 store 或 null-store（src/store-absent.ts——内存 collection / 空 gallery / 不落盘 / auth·加密 dormant）。
// 缺席模式下 createOneDriveProvider/createStore **完全不被调用**（零 IDB/localStorage 命名空间副作用）。
export const storeAbsent = detectStoreAbsent();

type _Prov = ReturnType<typeof createOneDriveProvider>["provider"];
type _Auth = ReturnType<typeof createOneDriveProvider>["auth"];
function _assembleReal(): { provider: _Prov | null; auth: _Auth; store: Store } {
  // P6 单文件：msal 从内嵌走 blob URL（file:// MSAL 无戏，这条是 http://localhost 逃生舱用——verdicts §2.9）。
  const od = createOneDriveProvider({ clientId: CLIENT_ID, scopes: SCOPES, authority: AUTHORITY, msalUrl: embeddedBlobUrl("msal-browser.min.js", "text/javascript") ?? "./vendor/msal/msal-browser.min.js" });
  return { provider: od.provider, auth: od.auth, store: _createRealStore(od.provider, () => od.auth.isSignedIn()) };
}

// 加密 codec 注入（不注入 = 加密 dormant）。
const cryptoCodec = { zipPack, zipUnpack, pack7z, unpack7z };

// 唯一 store（薄库）。app 建它（含 ui bundle）；migration 内部自跑（createStore 隐形，app 不 await）。
// P3：databaseId 参数化（registry 条目的 dbId；缺省 = 库默认 "defaultStore" = legacy OneDrive 库）。
const _createRealStore = (provider: _Prov, signedIn: () => boolean, databaseId?: string): Store => createStore({
  provider,
  ...(databaseId ? { databaseId } : {}),
  ui: storeUI,
  appId: "weebpaint",   // 本 origin 内唯一命名空间（databaseId 默认 "defaultStore"）：IDB 库 weebpaint.defaultStore + localStorage weebpaint.defaultStore.* 键，与兄弟 PWA(JRP 等)隔离
  // persist 三件套之②（store 0.6.0 表态制）：app 承诺在**挂图库手势时刻**调 requestStoragePersistence()
  //   （P3 verdicts：persist 只在 attach gallery 时申请，Editor-only 首开不申请）；库 boot 只做 persisted() 纯查询。
  persistence: "app-managed",
  // 薄命名（身份=全名）：**app 不再注入 fileName/encFileName**——库默认 fileName 恒等（身份即云端文件名）、
  //   encFileName 追加 .zip（加密容器外扩展名 ADR-0012）。app 在**边界**用 sessionFileName 把裸 session 名转成全名
  //   （X→X.ora）再传库（见 session-state 的 _file / editor-session 的 name；OUT 侧 itemToG 用 stripSessionExt 还原显示）。
  //   加密件云端 = X.ora.zip（追加，无损可逆），由库据字节加密态自动翻转，app 只管明文全名。
  //   身份从出生即全名——无迁移（无用户/无后向兼容，2026-07-13 清 tax；migration 框架留库内待将来）。
  crypto: cryptoCodec,
  crypt: {
    ext: "ora",
    makePeek: async (blob) => { try { return await zipReadEntry(blob, "Thumbnails/thumbnail.png"); } catch { return null; } },  // ora 内容知识只此一行
    getPassword,
  },
  // 采纳云字节前验真内容。**只看魔数**，不解密（这是 createStore 的 config，此刻 store 还没建好，
  //   也拿不到 store.encryption；而且这里本就只需要便宜的分流判定）。
  //   明文 ora = zip（PK\x03\x04）；加密容器 = 外壳 zip 或裸 7z —— 两者的头都在这四个字节里判得出，
  //   7z 魔数 "7z\xBC\xAF\x27\x1C" 前四字节即可识别。挡的是 captive-portal HTML / 截断字节。
  validateAdopt: async (blob) => {
    const h = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
    const eq = (at: number, ...b: number[]) => b.every((v, i) => h[at + i] === v);
    if (eq(0, 0x50, 0x4B, 0x03, 0x04)) return true;                  // ZIP "PK\x03\x04"：明文 ora，或加密件的明文外壳
    if (eq(0, 0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C)) return true;      // 7z  "7z\xBC\xAF\x27\x1C"：裸 .7z 容器（老格式）
    // 云盘图片 picker（spec 20260820 §5）：图片是合法 store 内容了——魔数放行，仍挡 captive-portal HTML/截断字节。
    if (eq(0, 0x89, 0x50, 0x4E, 0x47)) return true;                  // PNG
    if (eq(0, 0xFF, 0xD8, 0xFF)) return true;                        // JPEG
    if (eq(0, 0x47, 0x49, 0x46, 0x38)) return true;                  // GIF8
    if (eq(0, 0x52, 0x49, 0x46, 0x46)) return true;                  // RIFF（WebP 外壳）
    if (eq(0, 0x42, 0x4D)) return true;                              // BMP
    if (eq(4, 0x66, 0x74, 0x79, 0x70)) return true;                  // ISO-BMFF "ftyp"（AVIF/HEIF）
    return false;
  },
  autoCacheOpenedFile: true,
  signedIn,   // 连接态 store 自持（网盘模型）：OneDrive = auth.isSignedIn；folder gallery = 恒 true（本地即在线，权限掉→provider 失败呈离线）
  // 当前打开的 doc（全名）：cloud-gone 去抖 trash 绝不碰它（连 watchFolder 自动 reconcileFolder 也跳过，防 trash 掉开着的 clean 文件本地缓存）。
  //   P5（2026-08-27）：读 resume-slate 回执条（device 本机真相，永不同步——v438 毒化案结构化根治）。
  activeFileName: () => { try { const o = readSlate().opened; return o?.kind === "doc" ? sessionFileName(o.path) : null; } catch { return null; } },
});

const _asm = storeAbsent
  ? { provider: null, auth: createDormantAuth() as unknown as _Auth, store: createNullStore() }   // dormant auth：结构镜像 cast（同 null-store 纪律，smoke 点名 drift）
  : _assembleReal();
export const provider = _asm.provider;
const _auth = _asm.auth;

// ============ B2 窄接口（C7 裁定落地，2026-08-10）============
// app 消费的 store 面**只有四个**：file / files / collection / encryption（全仓实测，其余 grep 命中皆旧注释）。
// 裁定：全量手写镜像**不做**——「物理删除仍编译」的极端目标无受益方（headless 分层 = WeebPaintBackend，
// 零 store 依赖；运行时缺席已由 null-store 达成），而镜像是 drift 源（维护成本 > 收益，
// epoch-handoff §B2 的怀疑成立）。收敛形 = **派生窄 Port**（Pick 自库类型 SSoT，零镜像零 drift）：
// 面收窄在此单点声明；app 若碰四面之外的成员 = 编译错。类型 import 也收拢本接缝（下方 re-export）。
export type AppStorePort = Pick<Store, "file" | "files" | "collection" | "encryption">;
// P3 热插拔：store 是 **live binding**（export let，全仓实测零模块级捕获——消费方都在调用点访问 store.xxx）。
//   换库 = _swapStoreForGallery 重指 + 重灌 collections + 广播 wp:gallery-changed；旧实例已 dispose，
//   谁还攥着旧 collection 句柄谁就吃 StoreDisposedError（响亮死是契约，不是失败）。
let _storeFull: Store = _asm.store;            // 全 Store（含 dispose）——只有 attachment 器官经 seam 摸它
let _isNull = storeAbsent;                     // 当前是不是 null-store（无库模式/absent）；cloud-capability 的真相源
export let store: AppStorePort = _storeFull;
/** 有活店？（attachment attached 或 legacy 预建店在岗）。P3 sunset：isCloudEnabled 的新真相。 */
export function hasLiveStore(): boolean { return !_isNull; }
export type { Collection, EncryptedBlob } from "@internal/store";   // app 侧仅剩的两个库类型，经接缝转口

// ============ 设置/状态 collection（4 个）注入 ============
// app-prefs/app-state **不 import 本文件**（防 i18n→app-store→store-ui→i18n 成环）；由此处建好 store 后惰性注入。
//   synced 变体上云 + scaffold；{local:true} 变体 local-only（设备本地、不碰云）。boot 门 await init* 后才读写。
//   P3：抽成 _wireCollections（换库重灌复用；wirePreferences 重调会自动重置 ready 门）。
// ---- brush-rack collection（逐 brush 一 item + 一条 .meta）：持久化 + 云同步唯一入口，红线在库内。----
//   getInitData（brushes.ts 域构造）：仅当这份 collection 的 json 不存在（新库）时 fetch builtin-brushes.json。
//   P3 起 live binding（换库重灌；app.ts 在 wp:gallery-changed 里 brushRack.rebind(brushRackCollection)）。
export let brushRackCollection: _Coll;
// 「继承当前笔刷」种子（P3 verdicts §1.9）：一次性覆写下一次 rack collection 的 getInitData——
//   只对**空库**生效（getInitData 契约：json 已存在则忽略），与 builtin 播种同一条路 → 天然无竞态无重复。
let _nextRackInit: { id: string; value: unknown }[] | null = null;
export function _seedNextRackInitData(items: { id: string; value: unknown }[] | null): void { _nextRackInit = items; }
function _wireCollections(): void {
  wirePreferences(store.collection("local-user-preference", { local: true }), store.collection("synced-user-preference"));
  wireAppState(store.collection("synced-app-state"), store.collection("local-app-state", { local: true }));
  const rackSeed = _nextRackInit; _nextRackInit = null;
  brushRackCollection = store.collection("brush-rack", { getInitData: rackSeed ? async () => rackSeed : builtinBrushInitData });
}
_wireCollections();   // boot 装配（此后每次换库经 _swapStoreForGallery 重灌）
setGalleryLayerLive(!storeAbsent);   // P6 cascade 开关：absent = 无库起步（gallery scope 落 device 层）

// ============ P3 热插拔 seam（只准 gallery-attachment-host 调）============
/** 换当前 store 实例（next=null → null-store = 无库模式）。重灌 4+1 collections、重跑 init 门、
 *  广播 wp:gallery-changed（笔架等持句柄消费者在 app.ts 监听重挂）。旧实例的 dispose 由调用方（attachment 器官）负责。 */
export async function _swapStoreForGallery(next: Store | null): Promise<void> {
  _storeFull = next ?? createNullStore();
  _isNull = next == null;
  store = _storeFull;
  _wireCollections();
  setGalleryLayerLive(next != null);   // P6 cascade：无库 → gallery scope 读写落 device 层
  await Promise.all([initPreferences(), initAppState()]);   // wirePreferences 重调已重置 ready 门（app-prefs 不 import 本文件，无环）
  try { window.dispatchEvent(new Event("wp:gallery-changed")); } catch { /* node 测试环境无 window */ }
}
/** attachment 器官取全 Store（dispose/files.dirty 面）。app 层其余一律走 AppStorePort。 */
export function _currentFullStore(): Store { return _storeFull; }
/** persist 三件套③执行体（手势时刻调；fire-and-forget，结果永不改变数据安全行为）。值级 import 收拢本接缝。 */
export function requestGalleryPersist(): void {
  if (!storeAbsent) requestStoragePersistence().catch(() => { /* 降概率层，静默 */ });
}
// boot 预建实例的一次性移交（P3 Slice C）：boot 时 registry 说了算——legacy OneDrive 条目领养它、
//   其余情形（folder / 非 legacy）规矩 dispose 后另建。取过一次或 absent 模式 = null。
let _bootStoreTaken = false;
export function _takeBootStore(): Store | null {
  if (_bootStoreTaken || storeAbsent) return null;
  _bootStoreTaken = true;
  return _storeFull;
}
/** 为 registry 条目建新 store 实例（不换当前——换是 _swapStoreForGallery 的事）。 */
export function _buildStoreForGalleryEntry(entry: { kind: "onedrive" | "folder"; dbId: string; handle?: unknown }): Store {
  if (storeAbsent) throw new Error("store-absent mode: cannot build gallery store");
  if (entry.kind === "folder") {
    if (!entry.handle) throw new Error("folder gallery entry has no handle");
    const prov = createFolderProvider(entry.handle as Parameters<typeof createFolderProvider>[0]) as unknown as _Prov;
    return _createRealStore(prov, () => true, entry.dbId);   // folder=本地即在线；权限掉→provider 失败呈离线态（P3 verdicts §1.7）
  }
  if (!provider) throw new Error("onedrive provider unavailable");
  return _createRealStore(provider, () => _auth.isSignedIn(), entry.dbId === "defaultStore" ? undefined : entry.dbId);
}

// ============ auth（转发）============
export const isAuthConfigured = () => _auth.isAuthConfigured();
export const initAuth = (...a: Parameters<typeof _auth.initAuth>) => _auth.initAuth(...a);
export const signIn = (...a: Parameters<typeof _auth.signIn>) => {
  // persist 三件套之③（P3）：signIn = 现阶段唯一「挂图库」手势。在手势**入口**即调（popup 往返会耗尽
  //   user activation，Firefox 的 persist 弹窗要活着的手势）；fire-and-forget——结果永不改变数据安全行为
  //   （库契约：persist 是降概率层，真承重 = dirty 窗口短 + 正本不进 IDB）。Slice B 起移进 attachment.attach()。
  if (!storeAbsent) requestStoragePersistence().catch(() => {});
  return _auth.signIn(...a);
};
export const signOut = (...a: Parameters<typeof _auth.signOut>) => _auth.signOut(...a);
export const isSignedIn = () => _auth.isSignedIn();
export const getActiveAccount = () => _auth.getActiveAccount();
export const retrySilentSignIn = (...a: Parameters<typeof _auth.retrySilentSignIn>) => _auth.retrySilentSignIn(...a);
export const getToken = (...a: Parameters<typeof _auth.getToken>) => _auth.getToken(...a);
export const onAuthChanged = (cb: Parameters<typeof _auth.onAuthChanged>[0]) => _auth.onAuthChanged(cb);
export const getAuthState = () => _auth.getAuthState();
// wp:auth-changed window 广播由**接缝**派发（@internal/store 0.1.0 起库不再碰 browser 事件——
//   订阅走 auth.onAuthChanged 回调，window 事件是 WeebPaint 自己的 UI 约定）。缺席模式 dormant auth 的
//   onAuthChanged 是 noop，天然不发。
_auth.onAuthChanged(() => { try { window.dispatchEvent(new Event("wp:auth-changed")); } catch { /* node 测试环境无 window */ } });

// 上次登录 flag（设备级 auth flag → local-app-state collection，经 appState struct）。boot 门 init 后才读写。

// ---- gallery 数据：统一列举（local ∪ cloud，每项带 syncState）。reconcile 已进库（watchFolder 惰性 per-folder）。----
// 扩展名路由（spec 20260820 §2/§3）：库零内容格式知识——扩展名知识全在 gallery/cloud-image-model.ts（纯模块，可测）。
//   gallery 白名单 = 画作/加密容器；图片走 watchFolderImages（picker）；其余杂物只在 OneDrive 侧可见。
const _CLOUD_STATES = new Set(["cloud-only", "synced", "unpushed", "newer-on-cloud", "conflict"]);   // 有云版的 syncState
// Item{path,syncState} → 旧 GalleryItem{name,local,cloud,dirty,ghost}（gallery-view-model 兼容；派生自 syncState）。
function itemToG(it: { path: string; syncState: string; lastModified?: number; size?: number }) {
  const name = stripSessionExt(it.path);
  return {
    name,
    // 本地项也带 size/updatedAt（listing 现从本地缓存记录填）→ 离线 / 云端帧到达前不显 0B/1970（itemTime 优先读 local.updatedAt）。
    local: isCached(it.syncState as never) ? { name, size: it.size, updatedAt: it.lastModified } : null,
    // size 从 store Item 带出来（listing 已从云端 c.size 或本地 stat 解析）→ 图库显真尺寸而非 0 B。
    cloud: _CLOUD_STATES.has(it.syncState) ? { path: it.path, name, size: it.size, lastModifiedDateTime: it.lastModified ? new Date(it.lastModified).toISOString() : undefined } : null,
    dirty: isDirty(it.syncState as never),
    ghost: it.syncState === "ghost",
    pendingGone: it.syncState === "pendingGone",   // clean cloud-gone 孤儿、防抖 grace 内 → gallery 显 badge + 重传/删动作
    // 云端字节比本地新（本地有副本 ∧ 云 etag 动了 = newer-on-cloud / conflict）→ thumb 取图必须走
    //   getPeek source:"cloud"（QA 2026-08-21「新 token 配旧字节」根修）：这两态下 it.lastModified 是
    //   **云端**戳（listing cf 优先），若字节仍本地优先取，就会把旧本地字节配新云 token 写进缩略图缓存 = 永不自愈。
    //   conflict 也算：token 同样是云戳，只有云字节配得上它（本地 dirty 字节没有可用的本地戳；缓存诚实 > 展示偏好）。
    cloudNewer: it.syncState === "newer-on-cloud" || it.syncState === "conflict",
    // badge 去压扁（老账 C，20260820 handoff §2C；user 2026-08-25 拍板开工）：这两态不再被压平成
    //   synced/unpushed——分叉工作流后「原名有云端新版待看」的可见性全靠它们。
    newerOnCloud: it.syncState === "newer-on-cloud",
    conflict: it.syncState === "conflict",
  };
}
// watchFolder（网盘模型）：订阅**当前文件夹** → 立即本地帧、云端到了同一 cb 再闪。app 只知「这一夹更新了」。
//   替代全树列举（JRP 开夹慢的根因）；连接态 store 自持、无 ctx。folderNames = immediate 子夹名。（映射 store.Item → app GItem。）
// ---- 云盘图片条目（gallery 次级 tile + cloud-picker 共用形；spec 20260820 §2/§3，v0.9.34 图片进图库）----
//   身份 = **全名 path**（含扩展名，直接就是 store.file 的 key——图片没有裸名/全名的 ora 代数）。
export interface CloudImageItem {
  path: string;           // 全路径含扩展名（= store.file key / 缩略图缓存 key）
  name: string;           // basename（显示用）
  size?: number;
  lastModified?: number;  // 缩略图新鲜度 token 的原料（退 size）
  cached: boolean;        // 本地有副本（离线可用徽章）
}
const _toImageItems = (items: { path: string; syncState: string; lastModified?: number; size?: number }[]): CloudImageItem[] =>
  items
    .filter((it) => isImagePath(it.path))
    .map((it) => ({
      path: it.path,
      name: imageBasename(it.path),
      size: it.size,
      lastModified: it.lastModified,
      cached: isCached(it.syncState as never),
    }))
    // 素材收件箱语义：新的在前（lastModified 倒序，缺失退名字倒序；自然序见 natural-order.ts）
    .sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0) || naturalCompare(b.name, a.name));

export function watchFolder(
  folder: string,
  cb: (snap: { path: string; items: ReturnType<typeof itemToG>[]; images: CloudImageItem[]; folderNames: string[] }) => void,
): () => void {
  const prefix = folder ? `${folder}/` : "";
  return store.files.watchFolder(folder, (snap) => {
    cb({
      path: snap.path,
      // 文件名**倒序**（自然序 numeric，见 natural-order.ts）：新文档名 yyyymmdd-xxxx → 新日期在前，稳定（不随存盘时间跳）。
      //   store 列举顺序不保证；排序是 app 展示策略（对齐 gallery-model.sliceFolder 的既定倒序），故在此 app 层做。
      // 路由：画作（isDocPath）= 主 tile；图片 = 次级 tile（v0.9.34 拍板：可见+孪生语义，替代已删的＋菜单 picker 入口）；
      //   其余杂物（.md 等）不进图库（诚实性余账见 ai-docs/20260820-gallery-hidden-files-honesty-handoff.md）。
      items: snap.items.filter((it) => isDocPath(it.path)).map(itemToG).sort((a, b) => naturalCompare(b.name, a.name)),
      images: _toImageItems(snap.items),
      // 文件夹 tile 自然序正排（store 列举顺序不保证；user 2026-08-21：10 要排在 2 后面）
      folderNames: snap.folders.map((f) => f.slice(prefix.length)).filter(Boolean).sort(naturalCompare),   // 全路径 → immediate 段
    });
  });
}

// cloud-picker 数据面（图层/参考窗入口仍用；与 watchFolder 同一订阅面，只留图片）。
export function watchFolderImages(
  folder: string,
  cb: (snap: { path: string; images: CloudImageItem[]; folderNames: string[] }) => void,
): () => void {
  const prefix = folder ? `${folder}/` : "";
  return store.files.watchFolder(folder, (snap) => {
    cb({
      path: snap.path,
      images: _toImageItems(snap.items),
      folderNames: snap.folders.map((f) => f.slice(prefix.length)).filter(Boolean).sort(naturalCompare),
    });
  });
}

/** picker 选中后取整份图片字节（本地缓存优先、整份拉云、autoCacheOpenedFile 顺手落缓存）。拿不到 → null。 */
export const openCloudImage = (path: string): Promise<Blob | null> =>
  store.file(path, { isZip: false, mode: "existing" }).open();
// ⛔ listGallery（全树列举）已删 2026-07-12——**库唯一列举面 = store.watchFolder（订阅当前夹）**，app 包成 watchFolder。
//   app 原则上不知道别的 folder 内容（内存只放当前夹）；名字碰撞由 store rename/saveAs 目标护栏内化检测（撞名抛 CloudNameCollisionError），不靠先 list 目标夹。
// 回收站视图：store.listTrash 返**两端聚合**的 TrashItem[]（side/localKey/cloudRef/encrypted/conflictLive）→ 映射成 gallery 的 TrashGItem。
//   local/cloud 两腿据 localKey/cloudRef 填（app 原有 both-side 模型此前从没被本地腿填充；0.4.0 id→ref 行李牌语义改名）。只元数据，无 blob。
export const listGalleryTrash = async () => (await store.files.listTrash()).map((it) => ({
  name: stripSessionExt(it.name),
  deletedAt: 0,
  encrypted: it.encrypted,
  conflictLive: it.conflictLive,
  local: it.localKey ? { name: stripSessionExt(it.name), trashKey: it.localKey, encrypted: it.encrypted } : null,
  cloud: it.cloudRef ? { path: it.name, id: it.cloudRef } : null,
}));


# P3 gallery 多实例侧 —— UX grill 拍板案卷

> created 20260827 · by Claude Fable 5（grill 对话 = user 2026-08-27 逐条拍板）
> as-of v0.11.14 / 2026-08-27。上游案卷 = `20260825-localfile-knight-grill-verdicts.md` §2.3-2.5/§4-P3；settings 侧 = `20260827-p5-settings-destore-proposal.md` §9.8。

## 0. 范围

P3 = 无地骑士工单第 6 步（P1/P1.5/P2/P4/P5 已落）：registry + 创建图库 UX + attach/detach 热插拔 + 锁名改造 + persist 时机 + cloud-enabled 收编退役。版本落 **0.11.x 继续**（user 拍板「还是 11」，不开新 minor，不触发 push-prod 家规问）。

## 1. 新拍板（本 grill，user 2026-08-27）

1. **UI 落点 = VS Code 模型**：库的生死管理（切换/连接/卸下/忘记）**全住 gallery 页**；**有库模式**下切库前置 = 退出编辑 + 全不脏（绿灯门）；**无库模式**编辑器只有单一小入口「连接图库…」（VS Code 无文件夹时 Open Folder 姿态）；设置页「这个图库」区只读显示当前库。UI 细节做了再迭代（user：「先这样做试试，UI要做了才知道」）。
2. **本地文件夹 = 选哪就是哪**（类 VS Code，不自作主张建子文件夹）；空夹=新库、有 .ora 的夹=挂上即列举。**嵌套语义**：认根目录 `.weebpaint`——嵌在库里的别家图库，其管理区（`.weebpaint`/`.trash`/`.backup`）不可见不可碰，**画照常列举可开可画**（user：「里面的就是别人的文件，画还是可以访问」）。fact-check：store 现状白送——列举规则「任意层级 basename 带点即隐藏」+ 保留根 `.<appId>` 已实现此语义，零库改动。
3. **`.weebpaint` 界线**（0825 否决条补注，user 确认原文）：`.weebpaint/` 作为**存在标记/管理容器**（collections+安全网，store 现状）合法；**身份标记**维持否决——里面永不放 gallery id/GUID，registry id 永远 device-local，同夹二挂查重只靠 isSameEntry，不靠源内任何字节。
4. **标签纯派生，不可编辑，无撞名机制**：folder → 文件夹名（handle.name）、OneDrive → 「OneDrive · 账号名」；attach 时从 handle.name 刷新（尽力自愈；FSA 无反查现名 API，改名后 name 可能停旧值——挂真机批，不承诺）。撞名不做后缀不做改名（user：「显示名撞又怎么了」）——picker 卡片**标来源**即可；单库模式当前库一个 badge。
5. **手动切库 → 落 gallery 页**（boot 仍 canvas-first + resume-slate 恢复）；落页零写入回执条，天然不覆盖「上次开的画」记录。**resume-slate 归属确认**：按 gallery 键控（每库一张）、物理存 device 层本机、**永不云同步**（v438 毒化案红线：驱逐守卫输入必须本机真相）。
6. **绿灯门逃生**：detach 扫到 dirty → surface「N 张未上云」三口：**下载备份**（逐张导出，走 save hub 既有通道）/ **仍要切换**（dirty 留本机缓存等回来补推；**明示警告：浏览器可能清掉本机缓存，不是保险箱**）/ 取消。数据安全：dirty 缓存永不驱逐、卸下默认保留缓存、重挂即补推（词典序第一条不破）。
7. **权限/token 掉 = 库离线，不算 logoff**（与现状行为一致）：缓存照看照画、dirty 攒着；**主动引导**非模态横幅「图库已离线，重新连接」（一键手势入口，可关闭）+ 常驻 chip 兜底——「主动引导而不是用户自觉点」是现状缺的增量。boot 永不弹窗、永不 redirect（家规：只有 signIn 手势能导航）。※ 这不是被否决的「toast 邀请」（那条否的是拉新邀请）；这里是「冲突/断连必 surface」的正面义务。
8. **cloud-enabled sunset**（P5 §9.8 裁定的 P3 落地，user 本轮点名「别忘了」）：toggle 退役 → 「卸下图库/选择图库」动词；isCloudEnabled() 消费者全改读 attachment 真状态；关 = 真不建 store 实例；播种 false→lastActive=null 后退役。isAuthConfigured() 独立保留。
9. **新库播种 = 创建模态一个勾**：「继承当前笔刷与设置」（默认勾）vs 出厂全新。勾 = 当前活跃 rack 快照 + 当前 gallery 层设置一次性拷入新库（拷贝即分叉，此后独立）；不勾 = 笔刷内置默认起步、settings 走 device cascade 兜底（settings 侧零播种即正确）。
10. **OneDrive 多账号 = 结构支持、UX 不打磨**：registry 条目带 homeAccountId（store 0.4.0 口子）、连接时 account picker 选哪个账号铸哪个的库、切库自动切对应 token；不做账号管理页/头像列表。personal-account-only 家规不动。
11. **版本 = 0.11.x 继续**（0.11.15 起步）。

## 2. 沿用不动（0825 案卷已拍，只做）

registry 形状（device-local 小 IDB、铸 opaque id、db 名 `weebpaint-bd6cece69075d759.gallery-<id>`、ADR-0024）；创建入口 = 文件菜单模态二选（→ 本轮修订：入口按拍板 1 收进 gallery 页/无库单入口）；detach 五步（收口开画→停 watcher→drain→绿灯 dirty 扫→销毁，缓存默认保留）；锁名 `gallery-id:相对path`；persist 只在 attach 手势申请（对口 store 0.6.0 persist 三件套）；热插拔不重启；transient dirty 登录流（桌面 popup / iOS redirect+待领养）；孤儿缓存 attach 扫 dirty surfaced、无 dirty GC 挂深清。

## 3. 器官提案 .h（pin 住的契约；实现中形状变了要回写）

```ts
// ---- src/gallery-registry.ts（新器官）——device-local 图库名册 ----
// ADR-0024 红线：per-gallery / device-local / 永不同步。id 非路径非身份主张，本机局部。
export type GalleryKind = "onedrive" | "folder";
export interface GalleryEntry {
  id: string;                          // 铸的 opaque id
  kind: GalleryKind;
  label: string;                       // 派生快照（attach 时刷新）；不可编辑
  dbId: string;                        // store databaseId：legacy OneDrive = "defaultStore"（既有缓存/dirty 零迁移）；新铸 = `gallery-<id>`
  homeAccountId?: string;              // kind=onedrive：账号引用（多账号=多条目）
  handle?: FileSystemDirectoryHandle;  // kind=folder：FSA 句柄（IDB structured clone）
  lastActive: number | null;           // null = 未激活/已卸下（LWW 便利值，非红线）
  createdAt: number;
}
export interface GalleryRegistry {
  list(): Promise<GalleryEntry[]>;
  mintFolder(handle: FileSystemDirectoryHandle): Promise<GalleryEntry>;  // isSameEntry 查重→复用旧条目+刷新 label
  mintOneDrive(homeAccountId: string, label: string): Promise<GalleryEntry>;  // 同账号查重→复用
  touch(id: string): Promise<void>;              // lastActive = now
  clearLastActive(): Promise<void>;              // 卸下 → 无激活库（boot 进无库模式）
  forget(id: string): Promise<void>;             // 只删条目不动源；缓存库 GC 挂深清
  lastActive(): Promise<GalleryEntry | null>;
}

// ---- src/gallery-attachment.ts（新器官）——当前挂载（tab 级真状态；cloud-enabled 继任者）----
export type AttachmentState =
  | { kind: "detached" }                                        // 无库模式（Editor Only）
  | { kind: "attached"; entry: GalleryEntry; online: boolean }; // online=false = 离线态（权限/token 掉，不算 logoff）
export interface GalleryAttachment {
  state(): AttachmentState;
  attach(entry: GalleryEntry, opts?: { seed?: SeedBundle }): Promise<void>;
    // = 建 store 实例（databaseId=entry.dbId）→ collections 重灌（preferences.attach + brush-rack 重挂
    //   + appState 重接）→ persist 手势（requestStoragePersistence）→ touch(entry.id) → 广播 wp:gallery-changed
  detach(): Promise<{ ok: true } | { ok: false; reason: "doc-open" | "dirty"; dirtyCount?: number }>;
    // 五步：收口开画（调用方先保证）→ 停 watcher → drain in-flight → 绿灯门 dirty 扫（store.files.dirty.count）
    //   → dispose({drain:true})。dirty>0 → 返回不销毁，UI 走逃生 sheet；强切 = forceDetach()（dispose({drain:false})，缓存保留）
  forceDetach(): Promise<void>;
  onChange(cb: (s: AttachmentState) => void): () => void;
}
export interface SeedBundle { rack?: unknown; gallerySettings?: Record<string, unknown> }  // 「继承当前笔刷与设置」勾

// ---- src/app-store.ts（改造）——store 门面化 ----
// export const store: AppStorePort 保持**稳定引用**，内部委托当前实例（热插拔不换 import 面）；
// 换库后旧 collection 句柄 StoreDisposedError 响亮死——持句柄的消费者（brush-rack 等）监听
// wp:gallery-changed 重新取（window 事件 = WeebPaint UI 约定，同 wp:auth-changed）。
```

## 4. 落地台账（全部已推 dev；提案 .h 回写见 §3 附注）

> edited by Claude Fable 5, 2026-08-27（实现同日完成；形状回写）

- **v0.11.15 = Slice 0+A**：收货 store 0.6.0（persistence 表态 + requestStoragePersistence 手势入口）+ gallery-registry 器官 + boot 播种接线。
- **v0.11.16 = Slice B**：热插拔机器面——app-store live binding 化（`export let store/brushRackCollection` + `_swapStoreForGallery` 重灌+重跑 init 门+广播 `wp:gallery-changed`）+ gallery-attachment 器官（五步 detach 契约测试钉死）+ 笔架 `rebind` + null-store 补 dirty/persistence 面。
- **v0.11.17 = Slice C**：gallery-connect 动词中心 + boot 静默重挂 + **active-gallery.ts**（「当前库 id」唯一真相：锁名/回执条/安家铸户口三处接管）+ OneDrive 离线翻牌接 wp:auth-changed。
- **v0.11.18 = Slice D**：图库管理面（住 gallery 云 popup：当前库+来源标/名册切换/连接二选/卸下/忘记✕）+ 播种二选 sheet + 绿灯门逃生 sheet（下载备份=pushAll+failed 逐张下载）+ 离线主动引导横幅 + iOS 手势红线走 onPick。
- **v0.11.19 = Slice E**：cloud-enabled sunset（isCloudEnabled 真相源换 `hasLiveStore()`；toggle 退役；设置页只读当前库行）+ 编辑器无库单入口「连接图库…」+ 忘记时孤儿 dirty surfaced（临时建店读标量）+ thumb 缓存 key 加库域。

### §3 提案回写（实现中定型的形状偏差）

- **legacy 连续性拍定（Slice C 关键决定）**：认领 `defaultStore` 的条目 **id = "default"**（= SOLE_GALLERY_ID）——锁名 `default:名`、回执条键 `resume:default`、thumb 缓存 key 与 P3 前逐字节相同，**零迁移**。
- registry：`mintOneDrive(homeAccountId, username)`（label 内部派生）；+`relabel(id,label)`（attach 尽力自愈）；`seedLegacyOneDrive` 挂在 registry 对象上。
- attachment：`attach(entry, opts?{online})`；+`bootAdopt(entry, store, opts?)`（boot 领养预建实例，零换店零重灌）；dep `setLockGalleryId` 广义化为 `setActiveGalleryId`（active-gallery.ts）。
- 连接动词拆分：`mintFolderByPicker()/mintOneDriveByAccount()` 返 `{entry, created}`（与挂载分离，UI 在中间问播种）+ `attachGallery(entry)` + `bootAttachFromRegistry()`。
- 「继承」种子实现 = `_seedNextRackInitData()` 一次性覆写 rack collection 的 getInitData（只对空库生效——与 builtin 播种同一条路，天然无竞态无重复）；gallery 层 prefs 直接 preferences.set 拷入。
- UI 形状偏差：「创建时打勾」落地为**二选 sheet**（继承[默认高亮]/出厂全新，复用 openChoiceSheet 不造新件）；管理面住 gallery 云 popup（原 Q1 拍板的自然落点，UI 做了再迭代）。
- cloud-enabled sunset 实现：`isCloudEnabled()` 保名换真相源（= `hasLiveStore()`，auth 无关化——folder 库无需登录也是有库），10 个消费文件零改动；`cloudPrefEnabled` 只剩播种源；`CLOUD_CAPABILITY_EVENT` 由 wp:gallery-changed 驱动。

## 5. 余账 / park

- **P6**：设置页无库态折叠（lang 有 device cascade，无库时该区仍有意义——折叠等 Editor-only build 语境）；single html 构建套（原案）。
- **P7**：孤儿缓存库全量 GC（忘记时已 surfaced dirty，全量扫挂深清）；`cloud-enabled` pref 键物理清理。
- **store escalation（下次 store 轮）**：OneDrive provider 的 per-account pin（现状 provider 绑 MSAL active account，`getTokenFor(homeAccountId)` 只在 auth 面——多账号切库需先交互登录切 active；结构支持已够 Q8 档位，真多账号顺滑需 provider 级口子）。
- **真机验证批（并入 0825 案卷 §6 攒批）**：folder 改名后 handle.name 是否更新（标签自愈）；FSA 句柄跨改名存活；Chrome 持久权限静默重取（boot query 分支）；多账号 token 切换；切库全流程（绿灯门/逃生/播种）；离线横幅一键重连；itch/file:// 形态照旧。

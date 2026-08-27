# 无地骑士 提案 .h（目标契约草案）

> created 20260825 · as-of v0.10.30 / 2026-08-25 · by Claude Fable 5
> 按 API ritual：现状 .h = 仓内 `api/`（v0.10.30 现值）；本文 = **pin 住的目标契约**——实现中形状变了必须回写本文。
> 范围：app 侧。store 侧只列 agenda（结案 doc §5），契约由 store 轮与人类逐条定。
> 纪律：纯 d.ts 风格草案，非生成物；命名用既有标准词，领域词只给领域物。

> **落地回写（v0.11.0 / 2026-08-26，edited by Claude Fable 5）**：P1「身份联合类型 + 家动词」slice 已落
> `src/doc-home.ts`（DocHome 原样；`handle` 用仓内 `LocalFileHandle` 最小面 = FileSystemFileHandle 结构等价）。
> 形状差异：① DocHomeKeeper 拆成两半——**状态持权** = doc-home keeper（`docHome()`/`fileDirty()` 只读 +
> `claimHomeAuthority()` 单持权动词，workpiece 令牌手法，session-state 是唯一持权者），**编排动词**（save/saveAs/exit）
> 仍在 session 门面；`settle()` 待 P2（transient 本 slice 无产者，`saveRoute` 已派发 + 矩阵测试钉）；`exportTo` 仍归
> export-import-menu hub（导出不清 dirty 由「导出路径拿不到 clearFileDirty」结构保证）。② 新增纯件：`saveRoute()`
> （(家×动作) 保存派发表）、`homeDisplayName()`（导出/建议名基名）、`SOLE_GALLERY_ID`（P3 registry 铸 id 前的占位）。
> ③ `session.name`/`session.localFile` 已私有化 → `session.home` 联合快照，消费点全部 switch/kind 判别。
> 契约测试 = `test/doc-home.test.mjs`。
>
> **落地回写②（v0.11.1–0.11.3 / 2026-08-26，edited by Claude Fable 5）**：P1 其余项：
> ④ **NamingOrgan** 落 `src/naming.ts`（galleryDefaultName=yyyymmdd-hex4 / downloadStamp / downloadName；
> 撞名 -1/-2 留在有占用谓词的 sink 侧 = cloud-image-model.nextFreeExportName，本地下载浏览器自补 (1)）；
> 新建空输入禁「未命名」落日期名。⑤ **标题栏** = save-status `_updateDocTitle`（document.title=画名+dirty 点，
> 跟 updateSaveStatus 中心渲染点）。⑥ **IntakeHub** = import-image.ts 扶正（`sniffFileKind` 唯一嗅探 +
> `intakeOraDoc` 唯一 ora 进口，picker/拖拽/launchQueue/file-input 四路全走；wp:importOraFile 事件通道删；
> 笔刷字节仍归 brush-io，P5 轮再议）。⑦ **SaveHub 打开侧**：「打开本地文件」恒显单按钮，FSA 优先静默落
> file input（导入为新身份），AbortError 不降级重弹；保存侧派发已由 saveRoute+既有「导出与另存」hub 覆盖。
> ⑧ **canvas-first boot**：404/崩溃断路/双实例锁 三条失败路落画布（boot-restore outcomes 改 blank-*）；
> ~~⚠ 首开半格待裁~~ → **v0.11.4 终案（user 2026-08-26 拍板「首次打开新画布，上次图库则图库」）**：
> currentFile 三态（null=首次→lazyblank 新画布 / ""=上次图库→图库 / 名→恢复）；lazyblank=日期名
> memory-only、es 不绑（空白永不落盘）、首笔 onChange 钩子自动安家（§1.2 Procreate 性）；
> 失败三路同落 lazyblank 可画新画布；云关仍 plain blank（无 store 家可安，P2 transient 接手）。
>
> **落地回写③（v0.11.5 / 2026-08-26，edited by Claude Fable 5）**：P2 首 slice **T-crash 核心**落地：
> CrashStore 契约 → `src/crash-store.ts`（本文 pin 形状 + 两处扩充：**`discard(tag)`**（恢复横幅「丢弃」
> 按钮——用户显式决定可删 pending，自动清扫不可）；**`adopt` 返 `Blob | null`**（null=已被另一窗口领走，
> 双领养第二个必须扑空而非 throw）。存储走 CrashKV port（原子性=port 的 take：get+delete 同事务）→
> 契约 node 可测（test/crash-store.test.mjs），IDB 适配器进真机批；库名 `weebpaint-bd6cece69075d759.crash`）。
> 接线：file 家行李牌（openLocalFile 现铸/离家即焚）+ 30s 空闲盲快照（bgJobs，serial 门防重编码，
> 与保存同一 `_encodeCurrentOraWithPeek` 字节）+ 显式写回成功清旧帧 + pagehide(非 bfcache)=正常关闭即删
> + boot 恢复横幅 `src/crash-banner.ts`（非模态浮卡；恢复=领养→uniqueNameFor 新身份→adoptAsNew=dirty
> 到首次真保存；流产 put-back 防「点恢复中途取消=丢画」）。
>
> **落地回写④（v0.11.6 / 2026-08-26，edited by Claude Fable 5）**：**transient 产者 + settle + 三键挽留**：
> 云关 boot 空白画布 = transient 家（此前 home:null 裸奔：Ctrl+S 死路、崩溃全丢；user 拍板「关gallery进
> local first则要么双击打开进文件要么新画布」）。`settle` 形状与提案差异：**无 target 参数**（现阶段唯一
> 去向=file：云关无 gallery 可安、云开无 transient 产者——Editor Only 挂 gallery 的双去向到 P3/P6 再回填；
> 实名 `settleToFile`，FSA 另存框→写→**换家即清 dirty**（keeper.setHome 结构保证「回家才清」）；无 FSA 落
> download=责任移交 toast、dirty 如实留着、**不算安家**）。keeper 的 mark/clearFileDirty 扩到 file|transient
> 同轨（gallery/无家仍 throw）。三键挽留 = `leaveLocalDoc`（原 leaveLocalFile 扩容）：离开脏 transient →
> 保存(settle)/丢弃/取消，download 未安家不放行。盲快照/行李牌/pagehide 即删全覆盖 transient；
> 崩溃恢复云关分支 = `adoptAsTransient`（不落看不见的图库，立即标脏+重挂保护）。
> **P2 余**：pending-adoption 产者（P3 redirect 流）+ 夏音 v0.3 真机基准；云关「新建」popup 仍建
> IDB 图库画（2026-08-21 v1 刻意范围，未动——要不要也 transient 化留给 user）。
>
> **落地回写⑤（v0.11.7-0.11.8 / 2026-08-26，edited by Claude Fable 5）**：v0.11.7 = 收货
> @internal/store 0.5.0（app 迁移面 cloudItemId→cloudRef ×3；dispose/dirty facet/folder provider 为 P3 备货）。
> v0.11.8 = **P4 revert v2 全量**：CheckpointRing 落 `storage.ts` checkpoint-ring store +
> `checkpoint-policy` ring 纯策略（planRingEviction 字节预算桌面64/移动32MB 最旧先走、**新档永不淘汰**
> ——超预算巨档也存；isNewSitting 输入间隔 qualifier 15min 可调；humanCheckpointTime 人话时间）。
> 与提案差异：capture/list 不是独立 CheckpointRing 接口对象——capture 编排留 session-state
> （`_ringCapture` 共用段 + `_captureCheckpoint` at-rest 路），存储 CRUD 在 storage.ts；key 用记录字段
> docKey（户口全名 X.ora / 行李牌 tag）而非拼接 key。triggers 沿用既有命名（gallery-open 而非提案的
> open）+ 新增 local-open（file 家打开点快照）。落地项：resume-first-input（histchange 里 gap 判定，
> copy-on-write 取 at-rest/磁盘字节=坐下前态）、pre-revert=undo revert（gallery 家先 saveNow 再取
> at-rest——加密件密文红线；file 家 live encode 进 ring 不写用户磁盘）、file 家 revert
> （adoptIntoCurrentFileHome：内容换/家不变/标脏；ring 随行李牌焚）、revert UI=多档列表
> （「回到 今天 14:02（打开时）」cap 8 档）、legacy v1 单槽只读兜底（升级窗口期不丢「回到打开时」）。

```ts
// ─── doc 的家（P1 核心）────────────────────────────────────────────
/** 一画一家。徽章/保存/checkpoint/锁 全部 switch 此联合类型（exhaustive，编译器守）。 */
type DocHome =
  | { kind: "gallery"; galleryId: string; path: string }   // 户口 =（gallery-id, 相对path）
  | { kind: "file"; handle: FileSystemFileHandle; fileName: string; lastSeenMtime: number }
  | { kind: "transient" };                                  // 无家；行李牌见 CrashStore

/** 家动词唯一持权模块（workpiece 令牌同手法：别处无权清 dirty / 改家）。 */
interface DocHomeKeeper {
  home(): DocHome;
  dirty(): boolean;                       // 相对「家」的 dirty；导出永不清它
  /** 保存 = 送回家。gallery→store 正门；file→器官写回（mtime 对表在器官内）；transient→安家仪式。 */
  save(opts?: { implicit?: boolean }): Promise<SaveOutcome>;
  /** 安家仪式（transient 专用）：gallery 在挂 → 进图库（默认名 yyyymmdd-hex4）；否则 FSA/下载。 */
  settle(target: "gallery" | "file"): Promise<SaveOutcome>;
  /** 导出 = 寄明信片：任意去向，永不清 dirty（图库模式画的下载也走这）。 */
  exportTo(sink: ExportSink): Promise<void>;
}

// ─── crash 库（P2；app 自有 IDB，db 名带 weebpaint-bd6cece69075d759 前缀）──
/** 行李牌：每次打开现铸、正常关闭即焚、永不写进文件、永不参与匹配（非身份）。 */
type LuggageTag = string;
type CrashRecordState = "crash" | "pending-adoption";   // 后者：redirect 前存，回程显式领养
interface CrashStore {
  /** 盲快照：与 save 完全同一 encodeDocToOra 字节（mp4 sidecar passthrough）。同 tag 覆盖写单帧。 */
  put(tag: LuggageTag, bytes: Blob, meta: { state: CrashRecordState; homeHint?: DocHome; name: string; at: number }): Promise<void>;
  /** 正常关闭即删。⚠ pending-adoption 在场时本调用必须拒绝该 tag（unload≠关闭），契约测试钉。 */
  dropOnCleanClose(tag: LuggageTag): Promise<void>;
  listAtBoot(): Promise<CrashRecordMeta[]>;   // crash→恢复横幅；pending-adoption→领养流程
  adopt(tag: LuggageTag): Promise<Blob>;      // 事务化（取+删）防双领养；领养出的 doc 视为 dirty
}

// ─── gallery 登记（P3；device-local 小 IDB；非 0607 之 registry：per-gallery、永不同步）──
interface GalleryRegistry {
  list(): Promise<GalleryLink[]>;
  link(src: { kind: "onedrive"; account: string } | { kind: "folder"; handle: FileSystemDirectoryHandle },
       label: string): Promise<GalleryLink>;          // 铸 opaque id；db 名 = ns.gallery-<id>
  unlink(id: string): Promise<void>;                  // 永不动源字节；缓存保留，删归还原出厂/深清
  lastActive(): Promise<string | null>;               // 「当前 gallery」= tab 级，registry 只记上次
  /** attach 时孤儿扫描：无主缓存库有 dirty → surfaced，永不静默 GC。 */
  scanOrphans(): Promise<OrphanReport[]>;
  rememberBrushRack(handle: FileSystemFileHandle): Promise<void>;   // Editor-only 笔架句柄（能静默就静默）
}
interface GalleryLink { id: string; kind: "onedrive" | "folder"; label: string; dbName: string }

// ─── 文件器官（P1；现役 local-file-session.ts 扶正，mtime 纪律封在器官内）──
interface LocalFileOrgan {                              // 已知失败：TOCTOU 毫秒窗（契约头注明）
  pickOpen(): Promise<FileSystemFileHandle | null>;     // AbortError = 用户取消 ≠ 不支持
  pickSave(suggestedName: string): Promise<FileSystemFileHandle | null>;
  /** 写回 = 读-比-写：mtime 与 lastSeenMtime 不符 → 抛 StaleFileError（app 出冲突面），绝不静默覆盖。
   *  语法扫描测试：仓内不许出现绕过本方法的裸 createWritable（抄 If-Match 家规护栏）。 */
  writeBack(h: FileSystemFileHandle, bytes: Blob, lastSeenMtime: number): Promise<{ newMtime: number }>;
  supportsFSA(): boolean;                               // false → save hub 落 download、open 落 input
}

// ─── save / intake hub（P1；各一个按钮，静默 fallback）────────────────
interface SaveHub {   /** 家在哪就送哪；transient 走 settle；FSA 不可用同手势落 download。 */ }
interface IntakeHub { /** 字节进口唯一接缝：picker/drop/paste/launchQueue → 嗅格式 → 开成 doc / 进图层 / 进笔刷。 */ }

// ─── revert v2（P4；checkpoint-policy 纯策略扩展）──────────────────
type CheckpointTrigger = "open" | "new-doc" | "save-as" | "cloud-refresh"
  | "resume-first-input"     // 新：输入间隔 ≥ N 分钟后的首笔之前拍（copy-on-write；不依赖 visibility）
  | "pre-revert";            // 新：revert 前自动拍当前态 = undo revert
interface CheckpointRing {
  /** key = 户口 or 行李牌；ring 按字节预算滚动淘汰（桌面 64MB / 移动 32MB，常量可调）= revert list。 */
  capture(key: string, trigger: CheckpointTrigger, bytes: Blob): Promise<void>;
  list(key: string): Promise<CheckpointMeta[]>;   // 显示人话：「回到 今天 14:02（打开时）」
}

// ─── 命名器官（P1；提拔 export-import-menu.ts:40 现成代码）─────────────
interface NamingOrgan {
  galleryDefaultName(): string;                  // yyyymmdd-hex4（v217 惯例）；禁「未命名」
  downloadName(base: string): string;            // 名-YYYYMMDD-HHMM，撞名 -1/-2
}
```

## 器官登记表（契约头只写已知失败情况）

| 器官 | 契约件 | 已知失败（摘要，全表见结案 §3） |
|---|---|---|
| store（云/folder gallery） | `@internal/store` api/（标准词，不再包一层） | 见库内 DATA SAFETY GUIDELINE |
| 文件器官 | LocalFileOrgan | TOCTOU 窗；FSA 平台矩阵；itch iframe 死 |
| crash 库 | CrashStore | 整源驱逐；file:// 共桶可读；Safari file:// 全灭 |
| registry | GalleryRegistry | IDB 驱逐→重 link+孤儿扫描 |
| 下载/上传 | SaveHub/IntakeHub 降级链 | 下载无完成信号（责任移交拍板） |
| 剪贴板 | 降级链（async→paste/execCommand） | itch iframe Chrome async 死 |
| WebGL | `weebpaint-backend-interface.ts`（已在，勿动勿漂移） | 见其头注释 |
| Web Locks | instance-locks（锁名 `gallery-id:相对path`） | file:// 共桶 scope 未证 |

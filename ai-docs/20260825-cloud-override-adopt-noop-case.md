# 案卷：cloud override local 后画布不重载（adopt 从未接线）+ 保存 TypeError: Load failed

> created 20260825 · as-of WeebPaint v0.10.28 / @internal/store 0.3.0（回滚后）· 2026-08-25
> 风险分区：§1/§4/§6 涉 **store/同步引擎 = 红线区**，动手前必读 MASTER.md §A、走 `pwa-cloud-store` skill、改前 escalate human。本案卷只记事实与提案，**未获批不动码**。
> 前传：`20260820-open-time-conflict-surface-handoff.md`（open 路径冲突 surface；本案是它的续集——surface 修好了，resolve 本身是半个操作）。

## 0. 事故现场（2026-08-25，user 真机 iPad）

对象：夏音 `.ora`（多图层，>4MB，走 chunked upload）。时间线（user 口述 + OneDrive version history 对照）：

1. 文档在 PWA 后台挂了 ~27h（"1623 minutes" 属实，非 bug，见 §5 附）。
2. 冲突菜单选了 **cloud override local（takeCloud）**——user 自述生产首用（注：`20260820-open-time-conflict-surface-handoff.md` §0 记录 8/20 也选过一次同按钮；无论哪次是首用，该路径的 adopt 从未接线，每次使用都踩中 §1）。
3. **override 后画布没有任何刷新**（user 观感"图层组没更新"——实际是整个文档都没刷新，图层组只是最显眼的新结构差异），UI 报"已同步"。
4. user 在这个陈旧画布上整理图层组 → 保存 → 弹 `[TypeError] Load failed (tap to dismiss)` → 云 badge 变问号云。
5. 回 gallery 显示待上传；重新点开是修改过的版本；手动重试上传成功。
6. version history：v6.0 = 8/25 1:54PM 8.97MB（重试成功那版）；v5.0 = 8/23 10:33PM 8.63MB（override 时拉下来、随后被 clobber 的云版本）。

**数据后果**：云端现存 v6.0 = 「陈旧画布 + 图层组整理」；user 在 override 时选择保留的那个云版本（v5.0）已被覆盖。**可救**：OneDrive version history 里 v5.0 仍在；另外 `.backup/`（override 时若本地 dirty 会先备份，`safe-resolve.ts:67-70`；本地 clean 则跳过备份 `:63-66`）；user 亦自行做了本地备份。

## 1. 主犯：`adopt` 全库零接线 → takeCloud 只换 IDB 不换画布（红线区 bug）

引擎侧唯一负责刷新内存文档的钩子：

- `safe-resolve.ts:81`：`if (adopt && plain != null) await adopt(plain, name);`
- adopt 传入链：`push.ts:89 resolveConflict(name, choice, { bytes, adopt })` ← `push.ts:46 PushOpts.adopt` ← **`create-store.ts:731` push 调用处根本没传 adopt** → 全程 `undefined` → `:81` 恒 no-op。
- 另两个入口：`fresh.open`（`create-store.ts:755-758`）刻意不接、靠 `readLocal()` 回流 + `editor-session.ts:193 editor.adopt(blob)`，**那里是对的**；`pullIfClean`（`create-store.ts:780`）的两个 app 调用点 `app.ts:501/594` 也全都不传 opts。
- grep 全库：adopt 生产代码零调用方。**save 时 takeCloud 的活替换从未被实现或测试过。**

### 后果链（六步，静默分叉 → 静默 clobber）

1. `safePull` 成功：云字节写入 IDB（`safe-resolve.ts:79`）+ `head.markSynced(name, cloudEtag)`（`:80`）→ `_base=cloudEtag`、dirty 清、`_parent` 删（`local-head.ts:109-133`）。
2. `resolveConflict` 返 `resolved` → `create-store.ts:734` 判 **`pushed = true`**。
3. `editor-session.ts:150` → `_pushPending = false`；`session-state.ts:483-485` → 状态栏"已同步"、badge 云对勾。
4. **此刻：IDB/lineage = 云版本，画布 = 旧本地版本，UI = synced。零 surface。**
5. user 编辑 → `recordEdit` → `_parent ← cloudEtag`。
6. 下次保存：`editor.encode()` 序列化**陈旧画布** → 覆盖 IDB → push 带 `If-Match: cloudEtag` **完全匹配** → 200 → user 选择保留的云版本被 user 选择丢弃的版本清掉，无 412、无提示。

违反：「冲突必 surface」精神（resolve 完成了一半却报完成）+「UI 不许谎报成功」。本次事故里第 6 步的 push 先撞了网络错（§2），问号云是它的正确尸检报告；手动重试把第 6 步补完成了。

## 2. `TypeError: Load failed` 的来龙去脉（网络错文案裸奔，非数据 bug）

- Safari 对 fetch 网络层失败的标准报错即 `TypeError: Load failed`。`providers/graph.ts:93-101` 只给 HTTP 响应错误装 `.status`；网络层 throw 直接裸抛。
- `push.ts:18-22` `retriable()`：`status == null` 可重试 → 重试 4 次、**线性退避 200/400/600ms**（弱网下一秒内烧完）→ 最终 throw。
- `create-store.ts:736` `catch (e) { ui.reportError(e); }` **默认 error 级** → `error-badge.ts:41` 渲染裸 `[TypeError] Load failed`。网络错在此路径无任何区分（兄弟路径 `delete.ts:124`、`cloud-sync.ts:166` 等都刻意降为 `"log"`，唯独 save/push 这条没有）。
- **前科**：store `8fef121`（spike-11）在 SW 网关修过一模一样的症状（iOS 网络切换后 fetch 抛 Load failed 裸奔）；页面侧 graph 路径没同步收货。
- **数据安全评估（绿）**：`create-store.ts:719-724` 先 `recordEdit`（durable dirty）再 awaited `local.save`，push 严格在后；push 失败不碰 etag/dirty（`cloud-sync.ts:195-216` 仅在拿到 item.eTag 才 markSynced）；无自动重试（`offlineUploadReplay` 默认 `"manual"` 且 `seenBase!=null` 不入队，`create-store.ts:738/507`）→ 手动重试成功是设计行为。
- 已知豁口（另案，勿在此重修）：`idb-store.ts:29-36` reqTx 不等 tx commit = 无地清单 A2，配额撞墙时"本地已落"可能是谎报。

## 3. 问号云 = 设计语义，正确，勿动

`save-status.ts:48-62` 状态机 + `:38` `cloud-pending`（虚线云+问号）= 「已落本地、云端那条腿确定没成，终态非在飞」。`editor-session.ts:148-150` `res?.pushed !== true` 保守判定保住重试。本次表现完全符合契约。（store 8 值 `SyncState` 无 "unknown"；gallery 的"待上传"= `unpushed`，`listing.ts:85`，与 topbar 一致。）

## 4. 顺带发现的两颗雷（keepMine 路径，本次未引爆，登记待修）

- **(a) `weakOverride` 非原子**（`cloud-sync.ts:314-331`）：先 `provider.move` 把云端败者挪进 `.backup`（:323），**再**无 If-Match 上传（:327）。两步之间断网 → 云端该路径变 ghost、本地滞留 dirty。
- **(b) keepMine 绕过 deferred guard**（`safe-resolve.ts:101-105`）：无条件 `head.markSynced(name, r.item?.eTag ?? null)`，不检查响应丢失。上传响应丢 → dirty 清、etag 清、badge 假 synced，下次 push 无 If-Match → 409。`push.ts:73-77` 防的正是这个形状，resolve 路径没走它。违反「瑞士奶酪=每层承重」。

## 5. 宣发前高红线 park（user 2026-08-25 拍板；本 session 不修）

**revert（"回到打开时的版本"）的语义红线**——user 原话要义（2026-08-25，含追加纠正）：用户心智里 revert 的目标 = "回到我上次坐在电脑前的状态"（= 上次 AFK 去健身/洗澡/吃饭之前）。Blockbench 式桌面 app 的 last opened 与此对齐；**iPad PWA 的 "opened" 实际 = 上次强退 app 的时刻，可能早至一周前**——比 last AFK 早得多，一点就**错误 revert 到更早的时间线**；且 **revert 应可 undo**。park 到高红线，**宣发前搞定**。

附（同区顺修）：
- `tm.revertMessage`/`tm.revertedToOpen` 分钟数不进位（`checkpoint-policy.ts:50-52` 无小时/天晋升；gallery 的 `humanTime` `gallery-view-model.ts:140-149` 会进位，对齐之）。
- 时间戳来源 = 本地 checkpoint 快照时刻 `CheckpointRecord.at`（`session-state.ts:380`，开档/保存时捕获），非 openedAt/云 lastModified——1623 分钟本身属实。

## 6. 修复提案（红线区，逐条 escalate，未获批不动）

1. **主修**：save 路径把 adopt 接线——`create-store.ts:731` push 时传 `adopt`，app 侧由 editor-session 提供活替换回调（复用 `adoptModel` 全量重建：`session-state.ts:301-335`）。takeCloud 必须是完整操作：IDB+lineage+画布 三者同步换，或至少 surface "已切换到云端版本，点击重载"。库契约改动 → escalate。
2. **网络错文案**：save/push 的 catch 区分网络层 throw（无 `.status`）→ 人话文案（i18n）+ 或降级，参照 store `8fef121` SW 网关同款处理；问号云语义不变。
3. 雷 (a)(b)（§4）修复：weakOverride 顺序/原子性重排；keepMine 接 deferred guard。
4. §5 revert UX（人类已 park，宣发前另开单）。

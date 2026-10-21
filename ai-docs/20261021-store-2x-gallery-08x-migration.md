# WeebPaint 迁库：store 0.15.2 → 2.1.2、gallery 0.1.0 → 0.8.5（周账 F-56 WeebPaint 那一半）

> created 20261021 by Claude Fable 5.1 · as-of v0.14.36（迁前）· 周账 = 家族根 `weekly/20261021-family-todo.md` §0-2 / §6 道 2。user 2026-10-18 的分法：「一半机械、一半是作品引擎的行为变更」——机械那半是编译错误清单（§5），行为那半是 §2–§4 的表。
> 读者 = 下一个接手的人：想知道「迁完 WeebPaint 的同步行为和以前有什么不一样」看 §2–§3；想知道「哪些开关是我定的、哪些要 user 定」看 §3；想知道「改了哪些文件」看 §5；想复核看 §7。

## 1. 一句话

WeebPaint 是家族里库最旧的一家（store 0.15.2 / gallery 0.1.0，WXHW / MoonSinger / KudsRocket 都在 2.1.2 / 0.8.5）。这次把它接到最新，**不推正式版**（prod 仍 v0.14.32，等 user 用一段 dev）。两个包一起换是因为 gallery ≥ 0.6.0 吃 `store.identifiers`、≥ 0.8.1 吃 `file.resolve()`，拆不开；`@internal/workbench-elements` 0.1.0 → 0.1.2 是 gallery ≥ 0.6.3 的 peer，一并带上。

迁库本身**不是**为了修正在丢画的路径（10-16 的创作向审计没找到 WeebPaint 静默丢画的路）。它修的是三件事：① 假冲突面（页面重开、登录前就动笔，第一次推没有基准 → 冤枉的「云端有新版本」）；② 图库里「推送到云端」这个**不在词汇表上的动词**（user 10-16「这个按钮为什么能存在是更大的安全问题」）；③ 挡着 #89（CSP 去 `unsafe-eval`）和 F-54（大文件后台传输）。

## 2. store 行为差异表（0.15.2 → 2.1.2，只写对 WeebPaint 接线有影响的）

每行：版本 · 变了什么 · 迁前 WeebPaint 是什么样 · 迁后 · 服务数据安全模型（家族根 `ai-docs/20261016-data-safety-model.md` §2）的第几条 / 碰 §3 哪一行 · 这次怎么处理。

| 版本 | 变了什么 | 迁前（0.15.2） | 迁后（2.1.2 默认） | 目标 / 威胁行 | 这次 |
|---|---|---|---|---|---|
| 0.16.0 | **文档种类表** `docKinds` 必填；身份 = `文件夹/主干后缀`（`X.ora`）；加密容器云端名 = 身份 + `.zip`；`file(id,{isZip})` 拆成 `file()` / `zip()`；`nameOccupied → occupied`、`activeFileName → activeIdentifier`、`Item.path → identifier`、`FolderSnapshot.path → folder`、`TrashItem.name → identifier`；删 `fileName / encFileName / toName / crypt.ext`；只有表里的种类能加密；回收站恢复撞名戳 `X [yyyymmdd-hhmmss].ora` | 身份已经是全名 `X.ora`（2026-07 钉死），app 自己在边界用 `sessionFileName` / `stripSessionExt` 切；`crypt.ext:"ora"` | 一行表 `{ kind:"ora", suffix:".ora", container:"zip" }`；身份、云端名、加密名**一个字节不变**（旧数据零迁移）；切名的唯一入口 = `store.identifiers`（app 的裸名 ↔ 全名转换仍留在边界，见 §6） | 不碰七条；只是 API 形状 | 机械迁（§5） |
| 0.16.2 | `pullIfClean` 在「云端没动」时也 `markSeen` 重捕本 tab 的基准 | 登录前打开的文档，登录后第一次编辑的推不带 If-Match → 被当撞名 → 冲突面 | 不再误报 | 第 5 条（不惊扰）；§3 A2 / A5 | 收（默认） |
| 0.17.0 | ① `save({onProgress})`；② **列举帧当新鲜度证据**：`watchFolder` 刚给过的完整云端帧里 etag === 本 tab 已见基准 → `open()` 不再逐个 `fetchMeta`（30 s 时效）；③ `files.uploadStream`；④ `save()` 推完再发一帧 | 每次 `open()` 本地有副本都先问一次云端 | ② 图库刚列过就开画 → 省一趟 meta；采信窗口内云端真动了 → 下次推 If-Match 412 → 冲突面（和以前一样）；④ 退出推完后图库卡片徽章会刷新（以前停在「没传上去」那帧） | 第 7 条（省一趟），不碰 1–6；§3 A4 由 0.18.1 补回 | 收（默认）；①③ 不用 |
| 0.17.1 / 0.17.2 | 传输层四个**显式开关**，默认全关（= 0.17.0）：Graph 请求超时 / 分块上传单块续传 / 提交最后一块前核 eTag / push 退避拉长 | 无超时、单块失败整份重来、只在开会话时核 eTag、4 次 × 200·n ms | 同左（没开） | 见 §3 | **没开**——等 user 定（§3） |
| 0.18.0 | `openLineageFromDurable`（默认开）：open 时云端核对没跑成（离线 / 未登录 / 出错 / 用户跳过）∧ 本地副本干净 ∧ 磁盘上有上次同步的 etag → 记为本 tab 基准 | 重开页面、MSAL 还没静默登录完就 `bootRestoreSession` 开上次那幅画 → 本 tab 无基准 → 第一次保存 409 → `CloudNameCollisionError` → 冲突面（云端其实没人动） | 第一次推带 If-Match：云端没动就过；动过 412 → tryHeal / 冲突面 | 第 5 条；§3 A2 / A5。安全边界：基准只会被记成**本地字节当时同步到的那一版**，脏副本一律不动（库说明「没做，也别做」） | 收（默认开） |
| 0.18.0 | `file.resolve()`：库自己弹冲突面、按人选的走（云端覆盖本地 / 本地覆盖云端 / 取消），app 不传答案 | WeebPaint 图库「推送到云端」= `session.push`：读本地字节再 `save({tryPush:true})`——**方向动词 + open 再 save 刷新基准**，10-16 被 user 判为越狱 | 图库卡片菜单只剩「处理…」→ `resolve()`；`session.push` / `pushItem` **删除**；`VerbDoc.push` 端口留着但接的是响亮 throw（包承诺不再调它） | 第 3 条（诚实，只能人在面里选）；§3 C1 | 删动词 + 接 resolve（gallery 0.8.1） |
| 0.18.1 | `pullIfClean({ trustHints:false })`：醒来 / 回前台 / 刚登录这种**怀疑自己过期**的时刻不采信 30 s 内的旧清单 | 没有 fresh-hints，所以也没有这个洞 | `refreshOpenDoc()`（回线 + 回前台两处调）传 `trustHints:false`——别的设备恰好在这 30 s 里推过也能快进 | 第 1 条（别的设备刚存的不被盖）；§3 A4 | 做（app 侧一行） |
| 0.18.2–0.18.4 | 冲突面 ctx 带 `cloudState`（changed / absent / unchanged / never）；云端没了 / 从没传过时「云端覆盖本地」= 本地这份进回收站 | 面上只有「云端有新版本」一种说法 | `store-ui.ts` 按 cloudState 换标题 / 正文（4 条新文案，四语）；三个按钮和主按钮（云端覆盖本地，v0.14.32 已对齐）不变 | 第 3 条；§3 A12 | 做 |
| 0.18.5 / 0.18.6 | `resolve()` 对「干净 ∧ 同步过 ∧ 云端没了」（pendingGone）也弹面；面开着时云端回来了 → `unresolved / cloud-reappeared`，两边不动；干净副本「本地覆盖云端」撞名走第二张面不抛错 | WeebPaint 的 pendingGone 行给「重新上传 / 删除」两个动词 | 只剩「处理…」（gallery 0.8.3） | 第 1 条（面开着时别的设备传回来的那版不被误删）；§3 A6 / A12 | 收（gallery 带） |
| 2.0.0 | 流式面显式开关 `streaming`（投机车道 / 卡住对冲 / 镜像）；`FileStream.status()`；修 0.18 的一个互等 | WeebPaint 不用 `openStream`（图片走 `open()` 整份） | 不传 `streaming` = 0.18 行为；作品那台引擎按构造不受影响（`test/engine-boundary-guard` 守着） | — | 不传 |
| 2.1.0 | 公民等级进 `docKinds`（`tier` work / auto-backup / resource；`stem` 正则分行；每种 `validate`） | 只有一种公民 | `.ora` 不传 tier = `work` = 全套（冲突面 / 回收站 / 脏不驱逐）；**零行为变化**。WeebPaint 的自动快照环（`checkpoint-ring`）住 app 自己的 IDB、不进 store，所以没有二等那一行；图片（png/jpg）不在表里 = 按作品处理 = 和 0.15.2 一样 | — | 不传 tier |
| 2.1.2 | `file.delete() → trash()`、`DelResult → TrashOutcome`；`Item` 带 `kind` / `tier`；`StoreTextKey` 多 `file.uploading` | app 自己不调 `delete()`（删除动词在 gallery 包里） | gallery 0.8.5 已改；`store-ui.ts` 的穷举表补 `file.uploading` | — | 机械 |
| 0.15.1（已在） | `files.dirty.pushAll()` 推本地 at-rest 字节（加密件免密码） | 只在「切换图库」的 dirty 逃生 sheet 里用 | 同左 | 第 2 条（缩短没传的窗口） | **没加「登录后 pushAll」**——那是 WeebPaint 推云节奏的改变（autosave 只落本机、退出 / 显式存才推 = consent 政策），等 user 定（§3 末） |

## 3. 2.x 开关：这次怎么定

家族政策（store 0.17.2，user 2026-10-15「123同意」）：**行为变更默认关、消费方显式开**。周账 §6 写明「道 2 / 3 的 2.x 开关默认值」是要回来找 user 的点。所以这次**一律按库默认接**（下表「这次」列），我的推荐另写一列，user 看完一句话就能翻。

| 开关 | 在哪 | 库默认 | 这次 | 推荐 | 为什么 |
|---|---|---|---|---|---|
| `transport.timeouts` | `createOneDriveProvider({ transport })` | 关（请求没有超时） | 关 | **开**（`DEFAULT_GRAPH_TIMEOUTS`：meta 30 s / 块 120 s / range 60 s / 整文件 15 min） | iPad 锁屏后在途的 fetch 常常**永远挂着**（KudsRocket 10-15 实录）。WeebPaint 的 `editor-session.persist()` 是 `_saving` 单飞锁，`await store.save()` 里内联 await 推云：推挂死 → `_saving` 永远 true → 之后的 autosave 全部跳过 → 编辑只在内存里，直到 reload。这碰的是第 2 条（没传上去的改动不能丢），§3 A3。有超时 → `CloudNetworkError` → save 返 `pushed:false` → 文件留脏、下次补推。 |
| `transport.chunkResume` | 同上 | 关（单块失败 = 整份网络错） | 关 | 开 | `.ora` 带 timelapse 动辄 5–50 MB，走分块上传；网络抖一下整份重来 = 流量 × N。只影响成功率，不影响安全。 |
| `transport.verifyChunkedCommit` | 同上 | 关（只在开会话时核 eTag） | 关 | **开** | 两台设备同时覆盖同一文件，分块上传「传那几十秒」里有窗口（store 0.17.1 分析 §4）。开了 = 提交最后一块前再比一次 eTag，窗口缩到最后一块那几秒。碰第 1 条（云端已有的不被盖），§3 A6 / A9。代价 = 每次分块覆盖多一个 GET。 |
| `pushRetry` | `createStore({ pushRetry })` | 4 次 × 200·n ms（共 2 s） | 默认 | 默认 | 推云在 `_saving` 锁内，退避拉到 15 s 会让 autosave 停 15 s；画画 app 没有 KudsRocket 那种「每 20 s 一片」的压力。 |
| `openLineageFromDurable` | `createStore` | **开** | 开 | 开 | §2 0.18.0 行。 |
| `trustHints:false` | `pullIfClean` 调用点 | 默认 true | **回线 / 回前台两处传 false** | 同 | 不是开关是用法；库说明写明这两个时刻该传。 |
| `streaming` | `createStore` | 不传 | 不传 | 不传 | WeebPaint 没有三等资源的流式读。参考窗将来放视频再说。 |
| `docKinds[].tier` | `createStore` | 不传 = work | 不传 | 不传 | 自动快照环不在 store；没有二等。 |
| `offlineUploadReplay` | `createStore` | `manual` | 不传（= manual，和 0.15.2 一样） | 不动 | 离线新建的画回线要不要自动补推 = consent 政策，和下面一条一起定。 |
| 登录后 / 回线后 `files.dirty.pushAll()` | app 侧 | — | **没加** | 建议加（WXHW `pushDirtyAll` 是样板） | 第 2 条：崩溃 / 关标签页前没走到退出推的画会留脏，直到下次打开它。加了 = 登录 / 回线那一刻把所有脏的推上去。但 WeebPaint 的政策是「autosave 只落本机，推云在退出 / 换稿 / 显式按存」——这会把推云提前到人没按存的时候，要 user 点头。 |

## 4. gallery 行为差异（0.1.0 → 0.8.5，用户在图库里看得见的）

| 版本 | 变了什么 | WeebPaint 这次 |
|---|---|---|
| 0.4.0 | 图库直接吃 store 的 `syncState`（9 态）画徽章，不再在 app 里派生 local / cloud / dirty / ghost 一堆布尔 | `app-store.ts` 的 `itemToG` 退役（包里 `galleryItemFromStoreItem` 做同一件事） |
| 0.4.1 | 改名保留后缀 | 收 |
| 0.5.0 | **回收站 + 备份箱 = 搁置区**：备份箱（冲突里输的那一版、`.backup`）有自己的视图，能恢复 / 彻底删 / 清空 | 图库菜单「备份箱」入口 + 回收站条目的返回 / 清空按钮按视图分流（2026-08-21 那个「备份箱管理（即将推出）」disabled 占位退役） |
| 0.6.0 | 身份全名、主干给人看、种类来自 docKinds 表；`policy.naming / isDoc`、`deps.isZipDoc` 删 | 适配层 `src/gallery/gallery.ts` 把 identifier ↔ 裸名的转换收在一处（§6） |
| 0.6.1 | 加密件卡片左上角大锁 | 收 |
| 0.6.2 / 0.6.3 | 卡片 ⋯ 菜单出卡片、进菜单 band（`Teleport` + workbench-elements 收养 adapter）；hover 只在 `(hover:hover)` 且不再 transform | 递 `Teleport`；workbench-elements 0.1.2；gallery.css 换成包的那份（styles.css 里的旧 `.gallery-*` 规则删掉，否则旧的 hover transform 还在 = iOS 菜单被盖 / 点两下的 bug 留着） |
| 0.7.0 | `tile.aspect` 是一个数，默认 1（方图 = WeebPaint 原样） | 不传 |
| 0.7.1 | 冲突面主按钮「云端覆盖本地」 | v0.14.32 已对齐 |
| 0.8.0 | 卡片右下角动作钮 + 「事实」缓存（可选） | 不用 |
| 0.8.1 / 0.8.3 | **「推送到云端」「重新上传」删除**，没同步好的文件只有「处理…」→ `file.resolve()`；pendingGone 行也只剩「处理…」 | 核心变化（§2 0.18.0 行） |
| 0.8.4 | 三张模板构建时编好：宿主递**整个 Vue 模块**就运行时零 eval | 递整个模块（`import * as Vue`）；这是 #89 的一半 |
| 0.8.5 | `delete()` → `trash()` | 收 |

文案：包内 zh / en / ja 齐，WeebPaint 多一门 tok——30 个新键（`gal.resolve` / `gal.st.resolve.*` / `cf.body.absent` … / `st.fileUploading` / `gv.badge.float` 等）在 `src/i18n/strings.ts` 补四语，tok 过 `tp_check`。`gal.pushCloud` / `gal.reupload` / `gal.st.reupload*` / `ss.push*` 这些死键删掉。

## 5. 机械迁移清单（升级后的编译错误就是这张表）

| 文件 | 改什么 |
|---|---|
| `package.json` / `vendor-pkgs/` | store 2.1.2、gallery 0.8.5、workbench-elements 0.1.2 三个 tgz |
| `src/identifiers.ts`（新） | `DOC_KINDS = [{ kind:"ora", suffix:".ora", container:"zip" }]` + `createIdentifiers(DOC_KINDS)`；`@internal/store` 第二个值级 import 点（纯函数），`scripts/build.sh` B 分层 lint 放行这一个文件（WXHW 同形） |
| `src/app-store.ts` | `docKinds`；`crypt` 去 `ext`；`activeFileName → activeIdentifier`；`file(path,{isZip:false})` → `file(id,{mode})`；`itemToG` / `watchFolder` / `watchFolderImages` / `listGalleryTrash` 包装层：图库屏幕改吃包的 `createGalleryDataFace`，这里只留 cloud-picker 还在用的 `watchFolderImages` / `openCloudImage`（`Item.path → identifier`、`snap.path → folder`） |
| `src/store-ui.ts` | `STORE_TEXT_KEYS` 补 `file.uploading`；`resolveConflict` 按 `cloudState` 换标题 / 正文 |
| `src/editor-session/editor-session.ts` | `StoreLike.file(name,{isZip,mode})` → `file(name,{mode})`；`isZip` 配置项删；`delete → trash` |
| `src/session-state.ts` | `_file` = `requireStore().zip(toFull(name),{mode:"existing"})`（要 `getPeek` 的地方）/ `file()`（只 open / save 的地方）；`saveAs` 的 `file(…,{isZip:true,mode:"new"})`；`pushItem` 删、门面去 `push`；`refreshOpenDoc` 传 `trustHints:false`；`openItem / unloadItem` 收 `GItem`（`item.identifier` → 裸名） |
| `src/enc-thumbs.ts` / `src/gallery/cloud-thumbs.ts` / `src/gallery/cloud-thumb-cache.ts` | `zip()`；缩略图缓存改按**身份**（缓存 key 本来就是 `sessionFileName(裸名)` = 身份 → 存量条目零迁移） |
| `src/gallery/gallery.ts` | 见 §4：整个 Vue 模块、`createGalleryDataFace({ store, policy:{ isImage } })`、`doc` 端口（`open(item: GItem)` / `setIdentifier` / `push` 响亮 throw / `unload`）、`thumbs` 经 `policy.thumbs.kinds:["ora"]`、`encryption` 收身份、`host.activeIdentifier()` |
| `src/gallery/gallery-shell.ts` | `nameOccupied → occupied`；`uniqueBareName → uniqueIdentifier`（撞名加戳走 `withStemTail`）；`walkLibrary` 的 `fr.path → fr.identifier`；`file(…,{isZip:true})` → `zip()`；备份箱 chrome |
| `src/gallery/gallery-manage-ui.ts` / `src/export-import-menu.ts` / `src/session-name.ts` / `src/topbar-menu.ts` / `src/app.ts` / `src/dev-console.ts` | `nameOccupied → occupied`；`file(…,{isZip:…})` 去 isZip |
| `test/app-state.test.mjs` / `test/brush-rack-reactive.test.mjs` | `createStore` 补 `docKinds: []`、去 `fileName` |
| `test/editor-session.test.mjs` | mock store 的 `file(name, opts)` 去 `isZip` |
| `styles.css` / `vendor/internal-css/gallery.css` / `index.html` / `service-worker.js` / `scripts/pack-standalone.mjs` | 包的 gallery.css 进 vendor + `<link>`；styles.css 删重复的 `.gallery-*` 规则（只删包里有的；图库外壳 chrome 的 `.gallery-trash-bar` 那些留）；SW 预缓存加一行；单文件打包把两份 css 都内联 |
| `src/i18n/strings.ts` | 30 个新键四语；死键删 |

## 6. 刻意没动的

- **app 内部仍用裸名**（`_activeName()` = `X`，`sessionFileName` / `stripSessionExt` 在边界转）。0.16 的用词改革（「name 不再指任何精确的东西」）在库和 gallery 落了；WeebPaint `session-state.ts` 1400 行的内部身份改成 identifier 是另一刀，不在这次（它碰的是 store 红线区外的 app 层，但量大、真机验不了，不混进迁库）。边界只有三处：`gallery.ts` 适配层、`enc-thumbs.ts` / `cloud-thumbs.ts`、`createStore` 的 `activeIdentifier`。
- **推云节奏**（autosave 只本机、退出 / 显式存才推、`offlineUploadReplay` manual）不动——§3 末两行归 user。
- **自动快照环**（`checkpoint-ring`，app 自己的 IDB）不搬进 store 二等。
- 缩略图缓存的 IDB（`gallery-thumbs` object store）形状不动；key 不变。

## 7. 验证（2026-10-21 做完回填）

- `tsc --noEmit` 零错（升级后 44 条编译错误 = §5 清单，逐条清完）；`npm test` **1498 过 0 红**（6.4 s）；`bash scripts/build.sh` lint 全过（deep-import / B 分层放行 identifiers.ts / 可见性 / 标准件）。
- `tools/preflight/`：**F1** 无痕首启 OK（无库 boot 不建店）；**F8** 记住密码 + CSP 零拦截 OK；**F9（新）**`f9-gallery-folder.mjs`——无头里没有 OneDrive / 真目录选择器，把 `showDirectoryPicker` 换成 OPFS 子目录（OPFS 句柄和 FSA 同接口，没有 queryPermission → gallery-connect 视为可用），folder provider 整条路跑通：连接（答「出厂全新」播种面）→ 新建 f9-probe → 画一笔 → 回图库（退出推云）→ 卡片列出 → ⋯ 菜单在 `#galleryMount` 直系、`position: fixed`、z 400（0.6.2）、没有「推送到云端 / 重新上传」、有「送到回收站」（0.8.1）→ 送到回收站 → 回收站视图（bar 标题 / 清空按钮换字）→ 恢复 → 备份箱视图（标题 / 两个清空按钮 / 菜单 title / 空态文案）→ 返回文件视图卡片回来 → reload 仍挂着 → 零 CSP / EvalError。已挂进 `scripts/preflight.sh`。
- `scripts/build-standalone.sh` + `tools/standalone-smoke.mjs` OK（两份 css 都内联；记住密码记录重开原样不动）。
- `tp_check`：新 tok 全 ok / 名词短语 label 只有 fragment WARN（预期）。
- F2 / F3 / F4 / F7 没跑（不碰图库 / store 接线；F4 三条基线红 = 总账 #90）；gl-smoke 不碰 GL 不跑（user 10-17「别动不动全量」）。
- **#89 同道顺手做完（v0.14.38）**：本仓 10 处 Vue `template:` 搬进 `src/vue-templates.ts`，`scripts/compile-vue-templates.mjs`（`@vue/compiler-dom` 3.5.35 = vendor/vue/VERSION）构建时编成 `src/vue-templates.compiled.ts`，组件经 `src/vue-render.ts` 拿 `render:`；CSP `script-src 'self' 'wasm-unsafe-eval'`；守卫 `test/vue-templates-compiled.test.mjs`（生成物不过期 / 无 eval / src 里不许长回 `template:`）+ csp-guard；**F10（新）** 左栏 dial / 笔架 sheet / 图层面板 / 颜色轮 / 笔刷设置 + 下拉 逐个点出来看 DOM、零 securitypolicyviolation。决策记在 ADR-0015。
- **没验的**：OneDrive provider 这条腿（无头没有账号）——和 folder provider 走同一套 store 引擎，差别只在 provider；`resolve()` 三选一的面（folder 库里退出即推、造不出脏 ∧ 云变的分叉）；加密件的锁图标 / 解锁 / 换密码（F9 没设密码）。这三样归 iPad Edge 真机，user 自己决定什么时候跑，AI 不催。

## 8. 要 user 一句话的

1. §3 三个 transport 开关（timeouts / chunkResume / verifyChunkedCommit）开不开——推荐开。
2. 登录后 / 回线后 `pushAll` 加不加（会把推云提前到人没按存的时候）。
3. prod 不推（照 F-64：等用一段 dev）。

# 无地骑士调查全records——创世考古 + Blockbench + itch.io + 耦合面地图

> created 20260825 · as-of v0.10.28 / 2026-08-25 · by Claude Fable 5
> 本文 = 无地骑士心智模型 grill session 的**调查记录**（四路并行调研的全量落盘），
> 不含产品拍板——拍板在 grill 结案 doc 另出。姊妹件：`20260825-localfile-knight-recon.md`（隐患+已拍板边界）。
> 出处纪律：引语逐字；创世期引语的原档可信度分层见 §1（T3 层原档已灭失，引用须带戳）。

---

## 0. 调查方法

2026-08-25 四路并行：
① 创世语料考古（transcript + journal + memory）；② Blockbench 文件心智模型（源码级，clone JannisX11/blockbench@47e633e 直接读码）；③ itch.io 嵌入环境技术现实（含第一手 curl 实测）；④ WeebPaint 现状耦合面地图（只读代码调查，HEAD `73f1af9` / v0.10.28）。

---

## 1. 创世考古：宪法地层学

### 1.0 ⚠ 创世 transcript 已永久灭失

2026-05 创世期（「三天四 app」）的 Claude Code 对话记录已被 **30 天保留期清理删除**：
六个创世项目的 `~/.claude/projects/` 目录只剩 `memory/`，零 jsonl；全系统（WSL + Windows 侧 `.claude`）现存最早 jsonl 首时间戳 = **2026-07-24**；冷备份 `/mnt/d/JupyterLocal-backup-20260813` 不含 `.claude`。旁证：JRP `journals/20260623 some recovery of old thoughts.md` 曾对着完整抽取工作，该抽取产物也已不存。

幸存件（人类手写 journal + 创世 session 当场 memory）已汇编归档：**`~/jupyter/20260825 语料考古/`**（私有仓；约 60 条逐字原话，分 T1 journal 现存 / T2 memory 带戳 / T3 仅存转录三层可信度）。本节只引用其中**存储原则类**引语；跨项目个人内容全量只在私仓。

教训：珍贵对话期当期归档，别等；`cleanupPeriodDays` 建议调大；T3 层引语引用必须标「原档已灭失，转录自 YYYYMMDD 报告」。另抓到一处历史引用错误：JRP 20260623 recovery 把「丢画是红线…」「这个库的唯一意义…为什么 ai 还是在绕！！！」标为出自 sos.md / potential-bugs.md，两文件现文本均无此句——实际出自已灭失 transcript，该出处标注不可再传抄。

### 1.1 第 1 层 · 五月创世直觉（user 原话，逐字）

| 日期 | 原话 | 出处层 |
|---|---|---|
| 2026-05-16 | "also the cybersecurity concern since all my creativity is backed in onedrive" / "i am not sure with exposing my precious onedrive dir of all my writing … or using a inbox model" | T1（WXHW journal）——硬规则 #6 AppFolder 沙箱的心理源头；AppFolder 方案 AI 当日提出、user 当日拍板（memory `onedrive_design.md`：强制沙箱、.txt=SSOT、冲突三键、删除=.trash、ETag=真理信号） |
| ≈2026-05-17 | "OneDrive 一直都是 SSOT，cache invalidate 从来都是坑" | T2（memory 标注 stated verbatim） |
| 2026-05-19 | 「我自己删，你不能动那边」 | T2——AI 不碰用户网盘的最早记录 |
| 2026-05-20 | "所有依赖库打包，纯离线可使用绝大多数功能，飞机上点开就能用" / "./journals是人类输入，ai不要在里面写东西"（硬规则 #2 出生地）/ "AppFolder+用户拖onedrive文件夹作为SSoT管理方案" | T1（RealHome proposal） |
| 2026-05-20 | "多端同步应该是伪需求，不符合阅后即焚的transcient mental model" | T1（ScratchPad）——无云 by design 从创世就存在 |
| 2026-06-01 | "离线第一公民，不丢用户作品" / "最怕的就是自动和云端merge的时候旧的覆盖新的。特别是多设备tab没关的情景" / "很多地方需要explicit consent（用户有随手ctrl s的习惯）" / "不强迫用户绑网盘，离线版有全部功能可以保存导入导出" / "可接任何网盘后端" | T1（MyPWAPatterns journals/20260601 sos.md） |
| 2026-06-04/05 | 「上传上去的文件另外一个电脑看是0B」「但上传还在骗人」「onedrive不是\*s\*sot,它自己也会和自己打架」 | T1（WeebPaint 0B 事故现场 journal） |
| （原档灭失） | "1 零账号也好用—第一公民；2 单账号下不丢数据，除非 user consent；3 突然断网，能用所有 cache 的东西"（RealHome）/ "我怕的反而是旧数据 override 一年的新数据"（WXHW）/ "autosave 不触碰云，但用户 Ctrl+S 是 explicit consent"（AtlasMaker）/ "upload 的语义就是覆盖…做了 conflict resolution 反而是给用户添堵"（BTP） | **T3**（转录自 2026-06-09 报告，原档已灭失） |

### 1.2 第 2 层 · 六月成文宪法（share-file-model + MASTER §A）

2026-06-01 grill 产出 share-file-model，6 月上旬 0B/假冲突事故逼出工程化红线（If-Match 处处、.trash、dirty 永不驱逐、conflict 必 surface——这些技术件无五月原话对应，是事故产物）。文本要点（与无地骑士直接相关）：

- "Accountless is first-class (Offline-first): local files are real originals, not mirrors of nothing"
- "Workbench in IDB = crash-shadow of RAM, **NOT a separate SSoT**"
- "ScratchPad is this model with cloud disabled and the Workbench permanently an orphan"
- float doc：consent 前不建条目（"burn a 5-second doodle without trekking to the gallery"）

**⚠ 关键限定（user 2026-08-25 本轮裁定，逐字）**：「六月的宪法没你想的这么好，那时候是假设IDB忠实可靠。现在这条翻了，很多东西都要重写，因为当时的全部设计是依赖于idb的affordance的」。即：六月宪法的**概念轴**（Home / consent / conflict）与**云侧红线**存活，但所有以「IDB 是忠实本地层」为前提的机构（accountless 家住 IDB、eviction guard「dirty 永不被驱逐」只防 app 自己不防浏览器、crash-shadow 的可靠性承诺）**随 IDB 可靠性假设一起翻掉，需重写**。证伪证据：A1/A6（浏览器整源驱逐、7 天 ITP 永不可测）、A2/A3（配额撞墙静默丢/永不 settle）、公用电脑威胁模型、§3 itch 现实、Blockbench #2724。

### 1.3 第 3 层 · 七八月实践漂移

代码把宪法漂移掉了：`newDoc` 硬编码「新建 = 立刻建库条目 + 立刻落库」（`session-state.ts:609-647`）；「consent 前不建库条目」语义在树上**从未存在**（ADR-0003 只管 push consent，本地条目照建）；IDB 图库从「云的缓存」事实上变成「作品的家」。

### 1.4 观察：原话 vs 成文

① 离线第一公民、OneDrive=SSoT、AppFolder 沙箱、journals 人类区、不丢作品——5 月 16-20 已以原话/当日拍板存在，成文只是抄写。② "explicit consent 才上云"5 月只有胚胎（Ctrl+S 心态、冲突三键），6-01 明确"旧覆盖新"噩梦后才成普适红线。③ 红线技术件是 6 月上旬事故的工程化产物。④ 「冲突策略 per-domain」（RealHome LWW 可接受 / BTP 覆盖即语义 vs 写作画画紧红线）从创世起就是用户自己的区分。

---

## 2. Blockbench 文件心智模型（源码级验证）

> 信源三档：【源码】= GitHub master (commit 47e633e) 直读；【官方】= blockbench.net / photopea.com；【口碑】= issues。
> ⚠ DeepWiki AI 生成页声称"网页版无 autosave/backup"**与源码矛盾，勿引**。

### 2.1 启动落脚点【源码】
- 桌面+网页都落 **Start Screen**（splash + 新建格式列表 + Recent 区），不是空白画布（`js/interface/start_screen.js`）。
- **Recent Projects 仅桌面版**：`recent: isApp ? recent_projects : []`；网页版这块不渲染。
- Start Screen 兼任 tab 系统的"New Tab"伪 tab。

### 2.2 打开/保存语义【源码】
- **全仓零 File System Access API**（`showOpenFilePicker`/`FileSystemFileHandle`/`launchQueue` 零命中；manifest 无 `file_handlers`）。
- 打开（网页）= `<input type=file>` + FileReader（`js/file_system.ts:114`）+ 全局 drop + 官方短链。
- **Ctrl+S（网页）= 无条件 blob 下载**，无原位写回路径；**下载完即 `Project.saved = true` + toast**（`js/io/codec.js:190`）——「下载=存盘、清 dirty」。桌面版有 `save_path` 则 `fs.writeFileSync` 原位写回。
- 无「退化」概念：三大浏览器行为一致（全下载）。

### 2.3 崩溃恢复/备份——两层独立机制【源码】
- **AutoBackup（桌面+网页共用）**（`js/auto_backup.ts`）：IndexedDB 库 `auto_backups`，keyPath=项目 uuid；定时循环默认 **30 秒**（设置 `recovery_save_interval`，最小 5s，0=关）整 doc compile 后 put。**项目正常关闭（确认过 save/discard）即删该备份**——IDB 里只剩崩溃现场。UI 入口 = Start Screen 恢复横幅（Recover/Discard；多备份弹 checkbox 列表）。对话框硬编码警告原话："⚠ Recovering models is only a backup. Please remember to always save your work to your device."
- **定时磁盘备份（仅桌面）**（`js/desktop.js:476`）：`userData/backups/` 写 .bbmodel，默认 10 分钟、保留 30 天，File 菜单 `view_backups`。网页版无此层、无历史备份 UI。

### 2.4 最近文件【源码】
- **网页版没有 recent，完全没有**（`js/web.js` 显式 `export {NULL as recent_projects…}`）；无句柄持久化问题（根本没用 FSA）。桌面版 recent 存 localStorage（路径+名+favorite）+ 缩略图文件。

### 2.5 多文档【源码】
- Tab 式多项目；关 tab dirty → Save/Discard/Cancel 三键（`js/io/project.ts:489-528`）；网页版另有 `window.onbeforeunload` 查任一 unsaved 项目（`js/web.js:152`）。

### 2.6 口碑【issues 采样】
- **#2724**：手机网页版隔几天回来模型连恢复备份一起消失（= 浏览器整源驱逐 IDB），官方关闭 not planned——**行业标杆对移动端 IDB 驱逐同样无解**。
- #2684 恢复出的项目因"无改动"关闭不弹警告→备份被删光；#2003 连环崩溃恢复 uuid 变化致项目重复；#2761 Android recover 按钮无响应。

### 2.7 对照：Photopea【官方】
- **Photopea 用了 FSA**：支持的浏览器里 File→Save 对本地打开的文件**原位写回**（"replace the old version of a file"），Google Drive 来源也写回；不支持的浏览器退化下载（退化路径为综合推断）。崩溃恢复 = 站点数据临时 PSD，崩溃重开自动恢复；主动放弃 = 真丢（二手，未逐字核）。
- 即：「Blockbench 式」严格说 = 最保守的纯下载式；**原位写回是 Photopea 式**，我方 spec §7 的写回属后者。

---

## 3. itch.io 嵌入环境技术现实

### 3.1 嵌入方式【第一手 curl 实测 wigglypaint 页】
- iframe **无 sandbox 属性**（普通 cross-origin iframe）；allow 列表 = autoplay/fullscreen/geolocation/microphone/camera/midi/monetization/xr/gamepad/gyroscope/accelerometer/cross-origin-isolated/web-share——**无 clipboard-write、无任何 FSA 相关委托**。
- 所有游戏共享 **`html-classic.itch.zone`** 一个域（2023-11 从 hwcdn 迁来），每游戏一个路径，**无 per-game origin**。迁域时官方原话："Games that used save game state within the browser will lose all their save data … there is no way around this limitation."——itch 自己发生过一次全平台浏览器存档团灭。

### 3.2 File System Access API：**iframe 里死透**【确认】
Chromium 明文禁止 cross-origin subframe 弹文件选择器（`SecurityError: Cross origin sub frames aren't allowed to show a file picker`）；放行名单是浏览器**嵌入方级 C++ 接口**（`ContentClient::IsFilePickerAllowedForCrossOriginSubframe()`，Chrome 只给自家 PDF viewer 开洞），**网页端无对应 permission policy 可委托**——itch 给不给都无济于事。Safari/Firefox 本就不支持 FSA picker。

### 3.3 IndexedDB / localStorage【确认】
- 能用（无 sandbox），但：Chrome 115+ 按 (顶级站点, iframe origin) 分区；**Safari/iOS 跨 session 实测大概率丢**（多方报告"完全关浏览器后存档消失"）；IDB 口碑比 localStorage 更差（Ren'Py/Emscripten IDBFS 报 `invalid security context`）；**命名空间与配额全 itch 游戏共用**（IF 社区实锤"一次导出=导出你玩过的所有游戏的存档"）；Safari ITP 7 天规则适用。

### 3.4 `<input type=file>` / `<a download>`【确认（间接多方一致）】
两者正常，是生态标准做法（存档=下载文件、读档=拖回/上传）。

### 3.5 跳出 iframe【确认】
官方 embed 选项（Click to launch fullscreen / Maximized / Fullscreen Button）**全部仍在 cross-origin iframe 里**，不改变 3.2/3.3 任何限制。"新标签页打开"无官方支持（多年 feature request 悬置）；`html-classic.itch.zone` 直链公开可访问但随每次上传 build 变化，不可当正式入口。

### 3.6 同类工具生态【确认】
| 工具 | 网页版 | 打开/保存 | 定价 |
|---|---|---|---|
| Pixelorama | itch 页内可玩 | 拖放 .pxo + 导出下载；web 版功能残；主推桌面下载 | 免费+name-your-own-price |
| **Wigglypaint**（itch 爆火画画工具） | 页内可玩 | GIF 走下载；**离线版 = File→Save As 存一个 standalone .html "you can keep forever"** | 免费开源 |
| Decker | 作者自域试玩 | deck = 自包含 .html 导出 | name-your-own-price |
| Tiled | 无网页版 | 纯桌面 | name-your-own-price |

- "网页版存档会丢"类告示真实存在（有工具直接禁用 web 版存读档并注明用下载版）。
- **活得好的网页工具共同点：产物即下载文件、零浏览器持久化依赖**；把项目留浏览器里的全在论坛哀嚎。
- 付费形态主流 = web 免费 + 下载 name-your-own-price；"拿到 html 文件本地跑"被 Wigglypaint/Decker 验证可行。

### 3.7 对 single-html 上 itch 最致命三条（汇总）
① FSA 在 iframe 死透（浏览器级，无解）→ 打开/保存只有 input/download/拖放；② 浏览器持久化不可托付（iOS 丢、共享 origin、官方团灭前科）；③ 无官方跳出 iframe 逃生门。

---

## 4. WeebPaint 现状耦合面地图（HEAD `73f1af9` / v0.10.28）

### 4.0 结论先行
1. **无地支路已在树上活着**：`session.localFile`（`src/session-state.ts:117`）= 完整「家=FS 句柄」路径（双墙防跨写、mtime 对表、beforeunload 降级、导出/另存收编）。改造 = 扶正 opt-in 支路，非新建。
2. **store 缺席已有真路径**：`src/store-absent.ts` null-store（`?nostore`）保 boot/画画/进出 ora/内置笔刷不死；代价 = 笔刷库/设置/appState 退化内存态刷新即失。
3. **贯穿性假设一处半**：① doc 身份 = 裸名字符串 `_activeSessionName`，20+ 处 `session.name` 真值/相等判据；无地靠「恒 null」绕过 ⇒ revert/rename/checkpoint/加密/gallery 对无地 doc 静默不可用。② autosave/checkpoint/boot-restore 三链 key 全是 store 全名。
4. **cloud-capability 开关完整存活**（回滚只撤 `app-prefs.ts` 默认值 4 行：现 `true`，被撤回的 v0.10.23 是 `false`）；「关云=变新文档」「1024² 落脚」「beginFileFirstDoc」「storage-persist.ts」不在树上。
5. **A4 死角实锤**：云关 boot 落 `name===null && localFile===null` 的空白画布，保存直接 `ss.noDocCannotSave`（`session-state.ts:464-465`），徽章 `none`（`save-status.ts:74`）——默认路径无任何落盘出口。

### 4.1 doc 身份三份并存
| 层 | 字段 | 定义处 | 形态 |
|---|---|---|---|
| app 内存 SSoT | `_activeSessionName` | `session-state.ts:71` | 裸名，初值 `t("nd.untitled")` |
| 持久 | `appState.currentFile` | `app-state.ts:83-84`（store collection） | 裸名/null |
| store 身份 | 全名 `X.ora` | `toFull()`=`sessionFileName()`（`session-state.ts:85`） | 加密件云端再 `.zip` |
| editor-session | `_name` | `editor-session.ts:92` | 全名 |

- 唯一写入口 `_setActive()`（`session-state.ts:88-97`）：归一化 + `setCurrentSessionName` + Web Lock。
- 消费者：`store.file()` key、`app-store.ts:83 activeFileName`、save 徽章、smart-save、checkpoint key（`checkpoint-policy.ts:42`）、instance-locks、gallery `item.name===session.name`、加密守卫（`session-state.ts:493`）、前台 `pullIfClean`（`app.ts:597`）。
- 无地 doc：`_localFile={handle,fileName,lastModified,dirty}`，name 恒 null；墙①localFile 在场 es 永不标脏（`:876`）、墙②`_esMuted` 残影墙（`:117-124,877`）；`adopt` 在 localFile 在场时抛错（`:862`）。
- `_isLazyBlankSession` 半死（全仓无一处置 true）；「consent 前不建库条目」语义树上不存在；`newDoc` 硬编码立刻建库（`:609-647`）。

### 4.2 boot 链
`app.ts:123` blank 2048² → `boot-restore.ts:48` 五落点：`blank-cloud-off`（`:50-56`，setNameMemoryOnly(null)+openBlankCanvas）/ gallery-* 四态 / restored。持久标记 `currentFile`、`restoreAttempt`（崩溃环断路器）都住 store collection——store 一走无家可归。

### 4.3 消费点清单（量级）
| # | 模块 | 量级 | 要点 |
|---|---|---|---|
| 1 | doc 身份裸名贯穿 | **大** | 20+ 判据逐点重判；需身份联合类型（store 名\|FS 句柄\|无） |
| 2 | gallery/store 消费面 | **大** | 中央闸已在（`gallery-shell.ts:58`）但数据层照常初始化；需整块可拆卸 |
| 3 | 笔刷库+4 个设置 collection | 中 | 全住 store collection（`app-store.ts:96-97,219`）；null-store 下退化内存态；唯一不走 store 的持久化 = `boot-snapshot.ts` 两个 localStorage 键（theme/lang 防闪白） |
| 4 | checkpoint/revert | 中 | IDB 是 app 自己的库 `weebpaint`（`storage.ts:13`）非 store 库（有利）；动的是 key 身份代数 + `topbar-menu.ts:275` 的 name 前置 |
| 5 | smart-save 两套状态机 | 中 | 徽章 7 态（`save-status.ts:47-63`）+ 动作 5 分支（`topbar-menu.ts:64-101`）分处两地，须同改同测；A4 死角在分支 2 |
| 6 | boot/boot-restore | 中 | 端口注入设计好、可测；两个持久标记要搬家 |
| 7 | autosave+flush | 小 | 双墙已天然短路（`bgJobs.register("autosave",…minIdleMs:30_000)`，`session-state.ts:894-897`） |
| 8 | timelapse | 小 | 零 store 零 IDB，寄生 .ora sidecar（`_timelapseJson/_timelapseMp4`），无地天然可用；风险=无地不自动保存则录像随刷新丢 |
| 9 | 本地文件进出口 | 小 | `local-file-session.ts`（112 行零 app 依赖带测试）：picker/drop（⚠`getAsFileSystemHandle` 须首个 await 前同步收集）/`writeHandleBlob` createWritable 原子替换/`consumeLaunchFiles`/`hasWeebPaintTraces` 三选一痕迹检测；5 消费点全接线；exporters 注册表 + `_cloudSinkBlocked()` 已识别 storeAbsent/localFile/加密三拒绝态 |
| 10 | cloud-capability 本体 | 小 | 7 消费点；红线=纯 UI gating 零数据变更；**MSAL init 目前不吃这个开关**（云关仍 initAuth，已知未收口）；MSAL 本身懒加载（`app.ts:476-485` 只在 isAuthConfigured 才 load script），`?nostore` → dormantAuth ⇒ 零 MSAL boot 路径已存在 |

### 4.4 现成资产（改造勿重造）
`store-absent.ts`（+`test/store-absent.test.mjs` 逐成员防 drift）、`boot-restore.ts`（全端口注入+测试）、`checkpoint-policy.ts`（纯策略+测试）、`local-file-session.ts`（零依赖+测试）、`AppStorePort = Pick<Store,"file"|"files"|"collection"|"encryption">`（`app-store.ts:118`，消费面已收窄 4 成员）。

### 4.5 与 recon doc 对账
A4 实锤（`session-state.ts:465`）；cloud-capability 接缝**已在 HEAD 不需从 tag 取回**（recon §5 该条对 HEAD 不成立）；`storage-persist.ts`/`storage-usage`/`beginFileFirstDoc` 确实不在树上。

---

## 5. 综合：调查对设计的含义（事实推论，非拍板）

1. **itch 环境不存在别的诚实模式**：FSA 死、IDB 不可托付、MSAL 无戏 ⇒ itch 版只能是「纯内存 + input/download」形态；该形态即 Wigglypaint 模式，是 itch 生态赢家形态。
2. **Blockbench 网页版的 IDB 用途恰好只有一个：灾难备份**（30s 快照、正常关闭即删、启动横幅恢复、明文警告"备份只是备份"）——与「IDB 不当家」的目标同构，且"正常关闭即删"顺手缓解公用电脑残留。
3. **行业标杆对移动端 IDB 驱逐无解**（#2724 官方 not planned）——灾难备份层只能按 best-effort 诚实标注，不能当承重层。
4. **原位写回（Photopea 式）与纯下载（Blockbench 式）是两档**，按平台能力分档：FSA 平台句柄写回，非 FSA 平台（iPad Safari / itch iframe）纯下载。
5. 改造起点比预想好：无地支路、null-store、零 MSAL boot 已是树上资产；大头是 doc 身份联合类型化与 gallery/store 面的可拆卸化。

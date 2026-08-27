# 无地骑士 grill 结案——心智模型宪法 + 拍板台账 + 工单分解

> created 20260825 · as-of v0.10.30 / 2026-08-25 · by Claude Fable 5
> 本文 = 2026-08-25 全天 grill session 的**结案**。调查底账 = `20260825-localfile-knight-survey.md`（五路调研），
> 入场材料 = `20260825-localfile-knight-recon.md`。引「user 原话」处均为本 session 逐字（transcript 30 天会灭失，
> 本文即耐久出处）。提案 .h = `20260825-localfile-knight-proposal-api.md`（pin 住的契约，实现漂移要回写）。
> 现状 .h = 仓内 `api/`（v0.10.30 现值）。

---

## 1. 心智模型宪法

### 1.1 一句话（美工版，产品的北极星文案）

> **每幅画任一时刻恰好有一个家：图库、或你磁盘上的一个文件、或还没有家（transient）。
> 保存 = 送回家，只有回了家才清 dirty；送去别的地方 = 导出，导出永不清 dirty。**

顶栏徽章永远回答「这画住哪」。美工测试标准：不看文档能答出"我这画在哪"。

### 1.2 两个模式 + 一根环境轴

| | **Gallery + Editor（图库模式）** | **Editor Only（仅编辑器）** |
|---|---|---|
| 定义 | 挂了一个 store backend（OneDrive / 将来 GDrive / **本地文件夹**——本地盘=云的抽象） | 无 store 实例（`createStore` 不被调用） |
| 新画布 | **自动安家进图库**（Procreate 性 = intentional feature，user：「涂鸦自动帮你进画布不需要consent，想扔反而麻烦，是一个intentionally design feature」），默认名 = `yyyymmdd-hex4`（v217 惯例），禁「未命名」 | transient，第一次 Ctrl+S = 安家仪式 |
| 退出 | 自动 ctrl+s，现 UX 一字不动 | dirty → 显式三键挽留（保存/丢弃/取消）；丢弃=明确决定；跳过挽留（crash）→ T-crash 恢复横幅 |
| 心理定位 | **Home**（练习本；「老了之后和金政基一样变成portfolio」） | **Shop**（急修急画；transient 是本职美德）——「独行的话用户就是 consent transient，而不是 practice home」 |
| 散文件 | **可以开**（双击 appfolder ora 即此场景）：FS 开=文件家，与图库画并存 | 唯一形态 |

**环境轴：地/无地**（用户不用理解，是我们的部署现实）：**无地** = 平台把持久化器官没收或不可靠（itch iframe / file:// 双击，Safari file:// 存储直接 SecurityError）→ 只能 Editor Only + T-crash 打折 best-effort。⚠ 术语纪律：**无地 ≠ 无云**——无云（Editor Only / 云 gallery 未挂）时持久化器官可能好好的。

### 1.3 doc 三态与身份

- 三态 = per-doc 属性，模式 = app 级能力（模式决定「图库家」这个选项存不存在）。
- **户口** = 图库项身份 = **(gallery-id, 相对 path)**。gallery 内 = 0607 判决的 path 身份原样（红线不动）；跨 gallery 零身份主张。
- **行李牌** = local file / transient doc 的临时 key：每次打开现铸、只活在 RAM+crash 库、正常关闭即焚、永不写进文件、永不参与匹配。它是快照的收件人地址，不是身份（0607「不铸 id」辖区外）。
- **拷贝即分叉，全场统一**（文件级 + gallery 级）：拷出去的永远不会"神秘地还连着"。这是杀死 token 身份方案的承重决定。
- 双击 appfolder ora：本地 WeebPaint 就当一个本地文件；云端就当第三者从 OneDrive 写入（走 etag→cloudMoved→现有冲突面）。**不检测也安全**是设计要求（FSA 拿不到全路径，检测不可能）。

### 1.4 器官学（依赖倒置，本轮定的纪律）

- **脑（领域+算法，纯 TS node 可测）定义 port，器官实现 port，脑永不 import 器官**。样板已在树上：`boot-restore.ts` 端口注入、`checkpoint-policy.ts` 纯策略、**`weebpaint-backend-interface.ts` + soft-gl2-port（WebGL 已有 port + 软实现，勿再漂移——本轮出过一次 AI 漂移事故，已钉 memory）**。
- 胶水（生命周期/store 编排/webgl 池管理）**珍惜**，只是不跟领域走。
- 器官契约**只写已知失败情况**（威胁预测头被否决：「未来的威胁很难想象，而且瑞士奶酪原则 discourage 自己能堵的洞交给别人」），不许拿契约摆烂。
- 命名：既有标准词归标准词（store 用 store 词汇），领域词只给真领域物（画/brush/手感）。稳定依赖不套 port（std::string 类）；**WebGL 不属于稳定依赖**——它是手感承重的易变边界。
- **AI 纪律（本轮立）**：凡「拆护栏方向」的判断（不需要 port / 可省检查）必须带出处（代码现状或既有拍板），无出处标「未核，请打枪」；加护栏方向可随口提。

### 1.5 与旧宪法的关系（考古结论）

创世条款（离线一等、OneDrive=SSoT、AppFolder、consent、不丢作品、可接任何网盘）**全部存活**。被证伪删除的唯一条款：**「IDB 可以当作品的家」**——user：「六月的宪法没你想的这么好，那时候是假设IDB忠实可靠。现在这条翻了」。IDB 从此只有三种角色：图库缓存（可弃）、crash-shadow（best-effort）、device-local 登记（registry/句柄）。六月宪法中依赖 IDB affordance 的机构随本轮重写；概念轴（Home/consent/conflict）与云侧红线存活。家族 MASTER/share-file-model 的修订案**不在本文**——归 store 轮连同红线一起与人类过（改 MASTER 前必 grill 家规）。

---

## 2. 拍板台账（全部 user 2026-08-25 本 session 拍板）

### 2.1 保存/命名/文件
- 一画一家 + 导出永不清 dirty ✅。下载开始 = 责任移交用户 + 「已下载」toast（「download只要浏览器开始下了责任就在用户啦」）。
- **同一按钮静默 fallback**：保存/打开各一个按钮，FSA 优先，不可用落 input/download；AbortError（用户取消）≠ 环境不支持，不许降级重弹。主菜单随之干净。
- 命名三粒度：**画 = `yyyymmdd-hex4`**（日粒度+消歧码，v217 惯例沿用）；**下载版本 = `名-YYYYMMDD-HHMM`** 撞名补 `-1/-2`（复用 `export-import-menu.ts:40` 现成代码提拔为全局命名器官）；项目=月粒度。禁「未命名」。谥号模式兼容（日期名顶着，毕业 rename）。
- 标题栏显示画名+dirty 点（`document.title` 不产生历史记录，零 spam）。
- 大图/psd/格式队列等沿用 spec 20260819 不动。

### 2.2 T-crash（灾难恢复尾）
- **做**。Blockbench 形状：30s 空闲**盲快照**（与保存同一 `encodeDocToOra` 字节，无歧视——mp4 sidecar 是 passthrough 非转码）、同行李牌覆盖写单帧、**正常关闭即删**、boot 非模态横幅叠画布（不是 start screen——canvas-first 拍板）。
- app 自己的 IDB，不走 store（「之前说的只能走idb主要是为了防opus」——本条为 user 明示豁免）。
- 与 redirect-tmp **同一层存储两种记录态** `crash | pending-adoption`；**pending 在场时 unload 不得触发正常关闭即删**（契约测试钉死）。
- file:// 形态 best-effort 默默兜底（不写用户文档，Blockbench 先例）；已知失败：Chromium file:// 共桶内快照对任何本地 html 可读（user 知情接受）。
- 恢复出的 doc 视为 dirty 直到第一次真保存（防 Blockbench #2684/#2003 两坑，测试钉）。
- 基准件 = **夏音 v0.3**（最胖 timelapse；注意 v0.3 因保存卡未开全量 2k——「大文件异步保存」工单同源）。
- 奶酪令：T-crash 永远是附加层，dirty 徽章+挽留+beforeunload 是承重层；「要求用户备份 = 把数据安全的锅推给用户」，设计假设用户没备份、也假设 T-crash 不存在。
- autosave 重构为 store-agnostic：头部策略（何时拍），落点按家分发（图库家→store crash-shadow；文件家/transient→T-crash）。

### 2.3 Gallery（多实例 + 本地文件夹）
- 数据契约 = **多 gallery 共存**（RealHome 标准）+ local file；WeebPaint UX = 单 gallery，但**「当前 gallery」是 tab 级**（双 tab 双 gallery 合法）。**热插拔不重启**（「以后是可以能避免重启的不要懒」）。
- **registry 铸 id**：device-local 小 IDB（铸的 opaque id + 句柄/账号引用 + 标签 + last-active）；id 非路径；db 名 = `weebpaint-bd6cece69075d759.gallery-<id>`。**GUID 命名空间 = `weebpaint-bd6cece69075d759`**（永久固定，preimage 由 user 自持、不进仓不进 lint，注释只写 "namespace token, preimage held by owner"）。
- **`.weebpaint` 源内标记否决**（= in-file GUID 在 gallery 尺度复刻；「一个源只有一个历史这个机制我们所有的红线都建立在这个上面」）。〔界线补注 2026-08-27，user 确认（edited by Claude Fable 5）：否决的实质 = **身份标记**——`.weebpaint/` 作为**存在标记/管理容器**（collections+安全网，store 保留根 `.<appId>` 现状）合法；里面永不放 gallery id/GUID，registry id 永远 device-local，同夹二挂查重只靠 isSameEntry。详 P3 案卷 `20260827-p3-gallery-multiinstance-grill-verdicts.md` §1.3。〕
- 孤儿缓存库 = 可弃缓存；attach 时扫孤儿 dirty → surfaced；无 dirty 可 GC（挂深清）；dirty 永不静默删。Chromium FSA 句柄大概率随改名存活（真机验证项）。
- WeebPaint 不用 RealHome 多源共存展示模型（那是消费型订阅语义，workshop 概念归 RealHome 系）；**跨源移动不做**——大批量管理归 file explorer（创世思路）。
- 每个 gallery 自带笔刷和 settings（PPSSPP 语义：每库一套 config）。
- 回收站/.backup = 文件夹内子目录（资源管理器可见，user 创世设计：「整个代码不可靠的话可以资源管理器里面回收站和backup捞文件」——backup 无 UI 不焦虑的理由）。
- persist() 只在 attach gallery 时申请；Editor-only 首开不申请（公用电脑/transient 姿态）。

### 2.4 创建图库 / 登录流程（含 token 过期高频场景）
- 入口 = 文件菜单「创建图库…」，用户自己发现（toast 邀请 = gotcha game，否决）；模态选 OneDrive / 本地文件夹。
- editor 先、gallery optional（boot 永不 404 跳 gallery）。
- transient dirty 在场时：**桌面强制 popup**（不导航）；**iOS redirect + 待领养记录**（iOS standalone PWA popup 的 token 回不来，redirect 是唯一可靠路）；回程 boot 显式领养 surfaced（「你创建图库前画的那幅在这里」）。本地文件夹分支全程无导航零风险。
- 奶酪令：popup/待领养各自承重，「不要觉得有idb兜底就这里可以直接丢重新加载」。
- link/create/switch/unlink 完整 UX 细节 = store 轮后续 grill。

### 2.5 锁 / 并发
- instance-locks（Web Locks：origin 级咨询锁，tab 崩溃自动释放，防同设备双 tab clobber）保留；**锁名改 `gallery-id:相对path`**（防跨 gallery 假阳性互锁）。
- 文件家 doc 跨 tab：安全网 = 写回前 mtime 对表（mtime 纪律**封在文件器官内部**，语法扫描测试钉——抄隔壁 If-Match 家规护栏的手法）；transient 无共享资源无 race。
- 锁/IDB/localStorage 同一 origin 身份：web 版与本地 html 互不相通（=不同设备）；本地 html 之间 Chromium 共桶（锁 scope 真机验证项）。
- T-crash 行李牌 per-doc（多 tab 各挂各的）；恢复→删除事务化防双领养。

### 2.6 变更检测（非身份）
- 文件家/folder backend etag = **(mtime, size)**；**懒仲裁 hash** 只在可疑差异时算（mtime 变 size 同 / 粗粒度平台），在产生 desync/backup 之前拦误报。中段必采（imohash 式）若将来上采样 hash。
- **hash 永不升格为身份**（契约钉死）。身份仍 = path（0607 判决完好）；content-hash 身份维持家族否决（验尸报告见 survey §1.2 与 0607 doc）。
- 撞名异身份守卫遗训：将来任何身份升级，同名 ≠ 同身份，宁裂卡不误配。

### 2.7 revert v2（语义已 grill，实现归骑士，高红线宣发前）
- **qualifier = 输入间隔**：两次输入隔 ≥ N 分钟 = 新的一次坐下（不依赖 visibility/锁屏/PWA 挂起事件——iPad 上那些不可靠；1623 分钟案根治）。
- **首笔前 copy-on-write**：恢复前台不拍，落第一笔之前拍（隔壁「真快进第一笔之前升 gate」同手法）。
- **ring 按字节预算**：桌面 64MB / 移动 32MB（可调常量），滚动淘汰最旧 = revert list 白送。
- **undo revert**：revert 前自动拍当前态一档。
- 文件家 doc 的 revert = **打开点快照**，挂行李牌，session 级，正常关闭随牌焚；跨 session 历史诚实归 OneDrive version history / 文件管理器。
- 显示用人话（「回到 今天 14:02（打开时）」）。

### 2.8 笔刷 / settings 去 store 化
- **app 不再拿 store collection 当运行时容器**（「store管settings其实是一个单一职责违规」）——本轮 scope，必做。store API 面不用改（fact-check：现值 = file/files/collection/encryption 四成员，无 settings 专属物）。
- **笔架 = 文件家公民**（Editor-only：笔架住磁盘上一个文件，打开-编辑-写回，= 一画一家套在笔架上）；registry 记句柄，**能静默就静默**加载，权限掉出一键 chip，失败回内置不挡路。笔架文件家实现可 park 不伤彻底性；「跟着画」的笔不做（纹理笔刷时代再 grill；「贴图跟画不跟全局」原则记下——治素材外链）。

### 2.9 build / 交付物
- **html build = 全量 build 运行时 gate**（撤销 nostore 物理阉割——user 意图是保留**紧急上云逃生**：client id 烤入；file:// MSAL 死，争取路径 = Azure 白名单 `http://localhost` 本地 serve 逃生舱，不保证）。html 内生成逃生脚本/说明 helper **park**。
- itch：可下载 html 为主，embedding「决定放，好玩嘛」；iframe 测试夹具进工单。
- single-file 化改造三栏清单见 survey §5.3（SW 全家放弃、7z-wasm base64 内嵌、存储访问全 try/catch 降级纯内存、剪贴板降级链 = spec §3 paste 主通道天然对齐）。
- crash 库等全部 IDB 名带 `weebpaint-bd6cece69075d759` 前缀（file:// 共桶防撞）；纪律：永不枚举非自己前缀的库。

### 2.10 还原出厂设置（新工单）
清 registry + 全缓存库 + localStorage + crash/revert ring → **无痕扫**（枚举自家前缀验证归零）→ **打字 consent**（in-app sheet 输入确认词，禁系统对话框）；还原笔刷同款护栏。与 parked 的深清/公用电脑同机器两按钮，归一个工单。

---

## 3. 已知失败清单（诚实账，随器官契约落码）

1. 无 FSA 完成信号：下载后用户取消另存对话框不可知（→ 责任移交拍板 + toast）。
2. synced-folder gallery 跨机仲裁委托云盘客户端（冲突副本文件，档位低于 Graph If-Match）= PPSSPP 姿态。
3. registry 活在 IDB 可被驱逐 → 重 link + 孤儿 dirty 扫描兜；源字节永远无恙。
4. 文件器官 If-Match 等价物 = 读-比-写，有毫秒级 TOCTOU 窗（唯一并发写手 = 云盘客户端）。
5. Chromium file:// 共桶：crash 快照对其他本地 html 可读；T-crash 在 Safari file:// 全灭、itch iframe 分区易失。
6. mtime 可被工具类软件静默摸（→ 懒仲裁 hash 拦误报）。
7. 移动端浏览器整源驱逐 IDB 无解（Blockbench #2724）——T-crash/revert ring 均 best-effort。
8. A6：7 天 ITP 永不可测（user 高频使用），按最坏假设设计。

## 4. 工单分解（实现轮，顺序即依赖）

- **P0（store 轮，独立先行）**：A2/A3 事务收敛（08-21 交办：一次收敛三种事务形状 + 改写反的 GUIDELINE + 补 reqTx 契约单测；参考 tag `opus-round-20260821-before-rollback`）。
- **P1 app 核心**：doc 身份联合类型（`session.name` 私有化→编译器逼出 20+ 消费点 exhaustive）+ 家动词中心化（安家/搬家/清 dirty 单模块持权，workpiece 令牌同手法）+ canvas-first boot + save hub（单按钮 fallback）+ intake hub + 命名器官 + 标题栏。(家×动作) 矩阵契约测试。
- **P2 尾巴**：T-crash（含 pending-adoption、行李牌、盲快照基准夏音 v0.3）+ autosave 分发重构 + Editor-only 挽留三键。
- **P3 gallery 多实例侧（依赖 store 轮交付）**：registry + 创建图库 UX + 热插拔生命周期（attach/detach 步骤见 §2.5 讨论：收口开画→停 watcher→drain in-flight→绿灯门 dirty 扫→销毁；缓存默认保留）+ 锁名改造 + persist 时机。
- **P4 revert v2**（高红线宣发前）。
- **P5 笔刷/settings 去 store 化** + Editor-only 笔架。
- **P6 builds**：single html + itch 上传 + iframe 夹具 + localhost 逃生舱验证。
- **P7 还原出厂设置**。
- 版本 gate：本工程 = 新纪元，**bump minor 需人类显式说出版本号**；开工前按家规问「要不要把之前的版本 push prod」。

## 5. store escalation agenda（交下一个 agent，走 pwa-cloud-store skill，逐条 escalate human）

1. A2/A3 事务收敛（P0，最高优先，红线区）。
2. **多实例契约**：确认/加固 dbName=`${appId}.${databaseId}` 的多实例姿态（d.ts 已注明「想开多个互不打架的 store」）；实例生命周期 API（dispose/drain）；detach 绿灯门需要的 dirty 枚举口径（注意 usage「永不返名字」红线与 dirty 清单的关系——需新口子则 escalate 设计）。
3. **collections 归属**：per-gallery settings/brush 同步的行为确认（跨实例语义）。
4. **folder provider（FSA 目录 backend）**：契约映射 list→目录枚举 / etag→(mtime,size)+懒仲裁 hash / If-Match→读-比-写（已知失败 §3.4）/ .trash/.backup→子文件夹 / copy→FS copy；轮询时机与云 provider 平价（focus/打开，无推送——fact-check 已证）。
5. registry（device-local，句柄容器）与 0607「registry=灾难」判决的显式区分记录（per-gallery、device-local、永不同步 vs per-file、跨设备同步）。
6. 换 backend ritual 作废的落地：detach 安全性由「源=SSoT、缓存可弃」结构给出；全量 clean 检查（本地零网络）设计。
7. MASTER/share-file-model 修订案（IDB 角色降级、无地环境轴、folder backend 红线映射）——与人类逐条过后才动家族 doc。

## 6. 真机验证批（攒批，「我只测一次。就是交付」）

1. headed Chrome file://：FSA picker 实际调用、clipboard prompt。2. Safari file://：worker/wasm/module 全套 + 存储 SecurityError 降级不白屏。3. Chromium FSA 句柄跨改名存活。4. Chrome 持久权限（gallery 句柄 + 笔架句柄静默重取）。5. file:// 本地 html 之间 Web Locks scope。6. itch iframe：paste 降级链、IDB 分区行为。7. T-crash 夏音 v0.3 基准（30s 空闲编码+写入不卡笔）。8. popup MSAL 桌面 / redirect+待领养 iOS 全流程。9. beforeunload 各退出路径（沿 spec §10）。10. Ctrl+Shift+C 等 spec 20260819 攒批项照旧。

## 7. 否决 / parked（防 re-litigate，含既有）

否决：`.weebpaint` 源内标记；toast 邀请；「自动恢复但不保证」中间态；威胁预测契约头；跨源移动；hash 升格身份；nostore 物理阉割 build；工房/workspace 词；Standalone 模式名；「跟着画」的笔（口子留，纹理时代 grill）。
parked：html 内逃生 helper；persist/深清宏观轮（还原出厂设置吸收其 app 侧）；笔架文件家实现；主菜单精简（congratulations 阶段）；backup 箱 UI；大文件异步保存（与 T-crash 同源，独立工单）；宣发页 iframe 自动重放（等无头 multiplayer）。
沿用不动：spec 20260819 全部既有拍板（剪贴板/护栏/格式队列/§7.1 弃自动保存三件套/§7.2 关闭护栏）；ADR-0022 scope 硬规则 #6；personal-account-only。

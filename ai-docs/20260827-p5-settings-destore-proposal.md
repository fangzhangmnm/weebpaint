# P5 笔刷/settings 去 store 化——重构策划（提案 .h + 风险地图，待 user grill）

> created 20260827 · as-of v0.11.8 / 2026-08-27 · by Claude Fable 5
> 出处：verdicts §2.8「**app 不再拿 store collection 当运行时容器**（user 原话『store管settings其实
> 是一个单一职责违规』）——本轮 scope，必做。store API 面不用改」+ §2.3「每个 gallery 自带笔刷和
> settings（PPSSPP 语义）」。grill transcript 已灭失，除这两句外**无更多 pin**——因此本文 = 按 API
> ritual 出的重构策划件（现状 .h + 提案 .h），**实现等 user 过目**（feedback：讨论期不动工）。

## 1. 现状 .h（api/ 现值摘要，as-of v0.11.8）

collection 消费面 = **5 个 collection、三种耦合形**：

| collection | 注入点 | 耦合形 |
|---|---|---|
| local-user-preference / synced-user-preference | app-prefs.ts（wirePreferences） | **直读直写**：`getItem(key, DEFAULT)` 散在全 app（约 30+ 处，靠 grep）；collection 的内存镜像**就是**运行时态；注入前读返 DEFAULTS |
| synced-app-state / local-app-state | app-state.ts（wireAppState） | **struct 门面直读写**：`appState.currentFile` getter/setter 直通 collection，**不落 app RAM**（v409 刻意设计「不写第二份数据结构」——P5 拍板明确反转此哲学） |
| brush-rack | brush-rack-controller（deps.collection） | **半去 store 化**：读面已有 app 侧 shallowRef 镜像（`_brushesRef/_metaRef`，唯一写入点=collection.onChange）；但写路径仍散点直调 `collection.setItem`，读源仍是 `getAllBrushes(collection)` |

另有非 collection 的 per-doc desk（editor-state，跟 ora 走）——**不在 P5 范围**。
boot 快照（lang/theme 走 localStorage，boot-snapshot.ts）——不动。

## 2. 提案 .h（目标契约草案）

```ts
// ─── 原则：app 运行时态 = app 自有 struct；collection 降级为「持久化+同步通道」，只在四个边界碰 ───
// ① boot hydrate：collection.init 后一次性灌入 app struct（此前读返 DEFAULTS，与现状同）
// ② 写路径：app setter 写自家 struct（同步、无注入依赖）+ 转发 collection.setItem（防抖/云推仍全归库）
// ③ 云端变更：collection.onChange → 回灌 app struct（LWW 冲突语义不变；collection 仍是持久层权威）
// ④ P3 attach/detach：换 gallery = 换通道——从新 gallery 的 collections 整体重灌 struct（热插拔的
//    先决条件：直读形下换 collection 要全 app 重注入，racy；struct 形下 = 一次重灌）

interface SettingsHost<T extends Record<string, unknown>> {   // prefs/app-state 共用的通道壳
  readonly state: T;                       // app 自有运行时 struct（读面唯一来源；UI 反应式按需包）
  set<K extends keyof T>(k: K, v: T[K]): void;   // 写 struct + 转发通道（未接通道时只写 struct——boot 安全）
  attach(coll: Collection): Promise<void>; // 边界①④：接通道 + 整体灌入（P3 换 gallery 复用）
  detach(): Promise<void>;                 // 边界④：flushLocal 后断开；struct 保留（UI 不闪）
}
// brush-rack：补完既有半成品——写路径收敛为 rack 自有 verbs（改 struct + 转发 setItem），
//   读源全部切 _brushesRef（getAllBrushes(collection) 退役）；onChange 回灌不变。
```

## 3. 风险地图（接口面/耦合面，不是实现 bug 清单）

1. **双 SSoT 漂移**：struct 与 collection 两份态——提案的钉法：写必双写（set 封死唯一入口）、
   onChange 必回灌；语法护栏测试可钉「app 侧零裸 collection.getItem」。
2. **v409 反转**：「不写第二份数据结构」是 v409 刻意设计（app-prefs 头注释）——P5 拍板明确推翻，
   但推翻范围要 user 确认（见 §4 问题 3）。
3. **current-file 特殊性**：它是 boot 纪律/崩溃环断路器/store 驱逐守卫（activeFileName）的输入，
   改动波及 boot-restore 契约测试面——风险最高的一格。
4. **约 30+ 直读点的机械迁移**：量大但编译器可逼（getItem 私有化同 session.name 手法）。
5. **时序**：per-gallery settings（PPSSPP）只有 P3 多 gallery 后才真发力；P5 先行的意义 =
   为 attach/detach 铺好边界④。

## 4. user 拍板台账（2026-08-27）

1. **SSoT 归属**：✅ 同意「collection=持久层权威、struct=运行时工作副本、onChange 回灌」。
2. **范围**：方向=**全做，彻底无地**；但 user 叫停一刀切——「有些东西可能不应该用 collection，
   而是走 localstorage 之类的？一个一个 grill 他们的 nature」→ 逐项性质裁决表见 §6。
3. **时机**：✅ P5 先独立做。
4. **离开 gallery 未推完的 settings**：✅ drain 等推完（user：「这个其实文件很小的」）。
5. **wipeLocal**：✅ 可以加，但**强制 type consent，且 typing check 需要库来做**（store 侧强制，
   app 只提供输入 UI 回调——店内 emptyTrash 的 danger-confirm 回调已是同形，升级为「回调返回
   用户敲的确认词、库来比对」）。→ 归 store escalation（§5 更新）。

## 6. 逐项 nature grill 表（②的展开；每项待 user 拍板）

判性质的镜头：**彻底无地** = 设备本地/boot 关键的东西不许依赖 store 引擎（Editor Only 无 store 实例；
file:// 连 localStorage 都可能 SecurityError → 一律 try/catch 降级纯内存，survey §5.3 姿态）。
候选归宿三种：**localStorage**（设备本地、小、boot 关键、无地可用）/ **per-gallery collection**
（跟库走，PPSSPP 语义，P3 后每库一套）/ **跨库难题**（跟人走但无地也要用 → localStorage 打底 +
attach 时 collection 覆盖回灌）。

| # | 项 | 现住 | nature 分析 | 建议归宿 |
|---|---|---|---|---|
| 1 | color-theme | local-pref collection | 设备视觉环境；**已有 localStorage boot 快照**（boot-snapshot），等于双写 | **localStorage 正宫化**（collection 副本退役） |
| 2 | menu-tab | local-pref | ☰ 停留页，设备视觉习惯，微小 | **localStorage** |
| 3 | cloud-enabled | local-pref | 「store 开关存在 store 里」= 自举怪味；无地必须可读 | **localStorage** |
| 4 | current-file | local-app-state | boot 纪律核心输入；现状要 await prefsReady 才可读（boot 时序枷锁的来源） | **localStorage**（boot 立即可读，时序枷锁消失） |
| 5 | restore-attempt | local-app-state | 崩溃环断路标记；**flushMarker 400ms 防抖舞蹈就是因为 collection 是防抖的**——localStorage 同步写天然解决 | **localStorage** |
| 6 | lang | synced-pref | 跟人走；已有 localStorage boot 快照 | **localStorage 打底 + attach 覆盖**（跨设备 nicety 保留）？或纯 localStorage（放弃跨设备同步）？ |
| 7 | 手感 prefs（long-press-pick / single-finger-draw / show-fps / pixel-grid / stylus-smooth-params） | synced-pref | 跟人走 vs 跟库走（PPSSPP）？无地也要用 | **localStorage 打底 + attach 覆盖**？还是 per-gallery？ |
| 8 | gen-ai | synced-pref | 功能总开关，跟人走 | 同 #7 |
| 9 | blender-panel-url | synced-app-state | 2026-07-14 决策「全账号同步（tailscale 稳定端点）」；但 BTP 无地也能用 | **localStorage 打底 + attach 覆盖**（保 2026-07-14 决策） |
| 10 | current-directory | synced-app-state | 图库浏览态——**无库即无意义** | **per-gallery collection**（P3 归库；P5 期照旧+struct 化） |
| 11 | gallery-password-verifier | synced-app-state | 加密图库 sentinel——库的属性 | **per-gallery collection**（同上） |
| 12 | brush-rack | brush-rack collection | §2.3 拍板 per-gallery（PPSSPP）；Editor Only=文件家笔架（§2.8，可 park） | **per-gallery collection** + struct 化写路径收敛 |

（synced-app-state 里躺着的 legacy current-file 死键照旧不动——v438 注释：等所有设备升级后另拍。）

## 7. 第二轮 grill 台账（user 2026-08-27，逐项裁决 + 未决分叉）

**分类学（user 提出）**：scope × kind 六类 = {跟 ora, localDevice, synced} ⊗ {preference, state}。
存储引擎仍只三种（desk / localStorage / collections），kind 轴 = 命名与分组纪律（还原出厂、
设置 UI 按 kind 分面）。**零散小字段禁裸 localStorage/IDB**——一律走抽象记录（灾难备份类大件
crash-store/checkpoint-ring 不在此列）。

**逐项已裁**：
- 跟 ora（desk）：pixel-grid（必跟 ora）、long-press-pick（跟文件）、menu-tab（编辑器语境=per doc）
- localDevice preference（localStorage）：single-finger-draw（「唯一 local device preference 特例」
  ——后追加 stylus-smooth-params、color-theme 同类）、color-theme（跟设备）
- localDevice state（localStorage）：cloud-enabled、current-file、restore-attempt、
  show-fps（debug 用，甚至可不持久化→session-only）
- synced preference（collection）：language
- synced state（collection）：api token（未来 AI；「synced 可能会有大胖东西以后，api 安全问题
  遇到了再设计」）、blender-panel-url（与 api 同类）
- gallery state（库内 collection）：current-directory；部分原 synced state 实为 gallery state
- **gallery-password-verifier = 独立功能件**：不是 preference 也不是 state（安全件，归 gallery）
- 「不持久化档」不设（会乱心智模型）；show-fps 例外可 session-only

**已裁机制**：
- localDevice 走 **localStorage**（user 问 localStorage 还是 IDB → 本文 §8 论证选 localStorage）
- 权威性：synced 内部 = collection 既有 LWW（uat 新者胜）——即 user 说的「本地权威但云更新可覆盖」
- store 的 local:true collection（无云版）在 localDevice 迁出后失去消费者 → **escalate 移除**
  （user：「这样才单一职责」）——进 store escalation 清单

**未决分叉（§8 分析）**：多 gallery 打断「synced=跟人走」保证——「local 同设备跨云端，synced
跨设备但同文件夹」；PPSSPP（一库一套+手感拷贝）vs VS Code 分层 vs 其他；无地（无 gallery）怎么办；
心智模型如何在 UI/UX 透明。

## 5. 顺带登记（P7 还原出厂设置的 store escalation）

P7（§2.10）需要 store 侧口子，归 pwa-cloud-store skill 逐条 escalate（**user 2026-08-27 已预批方向**）：
- **wipeLocal / 本地缓存库销毁**：✅ 可以加。硬条件（user 拍板）：**强制 type consent，且 typing
  check 由库来做**——API 形状建议 `wipeLocal({ confirm })`，confirm 回调（app 出 in-app sheet 输入
  UI）返回用户敲的确认词字符串，**库内比对**通过才动手（emptyTrash 的 danger-confirm 回调同形升级；
  app 侧永远拿不到「跳过比对」的路径）。dispose({drain}) 已有（0.4.0），wipe = drain→dispose→删库本体。
- **dirty 清单口径**：无痕扫前的「dirty 永不静默删」护栏——dirty facet（count/pushAll）已够用
  （count>0 → 先 pushAll / 显式确认），确认这个用法即可，无需新口。

## 8. 骑士分析：三个硬问题的解法提案（待 user 裁）

### 8.1 「多 gallery 打断 synced 保证”的根治 = 引入**账号层**（out-of-box 提案）

问题本质：**「synced」一直被当成「跟人走」，但实现载体是「某一个 gallery 的 collection」——
多 gallery 后这两件事分家了**（跨设备但同文件夹 ≠ 跟人）。VS Code 的答案（User/Workspace 分层）
和 PPSSPP 的答案（每库一套+拷贝）都是在「没有账号通道」前提下的凑合。

但我们**有**账号通道：同一 MSA 的所有 OneDrive gallery 共享同一个 appfolder——
**appfolder 根（gallery 文件夹之外）放一份账号级 settings collection**，就是天然的「跟人走」载体：

- language / api token / blender-panel-url / 手感类 synced preference → **账号层**：
  跨设备 ✓ 跨库 ✓（同帐同手感——正面回应「同一账户不同手感不好」）；
- 换账号 = 换人 = 换手感（语义自然）；打开别人分享的库不会劫持你的手感（库里根本不放这些）；
- **gallery 层只放真正跟库走的**：current-directory、brush-rack（库的资产，配拷贝 affordance）、
  gallery-password-verifier（独立安全件）——「打开不同 preference 的云库怎么办」问题**消解**：
  云库不携带通用 preference；
- **无地/Editor Only/本地文件夹库**：无账号层 → 落 device 层（localStorage）→ 落工厂默认。
  cascade 读序 = 账号 ?? 设备 ?? 默认（只两层真实层；boot 快照只是缓存不是层）。

**代价/前置**：store 需要「gallery 外（appfolder 根）的 collection」能力 → **store escalation**
（现契约 collection 挂在 store 实例=库上；能不能挂账号根待库轮设计）。若库轮否决，fallback =
VS Code 式两层（device + gallery override）或 PPSSPP+拷贝——但先争取账号层，它最贴心智模型。

### 8.2 localDevice 走 localStorage（不是 IDB）的论证

- restore-attempt 这类崩溃标记要**同步写**（现状 collection 防抖 → flushMarker 舞蹈；IDB 也是异步）；
- current-file boot 要**同步读**（prefsReady 时序枷锁直接消失）；
- 量级 = 十来个小字段，5MB 上限无压力；
- 无地姿态：try/catch 降级纯内存（survey §5.3），封在一个 device-kv 器官里，**app 侧禁裸碰**。

### 8.3 心智模型的 UI/UX 透明化（user 问「有什么好办法」）

- 设置 sheet 按 scope **分区 + 人话标题**：「这幅画」「这台设备」「你的账号」（「这个图库」区
  只有库资产类：笔刷等）——不用 preference/state 这种词，kind 轴只影响开发侧分组与还原出厂粒度；
- 每项行尾一个 scope 微章（画/设备/云人形图标），长按/hover 出一句人话（「跟这幅画走，保存在
  .ora 里」）；
- 图标库登记三枚 scope 小图标（doc/device/account）→ SVG Icons TODO.md；
- Editor Only / 未登录：账号区整段折叠成一行「登录后这些设置会跟着你」——**scope 模型用缺席
  自解释**；
- 手感拷贝 affordance（PPSSPP 需求的残余价值）：brush-rack 库资产侧给「拷到这个库/从库拷来」，
  通用 preference 因为进了账号层**不再需要拷**。

### 8.4 连带小裁决（提请注意）

- **per-doc 项的「新画默认」**：pixel-grid/long-press-pick 迁 desk 后，新画从工厂默认起
  （pixel-grid=开、long-press=开）——**不做**「设为新画默认」种子机制 v1（观察是否烦再说）；
- show-fps：session-only 运行时旗（不持久化，user 已允）；
- current-file 迁 localStorage 时保三态语义（null/""/名）+ 从 collection 一次性播种
  （v438 播种同手法，云端死键不删）；
- store escalation 清单追加：①账号层 collection 能力（8.1）②local:true collection 移除（SRP）
  ——连同既有 wipeLocal，共三条归下个 pwa-cloud-store session。

### 8.5 追问：「又有 Google Drive 又有 OneDrive 会不会被柴刀」（user 2026-08-27）

会砍掉一半野心，剩下的一半站得住：

- **被柴刀的**：「账号层 = 跟人走」的全称保证。GDrive 一来，一人两朵云 = 两个 appfolder/appDataFolder
  = 两个账号层——「人」这一级的统一在 provider 边界上又裂开，和多 gallery 裂开 synced 是同构问题、
  高一层复现。想缝合它的方案（指定某账号为「主设置家」、跨 provider 读设置）意味着双活 auth、
  离线矩阵、跨云冲突——这个才该被柴刀，不做。
- **站得住的**：账号层**明确定义为 per 云身份**——「每个云身份一套漫游设置」。先例 = VS Code
  Settings Sync 本身就是 per 登录账号（换 GitHub/MS 账号登录就是另一套），用户理解无障碍。
  cascade 不变：`当前 gallery 所属云账号的账号层 ?? 设备层 ?? 工厂默认`。
- **实际锋面很窄**：家族已拍 personal-account-only；GDrive 是「将来」；主力场景 = 一人一 MSA
  多文件夹——账号层恰好把这个主场景完全缝合（这就是它的全部使命）。混用双云的人得到的语义
  = 「我的 Google 身份和 Microsoft 身份各有一套设置」，语义上反而自洽（api token 尤其如此：
  token 存在哪朵云的私域里，就跟那个身份走）。
- **柴刀防线**：账号层契约里写死「不跨 provider 聚合」——将来谁想加「主设置家」先过 ADR。

## 9. 第三轮 grill（user 2026-08-27）：兄妹共用电脑模型 → 全面重判

**user 输入**：①UI scope 分区方案同意；②per-doc 工厂默认「非常赞」；③store escalation ①②可打短
handoff 给在跑的 store session；④问 wipeLocal 是什么为什么要；⑤柴刀定论=「两个账号就是两个身份」，
且 local folder 与云在抽象层不可分（folder=另一朵云）→ **云没有特殊性**——哥哥妹妹同一台电脑、
两个文件夹库、两套手感、两个身份；两库之间画不自动互通（对，拷贝即分叉）→ 顺势 park
「**导出图库**」功能（它让 preference/state 之别有物理意义：导出带 preference 不带 state）；
⑥问：scope ⊗ kind 能不能只是 **preference 和 state 两个对象**而不是 8 个；⑦「等等，device
following 是否完全不需要？兄妹共用电脑的模型。重新帮我判断已拍板的东西」。

### 9.1 重判（判据一句话：**换台机器该不该跟着走？换个人该不该跟着走？**）

| 项 | 旧拍 | 兄妹模型重判 | 终判建议 |
|---|---|---|---|
| single-finger-draw | device 特例 | 像个人习惯，**但真 nature 是硬件耦合**（同一人 iPad 要开、台式机要关——跟人反而错）；VS Code 先例：machine-specific settings 被排除在 Settings Sync 外 | **device**（硬件耦合类） |
| stylus-smooth-params | device | 同上，数位板/笔硬件调参 | **device** |
| cloud-enabled | device state | 部署/环境开关，身份出现之前就要可读（自举） | **device** |
| restore-attempt | device state | 崩溃是这台机器的事件，保护的是「下一个坐下的人」 | **device** |
| color-theme | 跟设备 | 品味成分有，但环境耦合也真（OLED/暗房），且一键可切、兄妹互不伤 | **device 维持原拍**（若要跟人=账号层+boot 快照缓存，代价是登录前后闪变——不推荐） |
| **current-file** | device→localStorage | ★兄妹暴击点：妹妹开机不该落进哥哥的画。但 v438 红线：它**绝不能云同步**（跨设备毒化驱逐守卫）。解 = **device 存、按 gallery 键控**：device-kv `currentFile:<galleryId>`——切到谁的库就恢复谁的画，零云同步 | **device state，per-gallery key**（P5 单库期=单键，P3 白送多键） |
| menu-tab / pixel-grid / long-press-pick | per-doc | 不受兄妹模型影响（跟画走天然跟对了人） | **ora（desk）** |
| lang / api token / blender-panel-url / 其余品味 prefs | synced/账号 | 兄妹模型正面强化：跟身份走 ✓（lang 的 boot 快照=登录前缓存，不是层） | **account** |
| show-fps | session-only | 无 scope 议题 | **session** |

**结论**：device scope 不消失，但收窄为「硬件/环境/本机事件耦合」四件半；「纯品味」全部 account。
判据进 registry 纪律：新字段必答两问（换机？换人？）→ 四象限定 scope。

### 9.2 两对象 API（⑥答：**能，且应该**）

scope 是**每个 key 的属性**，不是对象边界——门面只有两个：

```ts
type Scope = "ora" | "device" | "account" | "gallery" | "session";
// registry（DEFAULTS SSoT 扩一列 scope；kind 由「在哪个对象里」表达）：
preferences: { "pixel-grid": {scope:"ora", def:true}, "single-finger-draw": {scope:"device", def:false},
               "lang": {scope:"account", def:null}, ... }
state:       { "current-file": {scope:"device", perGallery:true, def:null}, "restore-attempt": {scope:"device"},
               "api-token": {scope:"account"}, "current-directory": {scope:"gallery"}, ... }
// 读写：preferences.get(k) / state.set(k,v)——host 按 scope 路由引擎（desk / device-kv / account
// collection / gallery collection / RAM）。UI scope 微章 = registry 一查即得。
```

**「synced」一词退役**：它命名的是机制不是 scope；scope 词表 = ora/device/account/gallery/session。
gallery-password-verifier 独立安全件，不进这两个对象。

### 9.3 parked 登记

- **导出图库**（user 2026-08-27）：把库（画 + preference 资产）打包带走/导入——preference/state
  之别的物理意义所在（导出带 preference 不带 state）。P3 后议。

### 9.4 wipeLocal 是什么（④答）

P7「还原出厂设置」（verdicts §2.10，user 2026-08-25 拍的工单）要清这台设备的一切本地痕迹，其中
包括 **store 的本地缓存库**（weebpaint.defaultStore IDB）。app 自己 deleteDatabase 别家的库 = 绕库
红线，所以需要库出口子；「强制 type consent 且比对在库内做」是 user 2026-08-27 本轮自己加的硬化
（app 永远拿不到跳过比对的路径）。**不急**：P7 开工前 escalate 即可，不进本次 store handoff。

### 9.5 第四轮问答（user 2026-08-27）

**Q1：preference 和 state 要不要合并成一个 settings？VS Code 怎么做的？**
VS Code **不合并**，两套系统物理分离：
- **Settings** = settings.json——用户**亲笔的声明式文档**（可手编、可 diff、.vscode/settings.json
  可进 git），设置 UI 只展示它；带 scope（application/machine/window/resource——machine 级被
  Settings Sync 排除，即我们的 device scope 先例）。
- **State** = Memento/globalState/workspaceState——**机器写的暗库**（state.vscdb），不可手编、
  不进设置 UI，在 Settings Sync 里是独立开关的另一类（"UI State"）。
本质区别：settings 是**用户拥有的文档**，state 是**app 记的数据库**。
建议照抄不合并（两个门面共享一套引擎），理由全是已拍事实的推论：①导出图库带 preference 不带
state（user 自己给出的物理意义）②设置 UI 只列 preference ③还原粒度（还原设置 vs 还原出厂）
④写入姿态不同（pref=稀疏用户动作；state=高频 app 写——current-file 每次换画、restore-attempt
每次 boot，防抖/flush 策略不同）。命名可顺 VS Code 改叫 `settings` + `state`（纯改名）。

**Q2：「毒化驱逐守卫」是什么意思？**（v438 案，app-state.ts 头注释有案底）
store 的 reconcile/驱逐路径有一条 K1 红线守卫：**绝不动「本机当前打开的画」的本地副本**，
它问 app「现在开着谁」= `activeFileName()` = 读 currentFile。当年 currentFile 住 **synced**
collection：设备 B 打开 Y → 同步到设备 A → A 的守卫以为本机开着 Y，**不再保护 A 真正开着的 X**
——X 的本地副本可能在编辑中被 reconcile 驱逐/覆写。「远端设备的选择在驾驶本机的安全守卫」=
毒化。v438 修 = currentFile 迁 device-local；教训钉成红线：**安全守卫的输入必须是本机真相，
永不可来自同步通道**——这就是 current-file 永不上云、只能 device（按 gallery 键控）的原因。

### 9.6 第五轮（user 2026-08-27）：不合并已拍（命名=preferences/state）；opened-file 特例的雅解

**问题**：current-file 是 state 表里唯一的畸形格——①三态字符串哨兵（null/""/名）stringly-typed
②scope 是「device×gallery」破坏干净的 scope 格 ③restore-attempt 与它强耦合（恢复它的过程态）
④它是三套纪律的输入（boot 三态/崩溃环/驱逐守卫）。塞进 KV 表怎么摆都是屎山。

**解：升格为独立器官 `resume-slate`（每库一张回执条）**——它本来就不是「设置」，是设备的书签：

```ts
// device-kv 单键单记录：resume:<galleryId> → ResumeSlate（原子写；localStorage 同步写=天然原子）
interface ResumeSlate {
  /** 上次离开时开着什么。tagged union 杀掉 null/"" 哨兵（P1 DocHome 联合类型同手法）：*/
  opened:
    | { kind: "doc"; path: string }   // 上次开着这张画 → boot 恢复它
    | { kind: "gallery" }             // 上次有意停在图库 → boot 回图库
    | null;                           // 首次/从未 → boot 新画布
  /** 崩溃环断路标记——语义上就是「恢复 opened 的在途态」，同记录同原子写：
   *  flushMarker 400ms 防抖舞蹈永久消失（同步单键写）。 */
  restoreAttempt: string | null;
  // 将来扩展位：{ kind: "file"; ... }（P3 registry 能持久化句柄后，双击文件的恢复）
}
```

**一石五鸟**：①三态哨兵 → 真联合类型（boot-restore 纯模块拿 typed 输入，"" 魔法值退役）
②per-gallery 天然（兄妹各自的库各自的回执条；P3 多库白送，P5 单库期就一条记录）
③restore-attempt 并入同记录（原子性白送，写标记+写目标一次落盘）④preferences/state 两张表
保持纯净 scope 格（无 device×gallery 例外）⑤驱逐守卫 activeFileName 读本机 slate=本机真相
（v438 红线结构化）。器官地位与 crash-store/checkpoint-ring 同类（boot 关键的结构化小件，
不是散字段——符合「零散小字段走两表、结构化件立器官」的分界）。
写入口收敛：setCurrentSessionName → slate.setOpened()（唯一写点不变）。迁移=一次性播种。

### 9.7 第六轮（user 2026-08-27）：账号层撤回——PPSSPP 回归，终版模型

**user 问「为什么还有账号层」→ 骑士认账撤回**：账号层（appfolder 根）建立在「云有特殊性」上，
而 user 已裁「folder 与云在抽象层不可分、云没有特殊性」——本地文件夹库没有 appfolder 根，
账号层只对云库存在 = 亲手制造云特殊性，自相矛盾。兄妹模型的真结论：**身份载体 = gallery 本身**
（哥哥的文件夹=哥哥的身份=哥哥的手感）——即 verdicts §2.3 原始 PPSSPP 拍板，全票回归。
store escalation ①（appfolder 根 collection）**作废**；「同帐多库同手感」由 手感拷贝 affordance /
导出图库（parked）/ 建库播种（P3 细节）承接。

**终版模型（P5 定稿）**：

| 层 | 载体 | preferences | state |
|---|---|---|---|
| ora（跟画） | desk（.ora 内） | pixel-grid、long-press-pick、menu-tab | （既有 desk 态） |
| gallery（跟身份/库） | 库内 collections（LWW；detach drain） | lang、gen-ai、手感类 | api-token、blender-panel-url、current-directory |
| device（跟机器） | device-kv 器官（localStorage，try/catch 降级） | single-finger-draw、stylus-smooth-params、color-theme | cloud-enabled |
| session（不持久） | RAM | — | show-fps |
| 独立器官 | — | — | resume-slate（opened+restoreAttempt，per-gallery）、crash-store、checkpoint-ring |

- **cascade（gallery 缺席 fallback）**：gallery 层项的读写 = `gallery ?? device ?? 工厂默认`——
  无地/Editor Only 时写落 device 层（无地用户的 lang 也有家）；attach 后 gallery 层覆盖。
  这就是 VS Code 的 workspace??user 形状，但 upper 层是 gallery 不是账号。
- scope 词表终版：`ora | device | gallery | session`（"account"、"synced" 双双退役）。
- 建新库时从 device 层播种 gallery 层？——P3 细节，暂 park。
- gallery-password-verifier 独立安全件、brush-rack 库资产器官，均不进两表（已拍不变）。

### 9.8 第七轮（user 2026-08-27）：cloud-enabled 判死缓——P3 由 registry 取代

**user 指出**：cloud-enabled 是 MSAL 宣发不可用时的 UI 护栏；本轮重构正把护栏变真机制——
「关云」的真身 = **没挂 gallery**（Editor Only），与 P3 registry 的 attached/last-active（null 态
即「关」）重复；UI toggle 不该从独立 pref 推，该从 store/attachment 真状态看。

**裁定**：
- P5 device state 表里 cloud-enabled **标过渡态**（P5 期照常工作——attach/detach 未生，它是唯一
  能表达 detached 的载体）；
- **P3 收编**：toggle 变动词「卸下图库/选择图库」；isCloudEnabled() 消费者全改读 attachment
  真状态；关 = 真不建 store 实例（超越现在的藏 UI）；cloud-enabled 播种进 registry
  （false → lastActive=null）后退役；
- isAuthConfigured() 独立保留（容器能力事实，非偏好）。

## 10. 落地台账
- **Slice A（v0.11.10 / 2026-08-27）**：device-kv 器官（唯一 localStorage 入口，GUID 前缀，try/catch
  降级纯内存）+ resume-slate 器官（回执条：opened union + restoreAttempt 同记录原子写、per-gallery、
  legacy 幂等播种）；boot-restore 端口 typed 化（getResume；flushMarker 端口退役=同步落盘契约）；
  session/app-store/boot 全接线；legacy appState.currentFile/restore-attempt 停写只读（播种源）。
  测试：test/resume-slate.test.mjs + boot-restore 全量跟改。
- **Slice B（待做）**：preferences/state 两门面 + registry（scope 列）+ 全 callsite 迁移
  （device 组：single-finger-draw/stylus-smooth/color-theme/cloud-enabled[过渡态]；session 组：
  show-fps；boot-snapshot 收编 device-kv）。
- **Slice C（待做）**：per-doc 三项迁 desk（pixel-grid/long-press-pick/menu-tab，工厂默认）+
  设置 sheet scope 分区 + 三枚 scope 图标登记 SVG Icons TODO。
- **Slice D（待做）**：brush-rack 写路径收敛（gallery 层照旧 collection）。

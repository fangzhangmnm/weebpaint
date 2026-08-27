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

## 5. 顺带登记（P7 还原出厂设置的 store escalation）

P7（§2.10）需要 store 侧口子，归 pwa-cloud-store skill 逐条 escalate（**user 2026-08-27 已预批方向**）：
- **wipeLocal / 本地缓存库销毁**：✅ 可以加。硬条件（user 拍板）：**强制 type consent，且 typing
  check 由库来做**——API 形状建议 `wipeLocal({ confirm })`，confirm 回调（app 出 in-app sheet 输入
  UI）返回用户敲的确认词字符串，**库内比对**通过才动手（emptyTrash 的 danger-confirm 回调同形升级；
  app 侧永远拿不到「跳过比对」的路径）。dispose({drain}) 已有（0.4.0），wipe = drain→dispose→删库本体。
- **dirty 清单口径**：无痕扫前的「dirty 永不静默删」护栏——dirty facet（count/pushAll）已够用
  （count>0 → 先 pushAll / 显式确认），确认这个用法即可，无需新口。

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

## 4. 待 user grill 的问题（回答后才动工）

1. **SSoT 归属**：同意「collection=持久层权威、struct=运行时工作副本、onChange 回灌」吗？
2. **范围**：5 个 collection 全做，还是先 brush-rack + user-preference（app-state 的
   current-file/restore-attempt 与 boot 纪律缠得深，可留 P3 一起动）？
3. **时机**：P5 现在独立做，还是并进 P3（热插拔一起真机验）？
4. per-gallery 化后，**离开 gallery 时未推完的 settings 改动**：drain 等推完 / 丢弃 / 留在缓存下次推？

## 5. 顺带登记（P7 还原出厂设置的 store escalation）

P7（§2.10）需要 store 侧口子，归 pwa-cloud-store skill 逐条 escalate：
- **wipeLocal / 本地缓存库销毁**：dispose({drain}) 已有（0.4.0），但删库本体（weebpaint.defaultStore
  的 IDB）没有库 API——app 侧 indexedDB.deleteDatabase 别家的库 = 绕库红线，需库出口子。
- **dirty 清单口径**：无痕扫前的「dirty 永不静默删」护栏——dirty facet（count/pushAll）已够用
  （count>0 → 先 pushAll / 显式确认），确认这个用法即可，无需新口。

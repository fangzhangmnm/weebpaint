# 每日掉凭证 → 重连 redirect → bfcache 冻结页持 IDB 锁：09-08 黑匣子分析 + 架构选项

> 作者：Claude Fable 5.1（claude-fable-5-1）· created 20260909 · as-of dev v0.14.2 / store 0.11.6 / iPadOS 18.7 · Safari 26.6 · 数据 = user 2026-09-08 从 iPad 黑匣子导出的两份 .txt（13:19 / 13:20，微信传来，不进 repo）
> 结论级别：**时间线 = 事实；机制 = app 代码 + store 代码 + WebKit 源码推出的确定性链条（每一环有出处），但没有在真机上按开关验证**。§5 全部**未拍板**。前案 = `20260906-gallery-idb-wedge-log-analysis.md`（同签名，当时机制是推断，本篇把它钉实）。

## 0. 一句话

掉凭证 = 微软给 SPA 的 refresh token 固定 24h（每日必掉，不是 bug）。恶性全在**重连那一跳**：`loginRedirect` 让旧页进 bfcache（`pagehide persisted=true`）；旧页在 pagehide 里被 app **无条件**写了两笔 settings（readwrite）；store 0.11.6 看到有 readwrite 在飞就不关连接；于是一个永远 commit 不了的写事务冻在旧页里，新页对同一个 object store 的每一笔事务都排在它后面。0.11.5 的 3s deadline 只是把「静默挂 99s」换成「每 3s 一声 IdbTimeoutError 横幅」。**加密无关**。

## 1. 09-08 时间线（本地时间 UTC−4；黑匣子原文）

| 时刻 | 事件 | 备注 |
|---|---|---|
| 09-06 13:48 | 上次交互登录（redirect 回程 boot） | RT expiresOn = 09-07 17:48:19Z = 恰好 +24h |
| 09-07 00:15 | boot v0.14.2，signedIn=true | AT cachedAt 04:15Z |
| 09-08 09:17:11 | visibility=visible（隔 33h） | |
| 09:17:13 – 09:18:32 | 约 40 条 `getTokenFor` login_required：同一毫秒 6 连发，之后约每 250ms 一发；3 条 E 级 | RT 已过期 20h；6 并发 = 6 个隐藏 iframe 往返；黑匣子一分钟滚掉 160 行 |
| 09:18:30 | 图库首帧 21ms items=67 | **此刻 IDB 正常** |
| 09:18:46 | pagehide persisted=**false** → 09:18:48 boot | user 刷新；首帧 9ms 正常；boot-probe login_required |
| 09:18:52.286 | pagehide persisted=**true** → .446 boot → 53.0 signedIn=true | user 点重连；redirect 往返 160ms（微软 SSO cookie 活着） |
| 09:18:55 → 09:19:38 | get / keys / usage / put 全部 3s 超时 → 重开重试 → 再超时 → IdbTimeoutError；首帧 8s 看门狗；retry 无效 | **open 都成功、事务全挂 = 锁在别的连接手里** |
| 09:19:11 | user 从卡住的网格打开诊断日志（13:19 那份） | |
| 09:19:35.957 | `[auth] changed signedIn=false` | = user 点「断开连接」（`disconnectFlow`：卸库 + clearLastActive + signOut） |
| 09:19:41 | pagehide persisted=**true** → 09:19:43 boot「registry 无 lastActive → no-gallery」→ 44.6 signedIn=true | user 再连：第二次 redirect 往返；无 lastActive 是断开的正常后果 |
| 09:19:48 → 09:20:00 | 又全挂；09:19:57 transient adopt after attach failed | 锁仍在 |
| 09:20:03 | visibility=hidden → pagehide persisted=**false** → 09:20:05 boot → 首帧 19ms items=67 | 好了 |

四次 boot：前一次 pagehide `persisted=false` 的两次都正常，`persisted=true` 的两次都挂。09-05、09-06 两案同签名（前案 §1）。

## 2. 事实清单（每条带出处）

### 2.1 WebKit（GitHub main，2026-09-09 拉的源码）

- `Modules/indexeddb/IDBDatabase.h:125`：只覆写 `stop()`；**没有** `suspend(ReasonForSuspension)`、**没有** `shouldPreventEnteringBackForwardCache` → 页面进 bfcache 时 IDB 连接与活跃事务**原地冻结**，不关、不 abort。
- `IDBDatabase::stop()`（.cpp:317）= 对每个活跃事务 `transaction->stop()`（未 finishing 的走 `abortInternal()`）+ `close()`。只在**页面销毁**（bfcache 驱逐 / 非缓存导航）时跑 → 锁的释放时刻 = 冻结页死亡时刻。
- `IDBDatabase::maybeCloseInServer()`（.cpp:310）：还有活跃/提交中事务时 `close()` 不落地（等它们完成）。
- `IDBDatabase::fireVersionChangeEvent()`（.cpp:451）：对活着的 document 只是 `queueTaskToDispatchEvent`；冻结页任务队列不跑 → versionchange 派不出去、server 收不到 `didFireVersionChangeEvent` → **「新页升版本号逼退冻结页」在 WebKit 不通**（Chrome 会驱逐，WebKit 不会）。
- `history/BackForwardCache.cpp:523-533`：pagehide 派完后 `canCache` **再查一次**；`canCacheLocalFrame`（:91-195）的阻断清单：provisional load / 初始空文档 / 站点 quirk / 错误页 / **主框架 HTTPS 且响应 `Cache-Control` 含 `no-store`**（:156-158，`cacheControlContainsNoStore()`）/ 无 history item / 视觉空白 / quick redirect / 仍在加载 / 正在停止 / client 拒绝。**清单里没有任何 IDB 项。**

### 2.2 store 0.11.6（`src/idb-store.ts`）

- 单库**单 object store `"blobs"`**：files / trash / backup / dir-index-cache / collections 全住一个 store（`local-cache.ts:139`、`blob-partition.ts:28` 同一个 dbName）→ 任何一笔未 commit 的事务挡住所有分区。
- `suspend()`（:71-78）：pagehide → abort 在飞 readonly；readwrite 放行；**`rw === 0` 才关连接**。
- 事务在 `openDb().then(...)` 的微任务里创建（:139-140）→ app 先注册的 pagehide 监听器里发起的写，在 store 自己的 pagehide 监听器跑之前就已进 `_active`。

### 2.3 WeebPaint app

- `app.ts:554-559`：`pagehide` 与 `visibilitychange:hidden` → `flushPreferences()` + `flushAppState()`；:553 注释断言「IDB 事务已排队，浏览器会让它跑完」——**在 WebKit 上为假**（§2.1）。
- `@internal/store collection.ts:221 writeLocalNow()` **无条件**写快照 → 每次 pagehide 至少两笔 readwrite put（不看脏不脏）。
- `editor-session.ts:266`：pagehide → `persist(false)`（脏时再一笔）。`topbar-menu.ts:82`：登录提示前 `session.save()` 不 await（整幅 .ora 的 put 可能在飞）。
- 监听器注册顺序：`app.ts:558` 在模块顶层，早于 store 创建（`bootAttachFromRegistry` 内部有 await）→ app 的写先于 store 的 `suspend()` 跑。
- 没有 iframe 守卫（`window.self !== window.top` 只在 `local-file-session.ts`）：MSAL 静默 iframe 的 redirectUri = app 页本身，慢启动时整个 app 可能在隐藏 iframe 里再跑一份（本案两份日志无 iframe boot 痕迹，列为隐患非根因）。
- `providers/auth.ts getTokenFor`：无 single-flight、无「需交互」闩 → 6 个并发调用 = 6 次 iframe 往返 + 6 组多行日志 + 多条 E 级横幅。
- 「断开连接」= `gallery-manage-ui.ts disconnectFlow`（卸库 + signOut）；「registry 无 lastActive → no-gallery」是它的正常后果，不是丢注册表。

## 3. 机制（确定性链条）

1. RT 24h 到期 → 后台 `getTokenFor` 全部 login_required（Safari 的隐藏 iframe 拿不到第三方 cookie，SSO 只有顶层导航拿得到）。
2. user 重连 → `loginRedirect` 顶层导航 → WebKit 先判 canCache（无阻断项）→ 派 `pagehide persisted=true`。
3. pagehide 里 `flushSettingsNow` 起 2 笔 readwrite（微任务里立刻建事务）→ store `suspend()` 看到 rw>0 → 不关连接。
4. 页面冻结：事务的 success 事件派不出去 → 永远走不到 auto-commit → server 侧 `"blobs"` 的写锁一直握着。
5. 微软 SSO 立刻弹回（160ms）→ 新页 boot → open 成功、每笔事务排在冻结事务后面 → 3s deadline → abort / 重开 / 重试 → 再超时 → IdbTimeoutError（W/E 级 → 横幅）→ 图库看门狗 8s → 卡住态。retry / 断开 / 再连都换不掉锁的持有者；再连反而又冻一页。
6. 冻结页何时死（切后台、内存压力、bfcache 容量、进程被杀）→ `stop()` abort → 锁释放 → 帧瞬间到（09-05 / 09-06 是切走那一刻；09-08 是 09:20:03 那次非缓存导航之后，具体驱逐触发看不出）。

**推论**：「pagehide 里写 IDB」这个模式在 WebKit 上**三重失败**——写不进（冻结前没有事件循环轮次让它 commit）、持锁（本案）、驱逐即 abort（数据也没保住）。`persisted=false` 的真卸载大概率同理（pagehide 与 `stop()` 之间没有事件循环轮次；此句未逐行核 `FrameLoader::commitProvisionalLoad`，标为推断）。

## 4. 对 user 四问的回答

- **「是否和加解密有关」**：无关。两份日志零加密 / 锁条目；挂的是 IDB 调度层（keys / usage / get / put 一视同仁），在字节格式之下。
- **「修了之后更恶性了？」**：数据上没更坏；观感更坏是真的——0.11.5 的 3s deadline 把「静默挂 99s」变成「每 3s 一条 IdbTimeoutError 横幅 + 黑匣子刷屏」；0.11.6 的 pagehide 弃读没堵上 readwrite 这个口子（§3 步骤 3）。病没治，声音变大了。
- **「过一天重启掉凭证」**：MSA 给 SPA 的 RT 固定 24h 不滑动（本案三次 expiresOn 都是上次登录 +24h 整），客户端无解；能做的是让每日一次的重连变成「一点即回、不挂、不丢」。
- **「weebpaint 的 store 是不是稳一点 / wxhw / jrp」**：WeebPaint = 0.11.6、WXHW = 0.11.4、JRP = 0.1.0、BR = 0.2.0。WXHW 同病但无 deadline → 表现为静默不刷新直到冻结页死（与「各种不刷新」高度吻合，但 WXHW 没黑匣子，未证）；改名痛点未查（tryMove 路径在 `docs.ts:137`，要 WXHW 自己的日志）；JRP 是八月前的 0.1.0，另一个世界，无数据不评。

## 5. 架构选项（**全部未拍板**；store 侧 = 红线区，改前 escalate）

- **A. SW 给导航响应加 `Cache-Control: no-store`**（app 壳；`service-worker.js:117` 给 `mode === "navigate"` 的响应包一层改头）：WebKit 明文不缓存 → redirect 离场即销毁 → `stop()` 关连接、abort 事务 → 锁不存在。一行级改动；**验收 oracle 就在黑匣子：重连后应看到 `pagehide persisted=false`**。风险：① SW 合成的头是否被 `documentLoader->response()` 认——我信但没真机证；② `session-state.ts:1376` 把 `persisted=false` 当「干净关闭」焚烧崩溃快照 → redirect 离场会烧掉未保存快照，**必须先给「登录导航中」加豁免**（topbar 已有 `_signInNav` 旗，`reconnectFlow` 没有）；③ 桌面 Chrome 无关（popup 登录）。
- **B. store：pagehide = 零活动 + 闸门**：abort 全部在飞事务（含 readwrite）、关连接、置 `_suspended`；`pageshow` 复活前新事务直接 reject `IdbSuspendedError`。理由：readwrite 放行在 WebKit 上救不了任何一笔写（§3 推论），只留下锁。与 A 互补（A 治 Safari 这条路；B 让库在任何浏览器下诚实）。
- **C. app：pagehide 不再写 IDB**：settings 走 `visibilitychange:hidden`（有事件循环）+ 改动即写（去掉 400ms 防抖对导航的暴露）；redirect 前落盘做成两步手势（先 save / flush 并 await，再弹「去登录」，onPick 里同步 `loginRedirect`——topbar 登录提示已经是这个形状，`reconnectFlow` 抄过去）；`app.ts:553` 那句注释改掉。
- **D. token 取用 single-flight + 「需交互」闩**：同账号并发 `getTokenFor` 合并成一个 promise；首次 InteractionRequired 后闩住，后续直接 fail-fast 不进 MSAL（不开 iframe、不刷日志），`signIn` / `retrySilentSignIn` 成功才解闩。治 09:17 的风暴与 E 级横幅连发。
- **E. MSAL 隐藏 iframe 守卫**：app 入口 `if (window.self !== window.top)` → 只跑 MSAL 回程、不 boot app（MSAL 官方建议）。隐患清理，非本案根因。
- **F. 长期：按分区拆 object store**（files / dir-index-cache / collections 各一个 store，或至少 settings 独立）：一笔慢写不再挡图库列举。有迁移成本（DB 版本升级），不急。
- **G. WXHW**：先移植黑匣子（`diag-log.ts` 形制）再谈修；store 升到含 A / B 的版本。

## 6. 没验证 / 看不出的

- 09:20:05 锁是被哪个冻结页的死亡释放的（09:18:48 页 / 09:18:52 页）以及驱逐触发（容量 / 内存 / reload），日志无法分辨。
- 09:18:52 那两笔 readwrite 是 `flushSettingsNow` 的——代码上确定性，黑匣子不记 put 起点，未直接观测。
- A 的 SW 合成头在 WebKit bfcache 判定里是否生效（真机一看即知）。

## 7. 下一步（归 user 一句话）

A / B / C / D 各自要不要。顺序建议 A（一行、oracle 明确）→ C（`reconnectFlow` 两步手势 + 崩溃快照豁免）→ B（store 0.11.7）→ D。

# 图库「首帧超时 / IDB 挂死」黑匣子分析（2026-09-06 晚，user 导出的 diag log）

> 作者：Claude Fable 5.1（claude-fable-5-1）· created 20260906 · as-of dev v0.13.16 / store 0.11.4 · 数据 = user 从 iPad 黑匣子导出的 592 行（本机 `D:\Downloads\tmp.txt`，不进 repo）。
> 结论级别：**时间线是事实；机制是强相关推断**（两次案发同一签名），root cause 未在浏览器里复现。

## 1. 时间线（两次案发同形；本地时间 = UTC−4）

**09-05 12:40–12:41**
1. 12:40:57 boot（v0.13.0）→ 首帧 13ms **items=3**（前夜 66）→ 静默续签失败 `login_required`（RT 已过期）。
2. 12:41:00 `pagehide persisted=true` → 150ms 后新 boot → `auth changed signedIn=true`。
3. 12:41:05 又一次 `pagehide persisted=true` → 新 boot。
4. 12:41:08 图库 subscribe → **8s 首帧超时 + files.usage 超时**。
5. 12:41:32.168 `visibility=hidden`（user 切走）→ **12:41:32.215 首帧到达（23.7s）**→ pagehide persisted=false → 重启 → 首帧 11ms items=66。

**09-06 13:48–13:50**
1. 04:44 hidden 过夜。13:48:01 boot（v0.13.14）online=true、attach `online=false` → 首帧 13ms **items=4**（前夜 67）→ `login_required`（RT expiresOn 12:41，过期 1h07m；AT 04:43 缓存已过期）。
2. 13:48:13 `pagehide persisted=true` → 150ms 后 boot → signedIn=true；13:48:19 再一次 `pagehide persisted=true` → boot。
3. 13:48:22 subscribe → 8s 超时；13:48:52 user 点重试 → 又 8s 超时。
4. 13:50:31.761 `visibility=hidden` → **13:50:31.849 首帧到达（99161ms）**→ pagehide persisted=false → 重启 → 首帧 14ms items=67。

## 2. 两个现象，两个机制

**A. 「图库丢了」= items 3/4**：不是丢，是**云端名单没掺进来**。本地帧 = 本地缓存项 ∪（signedIn 时的 dir-index-cache 上次云帧）。`login_required` 时 `signedIn()` 为假 → 不掺 stale 云帧 → 只剩这台设备有字节的 3–4 张。这是 store 的既定语义（「登出 → 纯本地，别显示云端名单」），但对「RT 过期、账号还在」这种半登出态，用户看到的是 60 多张画凭空消失。**待拍板**：RT 过期但 cachedAccounts=1 时，本地帧是否仍掺 stale 云帧（灰显 cloud-only）？我倾向掺——账号没登出，只是 token 要续。

**B. 「IDB 挂死」= 首帧 99s 不来，切走那一刻立刻到**。签名：
- 只发生在连续两次 `pagehide persisted=true`（页面进 bfcache）之后的 boot；
- 帧恰好在 `visibility=hidden` 后 50–80ms 到达——两次都是；
- 中间 `retry`（重新订阅同一连接）无效。

推断：`persisted=true` 的两次是**重连登录的 redirect 往返**（loginRedirect 去微软、SSO cookie 还在 → 立刻弹回；pagehide 在回程响应 commit 时才发，所以看起来只隔 150ms）。老页面带着**打开的 IDB 连接（可能还有在飞事务）**被冻进 bfcache；新页面对同一 object store 的事务排在冻结页面的事务后面 → 永远等；user 切走 → iOS 挂起/清掉 bfcache 里的老页面 → 锁释放 → 帧到。这与 Chrome 把「IDB 事务在飞」列为 bfcache 阻断项的理由完全一致；WebKit 这里历来有坑。**没有在浏览器里复现**，是从两次同签名推的。

## 3. 已落地（store 0.11.5 / WeebPaint v0.14.0）
- store：每次 open / 每笔事务 3s deadline → abort + 丢连接 + `IdbTimeoutError`；重开重试一次；再超时 warning 上报 + 抛。`onversionchange` 老连接自关；`onblocked` 记一笔。**效果**：挂死时 6s 内库先给 onError（图库立刻进卡住态、三钮可用），不再 8s 看门狗 + 99s 干等；但若锁在别的（冻结）页面手里，重开也解不开——它治的是「后端连接坏了」这一类，不治 bfcache 持锁。
- WeebPaint：卡住态三钮 + 图库菜单诊断日志（v0.13.15）；黑匣子分享改 .txt 文件（v0.14.0）。

## 4. 第二刀（user 2026-09-06 深夜「批准」→ store 0.11.6 / WeebPaint v0.14.2 已落地）
> 落地记：① pagehide → abort 在飞 **readonly** 事务（IdbSuspendedError）、readwrite 放行（抢救写不腰斩）、无 readwrite 时关连接，下一 op 重开；② 本地帧与「云不可达」的远端帧都**缓存在就掺** stale 云帧，不再看 signedIn()；③ provider 新增可选 `onAuthChanged`（reason 透传），store 只在 reason "signOut" 时清 dir-index-cache 分区并重画在看的夹——凭证过期（expired）不清。pageshow reload（下 2）未做（app 侧，没批）。

1. **pagehide → abort 在飞事务 + 关连接**（store 内，浏览器专用一行监听）：让被冻进 bfcache 的老页面**不持锁**。被 abort 的写 = 没落盘 = reject（dirty 不清，下次重推），符合「resolve 只认 oncomplete」契约，数据零风险。这是对 §2-B 机制的直接治法。
2. `pageshow persisted=true`（bfcache 复活）→ app 侧 `location.reload()` 取干净状态（很多 PWA 的做法）。
3. §2-A：RT 过期但账号仍在 → 本地帧掺 stale 云帧。

## 5. 顺手看到的
- 重连流程里两次 redirect 往返（13:48:13 与 13:48:19）——是 user 点了两次，还是 MSAL 两跳？看不出来；下次案发前请别点第二次，看是否仍两次。
- `boot online=true` 与 `attach online=false` 同一毫秒级不一致：`navigator.onLine` 在 iOS 醒来瞬间抖；无害但会让首帧跳过云列举。

# WeebPaint 代码流程图（pipelines）

> created 20261103 by Claude Opus 5.5 · as-of v0.14.52 / 2026-11-03
> **这份还不全**：家族 ritual（CLAUDE.md「代码流程图」）要求每个 TS 兄弟项目有一份，本仓之前没有。这里先写工单 G 碰到的两条：开机 / 醒来，什么时候推。笔触、合成这些以后碰到再补。

## 总图

```
开机 ──► prefsReady（按名册挂库）──► gate.run("boot", { before: 恢复上次的画 })
                                       没挂 OneDrive：跑 before，不罩
                                       挂着：罩 → before → 等 authBoot / 静默续签 → 问云端一次 → 放行
                                                                     ├ 真分叉 → 库的面（叠在罩子上）
                                                                     └ 续签失败 / 没网 / 8 s → 闸（重新登录 / 离线继续）
回前台 / pageshow ──► gate.run("wake")（30 s 内核过不罩；已选离线不罩）
```

## 哪个操作走哪条

| 操作 | 流程 | 亚种 |
|---|---|---|
| 开机，挂着 OneDrive | 闸门 | `before` = 恢复，也算超时（登录和恢复并行，恢复可能碰网） |
| 开机，文件夹图库 / 无库 / itch / 备用版 | 直接恢复 | 不罩 |
| 回前台 | 闸门 + `onForeground`（拉设置、快进） | 快进在途时闸门加入它 |
| 回线 | `onCloudMaybeBack` + 老的一串 | 选了离线：走 reconnect，老的一串在 `catchUp` 里补 |

## 闸门（`cloud-gate.ts` 状态机，零 DOM，单测；`cloud-gate-host.ts` 组装）

1. 罩子（`sheets.ts openSyncGate`，栈）+ 交互锁 `gate`。O(1)。开头 120 ms 不显形。
2. `before`：恢复上次的画（`session.restore` → `es.open`，O(画)）。和逃生、8 s 赛跑；口令面板 / 冲突面上停表。
3. 续签：等 `authBoot`，没登录就 `retrySilentSignIn`（一次 MSAL）。
4. 问云端（`session.checkCloudOnce`）：干净 → `refreshOpenDoc`（一次 fetchMeta；云端动了才下载，O(画)）；有没传的 → 库的 `open`（回执丢失自愈，真分叉才弹面）。同一轮面只问一次。
5. 放行：排空离线删除队列 + 有没同步好的提一条。实测没事时 112 ms（含第 2 步的本地读）。

选了离线：`user-offline.ts` 内存布尔接进 OneDrive 那家 store 的 `isOnline`，库零请求（文件夹图库不吃）。回来 = 续签 → `catchUp`：排空队列 + 拉设置 + 快进 + 提一条。**不自己批量推。**

## 什么时候推

| 时机 | 落本地 | 推 |
|---|---|---|
| 人按「存」（`saveAndPush`） | ✓ | ✓，不脏也推 |
| 退出到图库（`flushAndPush`） | 脏才写 | 脏或待推才推 |
| 点「有新版本」，选「存好再刷新」 | ✓，不设时限 | 最多等 5 s，推不完就走 |
| 点「有新版本」，选「先不传」/ 够不着云 | ✓ | 不推 |
| 空闲 30 s（bg-jobs）、切后台、blur、pagehide | ✓（`persist(false)`） | **不推**（`pushOn: ["exit"]`；守卫核） |

每条写本地 = encode 全量，O(画)。

## 还随整张画涨的点

恢复（第 2 步）和快进下载随画大小涨；「存好再刷新」的本地那步不设时限，大画遮罩会转得久。

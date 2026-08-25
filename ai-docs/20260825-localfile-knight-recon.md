# 无地骑士考古清单——隐患 + 需求 + 已拍板边界（grill 入场材料）

> created 20260825 · as-of v0.10.28 / 2026-08-25
> 由 opus 轮考古（2026-08-25 fable 终审）收拢。**只录事实与 user 原话**（出处全部核过，含 queue-operation 通道）；
> 不含新规则、不含 AI 拍板。产品方向全部待 grill。
> 背景 doc（均已标 OBSOLETE 仅参考）：`20260821-opus-round-rollback-and-security-handoff.md`（含 §7 终审更正）、
> `20260821-storage-eviction-investigation.md`。spec：`20260819-clipboard-and-local-file-spec.md` §7。

## 0. 定位（user 2026-08-25 组会原话要义）

- 无地骑士本质 = **no MSAL，first safety**，「就是和 opus 做了回滚的那一堆。这个才是最红的」；卡宣发边缘，宣发前必须做好。
- **心智模型才是本体**：五月起全产品依附 cloud-sync 心智模型，要换成 **Blockbench 式「打开→编辑→存盘」**为第一公民；
  「如果只是禁用几个 UI 不碰红线的话，这就相当于使用 male to male power cord……给停电的房子供电」。
- **single html = itch.io 需要的交付物**，尽量做好，含 UX polish。
- 动红线很狠 → pwa-cloud-store skill，store 契约改动逐条 escalate。

## 1. 树上活着的红线缺陷（回滚代价，改库需 escalate）

- **A2**：store 0.3.0 `reqTx` 在 request onsuccess 即 resolve、不等 commit、无 onabort ⇒ 配额撞墙时保存**静默报成功**
  （⟨实测·变异测试⟩ 40 次写入全"成功"零落盘；dirty 被清、autosave 停、退出挽留解除武装）。
- **A3**：`rename`/`usage` 缺 onabort ⇒ 库满时删画/恢复 **promise 永不 settle**、遮罩永远转（⟨实测⟩）。
  `rename` = `.trash` 红线的唯一执行体。
- 修法（08-21 handoff 交办，仍有效）：**不把 0.3.2 原样装回来**——一次收敛三种事务形状 + 改写反的 GUIDELINE 句 +
  补 reqTx 契约单测。参考件：`git checkout opus-round-20260821-before-rollback -- <path>`（两仓同名 tag；
  夹具 `tools/idb-tx-commit-check.mjs` 经变异测试判定诚实）。
- 伤害口径（驱逐调查验明）：撞墙丢的是**本次编辑**（事务回滚旧记录完好）；**丢整幅画的路径是驱逐不是撞墙**；
  prod 与 dev 同源共用配额。

## 2. 已拍板的边界（真出处，别再 re-litigate）

| 拍板 | user 原话 / 出处 |
|---|---|
| 无地=除云外全功能 | 「我当时 propose 无地就是除了云之外所有功能都应该有。所有功能只要不需要持久化就不应该依赖持久化，深查」(08-21 QA轮) |
| 云关走 Blockbench | 「禁用云的时候应该所有用户路线都走blockbench模式」(08-21T22:16:08Z 排队) |
| 默认关云 | 「C2 13也行，虽然这样我会有忘了开云的风险」(19:42Z) + 「cloud-enabled 默认 false」(23:08:58Z 排队) |
| persist() 该做 | 「persist现在就应该patch」(22:12:52Z 排队)——注意与 §3 隐私对冲未合审 |
| 不做首屏弹窗 | 「不做首屏弹窗，数据安全告知靠UX来维护。引导装主屏这个还是放在设置里面。不做强制引导」(23:03Z) |
| 新用户落脚 | 「落脚点在哪里？默认1024的新文件？」(23:03Z 问句)→ 落脚 1024² 已落 v0.10.23（随回滚撤回） |
| 中途关云=变新文档 | 「先尝试推云，然后关，变成new document？」(23:03Z，带问号——grill 时确认) |
| PC app 断电 | 「grill blockbench模式是什么样的，pc app本来就不抱保证持久化啊？虽然我们是可以顺便加崩溃恢复」(journal R2 批注) |
| 存量用户失联 | 「现在没有存量用户，这个没事」(journal Y2 批注——此裁决曾被 handoff 漏记) |
| 测试面 | 「测试写的不全面其实也算，会让后人以为测试够稳」(00:04:45Z 排队) |
| 家族账号 | personal account only，不做 school/work/to Business（08-23T19:01Z）；authority 显式化在 store 库做，sibling 等升级 |

## 3. 未合审的复合风险（grill 必议）

1. **A4 默认路径**：默认关云 + 云关=Blockbench 复合 ⇒ 新用户默认路径作品只活在 RAM/GPU（无库、无 checkpoint、无 autosave）。
   两半都是 user 拍的，但**从未放一张桌上合审**。spec 20260819 §7 的「session 级零持久化托底」当初是给主动开本地文件的
   opt-in 拍的板。journal R2 的 pushback（PC app 本来不保证持久化 + 可顺便加崩溃恢复）是切入点。
2. **persist() vs 公用电脑隐私**（链4）：persist 关掉 LRU 驱逐兜底 ⇒ 明文残留被钉死。数据安全与隐私的对冲，两边没合算过。
3. **公用电脑威胁模型**（user 00:00:53Z 提出）：删除后 `trash/` 完整明文 .ora 两次点击取回；`backup/` 无任何 UI；
   IDB key 明文作品名；signOut 不清本地。§A「删除=移到 .trash」红线的隐含前提是「设备是你的」。
   user journal 已给优先级：**very high** = 开云进 gallery 当前画作丢失（无身份）/ 关云需确认护栏；
   **high** = 删除确认加「回收站仍是完整明文」/「彻底删除」提到与 Restore 平级 / 「离开前清空本机痕迹」。
4. **A5 系**：保存徽章谎报（"Saved to local file" 但从未写过文件）、beforeunload 不拦——回滚撤掉了带病实现，需求还在。
5. **A6**：7 天 ITP 存活永远测不了（user 高频使用中）——按最坏假设设计。
6. **iPad Safari**：拿不到 FS 句柄 ⇒ 每次保存重下载、文档永远未命名（C2 记录）；iPad 是主力场景且是 opus 轮唯一没验的平台。

## 4. user 2026-08-23 邮件里的需求原文（待 grill 逐条过）

- single html：「我要，我就要」；pcapp-like 开文件第一公民；「我只会在实际画画的时候测……我会很少走到 windows+无地的路径」。
- 三个模式：「1。彻底无地。2.只有本地，全量store，也是最危险的那个。3.云盘托底」。
- 禁用云 = 重 ritual 不是 UI toggle：「也许不能在画画界面，只能在 gallery，并且在用户已经 evict all local 之后才允许」；
  换盘前强制备份完成；重接旧盘 = 文件名+md5 列表对账、「不静默自愈，而是给用户看列表」。
- store 定位重检：「能不能让禁用云=store 不可用？」笔刷拆出来？「其他的持久化完全可以不走 store?」
  无地=store 不存在时：可画画、默认笔刷库、加自定义笔刷、断电恢复（「windows app 要不要做断电恢复？这个行业惯例是什么？」）。
- Google Drive 及墙外网盘：宣发前铺路，关键是想明白换盘/禁用时怎么办。
- 大文件异步保存：夏音 10MB，保存打断工作流「会鼓励用户少点保存的习惯。但是这里的安全问题好好想想」。
- 目录精简：剪贴板系与触屏逻辑重复（「导出选区全叠加到剪切板，这个其实导出按钮里面有」）。
- 库全量备份：现在小、几年后另一个数量级；「或者还是不做，用户自己管理，不要一大堆大压缩包患得患失？」

## 5. 可取回的参考件（当 spec 不当资产，严禁念旧）

tag `opus-round-20260821-before-rollback`（两仓同名）：cloud-capability 接缝、beginFileFirstDoc 脏轨、
storage-persist.ts、storage-usage 深模块、`dist/storage-probe.html`（真机实测底账）、
`tools/idb-quota-repro.mjs` / `cloudoff-blockbench-check.mjs` / `idb-tx-commit-check.mjs`（诚实夹具）。
已知带病处（journal/审计实锤）：mi.bootCloudOff 1.75s 蒸发、lf.fileFirstNew 死字符串、A5 徽章谎报、
cloud-capability 头注释腐烂、boot-restore 假安全感测试、零测试钉 cloud-enabled 默认值。

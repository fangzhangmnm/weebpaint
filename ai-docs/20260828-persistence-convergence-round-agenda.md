# 持久化收敛轮 agenda（wave 1 · 宣发前红线：「新旧两套持久化契约共存 = 禁止宣发」）

> created 20260828 · by Claude Fable 5 · as-of v0.11.26 / store 0.7.0 / encryption 0.1.0
> 出处 = 完成状态总账 §2′ wave 1（user 0828 全量裁决）。已完结：清零/cloudless/encryption/wipe/P7/#22。
> 本文 = 剩余件的**摊面 + 选项**（grill 时你划掉；标 ⚙ 的不需要 grill、拍板已够，直接排产）。

## A. 裁决落账（user 2026-08-28 晚，逐条【】回复；edited by Claude Fable 5）

- **A1 = a**（挂库 transient 自动安家=「有库新画自动创建身份」等价）→ **✅ 已落 v0.11.27**。
- **A2 = 大 grill 开启**：user 提案「回到必有 store 模型——local-only **store**（只 IDB 无云）+ 无地=memory
  降级 + 即使 local store 也**不应该有 gallery**；笔架 TS 数据结构为权威、collection 退为窄序列化接口、
  reload 不丢即达标、**放弃文件笔架句柄**」。我方 grill 回应（transcript 2026-08-28）：三轴考古（IDB 不当
  作品家=红线活/最小 IDB 四理由死三/browserless=memory backend 满足）+ **双店模型**成形（常驻 device
  store[local-idb backend] + 可插拔 gallery store；gallery 可见性从 hasLiveStore 解耦成 backend-kind）+
  两条反对（resume-slate 同步原子写别回滚=affordance 分工不是债；驱逐面回宽要点头）+ 切法提议
  （数据结构/提案 .h 宣发前钉死，代码重构可宣发后撕书——A3 原则自适用）。**等 user 对双店模型与切法表态**。
- **A2 终案（user 0828 深夜二轮）**：「兜底/memory store」两案**全否**——核心判据 =「store 单一职责：
  只负责数据持久化+云同步冲突解析，不做容器」；纯内存 store = null-store 转世（满足接口不满足契约 = mock，
  mock 的家在 ./testing）。双店模型（我方一轮提案）同刀撤回。收敛落地 = **笔架 port 化**：
  RackPersistence（脑定义窄接口，reconcileWithRemote 可缺席=缺的能力不装死）+ 三器官
  （gallery collection / device-rack-slot IDB 单槽 / 槽内纯内存降级诚实上报）。「reload 不丢」拍板达成；
  文件笔架句柄放弃；settings 维持 P5 形（device-kv+collection 各归契约成立处）；resume-slate 留 localStorage
  （同步原子写 affordance）；必有 store 模型不回归，kind:none 现架构不动。→ **✅ 已落 v0.11.28**
  （createMemoryCollection 同日退役；store-absent.ts 只剩平台探针）。
- **A3**：registry 序列化 = generic JSON dict 口径（旧 json 永不需要 migration；代码层改名随意）→ store agenda。
- **A4 = a 同意**（本地版本戳+写前 backup；双版本 spam 要去重设计）；b 只读打开 park；瑞士奶酪同意 → store agenda。
- **A5**：等 user 真机「一句话的事」——park 到真机 session。
- **A6 = a**（app 层轮询）+ store 出**强制表态 reconcilePolicy**（逼消费者选而非无视）；多 store 口径=
  轮询只属 gallery store（device store 无云）→ store agenda。

## A′. 原摊面存档（grill 已过，仅考古用）

### A1. transient 挂库后的保存去向（#23，「必grill，红线」）
现状：无库画 transient → 连接图库后留在编辑器（焚画守卫），但 Ctrl+S 仍走 settle→FSA 存文件，
没有「进新库安家」入口。摊面：
- 选项 a：挂库后 transient 的 smart save = 自动安家进图库（Procreate 性——图库模式新画布本来就自动安家；
  「连接图库」手势本身可读作安家意图）。
- 选项 b：弹一次三选「进图库 / 存成文件 / 取消」（显式，但多一步；违背「涂鸦自动进画布不需要 consent」拍板？）。
- 选项 c：保持 settle→文件，图库安家走「复制一份到图库」（现状+可发现性差）。
- 关联：doodle「不想上户籍」心理（0825：独行=consent transient）——但用户已主动挂库，语境变了。

### A2. Editor-only 笔架心智模型（#20「心智模型还含混不清」+ 笔架文件家公民【宣发前做】）
现状：无库笔架 = 内存 collection（内置笔可用、session 内可编辑、reload 失）；「能静默就静默」已拍未实现；
文件家公民（笔架住磁盘文件，打开-编辑-写回）原 park 被你改判宣发前做。要收敛的问题面：
- 无库用户改了笔（调参/新建笔）→ reload 全丢，现在无提示——诚实吗？
- 文件家公民形状：笔架=一个 .json 文件（FSA 句柄、registry 记忆、boot 静默重取、权限掉出 chip）；
  与「每 gallery 自带笔架」的关系（挂库后文件笔架让位 gallery 笔架？还是并存？）。
- 最小干净版提案：①文件家公民全套（存/开/静默重载）②挂库=gallery 笔架接管、文件笔架句柄保留不混==两个世界
  各自完整。grill 点：要不要「笔架跟人走」的第三态（否决过 account 层，别复活）。

### A3. GDrive/多云 provider 数据结构（#19，你的「唯一完美主义需求：migration 洁癖」）
路已铺的部分：registry 条目 {kind, dbId, homeAccountId, handle}、多实例 databaseId、folder=另一朵云抽象。
**要在宣发前钉死的数据结构问题**（改这些才需要 migration，provider 本体随时可加）：
- registry `kind` 枚举扩展位：现 = "onedrive"|"folder"——加 "gdrive" 是纯增量（旧条目零迁移）✓已够？
- 账号引用形状：homeAccountId 是 MSAL 专属词——GDrive 账号 id 语义不同。选项：a) 改名 accountRef（一次
  migration，趁现在只有你）；b) 保留字段名、注释声明「provider 域 opaque token」（零迁移，名字撒谎）。
- dbId 铸名 `gallery-<id>` 与 provider 无关 ✓。锁名/回执条键 gallery-id 域 ✓。
- 「会不会被柴刀」（0825 问句）：多云≠多账号——personal-account-only 家规不变；GDrive 走各自 OAuth，
  互不影响；柴刀风险主要在 OneDrive 侧（ADR-22 案卷），GDrive 反而是对冲。答：不冲突。
- 建议：只拍 b/a 之选 + kind 扩展位确认，provider 本体（OAuth/quota/真机真盘）另开工单不挡宣发——
  你说的黄线是「数据结构不后悔」，不是「provider 上线」。**请拍**。

### A4. store 双 tab 同作品本地字节互覆护栏（#21「听起来是红线，必做」；store 仓工单）
现状：app 侧 per-doc Web Locks 已拦同设备双开（警告+确认）；用户确认双开后，本地腿无 If-Match 等价物
= 后写盖前写（纯本地静默丢）。选项：
- a) 本地版本戳：local-cache 写前对表（读时记 rev，写时 rev 不符 → 冲突面/自动 .backup 一份再写）——
  形状同 mtime 对表（文件家已有先例），改动集中 local-cache。
- b) 把 app 的确认框改成「只读打开」（第二实例禁写）——UX 收紧，store 零改。
- c) a+b。推荐 a（瑞士奶酪：store 层自己承重，不依赖 UI 拦截）。**请拍**。

### A5. 主菜单精简（你 0828 升格：「不能让用户对持久化模型 confusion = 最高优先级」）
方向（0825 已有底）：程序小白极简、procreate 姿态。做法提议：我先出一份「现菜单全量清单 → 保留/收纳/删」
三栏提案表（不动码），你划掉后一把改。含 #14 剪贴板精简（0823：「和触屏逻辑重复的不应该做，
导出选区叠剪贴板=导出里已有」）。

### A6. 图库长驻云端轮询（你改判「建议必做」）
= 图库页开着不动时定期拉云端刷新（现状只有 focus/online/回前台）。0821 park 理由=「store 从被动库变
主动 agent 是大 ADR」。设计摊面：a) app 层定时器调 reconcile/watchFolder 重订（store 零改，轮询归 app）；
b) store 内建 poll opt-in。推荐 a（store 保持被动，符合器官学）。间隔/退避/省电（前台才轮询）细节实现时定。

## B. ⚙ 拍板已够，直接排产（不占 grill 时间）

- **#24 图库显示其他扩展名文件**（你拍：「显示，不提供打开」）：gallery 列表加杂物 tile（灰态、
  无 open 动作、可删=进 .trash/可见于回收站——删除知情性顺带闭环）；「作品占用」口径文案顺带对齐。
- **#12 分两支笔**：压感 toggle sunset——内置笔拆「压感版/固定版」两支（rack 数据结构不变，只是预设翻倍
  的克制版：仅对默认几支拆）；existing per-brush 压感参数保留。
- **#13 导出自定义水印**（宣发需要）：导出扳手加水印开关（文字水印，位置/透明度极简）。
- **#18 库全量备份**：最小形 = 图库页菜单「下载全库备份」= 逐件 .ora 打包 zip 下载（浏览器内存上限
  注意——超阈值改逐件下载）。与「导出图库」（park→收敛轮）同一件事，合并做。
- **per-account pin**（store 仓）：createOneDriveProvider({ homeAccountId }) 级 pin——attach 非 active
  账号库 silent token（0.4.0 getTokenFor 口子已在，provider 层接上）。
- **createStore 构造期 fail-fast**（agenda 已记）。

## C. 排程约束

- A 组一场 grill 收掉（半小时量级，每件都有推荐项可直接「同意」）。
- B 组随手排产（部分可 subagent）；store 件（A4/pin/fail-fast/长驻轮询若选 b）攒一个 store 0.8.0 批。
- wave 4（single html 轮 + itch embedding）宣发当天做，之前不 nudge（你拍板）。
- 上传前：红线数据契约 QA 批全自动跑几轮（wave 6——对抗夹具清单另出）。

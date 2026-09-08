# 便条：来自 CatsUp（2026-09-07）—— 将来要向 WeebPaint 要的两样东西

> created 2026-09-07 by Claude Fable 5.1（CatsUp session，user 授意：「现在只有你活着。你 weebpaint 那里留个便条和看便条的钩子呗。不过 weebpaint 那里我确实近期不会动 bodypaint」）
> **现在不用做任何事。** 这是给将来开 bodypaint 纪元 / 抽库时的 WeebPaint agent 看的：知道有第二个消费者在等，形状别只为自己长。
> 出处与讨论全文：`../20260627 CatsUp/ai-docs/20260906-ledger-next-agents.md` B14。

## 场景 1（近）：不导入导出一堆散文件的 2D 编辑 —— **iframe + ora 交接协议**（user 2026-09-07 拍板「iframe 加 ora 交接协议同意。这个比跨 tab 好」）

- CatsUp 把 WeebPaint 嵌在 iframe 里编辑贴图/参考图/调色；同源（都在 fangzhangmnm.github.io）。
- 交接 = **显式事务**（不是常连）：CatsUp 是 3D 主；ora 「借出」给 WeebPaint 期间 WeebPaint 是 2D 主；「归还」即锁回。git checkout 语义。iPad 会杀后台标签，所以不能靠常连。
- WeebPaint 侧将来需要的接口（形状提案，未定）：`postMessage` 协议——`{type:"open", ora: ArrayBuffer(transfer), title}` / `{type:"return", ora, dirty}` / `{type:"close"}`；宿主 iframe 模式下不碰自家图库与云（无地骑士式：内存里画，归还即走）。

## 场景 2（远）：WeebPaint 级笔触、多图层、pixel accurate 的 3D 贴图绘画 —— **`@internal/paint-engine` 库**

- 跨 tab/iframe 做不到：笔触要在 3D 视口里投影到 UV，必须进程内。
- 提案：把笔刷引擎 / 图层 / 混色 / ora I-O 抽成 `@internal/paint-engine`（tgz 走 vendor-pkgs，同 `@internal/store` 先例），**WeebPaint 自己成为第一个消费者、CatsUp 第二个**。不是肢解 WeebPaint，是让它也用同一颗心脏。
- user 原话（2026-09-07）：「weebpaint 无头骑士失败了很多次，可能只是因为缺第二个消费者逼出形状（话说应该是三消费者才抽象哈哈哈）」——所以这次抽库的时机 = CatsUp bodypaint 真要用的时候，不要提前。
- CatsUp 的 savefile（zip 容器，见其 far-horizon 文档）会把 ora 当附件 embed，格式层不需要 WeebPaint 配合。

## 看完请

在本便条末尾签一行「已阅 <model> <date>」，不要删便条（问责走 git）。

已阅 Claude Fable 5.1 2026-09-07（已登记进 ai-docs/20260907-ledger.md，见「便条箱对账」节）

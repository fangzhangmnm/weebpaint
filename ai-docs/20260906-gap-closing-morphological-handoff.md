# 魔棒第三 option「容隙（形态学）」handoff：现有 v0.7.24 容隙内核升级为「细部整块归属」（clean-room，无代码，不急）

> 作者：Claude Fable 5.1（claude-fable-5-1）· created 20260906 · as-of dev v0.13.14 · 状态：**已落地 dev v0.13.15**（user 2026-09-06「既然我们过去都做的也只差一步了……那么一起做吧」）。
> 落地记：内核 `_gapFloodMask` 按 §3 重写（膨胀取**严格** < r 的欧氏球——取 ≤ 时缺口口部相切格会把两头接通）；魔棒算法下拉加具名「容隙」(id `gap`)，px stepper 跟它走；**classic 上的 toggle 已并入**（§4 建议合并；`desk.magicWand.fillGap` 字段留在持久化结构不再读，形状不动）——user 若要保留 toggle 一句话可回。测试 `test/gap-flood-morph.test.mjs` 六案 + 2048² 计时。
> 出处：user 2026-09-06「gap 也记一下，做完另外一个 alternative（= 湿画笔补全 handoff），我们那个算法其实有时候蛮自作聪明的，做魔棒的第三个 option 供用户选择。先不急着做。」
> clean-room：作者读过 GPL 源码（npainter）故不写代码；**实现者不得阅读 npainter 源码**，本文是唯一输入；`20260906-npainter-water-brush-study.md` §10.1 是出处记录（纯文字），可读。

## 0. 一句话

本仓 **已有**一版形态学容隙（v0.7.24，`src/backend/algorithms/magic-wand.ts` `_gapFloodMask`，classic 专属 toggle + px stepper）。要做的不是从零写，而是：① 把它的第 ③ 步「回贴膨胀 r 像素」换成「**细部整块归属**」；② 在魔棒算法下拉里把它升成与「线稿闭合」平级的**具名 option**，让用户在「论文法（聪明但偶尔自作聪明）」和「形态学（笨但可预期）」之间自己选。

## 1. 现状（实现者以代码为准）

`_gapFloodMask`：`r = gapPx/2`；EDT（Meijster 精确）→ **core** = 离 barrier ≥ r 的像素 → ① 种子不在 core 时 ≤r 步口袋 BFS 找 core 接种（v71 教训：画师爱贴线点），找不到返 null 让调用方降级普通 flood → ② 只在 core 里 flood → ③ 从选中边界沿非 barrier **回贴膨胀 r 步**（4 邻曼哈顿球）。UI：`la.fillGap` toggle + 0..32 px stepper（toolbar 容隙钮，classic 专属；workbench-state `fillGap`/`fillGapPx`）。下拉 `MAGIC_ALGORITHMS`（lasso.ts）现有 classic / lineart / similar。

## 2. 差在哪（本次要记的 delta）

第 ③ 步只补回 r 像素，于是：
- 比 r 长的**细尖**（发梢、锐角尖端、细颈）填不到头，留一截空白；
- **窄走廊**只填进 r 像素；
- **缺口本身**只填到中线，两边各填一次才封上。

形态学派的更好做法（npainter 实测行为，本机用合成图验证过，详 study §10.1 表）：以「开运算」切分主体与细部，**细部整块归属于你点的那一侧**。

## 3. 目标算法（集合语义，实现者自己选数据结构）

记 `N` = 非 barrier 像素集；`E` = 腐蚀核 = N 中离 barrier ≥ r 的像素（= 现有 core）；`O` = `E` 沿 N 膨胀 r 步（开运算，**对全图所有 E 连通块做**，不只种子那块）；`T` = `N \ O`（细部：宽 < 2r 的通道、比圆盘尖的角、细颈、缺口口部）。

- 结果 = **种子所在的 O 连通块** ∪ **所有与它相邻的 T 连通块**（整块，不管多长；即使该 T 块另一头也贴着别的 O 块——走廊归先点的一侧）。
- 不进入任何其它 O 连通块（缺口另一边的房间永远不漏）。
- 种子在 T 里：沿用现有 ① 口袋接种（≤r 步找 O），比「只得细部 sliver」的行为好；找不到 → 现有降级路径不变。
- 复杂度 O(N)：EDT（已有）+ 一次膨胀 BFS（已有形）+ 一次连通标记 / 或从种子做「O 内自由、T 只进不出」的 flood。

预期行为（与本机实测一致）：两房共墙留 3 px 缺口 + 房内一个尖角，r=1.5：点房中央 → 本房 + 整个缺口 + 尖角到尖端，不进邻房；贴墙 1 px 点 → 同结果；点邻房 → 邻房 + 整个缺口；r 大于房半宽 → E 空 → 走现有降级（普通 flood）。

## 4. UI

- 下拉加具名 option（文案归 user；工作名「容隙」），与「线稿闭合」平级；px stepper 跟着这个 option 走。classic 上的 toggle 是否保留 = 实现时问 user（建议合并，一个概念一个入口）。
- 油漆桶 / 选区各自的默认算法（desk.fillTool.algo / lassoTool.algo，per-tool 持久化）不动。
- i18n 走 SSoT，不许裸中文；图标无新增。

## 5. 验证（只列断言）

- 合成图六案（§3 预期行为）逐案断言像素集；发梢案：比 r 长 5 倍的细尖填到尖端。
- 现有 `magic-drag.test.mjs` 及魔棒相关测试回归绿；ADR-0004 不动（算法只产 Selection）。
- 2048² 性能不劣于现有容隙（百 ms 级）。

## 6. 不做

不碰线稿闭合（论文法）内核；不学 npainter 的扫描线机制、近似距离变换、magic-number AA（我们有自己的 AA 路径）；不从 npainter 源码参照任何东西。

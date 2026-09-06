# 湿画笔补全 handoff：paint variant 加「稀释 · 压感反向 · 多分辨率出料 · 记忆解耦」四件（clean-room 交接，无代码）

> 作者：Claude Fable 5.1（claude-fable-5-1）· created 20260906 · as-of dev v0.13.14 · 状态：**交接稿，等实现 agent 接手**。
> 拍板出处：user 2026-09-06「回到混色，123 同意，4 是我 confusing 的问题。他这个东西的本质是另外一种笔刷，还是我们这几个还没被我 grounding 的笔刷的补全？」
> 「你因为看过他的 code 了所以不要生成代码。然后别的 agent 只看你的 handoff」。
> 答：**是补全，不是另一种笔刷**（§1）。本文是实现的唯一输入。

## 0. clean-room 约束（实现者先读）

- 本文作者读过 `mrgaturus/npainter`（GPL）源码，因此**本文不含任何代码，作者也不写实现**。
- **实现者不得阅读 npainter 源码**、不得克隆、不得去 GitHub 翻它的文件；本机 job tmp 里的克隆随 job 删除。WeebPaint 是 MIT 公开仓，GPL 代码一行不能进。
- 允许读的出处记录：`ai-docs/20260906-npainter-water-brush-study.md`（纯文字转述 + 数字来源，无代码）。**本文自足，不读它也能做。**
- 数学思想（掺笔色 / 底 alpha 稀释 / 湿色记忆 / 低频出料 / 轻按揉重按落色）都是 SAI 系画笔十几年的公共知识，npainter 作者做的是把它们 curation + grounding 成一组可信数字；我们从他那里拿的只有**数字与语义**。

## 1. 一句话

npainter 的 Brush / Water 两支笔 = 我们 `smudge-engine` **paint 模式旋钮空间里的两个点**（dull=1 与 dull≈0.5），外加我们还没有的三个旋钮 + 一处记忆律的解耦。所以：**不开新 variant**，给 paint variant 补四件，出厂值用作者验证过的数字（§4）。smear / dull 两支只吃 §3-C 的多分辨率升级，记忆律不动（user 2026-09-05「记忆不封顶不做」「MEMORY_EXP=3 不动」）。

## 2. 现状（as-of v0.13.14，实现者对照源码核实，以代码为准）

- 引擎 `src/plugins/smudge-engine.ts`：CPU、premult float、整数窗口 B×B；每 dab：读 cur 块 + 算 mask → 记忆更新 `Accum = mix(cur, Accum, ρ)`，`ρ = (s³)^(step/D)`（s = 本 dab 强度 = strength × 压感两乘子）→ 出料 P：dull=0 取块、dull=1 取 mask 加权平均色、中间**线性 lerp 两端**；paint 模式再 `P = mix(P, 笔色, colorRate)` → 上色 `cur = mix(cur, P, M·s)` → 写回。首颗 dab 只沾不上色。`_weightedAverage` 已算出 mask 加权平均的 premult RGBA（其 alpha 分量就是下文的 ā）。
- 插件 `src/plugins/smudge.ts`：variants smear / dull / paint；`brushSliders` 只有「揉匀」(dull)；`mixModes` 下拉；`smudgeSettingsFrom` 把 params + 笔 + 图层拼成 `SmudgeSettings`。
- `src/filters-adjust.ts`：滑杆渲染；`dull` 按 toolStates 持久化（per-doc）；混色空间持久化 preferences `smudge-mix`（gallery）。
- i18n：`src/i18n/strings.ts` `flt.smudge.*`。测试：`test/smudge-engine.test.mjs`、`smudge-plugin.test.mjs`、`smudge-rack.test.mjs`。
- 强度语义：**每 dab** 的 `M·s`，不按 spacing 归一（user 真机已按此调过手指出厂值 0.5 / 32px / 2%）。

## 3. 四件改动（spec）

记号：`ā` = 本 dab mask 加权平均的画布 alpha（0..1，透明像素分母计入）；`s_p` = 压感整形后的值（现有 pShape 输出，0..1）；全程 premult，透明像素 RGB 永不参与。

### A. 压感反向映射（P1，只 paint 模式）
- `colorRate_eff = colorRate × s_p`。轻按 → 不掺笔色 = 只揉；重按 → 滑杆值。
- 稀释也可反向：`dilution_eff = 1 − s_p·(1 − dilution)`（轻按 → 全稀释 = 空处什么都不落）。**默认关**（作者的出厂值也关），v1 不出 UI 开关，代码常量即可；开关要不要暴露归 user。
- smear / dull 的压感继续只乘强度，不动。

### B. 稀释 Dilution（P2，只 paint 模式）
- 出料 P 上色前整体乘 `1 − d·(1 − ā)`（四通道同乘，保持 premult）。d=0 → 现状；d=1 → 底下全透明处出料 alpha 为 0（画不上），半透明处按比例。
- 与 lockAlpha 叠加合法（lockAlpha 管写回时的 alpha，稀释管出料）。
- 新滑杆「稀释」0..1，paint variant 独有。

### C. 多分辨率出料（P3，三个 variant 共用，改的是「揉匀」旋钮的中段语义）
- 两端不变：dull=0 = 块（现状，零重采样）；dull=1 = 单一 mask 加权平均色（现状）。
- 中段**不再 lerp 两端**，改为真正的中分辨率：格数 `k = round(B^(1−dull))`，夹到 [2, B−1]。把记忆块 Accum 按 k×k 格做 **mask 加权 premult 平均**（没有 mask 像素的格标「死格」）→ 对活格做 **3×3 盒滤波**（死格不参与、premult 平均）→ **双线性放大**回 B×B 得 P。
- 记忆只住在块 Accum 上；单色 = 块的加权平均。现有的 `accumColor` 可退役或改为派生，由实现者定，回归测试要保持 dull=1 结果与现状一致。
- 成本 O(B²) + O(k²)，可忽略。

### D. 记忆解耦（新，答 P4；只 paint 模式）
- 现状把记忆 ρ 绑在强度 s 上：满强度 = 永不衰减的纯拖。这对手指对（drag lines），对湿画笔错——作者的水彩笔在满强度落色的同时湿色记忆极短（换算 ≈ 0.085 个直径衰减到 1/e，走一个直径后只剩百万分之几）。**直接把他的数字套进现引擎会得到一支永不衰减的拖拽笔**，这就是 P4 让人 confusing 的根源。
- paint 模式改用独立旋钮「记忆长度」L（单位 = 直径数，1/e 衰减）：`ρ = exp(−(step/D)/L)`。smear / dull 保持 `ρ = (s³)^(step/D)` 不动。
- 滑杆建议对数刻度 0.02 … 2 直径；默认见 §4。
- 不做：作者的「湿色记忆里含笔色」（笔毛越蘸越是笔色）——v1 不学，需要时另案。

## 4. 出厂值（paint variant；作者验证过的锚点，换算到本引擎语义）

| 旋钮 | 值 | 来源 / 换算 |
|---|---|---|
| colorRate | 0.49 | 作者演示 blending 51 = 笔下颜色占 51% → 笔色 49% |
| dilution | 0.32 | 作者演示 32 |
| dull（揉匀） | 0.5 | 作者演示 watering 68 + 他的格数 ≈ log₂(直径)；本文 `k = B^(1−dull)` 在直径 17 时 dull=0.5 → 4 格，与他一致 |
| 记忆长度 L | 0.085 直径 | 作者 persistence 20 @ opacity 100、spacing 2.5%，逐 dab 保留率 ≈ 0.74 换算 |
| strength | ≈ 0.2 | 作者 opacity 100 是「走一个直径后的覆盖」，他的每 dab flow ≈ 0.22；本引擎 strength 是每 dab 值，2% spacing 下对应 ≈ 0.2。**这是两引擎强度语义不同导致的换算，实现者别改成 spacing 归一（手指出厂值已按每 dab 调好）** |
| 压感反向 | colorRate 开、dilution 关 | 作者出厂 pBlending 开 / pDilution 关 |
| 混色空间 | srgb | 作者全程 sRGB 直混；oklab / spectral 是我们的加分项 |

这些是**手感数字，属 user 钉死区**：先按表落地，真机后 user 改。

## 5. UI / 持久化 / 文案

- paint variant 滑杆：揉匀（已有）+ 稀释 + 记忆长度。smear / dull 不加滑杆。
- i18n：新增 `flt.smudge.dilution`、`flt.smudge.memory`（zh / en / ja；tok 随其它 flt.smudge.* 的现状），**不许裸中文**。
- 持久化：`dull` 已走 toolStates（per-doc）。新字段（dilution、memory）要不要同样持久化 = **新持久化结构，落地前必须 user 一句话同意**（家规：改持久化先问）。在同意之前只做 session 内。
- 说明书（`readme-docs.ts` 手指节，如有）同步一句「带颜料的手指 = 湿画笔：稀释 / 记忆 / 轻按只揉重按落色」。
- 图标：无新增。

## 6. 验证（只列断言，实现者写测试）

- **稀释**：全透明 cur + d=1 → 上色后 cur 仍全 0；d=0 → 与现状逐字节一致；ā=0.5、d=1 → 出料 alpha 减半。
- **压感反向**：s_p=0 → 出料不含笔色（与 colorRate=0 一致）；s_p=1 → 等于滑杆值。
- **多分辨率**：cur 左半黑右半白、dull=0.5 → 出料沿中线单调平滑过渡、无双影；dull=0 → 逐像素等于块；dull=1 → 等于现状单色（回归）；mask 外的死格不污染活格。
- **记忆解耦**：paint、strength=1、L 小 → 走一个直径后 Accum ≈ 当前画布而非起点；smear / dull 记忆律回归不变。
- **premult 红线**：透明像素 RGB 不进任何平均 / 盒滤 / 双线性。
- 全仓：现有 1457 测绿 + tsc + standalone smoke；动了滑杆 UI 就跑手指 UI 探针。
- 交付时重打 `api/`（.h ritual）。

## 7. 提案 .h（`SmudgeSettings` 字段面；现状以 `api/` 为准）

- 新增：`dilution: number`（0..1）、`memoryLength: number`（直径数，>0）。
- 语义变更：`dull` 中段 = 多分辨率（§3-C），字段本身不变。
- 不变：`mode` / `colorRate` / `strength` / 压感系数 / `mix` / `lockAlpha`。
- 实现中形状变了回写本节。

## 8. 不做

新 variant；改 smear / dull 的记忆律；spacing 归一的强度；湿色记忆含笔色；任何对 npainter 源码的参照。

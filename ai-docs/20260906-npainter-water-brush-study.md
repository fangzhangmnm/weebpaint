# NPainter 水彩/混色笔只读学习：许可证结论 · 管线 · 五个旋钮的数学 · 对表 WeebPaint 手指引擎

> 作者：Claude Fable 5.1（claude-fable-5-1）· created 20260906 · as-of dev v0.13.14 · 状态：**只读学习（user 2026-09-06「进入只读学习模式」），未动码，未做决策**。
> 出处：user 2026-09-06「weebpaint: hey we got a company https://mrgaturus.itch.io/npainter 先看一下 license 和作者对我们抄他们的态度。
> 如果 ok 的话，因为他的混色很漂亮，正好就解决了在非赛璐璐领域里面我没法帮你 grounding 的问题」+ 三张截图（itch 头图 / Water 笔参数面板 / 猫图 Pen 笔）。
> 源码：GitHub `mrgaturus/npainter`（作者 Cristian Camilo Ruiz），本机浅克隆在 job tmp（`~/.claude/jobs/51e9aa92/tmp/npainter`，job 删即清；不进检疫桶，因为 GPL 与本仓 MIT 不兼容，永远不会 vendor）。
> 读过的文件：`src/wip/brush/{brush.h,basic.c,water.c,smudge.c,shape.c,pipe.nim,ffi.nim}`、`src/wip/brush.nim`、`src/ux/state/brush.nim`、README、LICENSE、nimble。
> **本文只转述公式与语义，不含任何源码片段；实现时照本文写，不照源码翻译**（著作权管表达不管思想；GPL 代码一行不能进 MIT 仓）。

## 0. 一句话

NPainter 的「漂亮混色」不是颜料模型（README 明写 Not-Planned: Realistic Color Mixing / Perfect Color Accuracy），也不是线性空间（全程 sRGB 8-bit 拉成 16-bit 定点、premultiplied、无 gamma 转换）。
它是 **SAI 系水彩笔的四个旋钮 + 一个便宜的空间技巧**：① Blending（每 dab 取笔下平均色掺进笔色）② Dilution（出料 alpha 跟随画布 alpha，空处不着色）
③ Persistence（湿色跨 dab 记忆）④ Watering（把 dab 下方按 log₂(直径)² 个格子取平均、3×3 盒滤波、再双线性放大回去当出料——一个近乎免费的低频「湿边」）
+ **压感反向映射：轻按 = 纯揉（blending→1、dilution→1），重按 = 落笔色**。这几条里 ②④⑤ 是本仓手指引擎（v0.13.x）还没有的。

## 1. 许可证与作者态度（先答 user 的问题）

| 项 | 事实 | 对本仓的含义 |
|---|---|---|
| 许可证 | `LICENSE` 文件 = GPL-2.0-or-later；`npainter.nimble` 写 GPL-3.0；每个源文件头 SPDX `GPL-2.0-or-later` | 两个写法都是 GPL copyleft。**WeebPaint 是 MIT + 公开仓 → 一行代码都不能搬**，搬了整个仓要跟着 GPL |
| 学算法 | 著作权保护表达不保护思想/算法/参数语义 | **可以学**。做法 = 本文用自己的话写数学 → 照本文实现。不做逐行翻译 |
| 作者态度 | 源码公开在 GitHub、合 PR、itch 评论区有人问「How'd you learn?」作者没回；没有任何反对研究/模仿的话。README「Not-Planned: 1:1 Features with Similar Software」说的是**他自己不抄 SAI**，不是禁止别人学他 | 中性偏开放（GPL 本身就是「欢迎研究」）。没有明确祝福也没有反对。不需要打招呼，但如果将来 WeebPaint 的水彩笔文案里想提「参考了 NPainter 的水彩笔参数语义」，是礼貌不是义务 |
| 竞品关系 | 原生桌面（Nim + C + SIMD，正在改写成 C + SDL3），Linux/Windows，macOS/iPad/Android 在 Planned；单人项目，itch 标 wip，2021 起 | 和 WeebPaint（web/iPad/VR）不同生态位，短期不构成竞争；**长期 iPad 上会撞** |

## 2. 管线形状（每颗 dab 两段式）

每颗 dab 把包围盒切成 `shift × shift` 个 tile（`shift = ⌊log₂ 直径⌋`，直径 17 px → 4×4、100 px → 6×6、1000 px → 9×9），tile > 5×5 时多线程。

- **stage 0（每 tile 独立）**：算形状 mask（圆 / 斑点纹理圆 / 位图）× 纹理 mask × 裁剪 mask → 按 blend 类型做事：
  普通类（铅笔/喷枪/钢笔/橡皮）直接把笔色按 mask 混进画布；**水彩类只做「采样」**：统计本 tile 内 mask≠0 像素的 premult 颜色总和与像素数（透明像素也计数，但 RGB 不计入——只加 alpha≥1/256 的像素）；模糊/手指类先拷块。
- **stage 0 与 1 之间（单线程，汇总）**：水彩类在这里算出本 dab 的**出料颜色**（§4 `average`）或**出料小图**（§5 `water`）。
- **stage 1（每 tile 独立）**：把出料按 mask 混进画布——Brush 模式用单色 normal blend；Water 模式用「小图双线性放大后逐像素 lerp」；Marker 用 flat blend。

所有混合都是 premult 定点 lerp：`dst ← dst·(1−m) + P·m`，m = mask 值（已含每 dab 的 flow）。**没有 over 算子，没有线性化**。

## 3. dab 形状与 flow（和本仓对表用）

- **圆 mask** = 对归一化距离 `u = d / 直径` 做 smoothstep：软带宽度（归一化）`= 0.5 − 0.5·hard + 2·(1.5 − sharp) / 直径`，带内从 1 平滑到 0，带外 0，全部 × flow。
  语义：**hardness 管软带占半径的比例，sharpness 管像素级 AA 宽度**（hard=1 时软带 = 1–3 px，与直径无关；sharp 0.5 → 2 px）。本仓 `smudge-engine.ts` 的 innerR/decay smoothstep 同形，只是没有 sharpness 这个像素项。
- **spacing**：圆笔 `step = 0.075 − 0.05·hard`（硬笔 2.5%、全软 7.5% 直径）+ 每 dab 再加 1 px；模糊笔 ×2；手指笔固定 2.5%。**印证 user 09-05 拍板的滤镜笔/手指 2%。**
- **flow（每 dab alpha）**：`flow = 1 − (1 − opacity)^(step_eff)`，`step_eff = step + 1/直径`。因为一个直径内恰好走 `1/step_eff` 颗 dab，累积覆盖 = opacity 滑杆值 → **不透明度滑杆的语义是「走过一个直径后的覆盖」，与 spacing 解耦**。（本仓 gl-stamp 的 flow 语义另查，不在本文范围。）
- **压感**：size 与 opacity 各有「最小值 + 放大指数」两个旋钮：`v = (min + (1−min)·p^amp) · v_max`；opacity 还过一次 smoothstep。直径 < 2.5 px 时不再缩小而是把 alpha 按比例调低（细线不断）。
- Pen（flat）模式：出料 alpha = `max(flow, 画布 alpha)`，单笔内只增不叠——SAI 钢笔的「不会越描越深」。猫图就是 Pen + 稳定器 16。

## 4. Brush 模式（= SAI 水彩笔的「混色」核）：每 dab 一个出料色

记号（全部 0..1）：`C` 笔色；`W` 湿色记忆（上一 dab 的出料色，straight，跨 dab 保存）；`F` 上一 dab 最终出料（premult，跨 dab 保存）；
`Ā, ā` = 本 dab 下方 mask 内像素的 **alpha 加权平均色（straight）** 与 **平均 alpha（含透明像素分母）**；`b` Blending，`d` Dilution，`ρ` Persistence，`f` 本 dab flow。

1. **采样守卫**：若 `ā ≤ 1/256`（笔下基本是空的）→ `Ā ← W`（用湿色顶替，别采到垃圾）。若 `ā < 1.6%` → `Ā ← mix(C, Ā, √(64·ā))`（近空处往笔色拉）。另有一个「按透明程度丢低位」的量化步骤，作用是压制低 alpha 去预乘的噪声，本仓 premult 浮点管线不需要。
2. **掺笔色**：`M = mix(C, Ā, b)`。b=0 纯笔色（普通画笔），b=1 纯采样（纯揉、不落色）。
3. **湿色记忆**：`k = 1 − (1 − √ρ)·√f`；`M = mix(M, W, k)`；`W ← M`。ρ 越大记得越久；**flow 越大刷新越快**（√f 项）——重按时旧色被冲掉得快。ρ=0.2、f=0.3 时 k≈0.70（每 dab 留 70% 旧湿色）。
4. **Dilution → alpha**：`α = mix(1, ā, d)` = `1 − d·(1 − ā)`。d=0 出料永远不透明；d=1 出料 alpha = 画布 alpha → **透明处画不上、半透明处只画一半**。这就是「水彩需要底下有水才晕得开」。出料 `P = M·α`（premult）。
5. **第二次记忆**：`P = mix(P, F, k)`；`F ← P`。alpha 也被跨 dab 平滑。
6. stage 1：`dst ← lerp(dst, P, mask)`。

**压感反向映射**（关键手感）：`s = smoothstep(p·(1 − minPressure))`；开了 pBlending 则 `b ← 1 − s·(1 − b)`，开了 pDilution 则 `d ← 1 − s·(1 − d)`。
→ **p→0 时 b→1、d→1：轻触 = 只揉、不落色、空处不着色；p→1 时回到滑杆值。** 这和本仓「强度 × 压感」是两种哲学：本仓轻按 = 什么都少做；SAI 系轻按 = 换一种动作（揉）。

**spacing 归一**：b、d、watering 三个值先做 `x ← x^(1 − 0.00005^step)`（硬笔 step 2.5% → 指数 0.22；软笔 7.5% → 0.52），把滑杆值往 1 推，spacing 越密推得越狠。作者的经验式，没有闭式的「每直径」语义；本仓 `ρ = (s³)^(step/D)` 的按笔程归一更干净，不用学这条。

Marker 模式 = 同一个 average 但 d=0、出料走 flat blend（alpha 单笔内只增不叠）。Eraser 在水彩模式下 = 笔色换成透明、走同一套（「glass」）——所以水彩橡皮会把边缘揉开。

## 5. Water 模式（= 「漂亮」的那一半）：每 dab 一张出料小图

在 §4 算完 `M`（湿色）和 `P`（含 dilution 的最终色）之后，再多做：

1. 每个 tile 的采样统计各自算一个平均色（straight RGB + 平均 alpha）→ 得到一张 `shift × shift` 的**小图**（没有 mask 像素的 tile 标「死」，不参与）。
2. 小图做 **3×3 盒滤波**（死格跳过；颜色按 alpha 加权，alpha 取算术平均）。
3. 每格按 Watering `w` 与 Colouring 开关得到出料格色：
   - **Colouring 开**（默认）：`t = clamp(ā_格 / α_dab)·w`；`格.rgb = mix(M.rgb, 格.rgb, t)`；`格.α = α_dab`（§4 第 4 步的 dilution 结果）→ **出料 alpha 固定为本 dab 的值，只有颜色跟着底下的低频画布走**。底下越实（ā 高）越跟。
   - **Colouring 关**（或橡皮）：`格 = mix(P, 格_premult, w)` → **alpha 也跟着画布走** = 更像纯揉/湿抹，颜料留得少。
   - pWatering 开：`w ← 1 − s·(1 − w)`，轻按 → w→1 → 纯湿抹。
4. stage 1：把小图**双线性放大到 dab 包围盒**（步长 `(shift−1)/包围盒边`），`dst ← lerp(dst, 小图(x), mask)`。

代价：采样本来就要做（§4 需要），小图 ≤ 9×9，盒滤波与放大都是 O(格数) + O(dab 像素)——**比 smear 搬块还便宜**，比每像素卷积模糊便宜两个数量级。

效果解释（对着截图第二张）：蓝色云团的软边、橙红团的晕开，来自「格平均 + 3×3 + 双线性」= 半径 ≈ 直径/shift 的低通，随笔走的是**模糊过的底色**而不是像素块（无 drag lines）也不是一个平色（不糊成一团）。它正好落在本仓 `dull` 旋钮（0 = 搬块 … 1 = 单平均色）**两端之间的第三个点**：多格平均。

## 6. 五个旋钮的中文语义表（给将来 UI/文案）

| NPainter 旋钮 | 数学位置 | 一句话语义 | 本仓现状 |
|---|---|---|---|
| Blending | §4-2 `mix(C, Ā, b)` | 每 dab 出料里「笔下颜色」占几成；1 = 纯揉 | = `1 − colorRate`（paint 模式有） |
| Dilution | §4-4 `α = 1 − d(1 − ā)` | 出料透明度跟随底下有没有颜料；1 = 空处不着色 | **没有**（本仓出料 alpha = strength × mask，与底无关） |
| Persistence | §4-3 湿色记忆 k | 湿色跨 dab 记多久；flow 大刷新快 | 近似 = Accum 记忆 ρ（但本仓记的是画布块/平均色，不是出料色；paint 模式每 dab 重新掺笔色，无出料记忆） |
| Watering | §5-3 格色与湿色的 lerp 权 | 出料颜色跟随「模糊过的底色」几成 | **没有**（dull 旋钮是块↔单色，没有多格中间态） |
| Colouring | §5-3 分支 | 开 = 出料 alpha 固定、只借底色；关 = alpha 也跟底走 | 无对应 |
| Min Pressure | §4 压感 s 的缩放 | 压感对 b/d/w 三个反向映射的作用幅度 | 无对应（本仓压感只乘强度） |
| pBlending / pDilution / pWatering | 三个反向映射开关 | 轻按 = 揉，重按 = 落色 | **没有** |

## 7. grounding 数字（user 要的：非赛璐璐领域的可信手感锚点）

两组都是作者自己的值，不是我编的：

**A. 代码里的 proof-of-concept 默认（`ux/state/brush.nim`）**：直径 10、min size 20%、size amp 0.5、opacity 100%、min opacity 100%、opacity amp 0.5、稳定器 4；圆 hardness 100%、sharpness 50%；
Water：blending 75%、dilution 0、persistence 25%、watering 25%、pBlending 开、pWatering 开、pDilution 关、colouring 开、min pressure 0。

**B. itch 头图 / 截图二（作者演示用的调过的值）**：直径 17、min size 20、opacity 100、min opacity 100、hardness 100、sharpness 50；
Water：**blending 51、dilution 32、persistence 20、watering 68**、colouring 开、min pressure 0。

读法：演示图把 watering 从 25 拉到 68、blending 从 75 降到 51、dilution 从 0 加到 32——**「漂亮」= 出料一半是笔色一半是底色，三分之一跟着底 alpha 变淡，颜色大幅跟随模糊底色**。这组数字可以直接当本仓水彩笔预设的出厂值起点（前提是把 §6 缺的三件做出来）。

## 8. 对表本仓 `smudge-engine.ts`（v0.13.14）：一样的、不一样的、值得拿的

**一样的**：premult lerp 混合、按 mask 形状 falloff（smoothstep）、每 dab 采 mask 加权平均色（我们的 dull = 它的 Brush 采样）、湿色记忆思想、spacing 2–2.5%、sRGB 直混是基线（它连 oklab/spectral 都没有——所以「漂亮」不靠色彩空间，我们的 oklab/spectral 是加分项不是必需品）。

**不一样的（它有我们没有）**：
1. **Dilution（出料 alpha 跟随底 alpha）** —— 本仓 paint 模式在透明处照样以 strength 落色，等于普通画笔；水彩需要「没水就晕不开」。
2. **Watering（多格平均 + 3×3 + 双线性的出料小图）** —— 本仓 dull 旋钮只有块 ↔ 单色两端；中间态是两者 lerp（既有 drag lines 又有平色），不是「模糊过的块」。
3. **压感反向映射（轻按 = 揉，重按 = 落色）** —— 本仓压感只乘强度。这是 SAI/CSP 水彩笔手感的核心，也是 user 现实需求①（大腿阴影边界抹一下）「老师嫌脏」问题的另一半答案：轻按时根本不该落新颜料。
4. **出料记忆而非画布块记忆**：它记的是「我上一次吐出来的颜色」（W/F），本仓记的是「我沾到的画布」（Accum）。paint 模式下差别：它的湿色里已经掺过笔色，所以湿色会慢慢**变成笔色**（像真的笔毛越蘸越是笔色）；本仓每 dab `mix(Accum, C, colorRate)` 重新掺，湿色永远是「画布 + 固定比例笔色」。

**不一样的（我们有它没有）**：oklab/spectral 混色空间；按笔程归一的记忆闭式；整数窗口零重采样的 smear（它的 smudge 是每 dab bilinear，会越拖越糊，正是 survey §3.3 说的 Krita 形坑）；选区 mask；lockAlpha 只混色不动 alpha。

**值得拿的（提案，未决策，等 user 拍板）**：
- **P1 压感反向映射**进 paint 模式：`colorRate_eff = colorRate · s`、（若做 P2）`dilution_eff = 1 − s(1 − dilution)`，s = 压感整形后的值。一行数学，手感变化最大。
- **P2 Dilution 旋钮**：出料 `P.α ← P.α · (1 − d(1 − ā))`，ā = 本 dab mask 加权平均 alpha（`_weightedAverage` 已经算出来了，白拿）。
- **P3 出料小图（Watering）**作为 dull 旋钮的**第三档 / 二维化**：把 cur 块按 `⌊log₂ D⌋²` 格取平均 → 3×3 盒滤 → 双线性放大 = `P_water`；出料 `P = mix(P_block_or_avg, P_water, w)`。成本可忽略。可能直接回答现实需求④「二次元场景水彩笔混色」。
- **P4 出厂预设**：新建「水彩」variant 用 §7-B 的数字起步（blending 51 → colorRate 0.49；dilution 0.32；persistence 0.20 → 记忆 ρ 需换算；watering 0.68）。
- 不学的：spacing 经验式归一（§4 末）、低位量化（§4-1）、每 dab bilinear smudge。

## 9. 来源

- itch：https://mrgaturus.itch.io/npainter（截图二、三来自该页/作者演示）
- GitHub：https://github.com/mrgaturus/npainter（master @ e3d029d「readme.md: this project is not dead」；作者正改写为 C + SDL3，Mastodon @mrgaturus）
- 本仓：`ai-docs/20260905-smudge-math-survey.md`（GIMP/MyPaint/Krita 三家公式）、`src/plugins/smudge-engine.ts`、`src/backend/algorithms/color-mix.ts`

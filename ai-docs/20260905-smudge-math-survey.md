# 手指 / 涂抹（smudge）数学考古：Procreate 能查到什么、开源三家怎么算、落到 WeebPaint 哪条管线

> created 20260905 by Claude Fable 5.1
> as-of v0.13.0 / 2026-09-05
> **性质：调研（survey），不是决策**。未动码。出处：user 2026-09-05「开始做欠了很久的手指了，先看看 procreate 的手指的数学」
> + 2026-07-25 journal「sumdge update 先系统性地考古 … nudge/sumdge，clone，手指（是不是就是nudge）？涂抹？分别是什么，
> 水彩的混色是什么。这个需要你科普」+ 2026-08-18「涂抹混色也比较独立，反而就是决策和美术和物理活」
> + 2026-09-05 对话「我们有液化笔吧，这两个应该很像」。
> 第三方源码只读参考：`~/jupyter/third-party/libmypaint/`（浅克隆，检疫桶；ISC 许可，本文只转述公式不抄代码）。

## 0. 一句话

Procreate 闭源，官方手册只给**行为描述**，没有公式。能钉死的公开数学来自三家开源：GIMP（拖一块像素缓冲）、
MyPaint（记一个平均色）、Krita（两种都有，叫 smearing / dulling）。把 Procreate 的行为描述对到这三家上：
**Procreate 的手指 = smearing 型（拖像素块）+ 强度 = 侧栏不透明度滑杆 + 每支笔一个 Smudge Pull 系数 + 笔的形状/颗粒当 mask**。
下面 §2 是能引用的事实，§3 是能钉死的公式，§5 是落到本仓的候选——手感参数归人类钉死区。

## 1. 科普：六个词各是什么（回答 07-25 的问题）

| 词 | 每 dab 干什么 | 颜色混不混 | 形状保不保 | 谁这么叫 |
|---|---|---|---|---|
| **手指 / 涂抹 / smudge / smear（拖）** | 把上一 dab 位置下方的**像素块**搬到新位置，按 dab 形状 α × 强度混上去 | 混（颜色随笔走，有记忆衰减） | 不保（拖出 drag lines，纹理跟着走） | PS 涂抹工具、Procreate Smudge、CSP「指先」、Krita smearing、GIMP smudge |
| **混色 / blend / dulling（揉）** | 只取一个「dab 下方加权平均色」，整个 dab 填这个色再按 α 混回 | 混（把强色揉钝，故名 dulling） | 不搬形，只揉匀 | MyPaint smudge、Krita dulling、CSP「色混ぜ」 |
| **模糊 / blur** | 局部低通卷积 | 不带色走 | 不搬 | CSP「ぼかし」；WeebPaint 已有（模糊笔 = 滤镜笔） |
| **nudge / push（推）** | 累积位移场，从**起笔快照**重采样 | 不混色 | **保结构**、可还原 | = 液化 push。user 07-25 说的「nudge（手指）」按行为其实是 smear 不是 push，差别见 §4 |
| **clone / 仿制图章** | 从**固定偏移**的源位置拷像素到笔下 | 不混（拷贝） | 拷源形 | CSP「コピースタンプ」、PS 仿制图章。和 smear 同属「搬像素」，只是源不是上一 dab |
| **水彩混色 / wet mix** | **不是独立工具**：画笔本身每 dab 颜色 = 画笔色 与 画布采样色 的混合 | 混 | — | MyPaint `smudge` 参数、Krita color rate、Procreate Wet Mix（Pull/Dilution/Charge）、PS 混合器画笔 |

关键关系：**手指 = color rate 为 0 的湿画笔；湿画笔 = 手指 + 掺画笔色**。同一段代码的两个参数点。

## 2. Procreate 能查到的事实（全部出自官方手册，逐句原文）

- 共用画笔库：*"Smudge shares the same brush library as Paint and Erase."*
- 强度 = 侧栏不透明度滑杆：*"The Smudge tool creates varying effects depending on the value of the opacity slider. Raise the opacity slider in the left sidebar to strengthen your smudge tool. Lower the opacity for a more subtle effect."*
- 高强度：*"When you use Smudge at high pressure, it smears color around like wet paint. Colors will blended much quicker at full pressure. You may also see visible drag lines where Smudge has moved paint around the canvas."*
- 低强度：*"At lower strengths, Smudge is smoother and softer. This can create gradients, blending shadows and highlights, or smudging pencil drawings."*
- **每支笔一个系数**：Brush Studio → Properties → Brush Properties → **Smudge Pull**：*"Adjust how much a brush smudges when set as the Smudge tool."*（同节：Use Stamp Preview / Orient to Screen / Preview Size；节首语 *"… and set a default Smudge strength."*）
- Wet Mix（这是**画笔**工具的湿混，不是手指工具）：Dilution *"Set how much water mixes in with the paint on your brush"*；Charge *"how much paint is applied onto your brush when you begin to make a stroke … the longer you drag your stroke out, the more paint it will leave behind"*；Attack *"the amount of paint that sticks to the canvas"*；**Pull** *"Set the strength of how your brush pulls paint around the canvas. This includes paint that is already laid down."*；Grade *"chunkiness and contrast of your brush texture"*；Blur *"the amount of blur your brush applies to the paint on your canvas"*；Blur Jitter；Wetness Jitter。
- Rendering 六档（Light/Uniform/Intense/Heavy Glaze、Uniform/Intense Blending）决定 dab 之间怎么叠——*"Uniform Glaze: similar to the rendering used in Adobe® Photoshop®"*、*"Intense Blending: … gives a full flow effect to the paint's Wet Mix."*

**推断（非文档，明确标注）**：drag lines + 颗粒纹理跟着笔走 ⇒ smearing 型而非 dulling 型；形状/颗粒是 mask；「强度」是每 dab 的搬运比例；「只采当前图层」是经验（没找到官方原文，待真机验）。

## 3. 三家开源的公式（可钉死）

记号：`p` 像素，`M(p)` dab 形状 α（0..1），`k` 强度（0..1），颜色一律 **premultiplied RGBA**，`lerp(a,b,t)=a(1−t)+bt`。

### 3.1 GIMP —— 持久缓冲拖（smearing，最简）

- 起笔：`Accum ← 画布在起点 dab 框的块`（RGBA float）。
- 每 dab（源码注释原文）：`Accum = rate·Accum + (1−rate)·I`（`I` = 本位置画布块），`Paint = (1−flow)·Accum + flow·BrushColor`，再按 dab mask 把 `Paint` 画回。
- `rate` = 记忆（PS 的 Strength 同义：1 = 起点像素一路拖到底、不吸新色；0 = 每 dab 全换成本地像素 = 几乎不动）。`flow` = PS 的 Finger Painting（掺前景色）。`no erasing` 选项：不让透明处把 alpha 拖低。
- 要点：Accum 是**一块带纹理的像素**，不是一个色 → 才有 drag lines。

### 3.2 MyPaint —— 单色记忆（dulling）

状态 = smudge 桶 `S=(R,G,B,A)`（premult）+ 上次采样色 + recentness。每 dab：

1. **采样** `c̄,ā = get_color(x,y,r_s)`：以 dab mask 为权重的加权平均（legacy 路径：`Σ opa·rgba / Σ opa`，输出 straight rgb + a）；`r_s = radius·exp(smudge_radius_log)`。为省钱**不是每 dab 都采**：`recentness *= f`，低于 `(0.5f)^smudge_length_log` 才重采（注释：get_color 几乎和画一颗 dab 一样贵）。
2. **更新记忆** `f = max(0.01, smudge_length)`：`S_rgb = f·S_rgb + (1−f)·ā·c̄_rgb`，`S_A = clamp(f·S_A + (1−f)·ā)`（首 dab `f=0` 直接初始化）。
3. **出色** `m = smudge ∈ [0,1]`：`α_t = clamp((1−m) + m·S_A)`；`color = (m·S_rgb + (1−m)·brush_rgb) / α_t`；dab 以 `color` 画，且 **eraser_target_alpha = α_t**——采到的 smudge 色偏透明时，这颗 dab 会把画布 alpha 往 `α_t` 擦（「拖到透明处会擦」的来源）。
4. `smudge_transparency`：采样 `ā` 低于阈值就不画这颗（smudge 版 lock alpha）。

手指 = `m=1`；水彩笔 = `0<m<1`。**坑**：记忆 `f` 是**每 dab**的因子 → spacing 越小衰减越快，`smudge_length_log` 是为此打的补丁；我们若做，记忆应按**笔程**归一（每走一个 dab 直径衰减一次），不按 dab 数（§5）。

### 3.3 Krita Color Smudge —— 两种都有，三步合成

每 dab 先「背景混入」，再「掺画笔色」，最后按 maskDab 画回（源码 `blendBrush`）：

- **smearing**：`dst ← 画布(新位置块)`；`dst = over(画布(上一位置块) @ opacity·smudgeRate, dst)`（`COMPOSITE_COPY` 且 rate=1 时直接整块搬）。
- **dulling**：`c̄ = 加权平均(画布 @ 新位置块，权 = mask，采样框按 smudgeRadius 放大)`；`dst = over(c̄ @ 0.8·smudgeRate·opacity, dst)`。
- **color rate**：`dst = over(paintColor @ colorRate²·opacity, dst)`。
- 写回：`painter.opacity = finalPainterOpacity(opacity, smudgeRate)`，按 maskDab 混到图层。
- Overlay 开关 = 采样所有图层 vs 当前层（PS「Sample All Layers」同义）。

**smearing 的记忆在哪**：Krita 每 dab 从画布重读「上一位置块」，记忆隐含在画布本身（拖过的像素留在画布上被下一 dab 再搬）；GIMP 的持久 Accum 则能把起点像素一路拖到底（rate=1 = 纯搬运）。两种在 `k<1` 时手感相近，`k→1` 时分叉：Krita 形每 dab 重采样（Δ 非整数 → bilinear 一次 → 逐 dab 低通，越拖越糊）；GIMP 形不糊但纹理被「印」出去。

## 4. 和液化的关系（user：「这两个应该很像」）

- **相同（工程壳）**：dab 调度（spacing 走位）、圆/椭圆 falloff、压感→强度、doc 坐标 footprint、选区 mask + bleed、tile 读写、dirty bbox。`liquify-engine.ts` extendStroke 的 footprint 循环、`filters.ts` `attachColorBrushBehavior` 的 spacing 走位，都能直接当骨架。
- **不同（本质）**：液化 = `dst[p] = src₀[p − D(p)]`，`D` 累积、`src₀` 是起笔快照 → **无颜色混合、无记忆衰减、无损可还原**（reconstruct 免费）——这正是当年 v46/v47「in-place 迭代 bilinear 会糊」之后改成 path A 的理由。smear = 每 dab `canvas[p] = lerp(canvas[p], canvas_prev[p − Δ], M(p)·k)` 作用在**已修改的画布**上 → 颜色混合、逐 dab 低通。
- **结论**：smudge 不能复用位移场 path A（它是「保结构」的反面），但复用它的工程壳；而「越抹越糊」对手指来说恰是想要的（Procreate 低强度就是糊）。

## 5. 落到 WeebPaint：现状 + 三条候选（供讨论，未动码）

### 现状（as-of v0.13.0）

- GPU 印章 `backend/gl/gl-stamp.ts` 只会「颜色 × 形状 α 累积」（instanced 一发），**不读画布** → 手指做不进这条。
- 滤镜笔 `filters.ts attachColorBrushBehavior` = CPU 逐 dab 读区域 → 烤 → 按 dab α 混回；模糊笔在用。这是 smudge 的天然壳，但两个坑：
  ① `_colorBrushStamp` 最后一步混合在 **straight RGBA** 做（黑边病根同款；v0.12.3 只修了模糊卷积内部）——smudge 必须全程 premult；
  ② footprint 夹在 `layer.bbox` 内（「不扩层」）——手指要把颜料**拖出**现有内容框，得改成夹 doc 边界（液化 tile era 已这么做，见其 extendStroke 注释）。
- 液化 `plugins/liquify-engine.ts` 自带 startSnap / footprint / 选区 bleed 工程壳。
- 旧 canvas 时代 smudge（v82 `st.loaded` 单色 + 每 dab 现做 stamp）v309 已 purge；toolbar/palette 各留一处 `"smudge"` 旧值迁移 fallback。

### 候选 A：CPU smear（推荐首版）

- 每 dab：读 `prev` 块（上一 dab 中心的 R 框，premult float）→ 读 `cur` 块（本 dab 中心）→ `cur = lerp(cur, prev[p − Δ], M(p)·k)`（Δ 非整数 → prev 内 bilinear）→ putImageData → dirty。
- 两种记忆形可选：Krita 形（每 dab 从画布重读 prev）或 GIMP 形（持久 Accum + rate）。要 drag lines 像 PS/Procreate，倾向 **GIMP 形**：`Accum = rate·Accum + (1−rate)·cur`，`cur = lerp(cur, Accum, M·k)`。
- 成本：R=50 → 100² px → 4 通道 40k 浮点/dab；spacing 6% → 6 px/dab → 1000 px 笔 ≈ 170 dab ≈ 7M ops，JS 几十 ms/笔。R=200（iPad 大手指）×16 → 100+ ms/1000 px，仍可用但接近上限（可拉大 spacing，或走 B）。
- `k = opacity × signedLerp(opaCoeff, p^γ) × preset.smudgePull`（Procreate 形：侧栏滑杆 × 压感 × 每笔系数）。手指没有 Π 内外之分（无 buffer）。

### 候选 B：GPU smear（第二版 / 大笔）

- 每 dab 一次 draw：layer 纹理的上一位置块 blit 到 scratch → 以 dab 形状 α 混到新位置（读写同纹理要 ping-pong 或 copyTexSubImage）。dab 之间有数据依赖 → 不能像 gl-stamp 那样 instanced 一发，每 dab 一 draw 也够。
- 前提待核：layer 像素目前住 CPU tile 池（`tiles/cpu-tile-pool.ts`），GL 侧是上传只读还是能写回 tile——决定 B 的代价。先做 A 拿手感，B 只在 A 的大笔延迟成为真问题时做。

### 候选 C：dulling（混色笔）= A 的一个 mode

- 不搬块，只采一个 mask 加权平均色 `c̄`，`cur = lerp(cur, c̄, M·k)`；加 `colorRate` 项就是湿画笔。建议和 A 做成**同一引擎的两个 mode**（Krita 形），UI 上「手指 = smear、混色笔 = dulling」——回答 07-25「涂抹和手指要不要拉开区分度」：数学上就是两个 mode，值得拉开。

### 手感参数（人类钉死区，需要 user 拍板；这里只列问题不给答案）

1. 强度来源：opacity 滑杆（Procreate 形）还是 flow？压感曲线是否沿用 `opaCoeff`/`pressureGamma`？
2. 记忆 rate 的默认值 + 是否暴露给用户（PS 暴露 Strength；Procreate 只暴露 Smudge Pull 每笔系数）。
3. 采样所有图层 vs 当前层（PS/Krita 有开关；Procreate 疑似只当前层，待验）。
4. 透明处语义：premult lerp 天然会把 alpha 一起搬 = 「把颜料拖出去 / 从透明处拖进来会擦」（MyPaint eraser_target_alpha、GIMP no-erasing 开关）——要不要给 lock-alpha 式的选项。
5. 形状/颗粒：我们的笔只有 hardness/aspect/rotation 解析 falloff，没有 shape/grain 纹理 → 首版 drag lines 只有 falloff 形状；要 Procreate 那种颗粒感需要纹理笔（另一纪元）。
6. 图标：手指图标需求 05-28 就登记过（「一根食指 45° 向下伸出来按住涂抹」）；图标库入库状态待对账（app 侧对账义务）。

## 6. 来源

- Procreate Handbook — Paint, Smudge, and Erase: https://help.procreate.com/procreate/handbook/brushes/paint-smudge-erase
- Procreate Handbook — Brush Studio Settings（Wet Mix / Rendering / Properties → Smudge Pull）: https://help.procreate.com/procreate/handbook/brushes/brush-studio-settings
- libmypaint `mypaint-brush.c`（`update_smudge_color` / `apply_smudge`）、`brushmodes.c`（`get_color_pixels_legacy`）、`mypaint-tiled-surface.c`（`get_color` 归一）: https://github.com/mypaint/libmypaint
- Krita Manual — Color Smudge Brush Engine: https://docs.krita.org/en/reference_manual/brushes/brush_engines/color_smudge_engine.html
- Krita 源 `plugins/paintops/colorsmudge/KisColorSmudgeStrategyBase.cpp`（blendBrush / smearing / dulling / colorRate 三步）+ `KisColorSmudgeSampleUtils.h`（mask 加权采样、blowRect）: https://invent.kde.org/graphics/krita
- GIMP `app/paint/gimpsmudge.c`（Accum = rate·Accum + (1−rate)·I；Paint = (1−flow)·Accum + flow·BrushColor）: https://gitlab.gnome.org/GNOME/gimp
- Photoshop — Work with the Smudge tool（Strength / Finger Painting / Sample All Layers）: https://helpx.adobe.com/photoshop/using/tool-techniques/smudge-tool.html
- Clip Studio Paint — Blend Tool（色混ぜ / ぼかし / 指先 / コピースタンプ）: https://help.clip-studio.com/en-us/manual_en/240_brushes/Blending_tools.htm

# Grill 议程：工具条抽象 / 手指语义与连续数学 / 工具-笔路由 / 仿制图章（2026-09-05 晚评审轮沉淀）

> 作者：Claude Fable 5.1（claude-fable-5-1）· created 20260905 · as-of dev v0.13.8 · 状态：**议程，非决策**（brainstorm ≠ decision；
> 每节「user 原话」是本轮聊天记录的直接引用，其余是 AI 的整理/提案，等 grill）。
> 出处轮：2026-09-05 晚，user 对 v0.13.5–v0.13.7（曲线/渐变映射/压感曲线）的六条评审 + 追加两条。

## 0. 本轮已拍板并落地（v0.13.8）——不在议程里

| user 原话 | 落成 |
|---|---|
| 「曲线窗口可以做的默认再小一点，原来的50-60%，然后加可变大小」「曲线手柄太小」 | 绘图区默认 200px（原 362 的 55%），右下 grip 拖拽改边长（session 记忆，不持久化），把手钮 16px / 长 56px / 线 2px |
| 「use foreground color不对。之前很早以前有一个提案就是把color window给抽象复用一下让ta不是只绑定画笔颜色」「2做」 | color-panel `registerColorTarget` 单槽→栈；渐变映射选中色标 = ColorTarget（色轮/吸管直接改色标）；「取前景色」钮撤；Filter 契约加 `disposeBody` 收口钩 |
| 「smudge的默认0.5不靠谱。因为换笔切回来就变回笔刷默认的1了」 | 过渡修：手指（toolStates.smudge）选笔不再被 `brush.defaultOpa` 覆盖。终局见 §B |
| 「嗯smear dull连续量。krita的也可以参考」 | smudge-engine `dull` 0..1 连续量（块记忆与平均色记忆同时维护，出料 lerp）；滤镜笔条「揉匀」旋钮（session 态；持久化键要 user 点头） |
| 「大滤镜笔性能确实不可接受，有模糊的话改回10%?」「模糊锐化自己的地板同意」 | 色彩类滤镜笔（模糊/锐化）自己的间距地板 10%（`COLOR_BRUSH_MIN_SPACING`），不改共享出厂笔 JSON，手指仍 2% |

## 0b. 2026-09-06 grill 拍板（user 逐条回复；本节是决策，其余章节仍是讨论/提案）

| user 原话 | 落成 / 去处 |
|---|---|
| 「工具栏放动词，动词绑 engine 族，preset 按 engine 族 typed……同意。动词原则进 adr」 | **ADR-0012**（`adr/0012-toolbar-verbs-engine-families-typed-presets.md`） |
| 「小三角试试吧，不 zen，多了一个 visual distraction，但是 catsup (sketchup clone) 必然会小三角。blender 也小三角」 | 子工具长按 + 角上小三角 = 标准件（UI 抽象轮；形状工具条 v0.6.25 变体组槽已有小三角先例） |
| 「橡皮是动词，即使再能用画笔复用也是动词」 | ADR-0012 §2 |
| 「模糊笔 wash idempotent 同意」 | §E 提案转决策，落地归 UI 轮之后的引擎批 |
| 「ui/context-toolbar 从登记表升级为 DOM 工厂深模块 同意」「子工具长按成标准件 同意」「单画笔位 + 长按出子工具 同意」「『…』溢出位 同意，是工具条的自带功能，不用特殊实现」「布局断点表赞」；09-06 晚「小三角……放心大胆去做。不要怕」「desk.subTool 同意」 | **U1/U3 已落地 v0.13.10–v0.13.11**（`20260906-ui-abstraction-round-proposal.md` §4 回写）；U4 吸色等讨论 |
| 「以后可以滤镜笔都搬家到手指这个 tool 栏位。每种都有一个自己的图标。用户可以切换。……你要么是形状笔和橡皮，要么是画笔和橡皮。反而不太会在形状笔和画笔之间切」 | ADR-0012 §2/理由；顶栏终形 `菜单 云保存 \| 笔 橡皮 手指 套索 \| fx 图层 颜色` |
| 「油漆桶进套索试一下吧」 | 填色 = 套索位子工具（ADR-0004 不互通语义不变），UI 轮 |
| 物理三模式 / 连续形式 / 落笔不糊 → 「同意」 | §C 转决策方向；实现归「平流引擎」批（等 UI 轮后） |
| 「修图族……进 wishlist，就算这轮不做我也肯定要。毕竟 weebpaint 的还有一个品牌方向就是用算法干别人用 genai 干的活」 | §G wishlist |
| 「液化选区进 wishlist，solve laplacian sounds interesting. despite my skeptical of bouncy and singularity, that is fun to explore. SDF is also okay」 | §G wishlist |
| 「那么就用加权切线吧」（并纠正：反求 Bezier 参数是三次代数方程不是超越方程；烤 LUT 的地方照旧 LUT） | **已落地 v0.13.9**：`anim-curve` inWeight/outWeight + Bezier 段 + 编辑器「加权」钮/方形把手拉长 |
| 「超越方程是混色那里你抱怨的，考古一下，看 lut 的可能性」 | §H |

## A. UI 抽象轮（第三轮讨论）：上下文工具条 + 子工具长按 + SE2

user 原话：「smudge笔刷工具条位置不对。开ui abstraction轮把所有的这类工具条和子工具的都抽象一下」「3 grill」；「iphone se2竖屏工具栏超了。你可以看一下css间距计算取舍。其实我有点想笔和形状笔收到subtool长按里面」「5 进第三轮讨论」。

实测（headless Chromium，2026-09-05）：

| 工具 | 上下文条元素 | 位置 / 尺寸 | 皮 |
|---|---|---|---|
| 套索 | `#lassoToolbarStack` | y=50，高 38，居中 | `.lasso-toolbar-stack` |
| 形状笔 | `#shapeToolbarStack` | y=50，高 38，居中 | 同套索 |
| 吸色 | `#pickerToolbar` | y=50，高 37，居中 | 复用 `.lasso-toolbar` 类 |
| 手指 / 液化 / 模糊 | `#filterBrushToolbar` | **y=56，高 44，宽 401 偏左** | `.crop-toolbar`（裁切条的皮） |

→「位置不对」= 皮不同（crop-toolbar 的 top/padding），不是布局 bug。C4（2026-09-02）只做了登记表（量顶栏下缘），chrome 各写各的。

SE2 竖屏 375×667 实测：顶栏内容 400px vs 容器 349px，**超 51px**。工具组 7 钮 = 7×32 + 6×2 间隙 + 8 padding = 244px；其余菜单/保存/调整/图层各 18、色组 42、分隔。纯 CSS（钮 32→28、间隙 2→0 省 40，再压顶栏边距各 6）勉强够、很脆；笔+形状笔收进一个长按子工具位省 34px 才宽松。SE1（320 宽）单工具组就 244，怎么压都放不下（要换布局）。

提案（待 grill）：
1. `ui/context-toolbar` 从登记表升级为 **DOM 工厂深模块**：标题 chip / select-field / 图标钮 / 连续旋钮 / 分隔的组合器，固定 y、高、居中、窄屏换行或折进「…」；套索/形状/吸色/裁切/滤镜笔/手指全部消费，删各自的皮。
2. **子工具长按**成标准件（Procreate 单画笔位 + 长按出子工具；套索/吸色已有类似交互？考古）：笔 + 形状笔共一位；将来仿制图章也可挂在手指位下。
3. 「…」溢出位：user 本轮点名「按特征长度可调的旋钮，收到...里面」——顶栏/工具条放不下的旋钮归这里。
4. 布局断点表：375（SE2）/ 390 / 768 / 1024，每档哪些位折进「…」。

## B. 工具-笔路由 ADR（慢做，但要做）

user 原话：「我的建议是smudge走自己的笔刷，不走滤镜笔刷？然后以后笔刷和工具模式的路由可能会有好几轮重构。比如可能会考虑滤镜，形状，画笔，橡皮是笔的属性。然后切工具等于换笔之类我觉得可能不靠谱的提案。做好心理准备」「路由大重构可以慢慢做。但是要做，我们的名片之一就是zen/distraction free，而不是krita那种的a380仪表盘」。

现状：手指 = filterBrush 模式 + payload smudge，笔架借滤镜笔（`brushesByTool("smudge")` = smudge 笔在前 + 全部滤镜笔），dial/variant 记在 `toolStates.smudge`；0.5 是 controller 常量不是笔数据。

参考（只是参考，**不是照搬**——user 明说要 zen 不要 A380）：Krita 把「笔做什么」（paintop preset：pixel / color smudge / filter / clone / …）与「怎么画」（tool：freehand / line / rect / lasso / fill）分成两轴，橡皮是混合模式开关。对应到我们：`preset.engine ∈ {paint, smudge, filter, clone, shape?}` × `tool ∈ {freehand, shape, lasso, fill, picker}`。

待 grill 的问题：① 手指自己的笔架（出厂笔含 defaultOpa 0.5、自己的间距语义）是否即 ADR 的第一刀；② 切工具 = 换笔 vs 工具与笔正交（user 倾向后者「不靠谱」指前者）；③ 橡皮是笔属性还是工具；④ 形状笔是工具（Procreate QuickShape 是手势不是笔）。产出 = ADR-0012 草案。

## C. 手指的连续数学（间距语义、模糊旋钮、有限 drag 的连续解）

user 原话：「我有一个根治我procreate手指用不来的提案。是不是我需要的混色的手指的语义是多了一个模糊旋钮的？」「嗯smear dull连续量。krita的也可以参考」；「小滤镜笔的间距其实可以宽，或者这样，手指和其他滤镜笔不应该读笔刷的间距，比如手指的间距应该取决于特征的长度，比如一条线的宽度。甚至可以好好grill一下数学，看一下能不能对于一个有限长度的drag，能够连续的算出效果，而不是离散的Stamp」「连续形式要，grill」。

已落地：dull 连续量（§0）。待 grill：
- **连续形式**：smear 的连续解 = 沿笔迹的**平流**（semi-Lagrangian：目标像素沿局部切线回溯 `strength·mask·L` 采样源图）——本质是液化「推」的位移场加上按 mask 混色；dull/blur 的连续解 = 沿笔迹的**线积分卷积 / 各向异性高斯**（扩散）。一段 drag = 一次 warp，间距概念消失，性能与笔径解耦。要衡量：反复重采样累积模糊（对 dull 是想要的，对 smear 要控制——液化的做法是累积位移场后一次重采样）。
- **Krita 参考**：Color Smudge 的 smudge length（记忆衰减）/ smudge radius（dulling 采样半径，越大越像模糊）/ color rate / smearing‖dulling 二选一。我们的 dull 连续量比 Krita 多一档（0..1 而非二选一）；smudge radius 可作第二旋钮。
- **模糊旋钮的三种落法**：① dull 连续量（已落）；② 搬运块先过 σ 可调高斯；③ Krita 式采样半径。哪种最接近 user「手指用不来」的病根，要 iPad 上手裁。
- **间距语义**（user「手指的间距应该取决于特征的长度」）：手指每颗 dab 的搬运距离 = 间距×直径；离散版下应按「要保的最细特征宽度」定间距 px，而不是笔的百分比；连续版下自然消失。旋钮位置：「…」（§A.3）。
- Procreate 事实核对：Wet Mix 的 Blur 参数属于画笔湿混（survey §2），是否作用于 Smudge 工具**未核实**——真机核一次再写结论。

## D. 仿制图章

user 原话：「仿制图章笔也可以考虑一下」「仿制图章要，grill ux手势」。

数学：smear 同族（survey 2026-09-05 表：源 = 固定偏移拷像素，不混），可作 smudge-engine 第四 mode（`source = offset`）。待 grill 的是 **UX 手势**：定源点（长按？Alt+点？单独「定源」钮？）、对齐/非对齐（源随笔走 vs 每笔重置）、跨图层取样（只当前层 vs 合成）、源点十字标显示；以及它挂在哪个工具位（§A.2 手指位长按？）。

## E. 滤镜笔间距的真正语义（user 反悔审查）

user 原话：「4 关于不走间距语义。主要是我刚反悔，我今晚刚说应该接，帮我看一下当时接的是什么。然后审查一下真正的语义是什么」。

**当时接的是什么（2026-09-05 晚早些时候）**：
- v0.13.3：出厂大/小滤镜笔 `spacingValue` 0.1 → 0.02（含未动过副本自愈），手指读 `bs.spacing`（2%）。
- v0.13.4：`filters.ts attachColorBrushBehavior` 的 `_colorBrushStamp` 间距从写死 0.06（v132 起误读不存在的 `spacingValue`）改成读 `ResolvedBrush.spacing` ——模糊/锐化从此跟笔的 2% 走：dab 数 ×3–5，实测 1000px 一笔大笔 4.7s。

**为什么「跟笔间距」对模糊是错的语义**：模糊/锐化每颗 dab = 对 dab 下方像素**再做一次**卷积并按 flow 混回；重叠 dab 不是「覆盖」而是**叠加滤波**——重复模糊 n 次 ≈ 一次 σ√n 的模糊。于是间距同时决定了**强度**（叠了几层）和成本，「强度」滑条与间距耦合，这就是「小间距 = 更糊 + 更慢」的病根；给它一个地板只是止血。

**真正的语义（提案，待 grill）**：模糊/锐化应当是 **wash 幂等**的——对笔迹扫过的区域**只算一次**滤波，用 dab 的 **max 覆盖 mask**（画笔 wash 模式 `buffer = max(buffer, α_dab)` 同款）合成回图层：`out = lerp(src, filter(src), mask·flow)`。这样：① 间距只影响 mask 边缘的平滑度，与强度解耦，可以放到 10–20% 甚至按 flush 一段一次；② 每次 flush 对 dirty 区域一次卷积，成本从 O(dab 数) 降到 O(面积)；③ 与 §C 的连续形式同一框架（一段 drag = 一次算）。锐化同理。「buildup」式（越描越糊）可以留作选项，但默认应是 wash。

## G. Wishlist（user 点名「肯定要」，不排期）

- **修图 / 贴图族**：仿制图章 → 修复画笔（克隆 + 泊松融合）→ PatchMatch 内容感知填充（Barnes 等 2009；PS CS5 同源）→ 无缝平铺 / 去接缝。
  品牌方向（user 2026-09-06）：「用算法干别人用 genai 干的活」。UX 手势（定源点）先照吸色语义：克隆子工具活着时长按 = 定源（pc 加 Alt 点）。
- **液化选区**：选区变换时周围像素随位移场平滑跟随不割裂。位移场 = 选区内刚体变换、外部按距离衰减 / 解拉普拉斯 / SDF 加权，一次重采样，与液化共用引擎。
  user 对 bouncy 与奇点存疑但「fun to explore」。等平流引擎落地后顺手。
- **抽象艺术纪元**（cel/anime 之后）：user 2026-09-06「血迹不一定要用吹画来实现，其实我说的就是普通的涂抹搅拌，做那种抽象画也会用到……
  现代抽象艺术这一套……油画，水彩，沙画，you name it……摆脱只能画二次元，不能做正经艺术，贴图，强纹理强材质工作流的污名」。
  没有可抄的 Procreate 方案、没有画这类的艺术家 grounding，「只能我们自己探索和 spiral」。入口 = §C 的平流引擎（泼溅 = 场驱动平流、搅拌 = 两色平流、吹画 = 气流场）。

## H. 混色的超越函数 → LUT 路线（考古 + 提案）

考古：抱怨在 `src/plugins/smudge-engine.ts:22`「每像素十几个超越函数，大笔会慢」，来源 `backend/algorithms/color-mix.ts`：
sRGB↔线性各一次 `pow`（去/重预乘路径）、OKLab 三个 `cbrt` 往返、颜料谱 WGM 每像素 10 段 `exp(u·log a + f·log b)`（:71）。是**超越函数**（transcendental functions）的调用成本，不是超越方程。

LUT 可行，三层，从便宜到贵：
1. **sRGB 传递函数**：输入 8-bit → 256 项精确表（`color-dist.ts` 已有正向）；线性→sRGB 用 4096 项 + 线性插值（误差 < 1/255）。零风险，立刻能做。
2. **状态存在混色空间里**：手指的记忆块（accum）本来就是持久状态——直接存成 log-谱（10 通道）或 OKLab，混合变成纯 lerp（log 域 lerp ≡ WGM），每 dab 只在**读画布**和**写回**各转一次。这是 Mixbox 的思路（RGB → 3D LUT → 4 个潜在颜料浓度，在潜在空间线性混，回 RGB 用固定多项式）。
3. **RGB → log-谱 的 3D LUT**：8-bit RGB 按 33³ 网格 × 10 通道 float32 ≈ 1.4MB，三线性插值 8 次查表，比 30 个超越函数便宜约一个量级；出口 `exp` 10 次可再用 1D 表。
GPU 化（survey §5 候选 B）后这些成本消失，但 CPU 原型阶段 1+2 值得先做——手指现在就在用谱混色。

## F. 曲线加权切线（已落地 v0.13.9，2026-09-06）

user 原话：「我记得unity里面手柄可以调长度？grounding一下」。Grounding：Unity 默认切线**非加权定长**（只能转）；每 key 右键 **Weighted** 后把手长度可拉，改变段内鼓起（Bezier 语义）。Blender F-curve 天生变长把手。落地：`Keyframe.inWeight/outWeight`（缺省无键 = 非加权定长）；段插值 Hermite → 三次 Bezier（w = 1/3 两侧逐位等价 Hermite；x(s) Newton 反求，三次代数方程；权重和钳 ≤ 1 防控制点交叉）；编辑器每 key「加权」钮、加权侧把手钮方形、拉长 = 改权重。烤 LUT 的消费者（调整曲线/压感）成本不变。
Sources: https://docs.unity3d.com/Manual/EditingCurves.html ；https://docs.unity3d.com/Packages/com.unity.timeline@1.8/manual/curves-tangents.html

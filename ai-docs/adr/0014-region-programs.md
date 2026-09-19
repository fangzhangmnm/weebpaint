# ADR-0014：区域程序（Region Programs）——手指 / 模糊 / 锐化统一为「对笔迹扫过的区域跑片元程序」，写靶 = RegionStroke 窄接口

> created 20260918 · 作者 Claude Fable 5.1（claude-fable-5-1）
> 状态：**已决定**（user 2026-09-18 逐条：「先做已有的的数学形式化，以后做创新。目的是一个很窄的gpu的接口加速」「逐 dab 精确翻译 同意」「模糊 / 锐化 wash 本轮顺路搬 yes」「显示走『overlay replace』也许可以」「『要求 floatColorBuffer + 一条 caps 守卫』定」「反正别叫Layer, brushlayer也改名，如果语义一样那么改一样的名字」）· 落地：dev v0.14.17（2026-09-18）
> 提案与数学：`ai-docs/20260918-region-programs-formalism-and-gpu-contract.md`（§1 统一方程、§3 接口、§3.4 精度契约、§3.7 浮点 FBO）。旧讨论：`20260905-grill-agenda-toolbar-smudge-routing.md` §C-补、总账 #1 / #42。

## 背景

2026-09-05 手指（smudge）以 CPU 原型落地（user「先 cpu prototype，然后看 gpu 契约的最小增加」），大手指 / 大滤镜笔的 B² 像素成本在 CPU 上不可接受（总账 #42；模糊笔 09-05 实测 1000px 一笔 4.7s）。09-06 §C-补 已论证：手指三 variant、模糊 / 锐化 wash、液化都是同一个方程 `out(x) = mix(src(x), Σ_k w_k·src'(x − d_k(x)), m(x))` 的特例。2026-09-18 user 拍板本轮范围：**只做已有工具的数学形式化 + 一个很窄的 GPU 接口做加速；血迹 / 拉花 / 吹画（#36）以后；离散化按逐 dab 精确翻译（手感不变）**。

同轮顺带的三个决定：`BrushLayer` / `SmudgeLayer` 同义改名 `StrokeTarget`（user「别叫 Layer」）；显示走 overlay replace；要求 `floatColorBuffer`。

## 决定

1. **区域程序 = 封闭枚举的片元程序**（`src/backend/gl/region-programs.ts`，`RegionProgramId`），每个名在 `soft-shaders.ts` 有逐行镜像的 CPU 孪生（ADR-0009 决策 5，缺 = `SoftGl2Port.program()` throw）。第一批 10 个（手指）+ 第二批 6 个（wash）。**只加不改**：连续形式（#1）= 新名 `advect-segment`，不改接口。
2. **RegionStroke = 一笔一个的窄服务**（`src/backend/gl/region-stroke.ts`）：构造时把叶 tile 整幅装进 **W**（doc 尺寸 straight u8 FBO；`snapshot:true` 再装一份 **W₀**），之后只有 `alloc / free / run / overlay / dispose`。`run(program, dst, textures, uniforms, scissor?, blend?)` 是唯一算子；dst 与采样源同一张 = throw。装载失败（显存不够、rec 不齐）= 构造 throw，**绝不带陈旧 W 起笔**（提交会整块替换叶像素）。
3. **显示与提交 = overlay 的第三成员**：`OverlayInput` 加 `kind:"region"`（W 当 overlay，doc 尺寸、ox/oy=0），合成 shader 加 `u_ovReplace`（bbox 内 = W 直值，bbox 外 = base；不是新 program 名，是现有 overlay program 的一个 uniform 分支，CPU 孪生同步）。预览零 CPU 往返；提交 = `RasterService.bakeStamps` 原封（GPU merge → `readPixels` dirty 矩形 → `applyRegionDiff` → GPU 收养）。否决：每帧 `readPixels` 回替身（GPU 停顿）、GPU-only 替身叶（多一个显示概念）。
4. **StrokeSession 第四种预览宿 `"region"`**：`deps.openRegion(leaf, {snapshot}) / setRegion / commitRegion`；end = commit → setRegion(null) → dispose；commit 返 false = 令牌取消 + throw `REGION_COMMIT_FAILED`（不静默丢一笔）；cancel = dispose 零回滚；openRegion throw = 令牌先收口再冒错（单令牌墙不卡死）。Filter 声明 `strokePreview:"region"`（+ `strokeSnapshot` 要 W₀）；液化仍 `shadow`。
5. **精度契约 = 逐 dab 精确翻译**：W straight u8（逐 dab 量化 = 旧 CPU `ImageData` 语义）；状态纹理（cur / mask / accum / release）f32（ρ≈1 时 f16 会冻住记忆）；混色三档 = `color-mix.ts` 原式（GPU 直接 pow，CPU 孪生 `mixPremultIntoExact`）。wash 的 coverage 存 doc 尺寸 u8 alpha（旧 CPU 是 f32，量化到 1/255 是唯一**有意**偏差）。
6. **验收 = 三方 golden，不靠真机手感**：旧 CPU 引擎删除前录 27 用例 fixture（`test/fixtures/smudge-golden.json`，git a700fad）；新引擎在 SoftGl2Port 上 ±2/255（实测 22 用例逐字节相同、5 用例各 2 字节差 1）；gl-smoke 真 WebGL2（SwiftShader）vs SoftGl 同驱动同输入 ±2（手指 max|Δ|=0、模糊 1、锐化 0）。**fixture 封存**：不许用新引擎重录来让测试变绿。
7. **要求 `caps.floatColorBuffer`**（EXT_color_buffer_float）：缺席 = 手指 / 模糊 / 锐化起笔 throw `REGION_NO_FLOAT_FBO`，错误信息附 caps 快照（状态栏 + 黑匣子 warning）。**不做 SoftGl 回退**（ADR-0009 决策 4：SoftGl 只在测试 / MCP；两 port 并用 = 数据跨界三接缝各两分支 = 双实现）；逃生口 = f32 打包 RGBA8，记录在案不做。app 此前累积器默认 u8，本轮是第一个浮点渲染目标。
8. **命名**：`StrokeTarget` = 一笔期间的像素写靶（运行时 = StrokeShadow 替身或 RegionStroke，**不是图层树节点**）；`beginBrushStroke(targets)`。program 名不得含浏览器词（backend 目录格律，`region-window` → `region-crop`）。

## 后果

- 手指 / 模糊 / 锐化的每 dab 成本从 CPU 上消失（B² 像素 → 4–13 个小 draw）；小手指 2% 间距的 draw 数与大手指的实际帧时待真机计时（总账 #72）。
- CPU 手指引擎与 filters.ts 的 CPU 分块 wash 删除；体重：src +1427 / −485（净 +942，其中 CPU 孪生 389 行 = ADR-0009 对表税、GLSL 506 行 = 16 个 program 本体）。提案里写的「净值 ≤ 0」没做到，实数如上。
- headless backend（MCP / node 全量）同一条路：`WeebPaintBackend` 的 deps 用同一个 GlRoom（缺省 SoftGl2Port 孪生跑）。
- 液化留在 CPU（第三批，AI 排期判断，待 user 一句话，总账 #71）；连续形式（#1）与抽象艺术（#36）接口已留门（`field` 纹理槽 / program 只加不改）。
- 新 program 的纪律：GLSL 与 `soft-shaders.ts` 孪生同 commit；`test/region-programs.test.mjs` 注册表全覆盖 + `test/smudge-golden.test.mjs` / `color-brush-*.test.mjs` 契约 + gl-smoke `regionParity`。

## 2026-09-19 补：首笔卡顿案（user 真机：「手指第一下会明显卡顿」）

根因 = `RegionStroke` 构造时同步编译全部 16 个 program（`program()` 的 LINK_STATUS 查询等驱动），加首张 doc 尺寸 FBO 分配。落地 v0.14.19（user「都做」）：
- **按需注册**：构造只注册 `region-load`，`run()` 到哪个 program 才注册哪个（只编当前 variant 要的）。
- **非阻塞预编译**：`Gl2Port.warmProgram?`（起编译+链接不查状态）+ `KHR_parallel_shader_compile` 的 COMPLETION_STATUS 空闲轮询收尾；无扩展时每拍最多同步收尾一个（把等待切碎）。`program()` 遇到预编译中的名当场收尾。
- **启动优先**（user「启动速度是更重要的。我不用photoshop不是因为subscription fee，而是bloatware启动非常慢」）：暖场只在 `board.setDoc` 之后的 `requestIdleCallback` 里跑，**不设强制 timeout**，每个空闲片起两个 program；Safari 无 rIC 退 setTimeout 分片。
- **预借 FBO 守卫**（user「预借再还 不会在小内存机器上惹麻烦可以试」）：池里已有同尺寸空闲件 = 空操作；池预算装不下 = 跳过；只在两者都过时预借一张 doc 尺寸 u8 再还回池。`Gl2Port` 加可选观测口 `fboPoolHas` / `fboPoolBudgetBytes`。

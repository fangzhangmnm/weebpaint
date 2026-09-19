# 区域程序（Region Programs）：手指族的统一数学形式 + 窄 GPU 契约提案

> 作者：Claude Fable 5.1（claude-fable-5-1）· created 20260918 · as-of dev v0.14.16 / 2026-09-18 · 状态：**提案已全部拍板（§4 四条），2026-09-18 开工**；实现中形状变了回写提案 .h。
> 提案 .h = `20260918-region-programs-proposal.d.ts`（同目录）；现状 .h = `api/`（v0.14.16 重生成，本文 §2 摘录）。
>
> 出处（user 2026-09-18 原话，本 session）：「convert the finger tools into GPU, perhaps use that fluid dynamics we proposed. first pick up our old discussion before taking actions」「以及对于血迹和拿铁拉花来说其实感觉现在也够用。先做已有的的数学形式化，以后做创新。目的是一个很窄的gpu的接口加速」「不过也不用把未来的脑洞堵死。总之答案就是half lagrangian?」「**逐 dab 精确翻译 同意**」「（增量 vs wash）这个是ux应该不动数学引擎」；第二轮：「模糊 / 锐化 wash 本轮顺路搬 yes」「显示走『overlay replace』也许可以」「缺席时手指族响亮不可用 咱们不是有cpu fallback吗？还是softgl vs gl只能用一个，两个都用会打架？这个会造成多大的架构混乱？」「**反正别叫Layer, brushlayer也改名，如果语义一样那么改一样的名字**」。
> 旧讨论：`20260905-grill-agenda-toolbar-smudge-routing.md` §C / §C-补 / §H；`20260905-smudge-math-survey.md` §5；`journal/20260905 v0.13 feedbacks.md`（user「连续形式：满想要的。还记得我们的血迹/拿铁提案吗？如果我们自己上semi lagrangian玩法的话，也是我们弯道超车procreate csp的好机会」「我审美上不喜欢落笔时模糊」）；总账 #1（平流引擎 [L] 待做）/ #42（手指 GPU 化候选 B [S] 等数据）。

## 0. 一句话

六个手指笔（手指 / 混合 / 手指绘画 / 模糊 / 锐化 / 液化）都是「对笔迹扫过的区域跑一个片元程序：读 ≤ N 张纹理、写一张目标」。把这件事做成 backend 的一个窄服务 **RegionStroke**（5 个动词：load / alloc / run / overlay / dispose；program 是封闭枚举，各带 CPU 孪生），手指三 variant + 模糊 / 锐化 wash 本轮按**逐 dab 精确翻译**搬上去（user 拍板），旧 CPU 手指引擎与 CPU 分块 wash 删除；写靶统一改名 `StrokeTarget`（user：别叫 Layer）；连续形式（#1）以后只是多一个 program 名，接口不动。「流体动力学提案」= semi-Lagrangian 平流（沿场回溯采样），仓里没有别的流体文档。

## 1. 数学形式化（五个 CPU 实现的原式，无近似）

### 1.1 统一方程

一笔的状态 = (W, S, aux)：
- **W** = 工作区域：图层在笔迹 bbox 内的像素，straight u8（与 tile 同格式）。W₀ = 起笔快照（只有 wash 类需要）。
- **S** = 随手指走的记忆（Lagrangian 状态）：块 A（B×B premult f32）与/或单色 ā。
- **aux** = 场 / 覆盖：液化位移场 d（RG f32）、wash 覆盖 c（r8）。

每一步（一颗 dab 或一段）对目标像素 x：

```
out(x) = mix( src(x),  Σ_k w_k(x) · src'(x − d_k(x)),  m(x) )      // mix 在混色空间里做（srgb / oklab / spectral）
```

- **src** = W（累加语义）或 W₀（wash 语义）。**「增量 vs wash」的全部差别就是这一个输入选哪张纹理**，program 不变（user：UX 决定，引擎不动）。
- **d_k** = 位移：整数窗口平移（手指三 variant）/ 位移场纹理（液化）/ 0（模糊锐化）。
- **w_k** = 采样核：δ / 3×3 盒 / nearest·bilinear·bicubic·B 样条。
- **m** = 手指触及量：falloff × 选区 × 强度（dab 制）或 max 覆盖（wash）。
- 记忆更新是同一方程的另一次调用：`A' = mix(A, W∘τ, 1 − ρ)`。

### 1.2 六个工具 = 一张参数表

| 工具 | src | d | w | m | 记忆 S | 现 CPU 代码 |
|---|---|---|---|---|---|---|
| 手指 smear | W | 整数窗口平移 τ_k（零重采样） | δ | M·s | A 块，ρ = (s³)^(step/D)；首 dab 只沾不放 | `plugins/smudge-engine.ts _dab` |
| 混合 dull | W | 同上 | δ（出料 = 常量 ā） | M·s | ā = mask 加权平均（归约） | 同上 `_weightedAverage`；dull∈(0,1) = k×k 加权降采 → 3×3 盒 → 双线性上采（`_multiRes`） |
| 手指绘画 paint | W | 同上 | δ | M·s | A 与 ā，ρ = exp(−(step/D)/L) | 同上；出料 lerp(P, 色, colorRate·p_c)，稀释 ×(1 − dil·(1 − ā_α)) |
| 模糊 | W₀ | 0 | 3×3 盒 × N（N = round(−amount/10) ≤ 10） | max 覆盖 | 无 | `plugins/sharpen-blur.ts bake` + `filters.ts attachColorBrushBehavior`（wash，v0.13.14） |
| 锐化 | W₀ | 0 | unsharp（盒 r = 1） | max 覆盖 | 无 | 同上 |
| 液化 | W₀ | 位移场 d(x)，逐事件累加 | nearest / bilinear / bicubic / B 样条 | 1（mask 进 d 的累加） | 无 | `plugins/liquify-engine.ts`（组 = 一个 d 逐叶重采样；B 样条预滤波是递归滤波，起笔 CPU 一次上传，transform 的 GPU warp 现在就这么干） |

表里每一格都是现有 CPU 代码的原式，**不需要数学近似**。数值差只有 f64→f32、sRGB LUT（层 1，误差 < 1/255）与归约的求和顺序。「模糊锐化有特化算法」= 它们的 w 是盒核而已，盒核同时就是 dull 中段的 3×3 那一趟，同一个 program。

### 1.3 两种离散化（user 09-18 拍板 (a)）

- **(a) 离散手指（本轮）**：沿路径每 spacing·D 放一颗 dab，每颗「沾 + 放」。单位长度的效果取决于每单位长度几颗 → 间距 / flowCoeff / 地板是补这个洞的旋钮，本轮**原样保留**（手感数字一个不动，#41 仍等 user 上手）。落笔第二颗 dab 就揉的老毛病本轮也保留。
- **(b) 离散时间（留 #1）**：两次指针事件之间手指扫过一段，一段一次场运算：`out(x) = ∫ K(ℓ) · src(x − ℓ·τ(x)) dℓ`，沿来路回溯距离 ℓ 取样，K 为指数记忆核（长度尺度由 strength 定），m = 手指在 x 上走过的距离。停着不动 = 回溯 0 = 什么都不发生（落笔不糊免费）；四个补洞旋钮退役；成本从 dab 数 × B² 变成扫过面积；手感变、要重钉；一段内自交的先后顺序要另外定义。**接口层留的门**：`run()` 的 inputs 里有 `field` 槽（位移场纹理），(b) = 新 program `advect-segment`，RegionStroke 一个字不改。血迹 / 拉花 / 吹画同理 = 换 field 的来源（#36，不在本轮）。

## 2. 现状（as-of v0.14.16，2026-09-18 勘探）

- **手指** = 纯 CPU（`src/plugins/smudge-engine.ts` 370 行，Filter 笔契约）→ 写 `StrokeShadow`（CoW `LayerPixels`）→ `board.setStrokeShadows` → `GlRoom.syncLeafSafe` 逐 tile 上传显示 → `StrokeSession.end()`：`shadow.commitTo(layer)` 在令牌内。液化同形。模糊 wash = `filters.ts attachColorBrushBehavior`（CPU 256 分块，起笔快照 + 覆盖 max + flush 一次烤）。
- **ADR-0009**（`adr/0009-gl2port-and-determinism.md`）：决策 4 = SoftGl2Port 只在测试 / MCP，**用户 runtime 无 WebGL2 照旧响亮失败，没有 CPU 回退**；决策 5 = 每个 program 名登记 CPU 孪生（`soft-shaders.ts resolveCpuProgram`，缺 = `program()` throw；孪生逐行镜像 GLSL，NEAREST+CLAMP、片元中心 +0.5、u8 目标逐写量化，三方 golden ±ε）；决策 6 = preview 零保证、commit 才保证；后果 =「热路径栅格只准走 Gl2Port，新独立 CPU 像素算法 = user consent」。09-05 的 CPU 手指是 user 批的「先 cpu prototype」例外，本轮是回归规则。
- **GL 已有**：印章 `gl-stamp.ts`（只写 颜色×形状α，不读画布）；warp `gl-compositor.ts WARP_FRAG / WARP_BAKE_FRAG`（homography `mat3 u_Hinv`，读上传平面，采样块 `WARP_FUNCS` 有 nearest / bilinear / bicubic / B 样条）；overlay 合成分支 `blend-glsl.ts`（bbox 尺寸纹理、`u_ovOrigin/u_ovSize`、selMask dst-in、lockAlpha 真 atop、erase、brush blendMode）；写回链 `raster-service.ts bakeStamps`（composite base⊕overlay → `readPixels` → `applyRegionDiff` → `pool.copyBatchFrom` → `bridge.registerPair` → `index.rebuild` → `invalidateTree`）。`OverlayInput = StampOverlayInput | FillOverlayInput`（union 已为长大而设）。
- **GL 没有**：读图层的 shader；位移场纹理；跨 dab 的持久 GPU 状态（overlay 每帧从 stamp 列表重画，`PooledFBO` 借还制，但 `_overlayOwnedFBO` 已有「持有一张借的 FBO」先例）；「图层 L 的矩形 R → 纹理」函数（只有 `sampleTiled(u_srcIndex, u_arr)` 在合成 shader 里）。tile = 256，straight RGBA8；`readPixels` 只出 RGBA8。
- **测试底座**：`npm test`（快层，SoftGl 单测）；`test:full` = + 全量画作 round-trip + `smoke`（Playwright + SwiftShader 真 WebGL2，golden `test/gl-smoke/goldens.json`）。手指现有 `test/smudge-engine|smudge-wet|smudge-plugin|smudge-rack.test.mjs`。

### 2.1 现状 .h 摘录（api/，v0.14.16）

```ts
// api/src/plugins/smudge-engine.d.ts
export interface SmudgeLayer { docW; docH; getImageData(docX, docY, w, h): ImageData; putImageData(docX, docY, img): void; }
export interface SmudgeSelection { materializeMaskRegion(x0, y0, w, h): Uint8Array; }
export type SmudgeMode = "smear" | "dull" | "paint";
export interface SmudgeSettings { mode; dull; size; hardness; spacing; strength; sizeCoeff; flowCoeff; opaCoeff; pressureGamma; pressureCurve?; colorRate; dilution?; memoryLength?; color; mix: MixSpace; lockAlpha; }
export declare class SmudgeEngine {
  beginStroke(layer: SmudgeLayer, settings: SmudgeSettings, x, y, pressure, selection: SmudgeSelection | null): void;
  extendStroke(x, y, pressure): void; endStroke(): void; cancelStroke(): void; flushDirty(): Rect | null;
}
// api/src/filters.d.ts（Filter 笔契约，filter-brush.ts 薄 delegate）
beginBrushStroke?(layers: readonly BrushLayer[], params, brushSettings, selection: BrushSelection | null, x, y, p): ColorBrushState;
extendBrushStamp?(state, x, y, p): void; endBrushStroke?(state): void; flushDirty?(state): DirtyRect | null;
export interface BrushLayer { bboxX; bboxY; bboxW; bboxH; getImageData(...); putImageData(...); }
// api/src/backend/stroke-session.d.ts
export type StrokePreview = "overlay" | "livesync" | "shadow";
export interface StrokeSessionDeps { begin(historyType): WriteToken; tokenChanged; tokenBeforeImage; getSelection; commitStamps(cs): boolean; invalidate(); setShadows(entries): void; }
// api/src/backend/gl/gl-room.d.ts
export type OverlayInput = StampOverlayInput | FillOverlayInput;
// api/src/backend/gl/raster-service.d.ts
bakeStamps(leafId, pixels: LayerPixels, ov: OverlayInput, docW, docH, apply): boolean;
// api/src/common/gl2-port.d.ts（不动）
program(name, vert?, frag?); borrowFBO(w, h, prec?: "u8"|"f16"|"f32"); returnFBO; clearFBO; draw(spec: Gl2DrawSpec); readPixels(src, x, y, w, h): Uint8Array; createTexture; uploadTexture(tex, "rgba8"|"rgba16f"|"r8"|"r32f", w, h, data); caps.floatColorBuffer;
```

## 3. 提案：RegionStroke（窄接口）

### 3.1 形状：5 个动词，1 个算子

```
RegionStroke（src/backend/gl/region-stroke.ts；一笔一个；持有自己借的 FBO，dispose 归还）
  constructor(room: GlRoom, leafId, pixels: LayerPixels, docW, docH, selMask)
  load(rect)                            // 扩工作区域 W（只扩不缩，夹 doc）：图层 tile → W（program region-load）；需要 W₀ 的 program 首次 run 时同步扩
  alloc(w, h, prec, fmt): RegionTex     // 状态纹理：A（rgba f32）/ ā（1×1）/ d（rg f32）/ c（r8）
  run(program: RegionProgramId, dst: RegionTarget, inputs: RegionInputs, uniforms)   // 唯一算子；dst 可带 scissor（窗口写）
  overlay(): RegionOverlayInput         // 显示 + 提交共用：W 当 overlay，ovMode = "replace"
  dispose()
```

`RegionInputs` 的 key 是封闭的：`W | W0 | cur | mask | accum | accumColor | release | field | coverage | selection`。`field` 就是给 (b) / 远景留的槽。program 枚举**只加不改**：

| 批 | program | 读 | 写 | 用途 |
|---|---|---|---|---|
| 1（本轮） | `region-load` | 叶 index+arena（straight u8） | W 矩形 | 图层 → 工作区域 |
| 1 | `region-window` | W | cur（B×B premult f32；doc 外 = 0） | 每 dab 的「读块」 |
| 1 | `smudge-mask` | selection | mask（B×B f32） | falloff × 选区（与 gl-stamp 同式） |
| 1 | `smudge-absorb` | cur, accum | accum'（同尺寸 ping-pong） | A' = mix(cur, A, ρ)，doc 外不沾 |
| 1 | `reduce-weighted` | cur, mask | k×k（premult 加权和 / 权重和） | ā、稀释的 ā_α、多分辨率的 k×k 格；两级（B→16×16→1） |
| 1 | `box3` | 任意 | 同尺寸 | dull 中段的 3×3 盒；第二批的模糊 ×N 同一 program |
| 1 | `upsample-bilinear` | k×k | B×B | 多分辨率出料回放 |
| 1 | `smudge-deposit` | cur, mask, release/accum/accumColor | W 窗口（scissor，straight u8） | mix(cur, P, M·s) 三混色空间 + 掺色 + 稀释 + lockAlpha + premult→straight 量化 |
| 2（本轮，user 09-18 yes） | `wash-coverage` | coverage, mask | coverage'（max） | 模糊 / 锐化 wash |
| 2 | `unsharp` | W₀ | 临时 | 锐化 |
| 2 | `wash-lerp` | W₀, baked, coverage | W | flush 一次烤（预览每帧也烤得起） |
| 3（另案） | `disp-accumulate` / `warp-disp` | field / W₀, field | field' / W | 液化搬家 |
| 远景 | `advect-segment` | W, field | W | 连续形式 #1 |

### 3.2 显示与提交 = overlay 的第三种成员（零新概念）

`OverlayInput` 加 `RegionOverlayInput { kind: "region"; tex; layerId; bx; by; bw; bh; selMask: null }`；`blend-glsl.ts` overlay 分支加 `ovMode = "replace"`（bbox 内 result = overlay 直值，bbox 外 = base；不裁 selMask，选区已在 `smudge-mask` 吃过）；`composite:<mode>:overlay:replace` 进 soft-shaders 表（现有 `makeComposite` 参数化，一条分支）。

- **预览**：每帧 `room.setStampOverlay(region.overlay())` → 现有 overlay pass。**零 CPU 往返**，W 就是那张纹理。
- **提交**：`StrokePreview` 加 `"region"`。`StrokeSession.end()` → `deps.commitRegion(ov)` = `RasterService.bakeStamps` 原封不动（merge 用 replace；`readPixels` → `applyRegionDiff` → `copyBatchFrom` → `registerPair` → `index.rebuild`），在令牌内。取消 = `dispose()`，真层从未被写，零回滚（同 shadow）。
- **否决的替代**：(A) 每帧 `readPixels` 回 StrokeShadow 再走 shadow 路——GPU 管线停顿，热路径先糊后修（家规 ✗）；(B) GPU-only 替身叶——要绕 bridge 造 LeafRec，多一个显示概念 ✗。

### 3.3 手指引擎搬家（精确翻译）

`SmudgeEngine` 的公共面**不变**（`beginStroke / extendStroke / endStroke / cancelStroke / flushDirty`；`SmudgeSettings` 字段一个不改 → 手感数字不动）；只有 `SmudgeLayer` 换成 `RegionStroke`。每 dab（顺序 = 现 `_dab` 的 1)–4)）：

1. `run(region-window)`：W 窗口 → cur
2. `run(smudge-mask)`：falloff × 选区 → mask
3. 记忆：smear → `run(smudge-absorb)`；dull / paint → `run(reduce-weighted)` 两级 → ā' = mix(avg, ā, ρ)（1×1 一趟）；dull 中段 → reduce k×k → `box3` → `upsample-bilinear` = release
4. `run(smudge-deposit, dst = W 窗口)`

约 4（smear）～ 8（dull 中段）draw / dab。2% 间距、D = 32 的 1000 px 一笔 ≈ 1560 dab ≈ 6k–12k draw，摊到指针事件上每事件几十个 draw（估 1–3 ms，**待实测**）；D = 400 的大手指 ≈ 125 dab，GPU 上从「不可接受」变成免费，这是本轮的目标场景（#42「大笔真卡」）。Filter 契约两处小改：① **写靶改名**（user 09-18「反正别叫Layer, brushlayer也改名，如果语义一样那么改一样的名字」）——`filters.ts BrushLayer` 与 `smudge-engine.ts SmudgeLayer` 语义相同（一笔期间的像素写靶，运行时都是 `StrokeShadow` 替身，不是图层树节点），合并为一个 `StrokeTarget`（字段取并集：`docW / docH / bbox 四值 / getImageData / putImageData`），`beginBrushStroke` 的参数 `layers` → `targets`；`RegionStroke implements StrokeTarget`（bbox 与 docW/H 真值，两个 ImageData 方法是 readPixels / upload 慢路径，只给液化并存期，手指与 wash 不调）。② Filter 声明预览宿 `strokePreview?: "shadow" | "region"`（缺省 shadow = 液化现状；手指 / 模糊 / 锐化声明 region），`input._beginFilterBrush` 据此建 StrokeSession。`plugins/smudge.ts` 只换引擎构造。

### 3.4 精度契约（「精确翻译」的定义）

- **W = straight u8**：= CPU `ImageData` 的逐 dab 量化语义（读转 premult、写转回 straight、每 dab 量化一次），同时正好是 overlay / `readPixels` / tile 的格式，边界零转换。
- **A、ā、cur、mask、release = f32**：CPU `Float32Array` 同精度。ρ 接近 1 时每 dab 增量 ≈ 0.6%，f16 的 10 位尾数会把记忆冻住，**不用 f16**。要 `caps.floatColorBuffer`（EXT_color_buffer_float；iOS 15+ WebGL2 有，待核 Quest / 老 Android）。缺席 → 手指族响亮不可用（同 ADR-0009 决策 4 精神；见 §4 问 3）。
- **混色空间**：shader 里就是 `color-mix.ts` 的原式（GPU 直接 pow / cbrt / exp，不需要 §H 的 LUT 层 2/3；层 1 的 4096 段 LUT 是 CPU 孪生用的现状，GPU 用精确 pow → 差 < 1/255，进 ±ε）。CPU 孪生复用 `color-mix.ts` 函数本体（一份实现，两处消费，防漂移）。
- **确定性**（ADR-0009 决策 6）：手指 = 「GPU 写真相 op 发结果」一类（同笔画 / transform），preview 零保证，commit 载荷 = 结果像素。

### 3.5 验收 = 三方 golden，不靠真机手感

1. 删旧引擎**之前**，用旧 CPU `SmudgeEngine` 录 golden 夹具进 `test/fixtures/smudge-golden/`（新建目录）：若干笔 × 三 variant × 三混色空间 × {选区, lockAlpha, doc 边界, 首 dab, dull 中段, 稀释}。
2. 新引擎在 SoftGl2Port 上跑同夹具 → **±2/255**（差异来源只有 f64→f32、sRGB LUT vs pow、归约求和顺序；超出 = 翻译错了，不是调参）。
3. gl-smoke（SwiftShader 真 WebGL2）跑同夹具 → 对 SoftGl ±ε（ADR-0009 三方 golden）。
4. 现有 `smudge-*.test.mjs` 改指新引擎（SoftGl2Port 驱动）；`test/soft-gl2-port.test.mjs` 加新 program 名的对表条目（缺孪生 = throw 红）。
5. 性能：draw 数上限估算写进 doc + 真 Chrome 一次计时（我这边 WSL 能否起真 GPU 待核；不能 = 记入真机批，**是数字不是手感**）。
6. 无头 UI 探针：进手指 → 画一笔 → 切回，现有 `tmp/smudge-ui-probe.mjs` 形制。

### 3.6 体重

删：`plugins/smudge-engine.ts`（370 行）；第二批（本轮）：`filters.ts attachColorBrushBehavior` 的 CPU 分块 wash（约 200 行）+ `sharpen-blur.ts bake` 的 CPU 盒滤波。加：`backend/gl/region-stroke.ts`、`backend/gl/region-programs.ts`（GLSL）、`soft-shaders.ts` 孪生、`plugins/smudge-engine.ts` 新体、`blend-glsl.ts` replace 分支、`stroke-session.ts` region 预览、`gl-room.ts` overlay 第三成员。净值目标 ≤ 0（交付时回填实数，家规「承诺了重构就交付体重变化」）。

### 3.7 浮点 FBO 缺席：为什么不用 SoftGl 当回退（user 09-18 问「咱们不是有cpu fallback吗？还是softgl vs gl只能用一个，两个都用会打架？」）

事实（2026-09-18 查码）：`shell/gl-board.ts` 建 GlRoom 没传精度，累积器默认 **u8**；runtime 没有一处 `borrowFBO` 要 f16/f32 → **app 现在不依赖浮点渲染目标，手指 f32 状态是本仓第一个**。`caps.floatColorBuffer` = `EXT_color_buffer_float`（`browser-gl2-port.ts:168`）。

- **没有 runtime CPU fallback**：ADR-0009 决策 4 把 SoftGl2Port 限定测试 / MCP，维持「CPU 性能不可接受」原判——无 WebGL2 = 整个 app 响亮失败。08-08 user 要的「cpu fallback 必须非常克制，只是对 gpu 的一个翻译，用 gpu 的接口做」就是 SoftGl2Port，只是没接成用户路径。
- **两个 port 同时用不打架的是代码，打架的是数据**：SoftGl 的 FBO 是 JS typed array，真 GL 的是显存纹理，每次跨界 = 上传 / 回读。手指跑 SoftGl、画板跑真 GL ⇒ 装载 W 从 LayerPixels 而非 arena、显示每帧上传字节（= 今天的替身路）、提交走 putImageData：**三个接缝各两条分支 + 每笔选 port** = 正是要杀的双实现。且 SoftGl 是逐片元 JS 闭包的迂腐模拟器，比手写 CPU 循环慢（估几倍，未测）——当性能回退是负价值。
- **真要无浮点路，正解 = f32 打包进 RGBA8**（4 字节编码 / 解码，只碰记忆相关三个 program，CPU 孪生镜像同一打包）：一条代码路走遍所有 WebGL2 设备，不是架构分叉。记录在案当逃生口，**本轮不做**。
- 覆盖面：每个有 WebGL2 的浏览器都带该扩展（Chrome 57 / Firefox 51 / Safari 与 iOS 15 起）；iPad / Quest / 桌面在内；剩余风险 = 老 Android GPU（待核）。
- **已定（user 09-18「『要求 floatColorBuffer + 一条 caps 守卫』定」）**：缺席 → 手指 / 模糊 / 锐化动词提示「此设备不支持」，守卫触发时黑匣子记一条 caps 快照（真实覆盖面从用户数据来）。可能不支持的设备（AI 记忆，未查证）：本来就没 WebGL2 的（iOS ≤ 14、老 macOS Safari、Mali-400 代）今天已失败，非新损失；有 WebGL2 但只渲半浮点的 2013–2016 安卓 SoC（Adreno 3xx、PowerVR SGX 544 / G6xxx、Vivante GC；Mali T6xx/T7xx 待核）是新损失；iPad / iPhone（iOS 15+）、Quest、近十年桌面 GPU、SwiftShader 不受影响。

## 4. user 已答 / 待答（2026-09-18）

| 问 | 答 | 落成 |
|---|---|---|
| ① 模糊 / 锐化 wash 本轮顺路搬？ | **yes** | §3.1 第二批入本轮；§3.6 体重含 CPU wash 删除 |
| ② 显示走「overlay replace」？ | 「也许可以」 | 按此做；它是一条 ovMode 分支，随时可撤（替代 A/B 否决理由在 §3.2） |
| ③ 浮点 FBO 缺席时手指族响亮不可用？ | user 问了 SoftGl 回退（§3.7 已答）；「app 已依赖浮点 FBO 就不做 fallback」——事实是**不依赖** | **定**（user「『要求 floatColorBuffer + 一条 caps 守卫』定」）：逃生口 = RGBA8 打包记录在案不做；设备面见 §3.7 |
| ④（user 追加）写靶别叫 Layer，BrushLayer 也改，语义一样就同名 | 指令 | §3.3 ①：`BrushLayer` + `SmudgeLayer` → `StrokeTarget` |

## 5. 不做 / 留门

- 不做：连续形式（#1，(b)）、抽象艺术纪元（#36）、增量 / wash 的 UI 暴露（UX 轮）、手感数字改动（#41）。
- 液化 GPU = 第三批，**AI 的排期判断，不是 user 决定**（09-18 user 问「这个是什么意思」：09-05 的「液化=CPU 已答」只是「液化走 CPU 还是 GPU」这个问题答过了 = CPU，本文初版误引为拍板，已改）。排后的原因：组液化一个场 N 叶、B 样条预滤波起笔上传、选区 bleed 三模式 march 现在每事件 CPU 算——三件都要接，且 CPU 液化不卡手感（R=60 ≈ 16 ms/事件；R=300 数百 ms，**也值得搬**）。建议本轮立住 RegionStroke + golden 后，下一轮同接口搬；user 要本轮做则排在 wash 之后。
- 留门：`inputs.field` 槽；program 枚举只加不改；`RegionStroke` 与 Filter 契约的接缝 = `BrushLayer` 面，CPU 滤镜笔和 GPU 手指并存期不打架。
- 收官动作：总账 #42 → done、#1 指针回写本文 §1.3(b)、ADR（`adr/0014-region-programs.md`）在 user「没问题」后立，`StrokeTarget` 改名随源 commit 一起落（含 `filter-brush.ts` 注释与 `stroke-session.ts` 的 `targets` 注释），API .h 重打。

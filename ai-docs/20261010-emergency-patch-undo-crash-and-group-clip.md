# 2026-10-10 真机问题报告与应急处置：撤销崩溃（历史清空）/ 剪切蒙版对图层组无效

> created 20261010 by Claude Opus 5.5 · as-of v0.14.24 / 2026-10-10
> 待办：剪切蒙版这条 = 总账 #79（待拍板）；**Fable 复审本次应急补丁** = 总账 #80（user 2026-10-10「下周记得提醒我让fable好好看一下」）。

## 0. user 原话（本次会话，按时间）

- 「weebpaint: 紧急查错，取消选区为什么没了，还是一开始就没有？我现在ipad上版本是0.14.23，还是我版本错了？」
- 「然后图层各上下文的菜单折叠也高度不对」
- 「还有一个问题。图层组对剪切蒙版无效，为什么，之前的设计应该是图层组逻辑上就是一个图层」
- 「然后图层组操作和split colors to layers之后出了undo unrecoverable undo expection history reset. error layertiles: layer gone at undo swap layerid=26 stack order bug，我马上发你一下log」
- 「先把这两次问题报告和你的处置存一下ai docs然后这个应急Patch推dev，下周记得提醒我让fable好好看一下」

user 发来的诊断日志（iPad，dev v0.14.23，standalone）里与本案相关的只有两行：

```
10-10 22:20:22.166 E [undo] unrecoverable undo exception; history reset (view rebuilt from current doc state): Error: LayerTiles: layer gone at undo swap (layerId=15 — stack-order bug)
10-10 23:16:47.821 E [undo] unrecoverable undo exception; history reset (view rebuilt from current doc state): Error: LayerTiles: layer gone at undo swap (layerId=26 — stack-order bug)
```

日志没有记操作序列，以下复现全部是在 node 里用真 workpiece + 图层门面（`LayersFace`）自己构造的。

---

## 1. 撤销崩溃，整个撤销历史被清空（已修，v0.14.24）

### 症状
做完「按颜色拆分」（split colors to layers），或对**有内容的**图层组做「合并为图层」之后，撤销一次 → 报 `LayerTiles: layer gone at undo swap` → History 走不可恢复路径：**整栈清空**，画面按当前文档重建。

**画没丢**：同一步里图层树那半已经先撤回去了（原层 / 原组回来），像素是一致的；丢的是**全部撤销 / 重做历史**。

### 最短复现
`explodeLayer(1, 两片) → undo` 一次就炸；`addGroup → moveIntoGroup → collapseGroup(有合成字节) → undo` 同样。盖印全部 / 向下合并 / 复制层 / 空组合并不炸。

### 根因（一句话版）
这两个操作都是「先往一块**新建**的像素里写内容，再把它挂成新图层」；撤销系统把这次写入误记成「对新图层的像素修改」，而且排在「新建图层」那条记录前面。撤销倒着放：先撤掉新图层，再去还原它的像素 → 层已经不在 → throw。

### 根因（机制版）
- 撤销一步（`UndoStep`）= 每个被写过的组件一条记录，**顺序 = 本令牌内各组件第一次被写的顺序**（`workpiece.ts` `_commitToken` 按 `_touched` 封口）；undo 倒序回放（`undo-stack.ts`）。
- 像素组件 `LayerTiles` 是**写时扣押**：令牌开着时任何 `LayerPixels` 的 tile 换手都会被观察者收下；**无主实例**（还没入册的临时像素块）也照收，封口时如果查不到它属于哪一层就作废（`layer-tiles.ts` 头注）。
- `LayerTree.explodeLeaf`（`layer-tree.ts` 按颜色拆分）与 `collapseGroupToLeaf`（组合并为图层）都在令牌里 `new LayerPixels` → 先 `applyRegionDiff` / `putRegion` 写内容（此刻无主，被扣押，`layerTiles` 先被登记 touched）→ 再 `createTileset` 入册 → `_swapRoot` 挂树（`layerTree` 后登记）。
- 封口时这块像素已经挂上树，`findLayerIdByPixels` 解析到新 layerId → step = `[layerTiles(新层), layerTree]`。undo 倒序 = 先撤树（新层消失）→ 再撤 tiles → `getPixels(新层)` = null → throw。
- `resizeAllLeaves` 的注释里早就写过同一颗雷（「新实例的 putRegion 若被写时扣押，seal 时已装上树会解析到 layerId → 双记账…炸 undo」），那里靠 `_suspendCollect` 挂起收集；`duplicateTileset` 也挂了。拆分和组合并没挂。

### 为什么测试一直是绿的
`test/workpiece-layer-tree.test.mjs` 本来就有「explodeLayer → undo 原叶回来」用例，它每次都在撞这个错；但 `mk()` 的 `onUnrecoverable` 只计数、该用例没断言计数为 0，而树账先撤完了，「回到单叶、像素还在」的断言恰好都对 → 假绿。全量测试临时打标记扫过：修前全套只有这一处在静默撞「layer gone」，另一处是 history 测试故意制造的「swap boom」。

### 修法（`src/backend/workpiece/layer-tiles.ts` `createTileset`，+11 行）
新 tileset 入册 = 新实例的出生点：入册时把该实例在本令牌里被暂扣的写**全部作废**（释放句柄、删出 `_collected`）。它在这一步之前不存在，「之前」由树账表达，不该再有一份 tiles 账。
- 一处兜住两个调用点，也兜住以后任何「先写新块再入册」的写法，不靠各调用方记得挂起收集。
- 前提：`createTileset` 只接新建实例。全部调用点已核（`painting-workpiece.ts` 初始层 / load、`layer-tree.ts` 五处、`duplicateTileset`），都是 `new LayerPixels`。

### 验证
- 最短复现全部通过；拆分、组合并为图层撤销 / 重做后像素正确。
- 临时随机压测脚本（15 种结构 / 像素操作随机序列，撤到底 + 重做到底来回两轮）：修前 280/300 组炸；修后 5 个种子 × 300 组 × 30 步 = 1500 组 0 失败；再加「撤到底 = 初态、重做到底 = 终态，结构 + 每叶像素逐字节」校验，800 组 0 失败。
- 反向对照：撤掉修复，下面 4 条测试变红；加上修复全绿。
- `npm test` 1460 绿（6.5s），`tsc --noEmit` 过。

### 新增 / 改动的测试
- `test/workpiece-layer-tree.test.mjs`：`mk()` 的不可恢复改为**直接抛**（本文件没有故意触发不可恢复的用例）；explode 用例补 redo；新增「explode 的 step 只有树账」「collapseGroup 有合成字节 undo/redo」。
- `test/layer-ops-undo-fuzz.test.mjs`（新）：固定种子 80 组 × 25 步，撤到底回初态、重做到底与终态逐字节一致、来回两轮、零不可恢复（~180ms）。

### 残留风险（给 Fable 复审，见 §4）
step 的回放顺序取决于「组件第一次被写的顺序」，而每个组件一步只有一条记录——同一步里如果是「**先改已有层像素 → 再建新层 → 再写新层**」，step = `[layerTiles(旧层+新层), layerTree]`，undo 照样炸（实测确认，修复后仍炸）。现行代码里会把多个动作并成一步的路径（导入图片、选区移到新层，都是 `checkpoint:false` 聚合）都是「先建层再写」，实测不炸；所以**当前已知路径安全，但这是结构性的顺序依赖**。

---

## 2. 剪切蒙版以图层组为底时不裁（未修，总账 #79 待拍板）

### 设计（ADR-0002，2026-06-14 user 同意）
组**可以当剪切层，也可以当剪切的底**（PS 不支持剪贴一个组，CSP 支持；我们偏 CSP）。user 这次的说法「图层组逻辑上就是一个图层」与之一致。

### 现状
- 给组本身开剪切、裁到它下面那一层（组 = 剪切层）：**正常**。
- 在组上面放一层并开剪切（组 = 底）：**不裁**，剪切层整层照画。穿透 / 正常两种组模式都一样。

### 原因
GPU 渲染规划 `src/backend/gl/render-plan.ts` `unitsOf`：

```ts
const clipBaseId = base && base.kind === "leaf" ? base.id : null;
```

底解析（`resolveBases`）认得组，但交给执行层时只传叶子 id，底是组 → `clipBaseId = null` → 不带蒙版画。这行最早出现在 2026-06-27 `8757ffe`（GL Stage 2，组隔离 / 穿透），7-22 S7b 重写原样继承；旧 CPU 合成器（现在留作 `test/gl-smoke/reference-2d.ts` 参照）是支持组当底的。测试只验了「组能被认作底」（`gl-compose-plan.test.mjs` / `layer-composite.test.mjs`），没验 GPU 真按组去裁，所以一直没发现。

### 实测
直接调 `buildPlan`：`[叶1, 剪切99]` → 剪切层 `clipBaseId=1`；`[组5{叶1}, 剪切99]`（穿透或正常）→ `clipBaseId=null`。

### 修法提案（未动手）
底是组时，把该组**单独合成一张整幅纹理**当蒙版（隔离合成到透明底，取 alpha）。着色器已有「采整幅 2D 纹理当剪切蒙版」的通路（`u_clipMode=1`，原本给「边画边裁」的 live merged 基底用）。要动：规划给组底一个新字段 + 动态传染（组里任何叶在变，剪切层都不能进缓存）、执行器现算 / 缓存这张纹理、导出路径同一套（会一起修好）、补 GPU 对拍 golden。
**视觉影响**：已在组上开了剪切的老画，修完会变成裁过的样子（本来就该这样，但看上去会变）。体量中等，一个 session。

---

## 3. 同批顺手（与上面两件无关，记一笔）

- **图层 ＋ 菜单被拉到屏底（已修，v0.14.24）**：`styles.css` `.layer-add-popup` 残留 v267 的 `position:absolute; bottom:48px`（那时菜单嵌在面板里贴底栏往上弹）。2026-09-02 C1（v0.12.23）菜单搬到 body、坐标改由 `positionPopup` 写 inline `top` 后没删 → 上下同钉、拉伸到「视口底 − 48px」。headless 量：5 项菜单竖屏 749px / 横屏 389px → 修后都 160px。全仓扫所有菜单类元素的 computed `bottom`，只此一处残留。图层面板其余弹层（⋯ 菜单、调整弹层、混合模式下拉、移入组下拉）量过正常。
- **取消选区「没了」（未复现，不是回归）**：0.14.23 = dev 最新、prod = 0.14.20，两版之间选区条零改动。headless iPad 三尺寸实测：有选区时在选区条最右端，其他工具下条缩成只剩它。看不到它的既有情形：无选区；进「变换」那一刻选区就被清（`floating-transform.ts:276` 注释「UX 待人类拍板」），应用后也无选区；吸色 / 编辑消失点时整条让位；分屏半宽 + 魔棒时条超宽、取消钮被挤出右边要横滑。等 user 说当时场景。

---

## 4. 给 Fable 的复审清单（总账 #80）

1. **`createTileset` 入册即作废暂扣**——语义对不对、有没有漏掉的入册路径；和「调用方各自 `_suspendCollect`」相比哪个更该是规矩。
2. **step 回放顺序的结构性依赖**（§1 残留风险）：「先改旧层 → 建新层 → 写新层」同一步仍会炸。要不要从结构上消掉（例如 tiles 账永远在树账之后撤、或封口时丢弃本令牌新出生层的 tiles 记录、或 step 按写入时序分段），还是维持「聚合路径必须先建层」的调用纪律 + 守卫测试。
3. **还有 5 个测试文件把 `onUnrecoverable` 接成空函数 / 只计数**（`doc-mergedown-clip` / `layer-cap-budget` / `undo-stack-integrity` / `float-ops` / `selection-preview`）。本次全量扫过，现在只剩故意的「swap boom」；但它们结构上仍能吞掉真错，要不要统一改成默认响亮失败、故意测不可恢复的用例显式声明。
4. **#79 组当剪切底**的实现方案（§2），等 user 拍板后做。
5. （顺带）进变换即清选区的 UX（注释里挂着「待人类拍板」）。

## 5. 产物

- 分支 `fix-20261010-batch` → 合入 main 推 dev，版本 v0.14.24。提交：`1419c67`（＋ 菜单）、`1896d18`（撤销崩溃 + 测试）、`d0d9928`（总账 #79）、本 doc + 总账 #80、版本与 bundle 提交。
- 本次 session 的临时脚本（压测 / 探针）在后台任务的 tmp 目录里，任务删除即清；需要的形状已经固化进上面两份测试。

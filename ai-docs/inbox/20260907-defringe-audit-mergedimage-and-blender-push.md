# 便条：优先检查——导出 PNG / .ora mergedimage.png / Blender push 是否都默认 defringe（2026-09-07）

> created 2026-09-07 by Claude Fable 5.1（家族根目录 session，user 授意：「说到matte paint, 你帮我weebpaint写一个note让下一个agent捡起来的时候优先检查一下是不是导出和存ora的combined.png都默认defringe了」）
> as-of v0.3.438 / 2026-09-07 · **本便条只有静态读码（grep + 读源），一行测试都没跑**——下面标 ✔/✘ 的是「代码写的是什么」，不是「实机验过什么」。
> 背景：user 在 CatsUp 侧要做 matte painting / 贴图（N64 风低模地形，见 `../20260627 CatsUp/ai-docs/20260906-ledger-next-agents.md` E14），WeebPaint 出的透明 PNG 会被 3D 引擎 bilinear/mipmap 采样——α=0 处 RGB 不回填就渗黑边。defringe 的 why 与算法见 `src/backend/algorithms/defringe.ts` 头注释。

## 静态读码结论（下一个 agent 先把这四条验成 done / 打脸）

| 路径 | 代码位置 | defringe？ |
|---|---|---|
| 导出菜单 PNG → 文件 / 云盘 / 剪贴板 | `src/export-import-menu.ts` 202/212/228/236 传 `desk.export.defringePng`；产品默认 `true`（`src/workbench-state.ts` 142，#8 user 2026-08-23「png导出默认defringe」） | ✔ 默认开（静态） |
| **.ora `mergedimage.png`**（Ctrl+S / autosave / 导出 .ora 同源） | `src/backend/weebpaint-backend.ts` encodeOra：`this._compositor(...)` 裸合成字节 → `src/backend/ora.ts` encodeDocToOra → `encodePngFromBytes(merged.data…)`；中间**没有** defringeAlphaZero 调用；ora.ts 注释「v134 约定保 alpha 不涂底」只管不涂底，不管回填 | ✘ **不 defringe**（静态） |
| .ora `Thumbnails/thumbnail.png` | 同上 merged 缩放（`renderThumbnailAdaptive`） | ✘ 同上（缩略图渗色多半无所谓，顺带记） |
| **Blender push PNG** | `src/blender-sync.ts` 229：`renderDocToImageBlob(ctx.doc, "image/png", undefined, scope)`——**没传 defringe 形参** → 走 `src/session.ts` 103 的库级兜底 `defringe = false` | ✘ **不 defringe**（静态）；这恰是给 3D 引擎贴图的路径，defringe 立项的 why 就是它 |
| PSD merged composite | `src/backend/psd.ts` writeMergedImage → renderNodesToBytes | ✘ 不 defringe（PSD merged 是给 Photoshop 的预览件，要不要管待 user 一句话） |

## 请下一个 agent 做的

1. **先验证再动手**：写一个 node 测试——一层带透明边的 doc → `encodeDocToOra` → 解出 `mergedimage.png` → 断言 α=0 像素 RGB 是否等于邻近边缘色（现状预期：不等，RGB=0）。同样对 `blender-sync` 的 renderPushPng 断言。现有 `test/defringe.test.mjs` 只测算法本身与导出 PNG 往返，不覆盖这两条路径。
2. **拿 user 一句话再改默认**（判断类字段归人类）：
   - mergedimage.png 是**恒开** defringe，还是跟随导出开关 `desk.export.defringePng`？AI 建议恒开：defringe 只改 α=0 处 RGB、α 不动，对做正确 alpha 合成的 reader 完全不可见，对 bilinear 采样的 reader 只有好处；mergedimage 本来就是给「别的 reader」看的。
   - Blender push 建议恒开（贴图用途，没有「想要黑边」的场景）；若要可关，复用导出开关别再开新设置项。
   - PSD merged 要不要管。
3. **代价先量再上**：defringeAlphaZero 是 O(N) 全图 BFS 多源层序，autosave 每次落盘都会跑在 encodeOra 里；大画布（如 4096²=16.7M 像素）主线程耗时**未测**，先量（长跑纪律：报耗时），太贵再谈放 worker / 只在有 α=0 像素时跑（算法内全不透明已 no-op，但扫一遍 α 仍是 O(N)）。
4. **落地纪律**：mergedimage 字节变 ≠ .ora 布局变（entry 不增删不改名），不触发「ora 布局变更必附目录表」的硬规则，但仍要在报告里明说「mergedimage 像素从此 defringe」；patch 级 bump，走发版 ritual。
5. **别做**：不要把 defringe 塞回 authoring 管线 / lockAlpha——user 2026-08-19 已拍板「走导出选项，不进 lockAlpha」（defringe.ts 头注释）。GL merge 按 ao 归一会把 α=0 处 RGB 规范化成 0，所以只能在导出字节上一次性重建，这条不变。

看完在下面签「已阅」，不删本便条。

# 便条（来自 CatsUp 会话 2026-10-24）：工单「抠山抠树」

> created 20261024 by Claude Fable 5.1（CatsUp 侧会话代 user 投递）· user 原话：「然后weebpaint发一个工单就是抠山抠树的功能 记账」

- **要什么**：从照片里把山 / 树 / 石头这类有机轮廓抠出来（去背景），出带透明的 PNG，喂给 CatsUp 的参考卡片 / 面片树 / 贴图。
- **为什么**：CatsUp 的建模历史 postmortem（私仓 `20261023 建模历史/ai-docs/20261023-vr-scene-postmortem.md`）：斩杀线在「灰模 → 有画面」，树 / 地形 / 有机材料全在「平面世界」外；面片树 = 几张带透明贴图的平面，瓶颈就是抠图。CatsUp 侧的图片导入深模块（CatsUp 总账 B42）只做裁剪 / 透视 / 缩放 / 透明检测，不做抠图——抠图归画图 app。
- **接口**：输出 = 普通带 alpha 的 PNG（CatsUp 导入时自己 detect alpha：无 → 不开透明并建议 JPEG，有 → cutout，极少数才 alpha blend）。不要求 WeebPaint 知道 CatsUp 的任何结构。
- **优先级**：user 说「记账」，没排期；WeebPaint 侧按自己的账走。Cycletex 调研里「树顶着天」拍法 + 抠图那条路是同一件事的另一半。

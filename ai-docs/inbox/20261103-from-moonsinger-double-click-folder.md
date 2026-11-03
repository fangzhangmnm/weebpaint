# 便条（来自 MoonSinger 会话 2026-11-03）：下载下来的文件夹双击就能用——老实脚本装数据 + 线程从页面里写死的地址起

> created 20261103 by Claude Opus 5.5（MoonSinger 侧会话代 user 投递）

- **user 原话**（MoonSinger 会话，聊 MoonSinger 上 itch、下载下来双击打不开）：「所以多线程还是有对吧。wishlist让weebpaint也这么学，记账。然后我觉得可以用老实脚本」。同一串前面：「我建议itch是zip部署」「没必要单文件」「不是可以.files吗，比如最基本的图片。以及虽然我不是很喜欢伪装成图片然后偷渡但这个方向有没有正规的做法」。
- **「这么学」指什么**：双击打开（file://）时浏览器只放行「显示」旁边的文件（`<img>` / `<audio>` / 老式 `<script src>`），不放行代码「读字节」（fetch / XHR / 读像素）。正规绕法 = **重资源写成老实脚本**：文件就是一段 JavaScript（老实叫 `xxx.data.js`），一行 `self.__xxData[名] = "<base64>"`，用到才插 `<script>`；解码后照旧对 app 里钉的 sha256。**后台线程** = 线程的代码当字符串带着、从 data: 地址起。WeebPaint 现在的单文件版（全内联进一个 html、约 5 MB）不受影响；这条是给以后用的。
- **MoonSinger 量到的（headless Chromium 149，file://；MoonSinger 自己还没做，只是调查结论）**：
  - 老式 `<script src>` 装 32 MiB：读进来 940 ms、`Uint8Array.fromBase64` 44 ms、sha256 39 ms，字节一致。
  - 起线程：data: 地址的 module worker ✓（里面 `import(data:)` / 静态 import / `import(blob:)` / wasm 都 ✓）、data: 地址的 AudioWorklet ✓ 能出声；blob 地址的 module worker ✗、classic blob worker 里 `import(blob:)` ✗、blob 地址的 AudioWorklet ✗、从旁边文件起 worker ✗。
  - data: 起的线程 origin = null：线程里自己的存储存不住；数据由主线程载好、转交（transfer）给它。
  - Cache Storage 写不进；IndexedDB / localStorage 能用但所有双击打开的 html 共用一份（本仓 0825 survey §5.1 早量过）。
  - 图片偷渡走不通：画进 canvas 读像素 = SecurityError；家规「字节进出不走 canvas」照旧。
  - 全表 = MoonSinger `ai-docs/20261103-itch-zip-feasibility.md` §2 / §6。
- **WeebPaint 可能用得上的地方（AI 推的，user 没逐条说）**：① 单文件版的 25 MB 上限装不下以后的重资源（大纹理笔刷、生成模型权重）时，改成「文件夹 + 老实脚本」、用到才载；② WeebPaint 以后把活挪进 worker 时，单文件 / 双击形态要走 data: 地址起线程（现在的单文件版能活，部分是因为几乎不用 worker）。
- **Safari**：只在 Chromium 验过。Mac 双击默认开 Safari；按本仓 0825 survey §5.1 的文献，Safari 双击打开时一碰存储就 SecurityError、data: 地址起 worker 不行（blob 可）；没实测。
- **优先级**：wishlist，user 没排期；WeebPaint 按自己的账走。家族周账 F-139。

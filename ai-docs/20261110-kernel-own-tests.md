# 画画内核的边界，和「内核自己的测试」

> created 20261110 by Claude Opus 5.5 · as-of v0.14.69 / 2026-11-10
> 起因：CatsUp 贴图纪元要把画画内核原样拷过去用（user 拍「同一份内核」）。CatsUp 那边的施工单 = CatsUp 仓 `ai-docs/20261110-paint-workorders-1.md` 的 0-1。这一页只讲本仓这一半：内核的边界有守卫、哪些测试算内核自己的有一份名单。**本仓的内核代码一行没动。**

## 一、内核是什么

- `src/backend/`（**先不含 `src/backend/timelapse/`**：CatsUp 暂时用不到录像；别的内核文件都不 import 它，`mp4-muxer` 也只有它用）
- `src/common/`
- `src/shell/browser-gl2-port.ts`（真显卡那一个实现；壳里别的文件不算）
- 内核用到的第三方库文件（精确到文件，连许可证和类型声明）：`fflate`、`jpeg-js` 的编码器、`upng`、`zip-js`

内核正本只在本仓改；CatsUp 那边是按提交号拷的，改不了也不该改（它有哈希守卫拦手改）。

## 二、名单 = `test/kernel-tests.json`

机器读的那一份，CatsUp 的拉取脚本按提交读它（不读本仓工作目录）。字段：

| 字段 | 是什么 |
|---|---|
| `kernelDirs` / `kernelFiles` / `excludeDirs` | 上面第一节的范围 |
| `vendor` | 要跟着拷的第三方库文件（含 LICENSE、`.d.ts`） |
| `helpers` | 内核测试用到的测试辅助文件（运行器、垫片、几个小工具） |
| `runner` | 只跑这一圈的入口 `test/run-kernel.mjs` |
| `tests` | 内核自己的测试（现在 62 个文件、549 条） |

**判据**：一个测试（连同它走到的辅助文件）import 的东西全在内核、名单里的第三方库文件和测试辅助文件里，至少碰到一个内核文件，而且不读仓里的文件（不用 `readFileSync` 之类）。照这个判据，读 `index.html`、总账、部署清单的那几个检查不算；碰到 timelapse 的那个也不算（timelapse 先不拷）。

## 三、怎么跑

`node --expose-gc test/run-kernel.mjs`：只跑名单里的测试，末尾照全量那样查图块句柄泄漏。实测约 4.6 秒、549 条全过、泄漏 0。`npm test` 照旧跑全量（这一圈也在里面）。

单独跑时发现的两个「靠别人」：

1. **`ImageData`**：内核拿 `new ImageData(data, w, h)` 当像素容器，node 里没有这个类。全量入口最前面的 DOM 模拟补了它；只跑内核这一圈就没人补。`test/kernel-shim.mjs` 只补这一个（和 `dom-shim-first.mjs` 里那段同一个最小实现），不装别的 DOM 模拟。
2. **`zip`**：`src/backend/zip.ts` 不 import zip.js，读的是全局 `zip`（浏览器里由 `index.html` 的 classic `<script>` 挂上）。全量里能过，是因为排在前面的测试先挂好了。`test/kernel-shim.mjs` 照 `test/zip-node.mjs` 那几行自己挂一份（`zip-node.mjs` 本身不能进名单：它另一个函数会 import 内核以外的 `src/sevenzip.ts`）。

`vendor/zip-js/` 里只有 `zip-full.min.js` 一个文件，没有单独的许可证文件（是 BSD-3 那份 zip.js，许可证该补一份进 vendor，记在这里，本张没动）。

## 四、守卫 = `test/kernel-boundary.test.mjs`（在 `npm test` 里）

1. 内核文件只 import 内核自己（不含 `excludeDirs`）和名单里的第三方库文件；不许裸包名（`node:` 除外）。
2. `src/backend`、`src/common` 不许用界面的全局：`document.`、`window.`、`HTMLElement`、`localStorage`、`indexedDB`、`navigator.`。现在一处都没有（`zip.ts`、`png-codec.ts`、`painting-view.ts` 里提到的都在注释里）。
3. 浏览器专用的 `createImageBitmap`、`OffscreenCanvas`、`new ImageData`：现有几处列成白名单（`doc-render.ts` 一处 `OffscreenCanvas`；`ora.ts`、`selection.ts`、`stroke-session.ts` ×2、`layer-tiles.ts`、`painting-view.ts` ×2 的 `new ImageData`），**只许变短**——多了红，少了也红（提醒把白名单改短）。
4. 名单不过时：列着的测试仍符合判据；反过来，符合判据而没列的测试 = 红（加了新的内核测试就进名单，连同它新用的辅助文件）。

注释不算，先剥掉再查。试过：往内核里加一句 `document.title`、加一条 import 到 `src/app.ts`、去掉白名单里的一处，三次各红一条，改回去全绿。

## 五、以后改内核

- 在本仓改，照常测；名单 / 白名单跟着守卫改。
- CatsUp 要收新内核时，在那边按本仓的新提交号重新拉（`scripts/pull-paint-kernel.sh <提交>`），它的哈希清单跟着换。

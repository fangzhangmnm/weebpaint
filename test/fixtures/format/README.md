# 冻结样本（持久化立宪，2026-09-29）

> created 2026-09-29 by Claude Fable 5.1

规矩：**只增不改**。每发过一版格式就冻结一份新样本进新目录；`test/format-samples.test.mjs` 必须永远读得了这里的每个文件，
而且「读 → 用当前写入器写 → 再读」语义逐字段一致（CatsUp 契约 §7.9「完美」的定义）。

| 文件 | 类别 | 是什么 |
|---|---|---|
| `real/v2/references-live-timelapse.ora` | **真** | v0.14.20 的写入器真写出来的 format 2：两层像素、参考清单在 desk 的 `refPanels` 里（图片 / 画布小窗 / 图片，当前第三张）、录像 json + mp4 桩字节 |
| `real/v2/plain.ora` | **真** | 同一写入器，没有参考没有录像 |
| `real/v3/references-live-timelapse.ora` | **真** | v0.14.44 的写入器真写出来的 format 3（`tools/freeze-format-sample.mjs v3`，2026-10-21 Opus 5.5 冻）：stack.xml `weebpaint:format="3"`、desk `version:1`、参考清单 `.weebpaint/references/manifest.json` `version:1`（三张卡）、录像 json `v:1` + mp4 桩字节。v0.14.21–v0.14.44 都是这个写法（minor / patch 键还没有 = 3.0.0 / 1.0.0） |
| `real/v3/plain.ora` | **真** | 同一写入器，没有参考没有录像；desk 改了导出格式 jpg / 白底两个非默认值 |
| `synthetic/v0/webpaint-dirs.ora` | **拼** | 无 `weebpaint:format` 戳时代的布局，按 ora.ts 当时读端路由表手工拼：`webpaint/state.json`、`webpaint/reference.png`、根目录 `timelapse.mp4`、`.webpaint/` 点目录 |
| `synthetic/v1/weebpaint-nondot.ora` | **拼** | format 1：非点 `weebpaint/reference.png` + 根目录 mp4 + `.weebpaint/` 点目录 |

「拼」的样本不是历史上真存在过的字节，是按读端当时写明的兼容路径拼出来的；本机没有真的历史文件。
用户真机上若有更老的画，读不开就是这两个样本没覆盖到的路径——把那个文件（去掉隐私内容）冻结进来。

**format 3 起冻结 = `node tools/freeze-format-sample.mjs <新目录名>`**（用当前写入器写两份小画；目录已存在就拒绝，只增不改）。

`gen.mjs` 是当时生成 v2 / v0 / v1 这四个样本的脚本：它用的是 format 2 的写入器 API（`refEntryName`、`desk.refPanels`），
在 format 3 的代码上跑不了，留着只为记录样本是怎么来的。下一版格式要冻结样本时，另写 `gen-v<N>.mjs`，
或者直接把当时 app 保存出来的真文件拷进来。

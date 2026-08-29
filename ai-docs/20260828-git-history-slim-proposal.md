# git 历史瘦身提案（未执行——执行须 user 单独拍板开工）

> created 20260828 · by Claude Fable 5
> as-of 2026-08-28 / main@止血 commit（.map 停止入库的那个 commit）

## 背景数字（2026-08-28 实测）

`.git` = **429MB**。按 blob 压缩后体积（`objectsize:disk`）聚合：

| 来源 | 历史累计 | 说明 |
|---|---|---|
| `dist/*.mjs.map` | **255MB** | 每版 ~2MB × 上百版。**已止血**：2026-08-28 起 gitignore，HEAD 不再含 map |
| `dist/*.mjs` | **101MB** | 每版 ~1MB+。仍在出血（见「不动的理由」） |
| `*.zip` | 15.8MB | 旧 `dist/weebpaint-itch.zip`（现已 ignore）+ `ai-docs/20260821-opus-round-transcripts.zip`（真史归档，去留归 user） |
| `src/i18n/strings.ts` + `api/...d.ts` | 8.8MB | 真源码，正常代谢，不碰 |
| `index.html` | 8.8MB | 真源码（含内联 sprite），不碰 |

止血后每版出血 ≈ 1.3MB（只剩 mjs），一年 ~100 版 ≈ +130MB/年。

## 提案：git filter-repo 剥历史 dist 派生物

- 工具：`git filter-repo`（或 BFG）。剥 `dist/*.mjs.map` 全部 + `dist/*.mjs` 中**非 HEAD 引用**的旧 hash 版 + 旧 itch zip。HEAD 现值不动（线上 Pages 分支同理要保 HEAD）。
- 预估：`.git` 429MB → **~70-90MB**。
- prod / main 两个分支都要过滤，之后 force push 两支。

## 代价（真史公开仓，代价比私仓大）

1. **全部 commit SHA 重写**。ai-docs / 注释 / 家族 sibling 里引用过的 WeebPaint commit hash 全部失效。缓解：filter-repo 会产 `commit-map`（旧SHA→新SHA 对照表），执行时必须把它 commit 进 ai-docs 留档，问责链（署名制走 git 历史）才不断。
2. force push：任何 clone / fork 作废需重拉。本仓已公开，外人 fork 会断。
3. 先例：2026-08-28 transcript 外泄案已重写过一次历史（那次是安全必要）。每重写一次，「真史」的 SHA 稳定性就折损一次——**纯省空间的重写建议攒着，别高频做**。

## 明确不在本提案里的（防 re-litigate）

- **deploy 改 GH Actions 重 build、dist 不进 git**：v122 bundle pattern（.gitignore 头注释）是既定设计——分支自带现成 dist、deploy.yml 只组合不重 build。改这个 = 推翻既定设计，须 user 主动重开，本提案不推。
- **`.mjs` 也止血（ignore）**：做不到——deploy.yml 从分支 tree 取 dist，mjs 不入 git 线上就没有 app。属于上一条的连带。
- `ai-docs/20260821-opus-round-transcripts.zip`：真史归档物，外泄案已审过，去留是 user 的编辑判断不是空间问题（HEAD 6.2MB / 历史 12.4MB）。

## 可选小补丁（执行历史清理时顺手，平时不动）

- build.sh `--sourcemap=linked` 里 bundle 尾部的 `sourceMappingURL` 注释现在指向一个 404——无害，但想干净可换 `--sourcemap=external` 去掉注释（要重 build 重 commit dist，别为它单独发版）。
- 若将来想把 map 请回 prod：esbuild `sourcesContent=false` 能把 map 从 ~6MB 砍到零头（devtools 需另行取源，本仓已公开源码，可接受）。

## 建议

**现在不做。** 止血已把出血降到 ~1.3MB/版；429MB 只是 clone 慢，不疼。触发条件建议：`.git` 过 1GB、或要做仓级备份/迁移、或下次因安全原因反正要重写历史时**搭车一起做**。执行时单独开 session，先冷备 `git clone --mirror`。

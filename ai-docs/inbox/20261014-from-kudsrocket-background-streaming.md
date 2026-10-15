# 便条：WeebPaint「后台 streaming」那条 wishlist，store 里可能已经做了一半

> created 20261014 by Claude Opus 5.5（KudsRocket 会话）· 给 WeebPaint 下一个 session 对账用。

user 10-14（在 KudsRocket 会话里说的）：「然后之前weebpaint wishlist了后台streaming好久了吧，这个也记账，说不定我们已经做了一半了」。

**原始那条 wishlist 的原话我没找到**：查了 WeebPaint `ai-docs/`（含 `20260907-ledger.md` 全文搜「后台」「stream」「流式」）和对话语料抽取（只抽出了家族根目录那份），都没有。请对账的 session 按总账规矩回人类语料核出处，核不到就问 user 一句，别按这张便条的转述立项。

**store 里已经有的（可能就是「一半」）**：
- `file.openStream()`（2026-08-15，当时给 Background Radio 放歌做的）：按需取片（2 MiB 一片）、按 eTag 钉版、拉过的片进暂存区；`prefetch` 低优先级预拉；`keep()` 把已流过的片升格成本机副本，只补缺口不重下。
- 暂存区全局上限 `stagingCapBytes`（默认 256 MiB），超了按最久没碰过的整组清。
- 0.17.0（2026-10-14，Fable）：`save(bytes, {onProgress})` 上传进度；`files.uploadStream` 流式新建纯云端文件（整份不进内存、不落本机）；`watchFolder` 完整云端帧当新鲜度证据。
- 消费方样板：KudsRocket `src/app/discs.ts`（流式读盘 + 预读 + 断网重试）、`src/app/disc-tools.ts uploadToPantry`（边加密边上传）。

**没有的**：上传中途断了的续传（Graph 上传会话本身支持，库没用）——已记 KudsRocket wishlist W-20，escalate Fable。

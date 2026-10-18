# 便条：记住口令（WeebPaint / WXHW / KudsRocket 一起）进 wishlist

> created 20261014 by Claude Opus 5.5（KudsRocket 会话）· 给 WeebPaint 下一个 session 收进总账用。

user 10-14 深夜（在 KudsRocket 会话里说的）：「wishlist wxhw weebpaint kudsrocket 吃书，也许还是需要一个记住密码的机制，不然很烦」「实在不行弄一个手势解锁哈哈哈」「然后这个记住密码的机制也应该跟着store我猜？」。

- 方向早就有：store 仓 `ai-docs/adr/0026-password-origin-generated-passphrase-plus-credential-manager.md`（2026-09-09 user 定，未实现）——交给平台密码管理器，ADR-0012「store 不存口令」不动。
- WeebPaint 这边的第一步就是 ADR-0026 落地清单第 1 条：口令面板（`promptPassword`）改成真的 `<form>` + `autocomplete="current-password"`，浏览器才会问「要保存密码吗」。
- 三个 app 共用一个口令面板，别各写一份；放哪个共享库到时候问 user。
- 全文（含「手势解锁」= iOS 自动填本来就要的 Face ID、真机要验的坑）：`20261014 KudsRocket/ai-docs/20261014-wishlist.md` W-24。

**10-15 补（Claude Fable 5.1）**：user 改口「还是允许设备记住密码，每次进来不用输吧。你看我claude都可以直接进……仔细想想安全问题」——要的是按设备记住、免输，不只是密码管理器自动填。安全分析和建议做法（opt-in、不可导出 CryptoKey 包口令、共用深模块、吃书 ADR-0012 要 user 拍板）在 KudsRocket wishlist W-24 的 10-15 段，等 user 定了再动。

**10-17 落地（Claude Opus 5.5）**：user「口令同意。口令加一个过期时间，最多一个月。」「升级加密库同意」「csp…一起上」→ v0.14.33：`@internal/encryption` 0.2.2 `createPasswordKeeper` + `src/remember-password.ts` + 页面 CSP。ADR-0015；总账 #88 / #89。已阅 20261017（Claude Opus 5.5）。

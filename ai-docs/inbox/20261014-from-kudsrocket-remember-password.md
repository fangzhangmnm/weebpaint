# 便条：记住口令（WeebPaint / WXHW / KudsRocket 一起）进 wishlist

> created 20261014 by Claude Opus 5.5（KudsRocket 会话）· 给 WeebPaint 下一个 session 收进总账用。

user 10-14 深夜（在 KudsRocket 会话里说的）：「wishlist wxhw weebpaint kudsrocket 吃书，也许还是需要一个记住密码的机制，不然很烦」「实在不行弄一个手势解锁哈哈哈」「然后这个记住密码的机制也应该跟着store我猜？」。

- 方向早就有：store 仓 `ai-docs/adr/0026-password-origin-generated-passphrase-plus-credential-manager.md`（2026-09-09 user 定，未实现）——交给平台密码管理器，ADR-0012「store 不存口令」不动。
- WeebPaint 这边的第一步就是 ADR-0026 落地清单第 1 条：口令面板（`promptPassword`）改成真的 `<form>` + `autocomplete="current-password"`，浏览器才会问「要保存密码吗」。
- 三个 app 共用一个口令面板，别各写一份；放哪个共享库到时候问 user。
- 全文（含「手势解锁」= iOS 自动填本来就要的 Face ID、真机要验的坑）：`20261014 KudsRocket/ai-docs/20261014-wishlist.md` W-24。

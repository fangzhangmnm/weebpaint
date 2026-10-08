# 撞名后缀：「 1」→「-hex4」（家族对齐 handoff）

> created 20261008 by Claude Fable 5.1（MoonSinger 会话写给 WeebPaint 会话；as-of WeebPaint v0.14.23 / MoonSinger v0.6.20）

## 决定（user 2026-10-08，MoonSinger 会话「歌库对账」第 3 条）

三家撞名后缀现状：WeebPaint `uniqueNameFor` 加「 1」「 2」…；WXHW / MoonSinger 加 `-hex4`（`yyyymmdd-hex4` 默认名同一套随机 4 位）。
user 原话：「3 weebpaint写handoff和我们对齐」——**WeebPaint 改成 `-hex4`**，不是 MoonSinger 改成序号。

理由（对账时摆出来的，user 没反对）：序号在两台设备离线各建一张同名时会再撞一次（都叫「x 1」，上云时还得再撞），随机 4 位基本不会；
默认名本来就是 `yyyymmdd-hex4`，撞名后缀用同一种字节，用户看到的名字只有一种样子。

## 要动哪里

- `src/gallery/gallery-shell.ts` `uniqueNameFor`（app 层）：归一化 + 撞名后缀。后缀生成改成 `-` + 4 位小写 hex（`crypto.getRandomValues`），撞了再抽（上限几十次）。
  调用方：`import-image.ts`（导入 / 孪生）、新建、首存 `mode:"new"` 撞名抛的那条路——都走同一个函数，改一处。
- 先查 `@internal/gallery` 包里有没有自己的撞名实现（`dist/core/naming` 只见到 `galleryDefaultName`（yyyymmdd-hex4）和 `downloadStamp`）：
  **有的话就是库改动——bump 要 user 批**（家规：内部库 bump minor 必问；patch 自决）。
- MoonSinger 这边的参考实现：`src/app/main.ts` `saveIntoGallery` / `homeNow`（`defaultStem().slice(9)` = 当天默认名的 hex4 部分，`files.occupied` 循环最多 50 次）。
- 改完 E2E 里凡是断言「x 1」的要跟着改（grep ` 1"` / `撞名`）。

## 顺带：登录方式的对账结论（第 9 条，不用改）

WeebPaint 桌面弹窗 / 移动跳转（`oneDriveInteractMode`：iPadOS 桌面 UA 用 `platform === "MacIntel" && maxTouchPoints > 1` 认出来，对的），WXHW / MoonSinger 一律跳转——三家都没有问题，只是桌面手感不同（弹窗不重载页面）。不需要 handoff 给 WXHW。

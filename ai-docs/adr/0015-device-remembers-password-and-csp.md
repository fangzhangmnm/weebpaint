# ADR-0015：这台设备可以记住图库密码（opt-in、≤ 30 天、锁定即忘）+ 页面头上一条 CSP

> created 20261017 · 作者 Claude Opus 5.5（claude-opus-5-5）
> 状态：**已决定**（user 2026-10-14「wishlist wxhw weebpaint kudsrocket 吃书，也许还是需要一个记住密码的机制，不然很烦」→ 10-15「还是允许设备记住密码，每次进来不用输吧」→ 2026-10-17（WXHW 会话）「口令同意。口令加一个过期时间，最多一个月。」「升级加密库同意」「csp是什么？甲一起上」）
> 决策与威胁模型：`@internal/encryption` 仓 `ai-docs/adr/0001-device-remembers-password.md`；本 ADR 只记 WeebPaint 的接法。便条：`ai-docs/inbox/20261014-from-kudsrocket-remember-password.md`。

## 记住密码

- **吃书**：ADR-0012 / crypto-state 的「密码永不持久化」改成「crypto-state 自己永不持久化」；持久化的那一份 = `@internal/encryption` 0.2.x `createPasswordKeeper`，本机 IDB `weebpaint-bd6cece69075d759.remember`（家族 `<app>-<guid>.<用途>`：还原出厂按 GUID 前缀一起删，F1「新库都带 GUID 前缀」也认），口令被不可导出的 AES-GCM 钥匙封着，过期时间封进密文。
- **只记统一图库密码**；导入件自己的密码照旧每次问。勾**默认不勾**，只出现在**验得了**的统一密码面板上、而且是流程的**最后一个**面板：开加密作品（全局密码还空着时）、输入已有密码（verifier）、设新密码的「再输一次」、图库菜单解锁（verifier）。不给勾的面板一律清掉勾态，锁定也清——悬着的勾不会被别的流程顺手用掉。
- **开页**：`prefsReady` 之后、`bootRestoreSession`（开上次那幅画）之前：记着 → 先过 verifier 再 `setPassword`；对不上 → 忘掉、状态栏说一句；没 verifier → 忘掉。
- **跟着统一密码走**（`crypto-state.onCurrentPasswordChange`）：锁定 / 首次密码撤销（null）→ 忘；被换成一把**过得了 verifier** 的（改密码先写 verifier 再换）→ 记新的、过期日不变；过不了的（session-state 打开一张别的密码的本地加密文件时把那把设成会话密码）→ 不跟，记着的那把留着。
- **入口**：图库菜单「锁定」= 锁 + 忘；记着时菜单多一项「忘记这台设备记着的密码（X 到期）」；断开连接（退出登录）= 忘；忘记密码重置 = 忘。清缓存 / 强制更新不碰。
- **单文件 html / itch 形态不提供**（v0.14.34；user 2026-10-17「做」）：file:// 在 Chromium 里所有本地 html 共一个存储桶，itch 所有网页游戏共 `html-classic.itch.zone` 一个 origin（`20260825-localfile-knight-survey.md` §3.3、`20260827-p6-single-html-landing.md`）——同源的别人能拿库里那把不可导出的钥匙**直接解**出密码。`isStandaloneHtml()` → `enabled: false`：不给勾、不恢复、不跟、不碰存储（单测「keeper 一碰就炸」+ `tools/standalone-smoke.mjs` 在真包上塞记录、重开、必须原样不动）。
- 接缝：建 = `src/encryption.ts`（`@internal/encryption` 唯一值级 import 点，build.sh lint 守）；递 = `src/app.ts`；用 = `src/remember-password.ts`。

## CSP

`index.html` 头上一条 meta（GitHub Pages 配不了响应头）：`script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'`（不放行内联脚本 → 主题防闪白那段搬成 `theme-guard.js`，SW 预缓存）；`connect-src 'self' https: blob: data: http://127.0.0.1:* http://localhost:*`（OneDrive 主机不固定、Blender 同步默认本机 18765、远程地址人能填）；`frame-src` 只准本站 + 微软登录（MSAL 后台续登录）；`img/media/font` = 本站 + data / blob；`style-src 'self' 'unsafe-inline'`；`object-src 'none'`、`base-uri`、`form-action` 收口。被拦的东西走 `reportError(…, "log")`（`[csp] blocked …`）。

- **`'unsafe-eval'` 是过渡**：本仓十几处 Vue `template:` 组件 + gallery 0.1.0 都在运行时编译模板（`new Function`）。退场 = 构建时预编译：gallery 0.8.4 已经做了（宿主递整个 Vue 模块即零 eval），F-19 迁过去 + 本仓组件也预编译后，把 `test/csp-guard.test.mjs` 的期望值和 index.html 一起改掉（总账 #89）。在那之前注入的 `<script>` / 内联事件 / 外站脚本照样不跑。
- **standalone 单文件版没有 CSP**：它本来就全是内联脚本（`scripts/pack-standalone.mjs` 去掉 meta、把 theme-guard 内联回去，并自检）。

## 验证（2026-10-17）
npm test 1495（含 `test/remember-password.test.mjs` 9 条、`test/csp-guard.test.mjs` 6 条）；build（tsc 门 + lint）；preflight F1 / **F8（新：首启不建库、真 IDB 上开页恢复路径、菜单一圈 CSP 零拦截）** OK；standalone 打包 + `tools/standalone-smoke.mjs` OK。F4 三条红在改动前的 HEAD 上同样红（总账 #90）。**勾上 → 重开不用输**这一段要有图库 + verifier，无头里接不上 → 节点单测 + 真机。

# 案卷：reconnect 之后 gallery 还是坏的（online 旗竞态三连）

> created 20260830 by Claude Fable 5
> as-of v0.12.0 / 2026-08-30

## 事故报告（journal/20260829 v0.11 feedbacks.md + 当场补充）

- very high：「reconnect 之后 gallery 还是坏的」——「出了一个导致我都没法用的 bug」。
- 「gallery 的主菜单也很奇怪」→ 当场补充实锤：「gallery 菜单里面复制了两份很像的重复的东西」。
- 「reconnect banner dont follow ui standard, and cannot be clicked for its bad position」。

## 问题陈述（math-bug 纪律：先写清输入/输出）

**输入**：OneDrive 图库挂载中，token 静默失效（`getToken` silent fail → `activeAccount=null` →
`wp:auth-changed(signedOut)` → 离线横幅）。用户走任一重连路径（横幅按钮 / 云 popup 登录 /
连接图库…）→ `signIn()` = **loginRedirect 整页跳走**（0.11.37 实锤）→ 微软 → 回程整页重 boot。

**期望输出**：回程登录成功后，attachment `online=true`，徽章/推送/60s 轮询/横幅全部恢复。

**实际输出**：横幅永远「已离线」、图库 tile 徽章全塌「本地」、保存不推云、轮询停摆；
再点重连=再跳一整圈微软回来还是坏。菜单名册双份。

## 根因（三个独立 bug 咬合）

### BUG A（承重根因）：boot attach × auth-changed 的 online 旗 lost-update

- boot 链头 `bootAttachFromRegistry()`（app.ts:110，模块 eval 即跑）在 **initAuth 完成前**读
  `isSignedIn()`（恒 false）→ 以 `online:false` 开始 attach（建店+swap+initPrefs/initAppState，
  IDB 重活，窗口几百 ms）。
- redirect 回程的 `initAuth().handleRedirectPromise` 在这个窗口内完成 → `wp:auth-changed` →
  app.ts:508 `setOnline(isSignedIn())` 打在 **还没 attached** 的状态上 → `setOnline` 对
  detached 是 no-op → **翻牌被丢弃**。
- attach 随后以过时的 `online:false` 落地。此后再无 auth 事件 → 旗死锁。
- 放大器：`galleryOnline()`（SSoT=attachment.online）的消费面全军覆没——
  gallery host `signedIn`（app.ts:425→tile 徽章全塌 localOnly）、session-state 推送门、
  save-status 图标、A6 60s 轮询（app.ts:633 直接 return）、离线横幅。
  **auth 明明是好的（watchFolder 的 ctx 读 `auth.isSignedIn()`，云帧照来），UI/推送层全按离线办**
  ——这正是「看起来 reconnect 没用」的形状。

### BUG B：reconnectFlow 已登录还 loginRedirect

`gallery-manage-ui.reconnectFlow`：`await signIn(); setOnline(isSignedIn())`——写的时候按 popup
心智模型（signIn 回来接着跑）；实际 signIn=loginRedirect **整页跳走**，后半句永远不跑。
已登录（旗死锁场景）点重连 = 白跳微软一整圈，回程重 boot 再掷一次 BUG A 的骰子（大库 IDB 慢
→ 几乎必输）→「reconnect 之后还是坏」死循环。

### BUG C：renderGalleryManage 异步填充竞态（菜单双份）

渲染 = 同步清空 `box` → `galleryRegistry.list()` **异步** append。两次渲染落在 IDB 往返窗口内
（boot 期常见：initGalleryManageUI 初渲、initAuth.then→updateCloudAuthUI、auth-changed、
attachment onChange×2）→ 清空×2 先跑完、两个 fill 都往同一个空 box append → **名册整份×2**。

### BUG D（同族加固，静态可证）：attach 流无单飞锁 + boot 失败兜底会误拆活店

- redirect 回程 `resumePendingOneDriveConnect`（auth-changed 链）与 `bootAttachFromRegistry`
  （boot 链）可并发 attach；输家抛「attach while attached」，而 boot 的 catch 兜底
  `_swapStoreForGallery(null)` 会把**赢家刚挂上的活店**从接缝上拔掉（attachment 仍 attached）
  → 破 `_storeFull≠null ⇔ attached` 不变量 → 图库空网格 + requireStore 处处 throw。
  0.11.37 只考虑了「boot 赢」的半边。

## 修法（v0.12.0）

1. **A**：`gallery-connect.attachGallery` / `bootAttachFromRegistry` 在 attach **落地后**对
   onedrive 条目补一次 `setOnline(isSignedIn())`——旗的最终值=最后完成的一方所见，竞态定义性关闭
   （folder 库 online=权限语义，不动）。
2. **B**：reconnectFlow 已登录 → 不再 signIn，原地 `setOnline(true)`+drain+refresh；
   未登录才真跳（回程由 1 收口）。
3. **C**：名册渲染加 epoch 守卫（`gen !== _rosterGen` 丢弃过期 fill；fill 时刻再清一次）。
4. **D**：`src/flow-lock.ts` promise 互斥；bootAttach / switchFlow / detachFlow 全进
   `galleryFlow` 单飞道；bootAttach 锁内先查「已 attached → 目的已达直接退」；
   catch 兜底只在 **非 attached** 时才回落 swap(null)。
5. 横幅按 UI 标准件重做：`.toast` 底部居中 pill（v0.9.4 拍板：顶部通栏压 iPad 无框顶栏——
   error-badge 早已迁底部，这条横幅当时踩了回去，位置差到点不到）。

## 验证

- node：flow-lock 单测（串行序/错误不断链）；全量 `npm test` 绿。
- headless：boot smoke（build.sh tsc 门 + gl-smoke）。
- 真机（user 自定节奏，不 nudge）：token 过期态点「重新连接」→ 不再整页跳转、横幅立收、
  徽章/推送恢复；菜单名册单份。

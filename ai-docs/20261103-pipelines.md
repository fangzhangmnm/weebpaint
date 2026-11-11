# WeebPaint 代码流程图（pipelines）

> created 20261103 by Claude Opus 5.5 · as-of v0.14.52 / 2026-11-03
> **这份还不全**：家族 ritual（CLAUDE.md「代码流程图」）要求每个 TS 兄弟项目有一份，本仓之前没有。这里先写工单 G 碰到的两条：开机 / 醒来，什么时候推。笔触、合成这些以后碰到再补。

## 总图

```
开机 ──► prefsReady（按名册挂库）──► gate.run("boot", { before: 恢复上次的画 })
                                       没挂 OneDrive：跑 before，不罩
                                       挂着：罩 → before → 等 authBoot / 静默续签 → 问云端一次 → 放行
                                                                     ├ 真分叉 → 库的面（叠在罩子上）
                                                                     └ 续签失败 / 没网 / 8 s → 闸（重新登录 / 离线继续）
回前台 / pageshow ──► gate.run("wake")（30 s 内核过不罩；已选离线不罩）
```

## 哪个操作走哪条

| 操作 | 流程 | 亚种 |
|---|---|---|
| 开机，挂着 OneDrive | 闸门 | `before` = 恢复，也算超时（登录和恢复并行，恢复可能碰网） |
| 开机，文件夹图库 / 无库 / itch / 备用版 | 直接恢复 | 不罩 |
| 回前台 | 闸门 + `onForeground`（拉设置、快进） | 快进在途时闸门加入它 |
| 回线 | `onCloudMaybeBack` + 老的一串 | 选了离线：走 reconnect，老的一串在 `catchUp` 里补 |

## 闸门（`cloud-gate.ts` 状态机，零 DOM，单测；`cloud-gate-host.ts` 组装）

1. 罩子（`sheets.ts openSyncGate`，栈）+ 交互锁 `gate`。O(1)。开头 120 ms 不显形。
2. `before`：恢复上次的画（`session.restore` → `es.open`，O(画)）。和逃生、8 s 赛跑；口令面板 / 冲突面上停表。
3. 续签：等 `authBoot`，没登录就 `retrySilentSignIn`（一次 MSAL）。
4. 问云端（`session.checkCloudOnce`）：干净 → `refreshOpenDoc`（一次 fetchMeta；云端动了才下载，O(画)）；有没传的 → 库的 `open`（回执丢失自愈，真分叉才弹面）。同一轮面只问一次。
5. 放行：排空离线删除队列 + 看没传的（见「回来时没传的」）。实测没事时 112 ms（含第 2 步的本地读）。

选了离线：`user-offline.ts` 内存布尔接进 OneDrive 那家 store 的 `isOnline`，库零请求（文件夹图库不吃）。回来 = 续签 → `catchUp`：排空队列 + 拉设置 + 快进 + 提一条。**不自己批量推。**

**离线态回来**（设计稿 §3 硬要求，v0.14.54）：选了「离线继续」之后，`online` 事件 / 回前台 / 每 60 s（只在前台、浏览器说有网时）走同一个 `reconnect`：静默续签 → 问云端一次（`provider.getItemByPath`，不经 store，硬超时 8 s）→ 都通才清离线、补传、收条；不通什么都不弹，下一拍再试。碰多少：一次续签 + 一次很小的 Graph 请求，不随画涨。

## 什么时候推

> 2026-11-09（v0.14.66）：存盘模块里所有会写盘、会换身份的动作**排成一队**（保存 / 开画 / 改名 / 删除），前一个落地了下一个才开始；每一轮保存在起跑时钉住「存给谁」。所以：按存撞上在飞的自动保存 = 等它落地再完整存一遍并推；换画 = 上一幅真的存完、试推过才换。为什么 = 家族根 `ai-docs/20261109-editor-session-serialize.md`。

| 时机 | 落本地 | 推 |
|---|---|---|
| 人按「存」（`saveAndPush`） | ✓ | ✓，不脏也推 |
| 退出到图库（`flushAndPush`） | 脏才写 | 脏或待推才推 |
| 点「有新版本」，选「存好再刷新」 | ✓，不设时限 | 最多等 5 s，推不完就走 |
| 点「有新版本」，选「先不传」/ 够不着云 | ✓ | 不推 |
| 空闲 30 s（bg-jobs）、切后台、blur、pagehide | ✓（`persist(false)`） | **不推**（`pushOn: ["exit"]`；守卫核） |

每条写本地 = encode 全量，O(画)。

## 回来时没传的（`cloud-return.ts` 纯函数；`app.ts _offerOnce`；规则书第 15 条，v0.14.53）

开机放行 / 网回来 / 挂上库后走一遍，`dirty.count()` 为 0 就到此为止（碰多少：一次本地读）。不为 0：

1. `walkLibrary` 逐夹走一遍，找 `syncState === "float"`（从没传过）。碰多少：每夹一次云端列举 + 约 800 ms 等帧；随文件夹数涨，不随画的大小涨。
2. (b) 开着那份 `isPushOwed`（人按过存、没传成、之后没再改）且不是从没传过 → `flushAndPush` 续传，不问；每次回来都看。
3. `planReturn(剩下的脏, float 数)`，一页只走一次：
   - 没有 float → (c) 不传不问，常驻通知「N 份没传上去，在「要处理」列表里」+「去处理」。
   - 有 float → 面「有 A 份只在这台设备，现在传上去？」；还有别的脏就是「有 A 份只在这台设备，还有 C 份改过没传。现在全传？」。两键「现在传 / 稍后」，Esc = 稍后。
   - 现在传 = `dirty.pushAll()`（全仓这条自动路径的唯一调用点）；稍后 = 全部进列表，什么都不推。传完没传成的带名单 +「去处理」。

## 加密作品出门（规则书第 5 条，v0.14.53）

| 动作 | 字节 |
|---|---|
| 复制一份到图库 / 另存为（`saveAs`）| `sealForSaveAs` 封成容器再 `save`（库原样透传），本地、云端都是密文；锁着 = 拒，打不出容器 = 拒 |
| 存为本地加密文件（hub 主按钮）| `readEncryptedBytes`：原样搬 at-rest 容器 |
| 存为本地 .ora（这份是明文、没有加密）| 显式那一行，明文 |
| 导出图片 / psd | 按钮上写着那句话；格式天然明文；`.ora` 工程格式走这里也是容器 |
| 录像 mp4 | 下载前面上明说，取消不导 |

## 锁：图库里的画默认只读（修改锁；v0.14.59 起，v0.14.64 理成「一张表、各层都查」）

> as-of v0.14.64 / 2026-11-09（Claude Fable 5.1）。两个问题各只有一处回答：
> **这幅画锁着吗** = `src/edit-lock.ts` 的 `isEditLocked()`（现算，不记状态）：库开了 `lockByDefault` ∧ 开着的画住在图库里 ∧ 不是空白 / 刚新建还没首存的 ∧ 这台设备上没有活着的解锁；或者开着的是硬盘上的单个文件、这一次打开还没解。
> **这个操作锁着能做吗** = `src/edit-lock-table.ts` 那张表。键 = 操作的名字 = 写令牌的标签；列进去的是「看法」（现在两个：`layerVisible` 图层的眼睛，进文件；`selection` 选区，不进文件），没列的一律是内容。

各层怎么问（都拿操作的名字来问，不各写各的名单）：

| 层 | 在哪 | 怎么拿到操作的名字 | 被拒了怎样 |
|---|---|---|---|
| 指针 | `input.ts` 按下那一刻 → `interaction-lock.allows(intent, { op })` | `pointer-route.pointerOp(role, tool, floating)`：套索工具画选区 = `selection`；拖浮着的那块 = `floatTransform`；油漆桶 = `fill`；落笔 / 擦不细分（内容） | 不收，门闪一下 |
| 快捷键 | `input.ts` 快捷键表 → 同一个 `allows` | 每条自带 `op`（全选 / 反选 / 去选 / 多边形收尾 = `selection`；撤销重做 = 现算要翻的那一步）；复制两条标 `intent: "copy"` = 读 | 不收，门闪一下 |
| 面板按钮 | `edit-lock-door.ts` 捕获阶段 | 离被点元素最近的 `data-op`（`index.html` / `vue-templates.ts` 里标）：`view` = 不碰画，表里的看法 = 放，`content` 和别的 = 拦 | 点不动、门闪一下、淡一档（`styles.css` 一条规则） |
| 写令牌 | `Workpiece.writeGate` → `edit-lock.editWriteGate(label)` | 开令牌时 `begin(label)`；并进一个已经开着的令牌的每个微步，`History.withPoint` 再问一次（不许搭车） | 抛 `WriteRefusedError`；全局筛子翻成门闪一下 + 状态行 |
| 撤销 / 重做 | `History.undo / redo` → 同一个 `writeGate` | 要翻的那一步的标签（`UndoStack.peekLabel`）；几个不同名字的微步并成的一步，标签 = 名字用 `+` 连起来，表里查不到 = 内容 | 不动，门闪一下 |
| 保存 | `editor-session.persist` 的 `editLocked` | **不看表**：锁着 ∧（内存脏 ∨ 人按了存）→ 抛 `EditLockedError`、改动留在内存；只欠一推 → 不走保存 | — |
| 库 | `@internal/store` `lockByDefault` | **不看表**：没解锁 `file.save` 抛 `LockedError` | — |

- **看法锁着能动，但对文件一个字节都不写**：会话（`session-state.ts`）锁着时进来的变化一概不标脏、不留崩溃影子、不碰保存。进文件的看法（表里 `inFile: true`）过写门时由 `edit-lock.ts` 记一笔欠着，解锁那一刻会话用 `takeLookOwed()` 取走、转成待保存改动；只动过选区 → 解锁后还是干净的；没解锁就关掉 / 换画（标签 `load`）→ 欠的作废。导出 / 复制 / 另存为跟着眼前的样子。
- **油漆桶锁着整个不起作用**（`fill-mode.ts` `fillPreviewActive` 锁着恒 false）：不出预览、✓ 不出现、切走不落色也不清选区；解锁后预览自己回来。
- 换画 / 新建 / 还原（整份装入）：标签 `load`，写门永远放行；新建的首存库不拦，存成后库发一枚解锁。
- **解锁只在人点钮时发生**：画布顶上那扇门（`src/edit-lock-door.ts`，「接着改」「存一版再改」）和图库卡片菜单；`test/edit-lock-guard.test.mjs` 钉着 src 里没有第三处。解锁记在这台设备、放凉一天过期、每存一次往后推、正开着的那幅不打断（都是库的事）。
- 锁上：图库卡片菜单和画布文件菜单的「锁上（先不改了）」（后者先存好再锁；存的那一下会把浮着的变换自动应用）。
- **硬盘上的单个文件（v0.14.61）**：不经过库，所以没有库那一层；锁跟着这一次打开的这个文件（句柄），打开默认锁着、门上只有「接着改」、解到关掉为止；写回文件那一层 = `saveLocalFileNow` 开头的拦；新画存成的文件不锁；导出 / 另存为照常。文件夹图库走库，和云端一样。
- **参考窗（v0.14.61）**：窗里挪卡 / 删卡 / 加画布镜像问同一个地方（`ref.canEdit`）；从 app 这头加参考图在入口问（`editWriteGate("reference.add")`）；翻页、跳转不问、不欠。
- 不归这把锁管：空白画布、改名、加密 / 解密、删除（归星）、同步、导出 / 另存为。
- **加一类看法怎么加**：表里加一行 → 给它的写入口一个专属标签 → 它的按钮标 `data-op`、快捷键标 `op` → `styles.css` 那条规则的例外名单加一个词。漏了哪一步 `test/edit-lock-guard.test.mjs` 会红（表里的词必须真有写入口在用、界面上的词必须在表里、样式的例外名单必须和表一样、门里不许手写面板名单）。
- 验收：`node test/probes/probe-edit-lock.mjs`（真 bundle + 真库 + 假网盘，无头，≈ 25 s；⑤″ = 选区那一段 20 条）。

## 显卡那一层的两种建法（`src/shell/browser-gl2-port.ts`；v0.14.70，Claude Opus 5.5，CatsUp 贴图主线 0-4）

```
画画软件：new BrowserGl2Port(canvas) ──► 自己的画面（alpha:false / preserveDrawingBuffer）──► 合成 → 贴到画板（target "screen"）
CatsUp：  BrowserGl2Port.fromContext(three 的 gl) ──► 共用画面
            每个碰 GL 的入口先 _ensureBase()（把宿主留下的状态设回默认）
            合成进借来的 FBO（GLBoard.composite 交出合成好的那张，见「一帧」）──► glTextureOf(fbo) ──► three 的 ExternalTexture 直接采样（不读回）
            画到 "screen" = 抛；内核做完一批，宿主 renderer.resetState()
```

- 自己的画面：`_ensureBase` 什么都不做（零开销）。共用：每个入口多二十来个设状态的调用（CatsUp 探路量过：一次 three 的 resetState 约 0.04 ms，CPU 时间）。
- 归位单子和来历在 `_ensureBase` 的注释里；守卫 `test/gl-port-shared-guard.test.mjs`；显卡冒烟测试的「共用画面」那一轮。为什么 = ADR-0009 追加注。

## 一帧（合成 → 上屏；2026-11-10 贴图主线 0-5 拆成两半，Claude Opus 5.5）

```
board.render / GLBoard.render
 → RenderTree.renderFrame
     = compositeFrame（合成整幅画到一张离屏图 _display）
         装这一帧的薄层（room.setStampOverlays：每层最多一张）→ 规划（段缓存 / 实时叶）→ 合成
         快路径：没脏、没实时叶、签名没变 → 不重合成，直接交出上一张 _display
     + _present（把 _display 按视图变换画到屏幕：底色 / 点网格 / 缩放）
CatsUp：GLBoard.composite（参数同 render，去掉屏幕那几个）→ RenderTree.compositeFrame → 交出 _display（预乘、和画布一样大、第 0 行 = 画布第 0 行）
          那张图归内核：下一次合成之前有效，宿主不归还、不改采样设置；底色可以给不透明的颜色 [r, g, b, a]（材质自己的底色）→ 交出去的图不透明
```

- 两半是同一段代码，不是两份：`renderFrame` 只是先调 `compositeFrame` 再调 `_present`。合成那一半碰的东西随这一帧动了的图层涨（段缓存命中的不重合成）；上屏那一半随屏幕大小涨。
- 和一次性合成（`RasterService.compositeOnce`：导出 / 吸管，不建缓存）结果逐像素相同：`test/host-overlay.test.mjs` B（十帧：改图层、挂撤薄层、几种底色、实时叶）。
- 显卡冒烟测试：渲染树 / 提交 / 裁剪实时 / 填充四个用例各有一份「只合成」版，共用画面那一轮也跑、和独占那一轮逐字节比。

## 一笔的第五种预览方式：宿主画好的薄层（host；2026-11-10 贴图主线 0-5，Claude Opus 5.5）

```
三维的空间层（CatsUp）：笔尖列表（空间里的）→ 画到贴图格子上 → 一张和画布一样大的预乘薄层（宿主借的 FBO）
 → StrokeSession（preview "host"）：开写令牌
     每帧 setHostLayers(list)：每层最多一张；浓度 / 橡皮 / 混合方式宿主给，锁透明（图层的）和选区（现在的 bboxMask）档口补 → deps.setHostOverlays
       → room 的薄层：host 这一支直接进 _addPremulOverlay（预乘转直值 → 带选区 → 登记），和二维笔尖画完之后是同一段；宿主的图不归还
     抬笔 end：逐张 deps.commitHost（= bakeStamps 写回链：显卡合并 → 读回范围 → applyRegionDiff → 收养）→ 一个令牌 = 一步撤销
       有一张没落成（返回 false 或自己抛）→ 令牌取消（已落的跟着回滚）、通知重画、抛（HOST_COMMIT_FAILED 或原错误）；空的（范围宽或高 ≤ 0）跳过
     取消：撤显示、取消令牌（真层从没被写）
```

- 一笔碰的东西：每帧 = 这一帧交上来的薄层张数（每张整幅一次预乘转直值）；落层 = 每张读回它的范围。
- 「笔尖从硬芯到边缘怎么淡下去」只有一份：`src/backend/gl/stamp-falloff.ts`（GLSL 片段 `STAMP_FALLOFF_GLSL` + 同算式 JS `stampFalloff`，软件显卡也从 `soft-shaders.ts` 导出）；淡彩最后上色那一遍 = `GLStampRasterizer.colorize`。三维的空间层用这两样，不另写。守卫 `test/host-overlay-guard.test.mjs`。
- 和二维笔尖同一条路：`test/host-overlay.test.mjs` A（十种：淡彩、叠色、橡皮、锁透明、选区、几种混合、浓度 < 1、椭圆笔尖；预览和落层逐像素相同）。

## 还随整张画涨的点

恢复（第 2 步）和快进下载随画大小涨；「存好再刷新」的本地那步不设时限，大画遮罩会转得久。

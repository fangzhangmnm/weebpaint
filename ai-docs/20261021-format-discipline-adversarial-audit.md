# 格式版本纪律（v0.14.46）对抗性审计：会丢画的路径

> created 20261021 by Claude Fable 5.1 · as-of v0.14.47（dev）· user 当晚原话「对抗性地审计一下你之前的全部决策和修改。重点在于数据安全……查到问题先写复现，再修。只推 dev」
> 读者 = 下一个接手的人：想知道「v0.14.46 哪些决定被推翻了、为什么」看 §1；想知道「每条审计项的结论」看 §2；想知道「改了哪些文件、怎么验的」看 §3。

## 1. 一句话

v0.14.46 把「写这画的 app 版本比我新 → 警告 + 覆盖确认」那层删了，理由是「判据只看拍子」。审计坐实这是错的：**格式拍子兜不住 stack.xml 内部**（图层上的未知属性 / 子元素读一次写一次就没了，`test/format-stack-xml-unknown.test.mjs` 钉住），所以那层必须和拍子**并存**。v0.14.47 恢复它，并且比旧版更严：旧版只拦 app 层的保存入口，editor-session 自己的 autosave / 失焦 / 关页 / 退出推云绕过它直接写；现在闸放在 persist 咽喉（`EditorAdapter.mayWrite`），确认之前哪条路都不写。

## 2. 六条审计项 + 独立发现

| # | 问题 | 结论 | 复现 / 守卫 | 修 |
|---|---|---|---|---|
| 1 | stack.xml 图层上的未知属性 / 子元素，旧版打开再存还在不在 | **不在。** parseStackXml 只读已知属性、buildStackXml 只写已知属性，没有直通袋；嵌在已知元素里的未知东西按家族规矩也不直通 | `test/format-stack-xml-unknown.test.mjs`（钉住「丢」）；样本 `synthetic/future-app/newer-app-same-format.ora`（`<layer>` 带 `weebpaint:future-layer-flag`，重写后没了，`format-samples` 断言）；F12 ④ 真 app | 不做 stack.xml 直通（图层 id 会变，按 id 带回语义错）；规矩写进 `migrate.ts` / `ora-stack-xml.ts` 头：**同 major 内不准往 stack.xml 加东西**，新东西放 `.weebpaint/` 新 entry；兜底 = 第二层（#6） |
| 2 | 历史版本 1、2 有没有各冻一份真样本 | v2 早有真样本（v0.14.20 写入器）；v1 只有「拼」的。**补了真 v1**：format 1 最后一版写入器（commit bfb9f08，v0.12.6 时代）在本机 node 跑得了，真写两份进 `real/v1/`（非点 `weebpaint/reference.png` + 根目录 `timelapse.mp4` 的老布局）；v0 时代没有 format 戳，那时的写入器没有可比的「版本」，仍用拼的 | `format-samples`「real/v1」两条：归一化搬动、单张参考带老视口、录像原样、往返语义一致、写成当前布局 | 生成脚本 `test/fixtures/format/gen-v1-at-bfb9f08.mjs`（放进 `git archive bfb9f08` 的源码树跑） |
| 3 | major 更新拒开之外，云同步后台路径会不会改写没打开的画 | **不会改字节。** 逐条核：editor-session 的 persist 只对 `_name` 指着的画，拒开的画从没拿到过 `_name`；`pushAll`（登录 / 回线后问一次）推的是本机 at-rest 字节原样，不重编码；图库的 resolve / 回收站 / 恢复 / 改名 = 库的字节级搬动；缩略图是派生缓存；崩溃快照 / revert 环只封存已打开的画；刷新重开（refreshOpenDoc）快进到云端更新 major 那份 → 拒开 + `_leaveDocUnsaved`：es 身份残留但 dirty / push-pending 都是 false 且墙②让它永不再脏，persist 的 need 门永远关着（代码注释写清） | 分析（无代码改动）；F12 ① 拒开后字节不变 | 无 |
| 4 | desk 单独 major 更新「按默认显示、存回原字节」：用户改的设置被悄悄丢、有没有提示 | **会丢、提示没说清。** 用户在这张画上改的面板位置 / 笔刷档位 / 透视框 / 导出设置这版存不下来（desk 没有 dirty 标记，保存写回的是原字节）；旧提示只说「原样留着不会丢」。同类：参考清单 major 更新时目录原样带着，但参考窗仍让人加参考，新加的卡保存时被静默丢 | F12 ③（提示文案断言）；F12 ⑤（导入被拒、manifest 逐字节相同） | 提示改成 warning 级、不自收、按部位分句说清「你对这些设置的改动这版存不下来」；参考目录带着时三条导入漏斗 + 组件自加的卡都拒 / 说清（`side-windows.ts`）。没有做「desk 也拒开整张画」——那是把一张能画的画锁死，超过家规「major 那一块拒读」 |
| 5 | 笔架 / 设置迁移进一个文件夹后，老笔架条目还能不能原样读出来；设置表有没有整表重写 | **能。** 历史上 `version` 只挂在整个笔架 blob（`RACK_VERSION`），从没挂过单支笔或 `.meta`（git 史 + 出厂数据核过），咽喉读到无拍 = 1.0.0 照常显示；设置 collection 只有逐键 `setItem`，种子继承也是逐键 `preferences.set`，没有整表重写。**补了一个洞**：导入更新 major 的笔 JSON 会被盖成本版拍写进笔架（降级伪装成迁移）→ `brushFromJSON` 直接拒、咽喉 setItem 也拒 | `format-migrate.test.mjs`「审计第 5 条补」三条 | `brushes.ts` / `rack-format-guard.ts` |
| 6 | 删掉的「较新 app 写的画 → 警告 + 覆盖确认」那层 | **恢复，两层并存。** 判据 = `parseAppVersion(wrote-with) > 本版`；说一次（warning 通知 + 顶栏红边）；任何落盘前确认一次；确认前 editor-session 的 persist 也不写（新闸）；切画 / 新建 / 退出前先问，取消 = 留在画布 | `test/editor-session-write-gate.test.mjs`（复现：没闸时 autosave 和切画都写）；`test/app-version.test.mjs` 恢复；F12 ② ④（失焦不写 / 取消留在画布且文件不变 / 确认才写、红边撤） | `session-state.ts` / `editor-session.ts` / `format-notice.ts` / `save-status.ts` |

独立发现（清单之外）：

- **录像检疫出所没有确认**：录像 major 更新进检疫区后面板仍给「开录」，开录 = 把更新版本的录像顶掉。改：`TimelapseDocState.startRecording` 在 too-new 态抛；面板在该态只给「清除那段录像，再开新录…」（走既有确认面）。损坏 json 的检疫照旧（2026-08-25 护栏 E 既定语义）。
- **退役的 desk 键名不能在同 major 内复用**：直通袋故意不带退役键（refPanels / bucket / selPen / fill / pressureDisabled / ruler），更新的 minor 若复用这些名字，老版本会丢它。写进 `workbench-state.ts` 注释。
- **导出 .ora（exporters）只写图层，不带 desk / 参考 / 录像 / 未知 entry**：这是「另存为 = 导出明信片」的既定语义（10-07），没动，记一笔。
- **参考窗「画布镜像」卡不经本仓的导入漏斗**：带着目录时组件自己加的卡存不进去，补了 itemschange 上的状态行提示。

## 3. 改了什么、怎么验

- 第二层：`src/session-state.ts`（`_gateNewerOverwrite`、saveNow / saveAndPush / saveLocalFileNow / openLocalFile / newDoc / openItem / exitCanvasToGallery 都过门；es 适配器 `mayWrite`）、`src/editor-session/editor-session.ts`（`EditorAdapter.mayWrite` + persist 闸）、`src/format-notice.ts`（newer-app 一类；part-too-new 按部位分句）、`src/save-status.ts` + `app-context.ts` + `app.ts`（顶栏红边回来）、`src/backend/ora.ts`（`parseAppVersion` 回来）、文案 4 条恢复。
- 第 4 / 5 条 + 独立发现：`side-windows.ts`、`brushes.ts`、`rack-format-guard.ts`、`backend/timelapse/timelapse-state.ts`、`timelapse-ui.ts`。
- 样本：`real/v1/`（真）两份、`synthetic/future-app/`、`synthetic/future-major/references-2.ora`；`gen-future.mjs` 改成逐文件只增。
- 验：`npm test`（含 4 个新测试文件 / 节）、F12 五段、F1 F2 F4 F7 F8 F9 F10 F11、gl-smoke、standalone-smoke（结果以 v0.14.47 commit 信息为准）。真机（iPad Edge）零。
- 没做 / 等 user：stack.xml 直通（不建议做，见 #1）；desk major 更新是否该整张拒开（现在只提示 + 原字节带回）；prod 不推（仍 v0.14.32）。

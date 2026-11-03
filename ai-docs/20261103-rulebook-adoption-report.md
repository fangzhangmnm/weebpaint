# 家族工单 B 报告：WeebPaint 按「三种出货形态」规则书收口 + 收 store 2.2.2 / gallery 0.8.10

> created 20261103 by Claude Opus 5.5（claude-opus-5-5）· as-of **v0.14.51**（dev；B 单 = v0.14.50，B2 = v0.14.51）/ 2026-11-03
> 工单 = 家族根 `ai-docs/20261103-work-orders.md`「工单 B」；规则书 = 家族根 `ai-docs/20261103-three-shapes-rulebook.md`（下称「规则书」）。
> 三种形态：**官网**（weebpaint.com）/ **itch**（单文件改名 index.html 打 zip，被套在 itch 页面里）/ **备用版**（同一个单文件下载后双击打开）。
> **prod / itch 没推**（等 user 一句话，见第 4 节）。dev 已发 v0.14.51。Fable 11-03 审过 B 单（记住口令 diff / 披露文案 / policy 表 / 两个守卫都过），第 4 节前两道门已裁定、按裁定做成 B2（第 8 节）。

## 1. 做了什么（commit，一行一个）

| commit | 内容 |
|---|---|
| `1a527aa` | 第 1–3 步：`src/deployment.ts`（叶子）+ `src/deployment-policy.ts`（§2 表）+ `config.ts` 的 `SITE_URL` / `APP_NS`；四处散判迁走；网盘开关关 → 不建 OneDrive provider（不载 MSAL、不 initAuth）；记住口令按形态（备用版开 + 共桶披露、itch 关）+ ADR-0015 追加注；网盘入口灰 +「去官网」；开局一行；打包器另出 itch 那份（烤部署标记）；守卫 `test/deployment-guard.test.mjs` |
| `3d09b7c` | 第 4 步：前缀 token 收成 `APP_NS` 一处；锁名加前缀；`test/storage-whitelist.test.mjs` 扩到锁 / 广播频道 / SW；本仓 `CLAUDE.md` 白名单表 + 指路 |
| `dc632b1` | 第 5 步：`tools/standalone-smoke.mjs` 两种形态（备用版 file:// + itch 跨站 iframe 夹具） |
| `5e25706` | 第 6 步：收 `@internal/store` 2.2.2 + `@internal/gallery` 0.8.10（gh release 正货） |
| `96b6b2e` | v0.14.50 源 + `api/` 重打 |
| `6f4679e` | v0.14.50 dev bundle（`weebpaint-d09d6844fc3a`）+ smoke 加官网对照列 |
| （本报告的 commit） | 报告 + 总账三行 + 便条签「已阅」 |

测试：`npm test` 1566 绿（基线 1546，新加 20 条）；`bash scripts/build.sh` 全部 lint 过；`node tools/standalone-smoke.mjs` 三形态 22 s 全过；官网形态 preflight F1 / F8 / F9 / F10 单轮各过（headless）。

## 2. 规则书 §4 检查表逐项

| # | 项 | 结果 | 证据 |
|---|---|---|---|
| 1 | 自家前缀 token 一处常量 | ✓ | `src/config.ts:20` `APP_NS`；`test/storage-whitelist.test.mjs`「前缀 token 在 src 里只有 config.ts 一处字面量；theme-guard.js 照抄的那份和它一致」 |
| 2 | 存储名都带前缀（库 / 缓存 / 键 / 锁 / 频道 / SW） | ✓（B 单：锁、频道、SW；**B2：三个老裸名也改了**，见第 8 节） | 守卫：`storage-whitelist` 新四条（锁名全经 `_key()` = `${APP_NS}.doc-lock:…`；BroadcastChannel 现状零个含 `@internal` 库；SW 只在 `pwa-shell` 注册、挂 `policy.serviceWorker`、不给 scope、壳缓存名全 `weebpaint-` 开头）。反向变异（锁名改回裸名 / 塞 BroadcastChannel / 塞 location.protocol）三条都红过。命名空间表见下 |
| 3 | `deployment.ts` 叶子 + 别处不许看 file: / top / 标记 | ✓ | `src/deployment.ts:23` `classifyDeployment`、`:38` `deployment()`、`:45` `embedded()`；`test/deployment-guard.test.mjs` ①（反向变异红过） |
| 4 ★ | `deployment-policy.ts` = §2 表，单测钉死，每个开关有消费者 | ✓ | `src/deployment-policy.ts:32-37`；`deployment-guard` ②（三列逐格 + 开关集合）③（每个键在别处有读者）；表 `Object.freeze` |
| 5 | 网盘入口按开关灰 +「去官网」；itch / 备用版不载 MSAL、不 initAuth | ✓ | `src/app-store.ts:111` `cloudEnabled`（关 → provider / auth 都是 null）；`src/gallery/gallery-manage-ui.ts:238-239`、`:304` `_unavailableCloudItem`；smoke local / itch：`msalLoaded: false`、网络里无微软登录 / Graph 请求、`cloudEntryGrey: true`、`cloudEntrySub: "Use it at weebpaint.com"`；site 列 `cloudEntry: true, cloudEntryGrey: false` |
| 6 ★ | 记住口令按 §2 | ✓ | `src/app.ts:143-144`（enabled / sharedBucket 来自 policy）、`:137`（勾旁换带披露那句）；`test/remember-password.test.mjs` 新四条；smoke：local 塞记录重开 → `absent`（被读过 = 开着），itch → `present`（原样不动 = 关着）；官网 F8 过 |
| 7 ★ | 崩溃影子 at-rest = 保存字节（加密 → 密文） | ✓（本单没动，工单写明已合规） | `src/session-state.ts:1421-1427`：加密 file 家快照 = 容器，锁着就跳拍、绝不降级明文 |
| 8 | 资源读出重核哈希 | 不适用 | WeebPaint 没有「按 id + 哈希拿」的重资源：单文件版资产全内嵌，官网的三份 json 走同站点 fetch |
| 9 | itch 夹具（跨域 iframe）：资源 / 线程 / 出声 / 关页挽留 / 存 = 下载 / 网盘灰 | ✓（WeebPaint 没有出声线程，那格不适用） | `tools/standalone-smoke.mjs itch`：外页 `localhost:P1` 套 `127.0.0.1:P2`（跨站）；`embedded: true`；**脏文档关页弹了挽留框**（`beforeUnloadDialog: "beforeunload"`）；保存 = 下载 `20261103-1a93.ora`，下载后仍脏（下载 ≠ 回家）；网盘灰、无 MSAL |
| 10 | 「去官网」文案进 i18n、`SITE_URL` 插值、开局一行 + 灰入口副标题、不弹窗不重复 | ✓（「没测过 + 报告入口」那句 B2 补上，`ISSUES_URL` 插值，见第 8 节） | `src/site-hint.ts`（通知条 info、15 s、一页一次）；`deployment-guard` ④（网址只在 config.ts；四句四语都带 `{site}`）；smoke DOM 有 `site-hint` 通知且带网址 |
| 11 | zip 双击能开或至少一句人话 | ✓（能开） | smoke local（file://）开得起来、有 canvas、零页面错误 |
| 12 | zip 体积 / 文件数自检；推 itch 脚本 HEAD == prod 守卫 | ✓ | itch zip = 一个约 5 MB 的 index.html；`scripts/pack-standalone.mjs` 自检上限 25 MB（比 200 MB 严）；`scripts/push-itch.sh` 的 HEAD == prod 守卫原样在 |
| 13 ★ | 一次做全：没有 dummy / 恒 true / 只接一半 | ✓ | 六个开关各有真消费者（`deployment-guard` ③ 机械核）；`isStandaloneHtml()` 只剩「资产内嵌了没」一个读法（`src/pwa-shell.ts:76`：单文件旁边没有 service-worker.js） |

**命名空间表**（名字 · 在哪 · 带前缀没）：

| 名字 | 在哪 | 前缀 |
|---|---|---|
| IDB `weebpaint-bd6cece69075d759.crash` / `.device-rack` / `.remember` / `.gallery-registry` | `crash-store.ts:87` / `device-rack-slot.ts:22` / `encryption.ts:21` / `gallery-pkg-init.ts:11` | ✓ |
| localStorage `weebpaint-bd6cece69075d759:*` | `device-kv.ts:11`；`theme-guard.js:10` 只读主题键 | ✓ |
| Web Locks `weebpaint-bd6cece69075d759.doc-lock:<图库 id>:<相对路径>` | `instance-locks.ts:28`（**本单从 `weebpaint-doc:` 改来**） | ✓ |
| BroadcastChannel | 没有（本仓 + `@internal` 库） | — |
| store 的 IDB `weebpaint.<databaseId>` + localStorage `weebpaint.<databaseId>.*` | `app-store.ts:58` `appId`（库自己的命名） | ✓（家族口径：store 自己的 `${appId}.…` 算） |
| Cache Storage `weebpaint-<hash>` + SW | `service-worker.js:80`；只在官网注册 | ✓（家族壳缓存命名 `<app>-<hash>`；共用源上不注册） |
| IDB `weebpaint-bd6cece69075d759.app`（**B2 前叫裸名 `weebpaint`**）：缩略图缓存 + 「回到之前」快照 | `src/storage.ts` `DB_NAME`；老名只剩 `LEGACY_DB_NAME`（搬家）和 `factory-reset.ts` `BARE_APP_DB`（还原出厂删老库） | ✓（B2） |
| localStorage `weebpaint-bd6cece69075d759.nostore`（开发开关）/ `.storage-probe`（写完即删的探针）（**B2 前是裸名**） | `src/store-absent.ts` `NOSTORE_KEY` / `PROBE_KEY` | ✓（B2，零迁移） |
| localStorage `weebpaint.boot.lang` / `weebpaint.boot.theme` | `boot-snapshot.ts`、`theme-guard.js:11`：旧键，只读一次兜底 + 清扫 | ✗（老键只读不写，随它退场） |

## 3. 没做 / 做不了的

- ~~**WeebPaint 自己的 store 界面没接 2.2.2 的改名面**~~（**B2 已接**，第 8 节）：周账说 WeebPaint「收包即有」改名回执那道面，**核下来不成立**——WeebPaint 给 store 的 `ui` 是自己写的 `src/store-ui.ts`，不经 gallery 的 `storeUIFor`，里面没有 `resolveRenameOld`。库在没接时按 2.2.1 的老办法：旧的留着、改名回执带「旧的没动」旗；WeebPaint 编辑器改名那条路径（`src/session-state.ts:917-920`）和图库卡片改名（gallery 0.8.9 起）都已如实说出来。接不接是冲突界面的语义 = 事前门，第 4 节问题 1。
- ~~**老名字没改**~~（**B2 已改 + 搬家**，第 8 节）（裸 IDB `weebpaint` 等）：改库名会让老用户丢一次「回到之前」快照环，是持久化改动，第 4 节问题 2。
- ~~**Safari 双击打开的「没测过 + 报告入口」那一句**~~（**B2 已补**，第 8 节）（规则书 §1 第 12 条）不在工单 B 里，当时没做；WeebPaint 现在在 Safari 双击时走「存储被没收 → 只在内存」那条老路（0825），不白屏，但没有那句话。
- **单文件版不改成「文件夹 + 老实脚本」**：wishlist F-139，工单明写不做（便条已签「已阅」）。
- **一处语义变严**（顺带说明，不是问题）：旧的「选文件框能不能弹」允许被**同源**页面套着时照弹；现在统一问 `embedded()`（= 被任何页面套着都算），同源套着也不弹了。WeebPaint 没有被同源页面套着用的出货形态；手动夹具 `tools/itch-iframe-fixture.html` 是同源套的，现在它的行为反而更像真 itch。
- **保留了 0828 的「逃生舱」说明**：备用版点灰掉的「连接 OneDrive…」会先说「去官网」，再接上原来那段「在文件旁边起个本地服务器」的说明（那样打开就是 http 源，按官网走，能连 OneDrive）。itch 上没有文件可服，只说去官网。

## 4. 卡门（等 user / Fable 的，一次列齐）

1. **【Fable 11-03 裁定：接 → B2 已做】（找 Fable，数据安全 / 冲突界面）WeebPaint 要不要也接「改名撞上来历不明的云端旧版时问一句」**。这是什么：在这台设备上改了一幅还没传上去的画的名字，而云端那份被别的设备改过、或者这台说不清自己是从哪一版改来的——store 2.2.2 可以先问人「把旧的搬进回收站 / 两份都留着 / 不改名了」。接了会怎样：用户当场选，少出一份重复的画；要在 WeebPaint 自己的 `src/store-ui.ts` 里加一个面板（可以照搬 gallery `storeUIFor` 那三个按钮的说法）。不接会怎样：继续现在的做法——两份都留着、状态行说「旧的没动，图库里还看得见，不要了自己送回收站」，不丢东西，只是多一份要人手动清。
2. **【Fable 11-03 裁定：改，带一次性搬家 → B2 已做】（找 user 或 Fable，持久化改动）几个不带自家前缀的老名字要不要改**。这是什么：缩略图缓存和「回到之前」快照环住在一个就叫 `weebpaint` 的库里，还有两个开发用的小键；在 itch（所有网页游戏共一个存储）和备用版（所有双击打开的网页共一个存储）上，理论上会和别人起的同名库撞上。改了会怎样：撞车风险没了；但老用户这台设备上的快照环会丢一次（缩略图会自己重建）。不改会怎样：撞车要别人恰好也起名 `weebpaint`，概率很低；名字照旧。
3. **（找 user，仍然卡着）推正式版和 itch**：dev v0.14.51 已在 /dev/；正式版和 itch（itch 跟正式版走）要 user 一句话才推。推之前要知道的：这一版起 itch 上的网盘入口是灰的、不再假装能登录，开局有一行「这一份连不了网盘……完整版在 weebpaint.com」；下载的单文件版开始给「在这台设备上记住密码」的勾（勾旁有那句共用存储的提醒）；改名撞上来历不明的云端旧版会先问；本机那个小库换了名字，第一次打开时「回到之前」的历史自己搬过去、缩略图重建一次（`release-notes/v0.14.51.md` 已写好）。**正式版和 /dev/ 同源共用那个老库**：正式版没升级之前，在正式版上用过「回到之前」再开 dev，那段历史会被 dev 搬走（正式版上就看不见了）——只影响同时用两个渠道的人。

## 5. Fable 要看的 diff

- **记住口令 + 披露文案**（工单点名）：`1a527aa` → `src/remember-password.ts`（头注释 + `sharedBucket` / `rememberSharedBucket()`，约 12 行）、`src/app.ts:137-144`、`src/i18n/strings.ts` 的 `enc.rememberDeviceSharedBucket`（四语一行）、`ai-docs/adr/0015-device-remembers-password-and-csp.md` 末尾「追加注 2026-11-03」整节、`test/remember-password.test.mjs` 新 describe「按部署方式」。
- **policy 单测**：`1a527aa` → `src/deployment-policy.ts` 全文（50 行）+ `test/deployment-guard.test.mjs` 的「deployment-policy · 规则书 §2 逐格」三条 + ③。WeebPaint 比家族五键多一键 `rememberPasswordSharedBucket`（§2 那格是「✓ + 共桶披露」，一个布尔装不下）；MoonSinger 不加密，它的表可以不要记住口令那两键。
- **守卫改动**：`1a527aa` → `test/deployment-guard.test.mjs` 全文；`3d09b7c` → `test/storage-whitelist.test.mjs` 末尾新 describe「自家前缀（锁 / 频道 / SW）」四条。没有削弱任何既有守卫（`standalone-smoke` 里 10-17 那条「单文件版不许读记住密码的库」按规则书改成了「local 必须读过、itch 必须没读」，两头都钉）。
- 判定换手：`1a527aa` → `src/deployment.ts` 全文、`src/app-store.ts:105-114`（网盘开关并进「存储被没收」那个分叉）。

## 6. 真机项（攒批，不催）

- **真 itch 页面**：开局一行、灰入口 +「去官网」、保存 = 下载、脏着关页弹不弹挽留框（夹具里 headless Chromium 弹了；真 itch 的框还带 sandbox / allow 属性，以真机为准）。
- **真 itch 上键盘快捷键进不进游戏框**：headless 里在画布上画一笔，键盘焦点没进 iframe（框里 `document.hasFocus()` = false，Ctrl+S 落到了外页）；真用户点进框里之后快捷键能不能用，要真机看一眼。
- **备用版双击（Chromium）**：密码面板里那句新的共用存储提醒，长句子换行显示全不全。
- Firefox / Safari 双击没测。

## 7. 新图标需求

无（灰入口沿用库里现有的 `cloud` 图标）。

## 8. B2（Fable 11-03 裁定后续做，v0.14.51）

> Fable 裁定要点：改名面「接」，三句照抄 gallery 0.8.10，不许预设 / 自动回答；三个裸名「改，带一次性搬家」（不枚举、空闲片、核过才删、可重复跑、单测、发版说明披露）；补规则书 §1 第 12 条那句 + `ISSUES_URL`；推 prod / itch 照旧等 user。

**commit**

| commit | 内容 |
|---|---|
| `9673370` | B2-1 改名面：`src/store-ui.ts` `makeResolveRenameOld` + i18n `rn.*` + `test/store-ui-rename-old.test.mjs` |
| `78b73f6` | B2-2 / B2-3：三个裸名加前缀 + 老库搬家（`src/storage.ts` `migrateLegacyAppDb`、`src/legacy-app-db.ts`）+ 浏览器不给存那句（`src/site-hint.ts`、`config.ts` `ISSUES_URL`）+ 守卫 + smoke 两段 + `release-notes/v0.14.51.md` + 本仓 `CLAUDE.md` 白名单表两行 |
| `7d39b69` / `2e668b5` | v0.14.51 源 + `api/` / dev bundle `weebpaint-fb45e0b86120` |
| （本节的 commit） | 报告 B2 节 + 总账 #100 / #101 done、#103 新债 |

测试：`npm test` 1580 绿；`node tools/standalone-smoke.mjs` 四形态（site 含真搬家 / local / local-blocked / itch）28 s 全过；官网 preflight F1（首启不长库）/ F4（还原出厂）/ F8 / F9 单轮各过（headless）。

**B2-1 改名面**（`src/store-ui.ts`）
- 三个选项 =「搬走旧的（进回收站）/ 留着旧的 / 取消」，zh / en / ja 和 gallery `core/text.ts` 的 `rn.*` **逐字相同**（单测机械核），tok 本仓补；没有第四个、没有删除。主按钮标在「搬走旧的」= 和 gallery 同形；同步门不认回车（回车只在输入表单里），所以没有默认答案。
- **人没点就不回答**：同步门是共用的，别的流程可以从外面 `settleSyncGate(null)` 把它收掉——那个 `null` 不是人点的，面会重新摆出来，不当「取消」。（gallery 的 `storeUIFor` 是 `choice ?? "cancel"`；这里照 Fable「人没点就不 resolve」严一档。）
- 单测 `test/store-ui-rename-old.test.mjs` 七条：「正式装配接上了」「三个选项…没有第四个、没有删除」「原因分两句」「zh / en / ja 文案和 @internal/gallery 0.8.10 的 rn.* 逐字一样」「没人点 → 一直挂着」「门被外面收了 → 重新摆出来、仍不回答」「③ unknown-lineage：问了 → 人一直没点 → 本机还叫旧名、没有新名、云端只有旧的且原样、回收站空；人点取消 → 不改名」（库这一层，用 `@internal/store/testing` 的假云盘 / 假本地）。反向变异（`null` 当取消）红过。
- 债记进总账 #103：WeebPaint 的 store 面以后迁到 gallery `storeUIFor`，这次不做。

**B2-2 三个裸名**
- `weebpaint.storage-probe` → `weebpaint-bd6cece69075d759.storage-probe`、`weebpaint.nostore` → `weebpaint-bd6cece69075d759.nostore`（零迁移；开发开关要重设一次）；还原出厂现在也清 `${APP_NS}.` 开头的键。
- IDB `weebpaint` → **`weebpaint-bd6cece69075d759.app`**（用途名照 Fable 建议取 `app`：库里是缩略图 + 快照两类，没拆库）。搬 `checkpoint-ring` + `checkpoints`，两个缩略图 store 不搬。
- 规矩逐条：① 不枚举——老库在不在 = 无版本号 `open` + `onupgradeneeded` 里 `oldVersion === 0` 就 abort（`src/storage.ts` `_openLegacyIfExists`）；② 开完上次那幅画之后、`requestIdleCallback`（15 s 上限）、一页一次（`src/legacy-app-db.ts`，接在 `src/app.ts` 开机链的 `.finally` 上；没存储时不跑）；**逐键核过才删老库**，核不上 / 写失败 / 老 tab 不让路 → 老库留着、进黑匣子（`diag-log` 的 `storage` 类）、下次开机再来；③ 可重复跑：新库里已有的键**不覆盖**（新库那条更新），只补没有的——同源的老 bundle 会继续写老库，下次 dev 开机再搬一次。
- **和 Fable 原话的一处出入**：Fable 说老库不在时「直接 deleteDatabase 旧名」，我没做。理由：探完到删之间，同源的老 bundle 恰好新建了老库并写进记录的话，这一删会把没搬的新记录删掉；而探测时被 abort 的那次新建，浏览器自己就丢弃，不需要补删（假 IDB 单测「没老库 → 一个库都不建」+ 真 Chromium 首启无裸名库都核了）。要坚持原话的话改一行即可。
- 单测 `test/legacy-app-db.test.mjs`（自带最小假 IndexedDB，跑的是 `storage.ts` 里真的搬家代码）五条：「有老库 → 搬完：新库里 ring / checkpoints 条数 = 老库，缩略图不搬，老库没了」「没老库 → 什么库都不建」「可重复跑：新库里已有的键不覆盖，只补没有的；第二遍没老库 = none」「老 tab 不让路 → 记录已搬、老库留着（kept）；下次再跑 → 删掉」「往新库写失败 → 整个搬家不算数、老库一条不少地留着」。
- 真浏览器（`tools/standalone-smoke.mjs site`，headless Chromium）：首启 `freshHasBareDb: false`；塞老库（ring 2 / 单槽 1 / 缩略图 1）重开 → 新库 `{"checkpoint-ring":2,"checkpoints":1,"gallery-thumbs":0}`、库名列表里没有 `weebpaint`。
- 守卫：`storage-whitelist`「裸名只剩搬家和还原出厂」——src 里 `"weebpaint"` 字面量只准在 `storage.ts`（`LEGACY_DB_NAME`，一处）、`factory-reset.ts`、`app-store.ts`（store 的 appId）、`side-windows.ts`（参考窗目录的 app 名，不是存储）；`store-absent.ts` 的键必须带前缀。写的时候它当场逮住一处（黑匣子文案里的字面量），已改。
- 发版说明 `release-notes/v0.14.51.md` 第一节：缩略图重建一次、「回到之前」的历史搬过来了、画本身不变。

**B2-3 浏览器不给存那句**
- `config.ts` `ISSUES_URL = https://github.com/fangzhangmnm/weebpaint/issues`；`deployment-guard` ④ 新一条：issues 网址只准在 `config.ts`，那句四语都带 `{issues}`（`.ora` 文件里的 XML 命名空间 `…/weebpaint/ns` 是格式契约，不算网址，守卫不管它）。
- `store-absent.ts` 分清「开发开关」（`?nostore` 等）和「浏览器不给存」（存储探针抛异常）；只有后者在开局说：「这个浏览器我们没测过：在这里存不住设置和崩溃备份（关页就没了），作品记得存成文件。遇到问题请到 github.com/fangzhangmnm/weebpaint/issues 告诉我们。」+ 一个「去报告」钮（新标签开 issues）。警告级、不自己收、一页一次、不弹窗。
- smoke 新形态 `local-blocked`（双击打开 + 让 localStorage 一写就抛 SecurityError，模拟 Safari）：开得起来、那句在、正文带 issues 地址、「去报告」钮在。真 Safari 照规则书不测。

**§4 检查表在 B2 之后的变化**：第 2 项三个老裸名 ✗ → ✓；第 10 项「没测过 + 报告入口」补上；其余同第 2 节。

**真机项追加**：同时用正式版和 /dev/ 的那台设备上，第一次开 v0.14.51 后「回到之前」的历史还在不在（自动化核过同一段代码；真机攒批，不催）。

# 2026-09-10 收货 @internal/gallery 0.1.0：图库层搬进包，本仓只剩宿主适配
> 作者：Claude Fable 5.1（claude-fable-5-1）· created 20260910 · as-of v0.14.10 · user 2026-09-10「开干」（三件之三；此前 09-10 晨 user 说过「想优先跑长跑」，WXHW 先当第一消费者，本仓第二）
> 包的契约 = `../20260909 internal-gallery/ai-docs/20260909-proposal-api.md`；家族计划 = 家族根 `ai-docs/20260909-wxhw-2.0-long-haul-plan.md`。

## 搬走了什么（本仓删除，包里同名同签名 + 同一批测试）
`src/gallery/{gallery-model, gallery-path, natural-order, gallery-view-model, cloud-image-model, frame-gate, first-frame-watchdog, library-backup, change-password}.ts`、
`src/{gallery-registry, gallery-attachment, resume-slate, boot-restore, active-gallery}.ts`；`test/` 里对应 12 份契约测试（包仓 153 绿）。
`src/gallery/gallery.ts`（Vue 深模块 959 行）→ 包 `mountGalleryScreen`，本仓改成 ~70 行适配。

## 留下的宿主适配（薄，各自一件事）
| 文件 | 干什么 |
|---|---|
| `src/gallery-pkg-init.ts` | app.ts 第一行 import：`configureDeviceKv`（包永不直碰 localStorage）+ `configureText`（包内 key 抄自本仓 strings.ts，接回 SSoT；`gv.badge.float` 新增落包默认） |
| `src/gallery/gallery.ts` | `mountGallery(el, host)` 对外签名不变；内部 = Vue 注入 + DocHost（session 的 open/rename/setName/push/unload/exit/dropCheckpoint 七处收成端口）+ 数据面（ora/图片白名单 + 裸名↔全名）+ 缩略图 + 加密适配 + 当前夹记忆（appState） |
| `src/gallery/cloud-thumb-cache.ts` | `createThumbCache` over 本仓 storage.ts 的 gallery-thumbs store；旧函数名保留，4 个消费点零改动 |
| `src/gallery-capability.ts` | `createGalleryCapability({ attachment, hasLiveStore })` + `wireCapabilityBroadcast`；`galleryOnline / hasGallery` 名字不变，9 个消费点零改动 |
| `src/diag-log.ts` | 包 diagLog 的转发 + `initDiagLog({ app:"WeebPaint", version })` |
| `src/gallery/gallery-shell.ts` | 只改一行：`uniqueBareName(..., { bare: sessionBareName, full: sessionFileName })`（裸名边界成了参数） |

没动：gallery-shell / gallery-manage-ui / cloud-auth-ui 的 chrome 标记（包 0.1 决定留宿主）；image-thumbs / enc-thumbs / cloud-thumbs（宿主 codec / 密码 UI）；app-store 的 watchFolder 包装（cloud-picker 还在用；与包 data-face 同语义，日后二选一）。

## 验证
- build 全 lint 绿（类型 / 可见性 / 原生 select / deep-import / B 分层 / ambient-store / v0.4 分层 / C2 目录格律）；bundle 1.61MB（+ 包代码，Vue 本就在）；standalone 4.90MB 打包成功。
- `npm test` 1337 绿（含总账 lint：两处指向已搬文件的指针改到 `gallery-attachment-host.ts` / `cloud-picker-host.ts`）。
- `npm run smoke`（GL 真浏览器）：**「reference component」一步红 = 既有毛病**——收货前的树上同样红（`git stash` 基线对照过），与本次无关；其余绿、no GL error。登记在此，归 reference 窗口那条线。
- 真机零；`scripts/preflight.sh`（上传前 F1-F7 夹具 N 轮）没跑——那是 push prod / itch 前的 ritual，dev 线不要求。

## 升级包的方法
`bash "../20260909 internal-gallery/scripts/pull-package.sh" <ver>`（peer 要求 store ≥0.13.0、workbench-elements ≥0.1.0，两者本次已一并收进 vendor-pkgs），改 import 零处（名字同）。

# wave 6 · 红线数据契约对抗夹具清单（上传前全自动跑几轮）

> created 20260828 · by Claude Fable 5 · as-of v0.11.32 / store 0.8.0 批待审
> 出处 = user 0828 四波计划「上传前全自动做几次6」（红线数据契约需严格 QA 夹具）。
> 本文 = 设计稿/清单；实现排在 **store 0.8.0 WeebPaint 收货之后**（F 组的 A4 夹具要打真 guard 路径）。

## 0. 分层原则（谁测什么）

- **node 契约层（已有，硬线内）**：store 355 + WeebPaint 1251——引擎红线（If-Match/驱逐守卫/trash/
  冲突 surface/A4 mock 镜像）全在这层用 mock 打。**wave 6 不重复它们**。
- **playwright 真浏览器层（wave 6 新增）**：只测 node 测不了的——**真 IDB 事务、双 tab 共库、
  reload 存活、真清库**。mock 镜像与真实现的契约漂移正是这层要逮的。
- **真机批（user 手动，不在 wave 6）**：OneDrive 真云、iPad 手感、FSA 权限过期——清单在
  ai-docs/20260827-device-test-batch.md。

## 1. 夹具清单（F 组 = playwright headless，跑真 dist）

宿主形状：抄 tools/single-smoke.mjs（chromium + pageerror/console.error 收集 = 任何红字即 FAIL）；
serve dist/（http，非 file://——要 SW 与真 IDB 常态）；每夹具独立 browser context（干净库）。

- **F1 无痕首启诚实**：新 context 打开 → 无库模式（图库不可开、设置可改、能画）；**不出现**任何
  幽灵图库/registry 自动建库（0828 无痕 bug 的回归钉）。
- **F2 reload 存活 + T-crash**（实现修正：transient 正常 reload=**consent 即焚**不是恢复，原稿写反）：
  改设置（theme）+ 无库新建笔 → reload 后还在（device-kv / rack slot「仅 reload 不丢」）；
  对照=正常 reload 不出恢复横幅；画两笔 → 30s 盲快照 → **CDP Page.crash 真崩** → 重开出恢复横幅。
- **F3 双 tab A4 护栏（实现落点=真 local-cache 层）**：esbuild 直吃库仓源，真 IDB 上双实例
  （=双 tab 的代码路径等价物）重放 A4 契约：撞版回执 + 备份**对方**字节 + restore 改名找回 +
  5min 冷却不刷屏 + 无 guard 系统路径零误报。app 级双 page 真 UI 版（error-badge 可见性）归真机批。
- **F4 factory reset 真清**：建库写数据 → 跑 factory reset（typed consent 走真 UI 流）→
  scanAppNamespace 归零报告 + reload 后=处女态；**中途取消**（guard 各分支：开着文档/attached）
  → 一个字节不动。
- **F5 加密件明文不落盘 → re-scope（0828 实现时收窄）**：开加密库需要真云 attach，playwright 给不了
  ——加密 at-rest 红线留 node 层（store enc-at-rest 测试已对抗）+ 真机批。F5 的可自动化半边 =
  **足迹纪律扫**，已并进 F1/F4：全部 IDB 库名必须 GUID 前缀、店命名空间（weebpaint.*）无库时零出现。
- **F6 single-html**：现有 tools/single-smoke.mjs 原样进批（boot/EMBED/无 SW）。
- **F7 无库满功能**：无库画+导出 png 成功（无地=除云外全功能；kind:none 路径不卡任何非持久化功能）。

云腿说明：F 组零真云（OneDrive 引擎红线已在 node 355 用 mock provider 对抗过；真云=真机批）。
folder 库腿 playwright 给不了真 FSA picker——F 组不含，归真机批。

## 2. 跑法（上传前 ritual；⚠平时纪律见下）

`bash scripts/preflight.sh [轮数=3]`（已落地）= npm test（WeebPaint 硬线）→ store 仓 npm test →
gl-smoke → build.sh + build-single.sh → F3 bundle → 夹具批（F1/F2/F3/F4/F6/F7）**连跑 3 轮**
（user「全自动做几次」；逮 flake/竞态——F2/F3 本质是竞态夹具，单轮绿不算数）。任何一轮红 = 不上传。
日志实时 tee 到 `tmp/preflight-<时间戳>.log`（长跑纪律）。

**平时纪律（user 2026-08-28 拍板）**：playwright 重量批**不随每次改动全量跑**——全批只在上传前
ritual 跑；平时有问题或有测试需求时 **ad hoc 单夹具**（`node tools/preflight/f4-….mjs`）。
测试时间门不动：node 硬线 <1min，playwright 档另册（分钟级，永不进 npm test）。

## 3. 依赖与排程

- ~~F3 依赖 store 0.8.0 收货~~ → **全部已落地（v0.11.34，2026-08-28）**：`tools/preflight/`
  （harness + f1/f2/f3/f4/f7）+ `scripts/preflight.sh`；0.8.0 已收货。
- 实现备注：夹具 context 统一 `locale: zh-CN`（headless 默认 en，中文 label 断言会全体错位）；
  F3 = esbuild 直吃库仓源 `local-cache.ts`（deep import 门牌不放行、tgz 同源同 commit，见 entry 头注）；
  F2 的 CDP `Page.crash` 应答随连接死，必须 race 超时；F4 双 evaluate 前后有 reload，看门狗兜挂死。
- **F4 首跑即抓获真 bug（wave 6 回本）**：device-rack-slot 的 IDB 连接没装 `onversionchange→close`
  自让路 → 单 tab 还原出厂被**自己的**连接把 deleteDatabase 卡成 blocked（谎报「关掉其他标签页」）。
  已修（v0.11.34，同 gallery-registry/crash-store 惯例）。
- 不进 npm test 硬线（分钟级，playwright 档惯例）；进上传前 ritual。

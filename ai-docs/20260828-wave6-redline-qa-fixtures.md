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
- **F2 reload 存活三件**：改笔架（device 槽）+ 改设置 + transient 画两笔 autosave → reload →
  笔架/设置还在（rack slot 契约「仅 reload 不应该丢」）；transient 画布按 resume-slate 契约恢复。
- **F3 双 tab 同库 A4 护栏（收货 0.8.0 后启用）**：同 context 两 page 开同一作品交替保存 →
  警告 surface（error-badge 可见）+ backup 分区多一份**对方**字节 + 5min 冷却不刷屏；
  双方字节都能从备份箱找回（词典序②谁的操作都不静默丢）。
- **F4 factory reset 真清**：建库写数据 → 跑 factory reset（typed consent 走真 UI 流）→
  scanAppNamespace 归零报告 + reload 后=处女态；**中途取消**（guard 各分支：开着文档/attached）
  → 一个字节不动。
- **F5 加密件明文不落盘**：开加密库存一件 → 翻全部 IDB（page.evaluate 枚举本 app 前缀库的所有
  记录字节）→ **找不到明文 magic**（zip/ora 头）；缩略图路径同查（红线「明文派生物落盘即失守」）。
- **F6 single-html**：现有 tools/single-smoke.mjs 原样进批（boot/EMBED/无 SW）。
- **F7 无库满功能**：无库画+导出 png 成功（无地=除云外全功能；kind:none 路径不卡任何非持久化功能）。

云腿说明：F 组零真云（OneDrive 引擎红线已在 node 355 用 mock provider 对抗过；真云=真机批）。
folder 库腿 playwright 给不了真 FSA picker——F 组不含，归真机批。

## 2. 跑法（上传前 ritual）

`bash scripts/preflight.sh`（待写，实现时定形）= npm test（WeebPaint 硬线）→ store 仓 npm test →
gl-smoke → build.sh + build-single.sh → F1-F7 → **整批连跑 3 轮**（user「全自动做几次」；
逮 flake/竞态——F2/F3 本质是竞态夹具，单轮绿不算数）。任何一轮红 = 不上传。

## 3. 依赖与排程

- F3 依赖 store 0.8.0 收货（reconcilePolicy 一行 + A4 guard 真路径）；其余 F 夹具对现版即可实现。
- 实现量级：serve 小脚本 + 每夹具 ~60-120 行 playwright；一个 session 能落完。
- 不进 npm test 硬线（分钟级，playwright 档惯例）；进上传前 ritual。

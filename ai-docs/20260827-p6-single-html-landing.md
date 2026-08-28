# P6 builds 落地台账（single-html 交付物 + cascade 收尾）

> created 20260827 · by Claude Fable 5
> as-of v0.11.21 / 2026-08-27。拍板源 = `20260825-localfile-knight-grill-verdicts.md` §2.9 + §4-P6；能力矩阵 = `20260825-localfile-knight-survey.md` §5。

## 台账（已推 dev）

- **v0.11.20 刀一（数据正确性）**：gallery cascade 真落地（P5 §9.7：`gallery ?? device ?? 工厂`——get 走 getEntry 有项才算、**无库读写全落 device 层**「lang 无库也有家」、挂库后 gallery 层覆盖；开关 = `setGalleryLayerLive`，app-store 装配/换库喂）+ **Safari file:// 无地探针**（detectStoreAbsent 末尾 localStorage probe，炸 = 存储器官被没收 → 缺席模式纯内存不白屏）+ 设置页无库轻折叠（gallery scope 徽章藏起防撒谎，行保留可改）。
- **v0.11.21 刀二（single-html）**：
  - `src/single-file.ts` = 运行时接缝：打包器灌 `window.__WEEBPAINT_EMBED__`，本模块唯一读口（text / base64 bytes / blob URL）。常规 build 无该全局 → 一切走原路（**「html build = 全量 build 运行时 gate」拍板：同一个 bundle 两种壳，不做阉割 build**）。
  - 四装载点接缝化：7z（umd → blob classic script + wasm bytes 直喂 `wasmBinary`）；msal（blob URL——file:// MSAL 无戏，这条给 `http://localhost` 逃生舱）；builtin-brushes / canvas-templates / color-words 三 json 内嵌优先。
  - pwa-shell：单文件 = SW 全家放弃（survey §5.3）。
  - `scripts/pack-single.mjs` 打包器：css+nasin-nanpa 字体 data: 内联、zip-js/bundle 内联、`</script` 转义、PWA 外链剥除；**自检非零退出**（外链残留 / EMBED 缺失 / >25MB）。产物 `dist/weebpaint-single.html`（~4.6MB，**gitignored**——不进仓不进 pages；分发前本地 `bash scripts/build-single.sh`）。
  - `tools/itch-iframe-fixture.html` 夹具 + `tools/single-smoke.mjs`（playwright 档，不进 npm test 硬线）。

## 已验（headless Chromium file://，2026-08-27）

EMBED 6 资产就位；SW 零注册（file:// 连 getRegistrations 都抛 InvalidState——佐证必死）；canvas-first boot 正常（自动开新画布）；零致命 console 错误。复跑：`bash scripts/build-single.sh && node tools/single-smoke.mjs`。

## 已知失败 / 边界（诚实账）

- Safari file:// 全套（worker/wasm/module + 存储降级不白屏）**未实测**——文献 + 探针设计，真机批。
- 加密（7z blob 注入路径）在单文件形态未实测；Firefox file:// 未跑 smoke。
- itch 真沙箱 ≠ 夹具（clipboard allow 缺失等只有真 itch 验得了）；itch 上传 = user 手动，产物就绪。
- `http://localhost` 逃生舱（MSAL 白名单）未验——需要 Azure 侧确认 localhost redirect URI 在册。
- 单文件里持久化 = file:// 共桶 IDB（Chromium）/ 缺席纯内存（Safari）——0825 已知失败 §3.5/§3.7 原样。

## 余账

- 设置页无库**全折叠**（P5 注）：轻折叠已做（徽章藏）；整区折叠等 Editor-only build 语境定稿再议。
- itch embedding 决策（「决定放，好玩嘛」）+ 上传 = user；宣发页 iframe 自动重放 parked 照旧。
- P7 还原出厂设置：等 store 深清口子（0825 §2.10）。

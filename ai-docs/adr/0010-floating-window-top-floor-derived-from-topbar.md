# ADR-0010 · 浮窗拖把地板从顶栏下缘派生，不手填常数

> created 20260902 · by Claude Fable 5.1
> 状态：**accepted**（user 2026-09-02「adr 可以加」；出处 `ai-docs/reports/20260902-ui-epoch-recurring-mistakes.html`
> T3 行 + 本 session 对话：「ipad出血区还是没修好哈哈哈」「ipad必然有开发者指导书的！不可能实测！…必然有safety convention」）。
> 关联：`src/ui/floating-window.ts`（实现）；`ai-docs/20260611-surfaces-z-order.md`（z 归同一 module）。

## 背景

iPad 顶部有一条系统手势/死区：浮窗拖把一旦钻进去就拖不回来（v0.4.11 真机软锁）。修法一直是手填一个地板常数「60」，
到 2026-09-02 这个数散在 9 处（layers / color / timelapse / reference 60 与 96 并存 / panel-gizmo / dev 面板），拖、恢复、旋转、
跨设备还原各走各路——返工 6 次，当日 user 真机第 7 次。

查证的官方约定与缺口（2026-09-02）：
- 苹果的约定是 safe area：WebKit `viewport-fit=cover` + `env(safe-area-inset-*)`；HIG「Layout」要求用 safe area 应对不同状态栏
  高度，iPad 上「别把控件放状态栏中央（多任务 / Stage Manager）」。WeebPaint 顶栏本来就按它摆（`top: max(env(safe-area-inset-top), 6px)`）。
- 缺口：iPadOS 26 窗口模式下 `env(safe-area-inset-*)` 对 PWA 不上报、窗口控制钮盖内容（dev.to reinhart1010，26.0 实测；
  Apple forums 789178 原生也无 API 报控制钮位置）；iOS 18+ 横屏顶边触摸死区 env() 仍报 0（社区建议 ≥20px 缓冲）；
  iPadOS 15 多任务钮不计入安全区且无官方尺寸（Apple forums 691862）。**没有任何 web API 报出死区高度。**

## 决定

1. 浮窗拖把的地板 = **运行时量 `#topBar` 的下缘 + 4px**（顶栏自己由 CSS env() 摆——从官方约定派生；顶栏能点，它下面就能点），
   硬底线 = `safeAreaTop + 24px`（顶栏不可见时兜底；24 ≥ 社区 20px 缓冲）。实现 = `floatingTopFloor()`，全仓唯一出处。
2. 地板只在一个 module 算：拖、恢复持久化坐标、开窗兜底回屏、视口 resize/旋转四条路都穿它；参考窗（frontend/ 组件）经宿主端口
   注入同一个数，不自己定常数。
3. **禁止**再写地板常数（60/96/52…）；需要别的边距一律改 `computeTopFloor` 的参数。

## 后果

- 顶栏变高/变位（换代、iPad 状态栏出现）地板自动跟；出血区规则的复发路径（新窗抄旧常数）结构上消失。
- 代价：顶栏不可见的页面（图库态）地板退回硬底线；若将来有不经顶栏的浮窗需求，改 `computeTopFloor` 而不是再造一处。
- 真机未验（user 2026-09-02：顺手观察，不专门测）；观察项在 `ai-docs/20260827-device-test-batch.md` 场景 E.1。

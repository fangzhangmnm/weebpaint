# 收货 `@internal/workbench-elements`（总账 #2）：先要库补一条规则，再换 import

> created 20261021 by Claude Fable 5.1 · as-of v0.14.38 / workbench-elements 0.1.2 · 周账 §6 道 2 的「接着做」之一；按撞车规矩（库只有道 1 能改），本仓这边只写交接，不动库仓。

> **2026-10-21 晚收了**：道 1 发 0.1.3（子弹层规则进包）→ v0.14.41 按下面「本仓的活」做完（27 处 import、三个本地件删、`src/ui/icon.ts` 只剩 `slotCaretHtml`、`src/workbench-init.ts` configureFloors、`vendor/internal-css/workbench-elements.css`、styles.css 删 29 条同选择器规则、build.sh 封口）。小三角 `slotCaretHtml` 要不要提给包仍等 user。

## 一句话

WeebPaint 的四个 UI 原子（`src/ui/popup-menu.ts` / `src/anchored-popup.ts` / `src/ui/notice.ts` / `src/ui/icon.ts`）和包 0.1.2 的源码几乎逐行相同（2026-09-09 包就是从这里 WET 出去的），**但两边各自长了一条对方没有的规则**，直接换 import 会把本仓 09-11 的修复丢掉。所以顺序是：库先补 → 本仓再收。

## 差异（`diff src/ui/popup-menu.ts ↔ package/src/popup-menu.ts`，2026-10-21 核）

| 哪边有 | 规则 | 出处 |
|---|---|---|
| **只有本仓** | 外点关的判定：落在**子弹层**（锚在本弹层里的 popup，如弹层内 select-field 的下拉）上的那一击不算外面，父弹层留着 | 2026-09-11 图层调整弹层里选混合模式不许把弹层关掉（`popup-menu.ts` `onDocPointerDown` 第 191–192 行） |
| **只有包** | 菜单外的滚动让锚真的移了位（> 0.5 px）= 关；菜单内部滚动不算；锚没动的 scroll 不算（iOS tap 的幽灵 scroll） | 包 0.1.1 / 0.1.2（2026-09-30 WXHW 书库 ⋯ 菜单漂在半空 / iOS 删不了） |
| 本仓 `anchored-popup.ts` | `topToolbarBottom()` 直接 import `ui/context-toolbar` | 包改成 `configureFloors({ toolbarBottom, floatingTop })` 注入（host-floors.ts） |
| 本仓 `notice.ts` | 停靠顶部的地板直接 import `ui/floating-window` 的 `floatingTopFloor()` | 同上，走 `floors.floatingTop()` |
| 本仓 `icon.ts` | 多一个 `slotCaretHtml()`（右下角小三角 = 有菜单记号，09-11 三角纪律） | 包没有；本仓留一个 `src/ui/icon.ts` 只装它（或提给包，看 user） |

## 给道 1（库）的活

1. `popup-menu.ts` 的 `onDocPointerDown` 补「子弹层不算外面」那两行（本仓第 191–192 行原样搬），加一条测试（父弹层里开子 popup，点子 popup 不关父）。
2. patch 发版（0.1.3）。消费方 WXHW / MoonSinger / KudsRocket 不受影响（只是多放行一种点击）。

## 道 1 发完之后，本仓的活（#2 本体）

1. `pull-package.sh 0.1.3`；`vendor/internal-css/workbench-elements.css` 拷进来 + `<link>` + SW 预缓存 + `pack-standalone` 内联（和 gallery.css 同一套做法，2026-10-21 v0.14.37 的 commit 是样板）；`styles.css` 里和包同选择器的规则删掉（用 `tmp/css-surgery.py` 那种比对，别手删）。
2. `src/app.ts` boot 早期 `configureFloors({ toolbarBottom: contextToolbarBottom, floatingTop: floatingTopFloor })`。
3. 26 处 import（`grep -rn "ui/popup-menu.ts\|anchored-popup.ts\|ui/notice.ts\|ui/icon.ts" src`）改成 `@internal/workbench-elements`；删四个本地文件（`icon.ts` 只留 `slotCaretHtml`）；`scripts/build.sh` 加一条「这四个名字不许在 src 里复活」的 lint。
4. 跑：`npm test`、F8（菜单一圈）、F9（图库 ⋯ 菜单）、F10（Vue 组件）、standalone smoke；iOS 真机归 user。

## 为什么不现在换

包 0.1.2 缺 09-11 那条规则：换了 = 图层调整弹层里一选混合模式弹层就关（user 09-11 真机报过的那个 bug 复活）。库改动只有道 1 能做。

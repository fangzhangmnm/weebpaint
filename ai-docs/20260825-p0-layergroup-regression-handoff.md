# P0 图层组恶性回归修复批 — handoff

> created 20260825 · as-of v0.10.26 / 2026-08-25
> 委派：user 2026-08-25 周组会拍板。本批 = 宣发前最高优先（P0），由独立 agent session 执行。
> 背景：opus 轮 v0.10.22-25 + store 0.3.1/0.3.2 已整批回滚（详 `20260821-opus-round-rollback-and-security-handoff.md`），main 现 = v0.10.21 + v0.10.26（authority=/consumers，user 手动 patch）。**本批不碰那摊事**。

---

## 0. 一句话

图层组在夏音 v0.3 创作期间发生恶性回归——组内画画报错、对组变换报错，user 被迫全程只用扁平图层组。破案修复它，外加两个小骑乘（曲线 UI 禁用、录制静默关闭破案）。

## 1. 范围（in）

### ① 图层组家族回归（主件，一个根因群一起破）

user 原话（2026-08-25 组会清单）：
- 「对图层组变换会报错，在图层组里面的图层画也报错。typeerror: undefined is not an object (evaluating g[0].u) weebpaint-60bd77785797.mjs:352」
- 「weebpaint layergroup内落笔弹typeerror，无预览，有commit」
- 「修复图层组的恶性回归事件，我画夏音的时候只能用扁平图层组」
- 「图层组改名的时候ui快速抖动」

事实与线索：
- `weebpaint-60bd77785797.mjs` = **v0.10.26 当前 dev bundle**，`dist/` 里有 `.map`，行 352 的 `g[0].u` 直接 sourcemap 反解，不用猜。
- **「无预览，有 commit」是最凶的一条**：说明 mutation 管线在预览断掉的情况下仍在写数据（可能写坏 / 写不完整）。破案时先回答：commit 进去的字节是对的还是坏的？有没有已存档案被写坏的风险？
- 回归窗口嫌疑（按 git log，从大到小）：
  - v0.10.15 `4d8812c`：QoL 批动过**组保序/组复制**；
  - v0.10.16 `86cf212`：动过**变换 handler nearest-wins 内环 tie-break**；
  - v0.10.17 `7c17803`：动过 store 收货与换文档路径（嫌疑较低）。
  - bisect 就从 v0.10.14↔15↔16 之间对分；夏音 v0.3 创作用的具体版本未考证，别假设。
- 改名抖动可能是独立的 UI 层小病（渲染循环互踢），也可能同源；先破案再定。

### ② 曲线 adjust：禁用 UI 入口（骑乘）

user 原话：「曲线adjust的那坨屎……要不先删了？不管我们这一轮重做不重做？反正UI完全是坏的」；2026-08-25 拍板：「**曲线先禁用ui到时候整理**」。
- 做法：只藏/禁入口（menu item 用仓内惯例 `hidden` 属性，参考 v0.10.21 云开关 gating 的 menuGallery 做法），**代码不删**，将来整理轮再算总账。
- i18n：如需文案走 SSoT，不许裸中文（已毕业项目）。

### ③ 录制（timelapse）静默关闭破案（骑乘，**只查不修**）

user 原话：「夏音v0.3事故：某次回来画的时候画了半天发现录制关了。这个能分析为什么吗？会不会和版本更新有关？」2026-08-25 拍板进批。
- 交付 = **报告**，不动代码：录制开关 state 存哪、什么路径会清/重置它（版本升级？SW 换版？换文档/adopt？双实例 WebLocks 让位？cloud-enabled gating 波及？）、能否复现、候选护栏方案列选项。
- 修复与护栏**归人类拍板后另开批**，本批不许顺手修。

## 2. 范围外（明确不做，防 scope creep）

- **液化对图层组**：user 2026-08-25 拍板「多图层液化也许需要动蛮多东西。我感觉是不应该在这里做」——是新 feature 不是回归，登记 backlog 即可。
- P1/P2/P3 全部（alpha 导出护栏、defringe、模糊黑边、smudge、水印、导出模态化、吸色按钮、误移画布、压感拆分……）——都在总计划后置区，别碰。
- store / `@internal/store` / auth：**一行不动**。缺接口 escalate human，绝不 app 端绕（家规）。
- 无地骑士、UI 骑士：另有 session。

## 3. 纪律（钉死）

1. **math/手感类 bug 禁猜测式调试**：动手前先写清「输入是什么、输出是什么」的问题陈述（家规）。g[0].u 先 sourcemap 定位 + 最小复现（headless 能复现最好），再改。
2. **mutation 走 wp2 令牌**（ADR-0008 硬规则）：组内落笔那条八成死在 layerTree verb / collector / LayersFace 附近——修复不许绕令牌体系开裸写后门。
3. 回归修复**必须补回归测试**（node test，headless 可测的部分：组内落笔 commit 路径、组变换、组改名）。opus 轮的教训之一就是 800 行改动零测试。
4. 发版 ritual 照旧：bump patch（v0.10.27 起）、成对 commit（源→bundle）、tsc 门、`npm test` 全量绿（<1min 硬线）、push dev。**prod 必问人类**。
5. 真机验收按批交付：修完 push dev 后，末尾列一张**一次过的真机测试清单**（组内画/组变换/组改名/曲线入口已藏/别的 adjust 还活着），user「只测一次，就是交付」。
6. 错误处理 funnel 到 `reportError`（error-badge），dev 诊断文案英文（已毕业项目 logging 家规）。
7. 如用 worktree：改完必须 merge 回 main 落盘，并告知 worktree 位置。

## 4. 交付物清单

1. 根因陈述（每个 bug 一段：输入/输出/断在哪/为什么 v0.10.1x 引入）
2. 修复 + 回归测试，push dev（版本号照 ritual）
3. 「commit 无预览」期间写入数据的完好性结论（有没有坏档风险，如何自查）
4. 录制静默关闭破案报告（只报告，含候选护栏选项列表）
5. 真机测试清单一张
6. backlog 登记一句：液化对图层组 = 新 feature，待排期

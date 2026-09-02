# ADR-0011 · 反馈面按角色分 band：通知在 busy 之上、决策面之上不许有东西、模态期通知让位

> created 20260902 · by Claude Fable 5.1
> 状态：**accepted**（user 2026-09-02「toast, busy overlay, 红线区问题对话框，这些的 z order 很容易出红线事故，考古好好反省一下」
> 「其实就是当时 busy overlay 挡住了 reconcile dialogue 导致用户没法选」「adr 可以加」；出处 `ai-docs/reports/20260902-ui-epoch-recurring-mistakes.html`
> 「反馈面 z-order 红线反省」节）。
> 关联：`src/ui/notice.ts` / `src/ui/sheet.ts` / `src/ui/interaction-lock.ts`；band 表 SSoT = `styles.css :root --z-*`；ADR-0009 前提「冲突必 surface」。

## 背景

反馈面有三种**角色**：锁（busy 遮罩）、决策（sync gate / confirm）、通知（toast / 横幅）。代码里它们却是逐元素手填的 z 数字
+ 各自 inline 样式 + 两条互不知情的底部栈。事故链：07-22 gate(520)<busy(540) → 冲突决策面被遮罩盖死（**红线**：用户做不了决定，
修法翻 band）；08-19 busy 期弹确认 sheet 被盖 → 死锁（修法 throw）；08-21 busy 遮罩挡不住 keydown/paste → 逐处补守卫；
v0.9.4 横幅顶部通栏压无框顶栏挪底部，08-29 离线横幅又钉回 top:0；未爆雷：错误横幅 z 9999 高于 gate 且同锚底部，能盖住
keep/pull/branch 按钮。

## 决定

1. **角色决定 band，不是元素**：`… modal(500) < busy(520) < gate(540) < notice(560) < popout(600)`。
   - gate（决策）高于 busy：忙的时候决策面也必须可见可按（冲突必 surface）。
   - notice（通知）高于 busy：忙的时候错误也要看得见；但通知**永远不盖决策面的按钮行**——见 3。
   - 数字只在 `styles.css :root`；反馈面 module 零 inline z。
2. **锁是一把锁**（`interaction-lock`）：busy 只是它的 adapter；「此刻允许什么」由策略表回答（busy 期只放 gate / notice / 修饰键清位）；
   busy 期开模态 = 编程错误 → 响亮 throw（所有 sheet 都过这道，不止三原语）。
3. **通知让位**：所有通知进一条栈（`notice`）；任何模态/gate 开着（backdrop 带 data-open）→ 整条栈停靠顶栏之下。
   让位靠 MutationObserver 观察 backdrop，**不靠调用方记得调**。
4. 模态只有一个 owner（`sheet`）：单 backdrop、栈、Escape/backdrop 的取消语义、关时 blur；gate 走同一 module（band gate、
   allowDuringBusy、不可 dismiss）。

## 后果

- 「决策按钮被盖」「busy 期改 doc」两类红线在结构上关掉；新增反馈面只需选角色，不需要想 z。
- 例外仍存：index.html 内联 bootstrap 的 `#__errBar`（bundle 加载前的早期兜底，z 9999）——它只在 bundle 没起来时出现，此时也没有决策面。
- 若将来需要「忙时也能开的对话框」，应做成 gate 角色（allowDuringBusy），而不是给 modal 提 z。

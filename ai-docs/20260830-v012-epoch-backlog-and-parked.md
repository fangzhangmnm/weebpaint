# v0.12 纪元台账：backlog + parked（宣发后 patch 纪元）

> created 20260830 by Claude Fable 5
> as-of v0.12.0 / 2026-08-30
> 出处：journal/20260829 v0.11 feedbacks.md（user 原话）+ 2026-08-30 对话补充。
> user 拍板：纪元号 = **0.12**（「嗯那么应该是0.12」2026-08-30）；主题 = 宣发后 patch——
> long requested features（手指、曲线）+ QoL + 修复。

## 纪元 backlog（feature，未排期）

- **手指**（smudge/涂抹）——long requested。
- **曲线**（curve 工具）——long requested。

## user 拍板 park（「可以先把之前一些不能随手修的需求parked」2026-08-29）

1. **reference 窗口整改批**（建议一批做）：
   - 背景不跟 color theme（很跳的黑色）；
   - UI redesign + **multi reference** 支持；
   - image size warning（大图警告）；
   - 「perhaps auto convert to jpeg?」（user 疑问句，未拍板——做前要确认）；
   - 入口直觉：「每次想开 reference 总是去按图层按钮想在那里找」→ 入口/分组重排候选。
2. **上旧库也问笔刷播种问题**：根因 = `switchFlow` 的 `askSeed: minted.created`——`created` 是
   「registry 条目新造」不是「库是新的」；新设备/registry 清空后连**旧**云库也会被问「继承 or
   出厂」（答案其实无效：rack getInitData 契约=库里 json 已存在则忽略种子）。
   正解候选：把问句推迟到 rack collection `getInitData` 被真正咨询（=库确实空）的时刻再弹 sheet，
   永远静默捕种子。改的是 P3 verdicts §1.9 的用户流程 → **需 user 拍板后动**。
3. **UI cleanup pass**（user：「perhaps we need to do the ui cleanup pass this turn」——本轮只按
   标准件重做了离线横幅=.toast 底部 pill；全面 cleanup 另起一轮）。

## 本轮已修（不在 park 内）

- itch ritual 跟 prod 不跟 main（push-itch HEAD==prod 守卫）。
- reconnect 三连 bug + attach 单飞锁 + 横幅标准化 = v0.12.0，
  详 ai-docs/20260830-reconnect-gallery-online-flag-race.md。

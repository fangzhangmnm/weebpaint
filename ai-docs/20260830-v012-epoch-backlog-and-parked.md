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

1. **reference 窗口整改批** → **0830 全落地 v0.12.7 推 dev**（spec =
   **ai-docs/20260830-reference-window-rework-spec.md**，user 多轮 grill 逐条拍板）：ora format 2
   `.weebpaint/` 全家桶零迁移 + 1024² 拍平 jpeg 压缩 + borderless 多页 UI + nearest/点阵对齐 +
   addReferenceImage 漏斗；1257 node 测 + GL smoke 组件用例全绿。**批内两个尾巴**（edited by
   Claude Fable 5）：①「image size warning」被强制压缩政策实质 supersede（图进不了大，唯余
   「压大保原」病理边角）——按 supersede 记，user 有异议再复活；②「图层面板加 PiP 入口」候选
   （0830 心理学讨论产物）未裁未做，等 user 一句话。下列原始清单仅存档：
   - ~~背景不跟 color theme（很跳的黑色）~~ → **v0.12.5 已修**（user 0830「顺便修」：底=--void+点阵
     对齐 editor 画布，canvas 自画暗棋盘退役；edited by Claude Fable 5）；
   - UI redesign + **multi reference** 支持（user 0830：genai 稻草人之外正常画画也有用——手/腿/帽子参考图多开）。
     **0830 数据契约勘察（edited by Claude Fable 5）：可零 backward migration 实现**。现状=单张
     `weebpaint/reference.png`（原样字节，运行时 persistBlob round-trip）+ desk.refPanel{enabled,position,
     viewport}（.weebpaint/editor-state.json）。加法设计：reference.png 保槽位0 + `reference-2.png…` 新
     entry；desk 加 `refPanels[]` 新键（⚠ mergeInto 白名单机制：新键必须进 freshGroups 默认值才收得进，
     否则 Unserialize 静默丢）。新版读旧文件：refPanels 缺→落单张，天然零迁移。formatVersion 不必 bump
     （additive 非 break；wrote-with 比较已覆盖「新写旧读」警告，user 0830：旧读新不担心）。
     成本注意：每张参考原字节全进 ora（decode zipUnpack 全量进 RAM + 云同步体积）→ 与本批「大图警告 /
     auto-jpeg?」绑一起做正合适；thumbnail 恒最后一 entry 的 byte-range 契约不受影响（v399 起按名取）。
   - image size warning（大图警告）；
   - 「perhaps auto convert to jpeg?」（user 疑问句，未拍板——做前要确认）；
   - 入口直觉：「每次想开 reference 总是去按图层按钮想在那里找」→ 入口/分组重排候选
     （0830 心理学讨论已呈：app 自己的「设为参考层」语义联想+对象vs设置分类+心流手位；
     0830 第一遍已把入口从视图页挪到画布页，图层面板加 PiP 钮等候整改批 grill）。
2. **上旧库也问笔刷播种问题**：根因 = `switchFlow` 的 `askSeed: minted.created`——`created` 是
   「registry 条目新造」不是「库是新的」；新设备/registry 清空后连**旧**云库也会被问「继承 or
   出厂」（答案其实无效：rack getInitData 契约=库里 json 已存在则忽略种子）。
   **0830 拍板+机制勘误（edited by Claude Fable 5）**：user 批了语义 abc（a 取消=出厂兜底；b 无种子
   场景静默 builtin；c 问句挪离「点连接」时刻）。但原候选「getInitData 被咨询=库空」**premise 已证伪**
   ——collection.ts 的 getInitData 是 eager、按「本地 IDB 空」触发（新设备连旧库也会咨询，种子先落地
   云端到了再覆盖），照原案做会把问句弹给新设备连旧库。正解改为**连接时探目标库**：需 store 只读口子
   `collectionPeek`（collections 云面 fetchMeta 判 `.appId/brush-rack.json` 存在性，零记账），
   "absent"+有种子才弹问句；"present"/"unknown"（离线）不问。
   边角：scaffold（开库即建空信封）意味着「存在但空信封」的残库判 present→静默出厂，方向安全。
   **→ 0830 结案（edited by Claude Fable 5）**：user「同意」→ store 0.11.0（collectionPeek 三态探针，
   4 契约测）+ v0.12.6（switchFlow 永远静默捕种子 + _peekTargetRack 临时店探针 + askSeed 判据退役 +
   prefs 只随继承应用）已推 dev。本条出 park。
3. **UI cleanup pass**（user：「perhaps we need to do the ui cleanup pass this turn」——全面 cleanup
   另起一轮慢慢 grill。**0830 第一遍已落 v0.12.5**：视图 tab 解散（工作台三件归画布页、显示开关并入
   设置页三段分组、文件页纯行政、timelapse 判画布页），离线横幅 .toast 化在 v0.12.0）。

## 本轮已修（不在 park 内）

- itch ritual 跟 prod 不跟 main（push-itch HEAD==prod 守卫）。
- reconnect 三连 bug + attach 单飞锁 + 横幅标准化 = v0.12.0，
  详 ai-docs/20260830-reconnect-gallery-online-flag-race.md。
- 连接语义重构 + 连接菜单终形 = v0.12.1-0.12.2（user 同日拍板；判例=ai-docs/20260830-gallery-connect-semantics-rework.md）。
  **user 0830 验收原话「主菜单我看了下其实已经很好了」**——gallery 主菜单件就此关单（含老账 ledger #14/A5 主菜单精简的「等真机一句话」）。edited by Claude Fable 5 2026-08-30。
- **模糊工具黑边 = v0.12.3**（user 0830 拍板从 park #1 单拆直做；手指/涂抹大件仍在纪元 backlog）：
  blur 卷积迁预乘 alpha 空间，透明像素不再把黑拖进羽化边；回归测锁死。锐化路径的参考模糊仍是
  straight 空间（只影响 luma delta，未见用户报症状，未动）。
- **桌面 MSAL popup = v0.12.4 + store 0.10.0**（user 0825 拍板、0830 确认直做）：signIn 加
  mode:"popup" 口子（库缺省 redirect 零变）；app 侧 oneDriveInteractMode 分流——桌面连接/换账号/
  重连全程不离页，iOS/Android 维持 redirect 舞步；user_cancelled 静默。popup 交互本身无法无头
  验证（要真微软登录），user 下次自己连的时候顺手看一眼即可。

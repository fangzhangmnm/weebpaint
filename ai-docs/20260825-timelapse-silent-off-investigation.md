# timelapse 录制静默关闭破案报告（只查不修）

> created 20260825 · as-of v0.10.26 / 2026-08-25
> 事故：夏音 v0.3 创作期间「某次回来画的时候画了半天发现录制关了」（user 2026-08-25 组会）。
> 本报告 = P0 批骑乘③交付物：只破案列选项，修复与护栏归人类拍板后另开批。
> user 补充口供（2026-08-25）：「有可能只是人类不小心点了一下 stop，人类记忆不可靠」「画中间确实做了那几次版本更新」。

## 1. 状态模型（现状）

- 录制态**存在 .ora 文件里**（per-doc sticky）：`.weebpaint/timelapse.json`（`on` 开关 / 取景框 pin / n / motionSamples）+ `timelapse.mp4`。不在 localStorage/设置里。
- 载入：`timelapseAdopt` → `TimelapseDocState.restore`（timelapse-state.ts）。**任何回读失败 = 自愈止损：整个录像作废、on=false、只报一条 info 级消息**（状态栏一闪，画画时极易错过）。
- 保存：`timelapseForSave` → `serializeForSave`；`settings===null` 时**不写 entry**（ora.ts:201）→ 作废态一经保存就无痕固化，下次载入等于「从没开过录」。
- 暂停后无自动恢复：`resume()` 只有手动 UI 一条路。

## 2. 会把录制关掉的全部路径（代码穷举）

| # | 路径 | 代码点 | 表现 |
|---|------|--------|------|
| P1 | 人类点 pause/stop | timelapse-ui → `timelapsePause()` | on=false，sticky 落盘。**无二次确认**（clear 有，pause 没有） |
| P2 | 采帧/编码链路任一异常 → `_dropEncoder` | timelapse-session.ts:91,93,121 | **单次故障即永久暂停**（on=false sticky），只报一条 info。iPad 退后台挂起可杀 VideoEncoder → 回来第一笔 commit 就触发 |
| P3 | 回读自愈作废（corrupt-json / mp4-missing / corrupt-mp4 / sample-count-mismatch） | timelapse-state.ts `restore` | 录像+设置+开关全没，info 一条 |
| P4 | 文档「换新身份」 | session-state.ts:619 `timelapseDetach` + 632 `timelapseAdopt({})` | 新文档=默认关。**v0.10.23（opus，已回滚）「关云=变新文档」会走这条**：升级到 0.10.23 且云关 → 当前文档变新文档 → 录制静默重置 |
| P5 | 双实例：另一实例持旧态保存同一文档 | v0.10.16 per-doc 活锁应挡住并发编辑 | 低嫌疑，未发现具体通路 |

## 3. 附带发现：一颗会「毁素材」的雷（P3 的具体成因，建议修）

冻结保存路径有 sample-count 自毁组合：录制中 → 保存时 drain 出 ≥2 帧进 `motion` → 但尾帧编不出（GL lost / 编码器死，`tail=null`）→ 冻结 passthrough 写**旧** `lastMp4`，而 json 写**新** `motionSamples=motion.length` → 数字领先 mp4 实际样本数 → **下次打开命中 `sample-count-mismatch` → 整段录像作废 + 关录**（timelapse-state.ts:141 `j.motionSamples > d.samples.length` throw）。
一次「保存时恰好 GL lost」就够布雷；踩雷在下一次打开，时间上和「版本更新后重开」天然重合——**这条能同时解释「更新完回来发现关了」且素材没了**。

## 4. 版本更新时间线（user：画中间确实更了几次）

- opus 轮 v0.10.22-25（8-21 夜，后整批回滚）**没有直接改 timelapse 代码**（逐 commit stat 已查）。
- 但 v0.10.23「cloud-enabled 默认关 + 关云=变新文档」若在用户设备上生效过一次，P4 即触发——录制关+取景框 pin 重置，素材随旧文档身份留在原文件（不算丢）。
- 回滚本身（降级 0.10.25→0.10.21+26）不改 timelapse 格式，不构成 P3。
- v0.10.15/16 只动过 timelapse 的缩放 nearest / 伪依赖文件名，格式未变。
- **每次版本更新 = SW 换版 reload = 文档重载一次 = 过一遍 P3/P4 的门**——更新次数越多，撞自愈作废的机会越多。

## 5. 结论（按嫌疑排序）

1. **P2 单次故障永久暂停**：最符合「画了半天发现关了」——iPad 退后台/内存压力杀编码器，回来第一笔就 pause，info 提示一闪即逝。日常必然发生型。
2. **P1 误触 pause**：user 自供可能。现 UI 无确认、无常驻录制指示，误触后无从察觉。
3. **P4 v0.10.23 关云=变新文档**（仅当事故落在 8-21 opus 窗口内）。
4. **P3/§3 sample-count 雷**（若素材也没了，这条嫌疑飙升——请人类核对：录像文件还在不在、时长对不对）。
5. P5 双实例：低。

复现难度：P2 可真机复现（开录→退后台几分钟→回来画→看开关）；§3 雷可 headless 复现（构造 drain>1+tail=null 的保存再 restore）。

## 6. 候选护栏（列选项，人类拍板后另开批）

- **A 自动复活**：`_dropEncoder` 后下一次 commit 自动重建编码器重试，连挂 N 次才真 pause（现状=resume 只有手动）。
- **B 提级**：captureHalted / restoreLost 从 info 升 warning（顶部 banner），错过率大降。
- **C 常驻录制指示灯**：画布界面常显 REC 红点/灰点，on/off 一眼可见——同时治 P1 误触与 P2 无感。
- **D 拆 §3 雷**：冻结路径 json 的 motionSamples 写 `savedMotionCount`（与 lastMp4 一致）而非 motion.length；或 restore 端 mismatch 降级为「按 mp4 实际样本数截断」而不是整体作废。
- **E 作废不删证据**：restore 失败时原字节 passthrough 保留 entry（只停录不销毁），给未来版本修复留活口。
- **F pause 加轻确认或 undo toast**：防误触。

## 7. 拍板与落地（2026-08-25 当日，user 原话裁决）

**user 裁决**：事故本身「人类回忆非常大概率 P4」（opus 窗口 v0.10.23 关云=变新文档；mp4 还在=视频完成，与 P4 素材不丢相符）；「P5 不排除」（双实例在其生产环境中频发生）；也可能只是误触 stop；「123 也不应该静默，雷也修」「abcdef 护栏都做」。

**同日落地（v0.10.28）**：
- **A**：`_dropEncoder` 改自动复活——编码器死后下一 commit 自动重建续录（IDR 起步，同 resume 语义），连挂 3 次才真 pause；编码成功清 strike。
- **B**：captureHalted（第 3 strike）/ restore 问题全部升 **warning**（顶部 banner）；按「素材受损但录制活着」vs「读不懂已停录」分文案（`tl.restoreDegraded` / `tl.restoreLost` 改稿）。
- **C**：HUD chip 改常驻——开过录就显示：录制中=红点呼吸「录制中」、停录=灰点静止「已停止」；覆盖 2026-08-19「stop=无 chip」细则（本次 user 拍板 on/off 一眼可见）。
- **D**：雷拆双侧——写侧冻结保存 `motionSamples` 改写 `savedMotionCount`（与 lastMp4 一致）；读侧 mismatch 降级为按 mp4 实际截断（不作废）。
- **E**：corrupt-json/corrupt-mp4 原字节进检疫区、保存原样 passthrough 回 ora（不销毁 entry）；出所=用户明确 startRecording 或 clear。**mp4-missing 不再连坐**：设置+开关保命从零续录。
- **F**：停止录制加确认 sheet（同 clear 惯例；配合 C 的停录灰 chip，误触可见可逆）。
- 测试：护栏回归 6 条入套件（雷场景复现 / 旧毒档截断 / 检疫 passthrough / 出所 / mp4-missing 保命）。

**改名（夏音 hash→改名）核查**：`es.rename` = flushLocal（正常保存，timelapse 随行）+ `store.tryMove` 字节级搬移，不走 detach/adopt、不换文档身份 → **改名本身不是关录通路**；但它触发的保存与任何保存一样曾是 §3 雷的埋雷机会，拆雷后干净。
- P4 通路本体（关云=变新文档）已随 opus 轮回滚不存在；云开关流程归无地骑士 session 重设计，不在本批。

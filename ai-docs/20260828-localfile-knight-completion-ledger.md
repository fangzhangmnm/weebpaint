# 无地骑士 + v0.10 起全部欠账 · 完成状态总账（考古产出）

> created 20260828 · by Claude Fable 5 · as-of v0.11.24
> 考古语料 = journal 五篇（20260820/0821/0823/0825×2）逐行 + ai-docs（0825 案卷/0819 spec/0820 诚实性
> handoff/0821 QA 落账/P3/P5/P6 台账）+ WeebPaint·store 两仓代码 grep 实证。
> **用法（宣发红线的执行面）**：§3+§4 每一行你逐条裁「做」或「park」；本表清零（全 done 或全 user-park）
> 之前禁止宣发。AI 不得往「发后」分类，不得 nudge 测试/文案。

## 1. ✅ 已完成（拉通对账，含你怀疑没落而实际落了的）

- **无地骑士 P0-P6 全量**：P0 store 事务收敛→P1 DocHome/家动词/canvas-first→P1.5 boot 三态→
  P2 T-crash/transient/三键挽留→P3 gallery 多实例/热插拔/锁名→P4 revert v2（坐下 qualifier/undo revert/ring）→
  P5 settings 去 store 化（六类分类学/device-kv/resume-slate）→P6 single-html+探针（v0.11.0-0.11.21）。
- **无库真 sunset + ambient store 退役 + 店懒出生**（v0.11.22-24）：幽灵图库拆除；requireStore/galleryBackend
  表态制；null-store/dormant 替身物理退役；`_storeFull≠null⇔attached`；switchFlow 焚画守卫；build.sh lint。
- **你点名怀疑、grep 实证已落**：双击 .ora file_handlers（local-file-session.ts:100）；T-crash 盲快照=
  与保存同一 encode 全量字节（mp4 passthrough，crash-store.ts:6）；iOS redirect 待领养（pending-adoption
  三文件）；store 删除队列持久化（delete.ts:90「id 随队列持久化」）；converge isDirtyAnywhere（safe-resolve.ts:71）；
  getPeek source 必填（create-store.ts:265）；busy 文案 i18n（store 裸中文清零，StoreTextKey 机制）。
- 0821 QA 拍板全落：导出 hub 三去向/Revert 接活/按住 E 临时橡皮/hex 三位/换文档挽留 sheet/透视 nearest-wins/
  自然排序/双实例 per-doc 锁/崩溃环误触修。
- store 0.3.5-0.6.0 全收货；If-Match 全库家规；personal-account-only；ADR-22 案卷。

## 2. 🔧 进行中（你已拍板，我的当前执行队列，按序）——**0828 深夜状态：三刀码全落，卡审版门**

1. ✅码落 **{local:true} 清零**（WeebPaint v0.11.25 推 dev：播种纪元整体退役含 cloud-enabled 死缓执行）
   **+ store 删 cloudless**（store 仓已落，-210 行）。
2. ✅码落 **encryption 独立库**：新仓 `20260828 internal-encryption`（@internal/encryption，GitHub private，
   17 测绿）。实施形比原案更净：**依赖倒置端口**（store config.encryption 必填收 createEncryption 实例，
   两包零依赖、无烤 dist）——store 零加密知识，Store.encryption 面退役，无库加密探测/解密闭环。
3. ✅码落 **wipe/无痕扫口子**（store maintenance.ts：typed consent 库内比对/blocked 诚实报告/
   命名空间级库名+键计数红线口径，契约测试 5 件）。P7 app 侧 UI = 收货后做。
→ **当前 gate = 审版门（版本纪律人类 gate）**：store 0.6.0→提议 0.7.0、encryption 首发提议 0.1.0；
   材料 = store `git diff HEAD~2 -- api/store.api.md` + encryption 仓 `dist/encryption.d.ts` 全文 +
   两包 pack 清单。过目 → release → WeebPaint 收货（app 侧 encryption 器官接线 + P7 UI + 无库加密闭环验证）。

## 2′. 四轮分波（你 0828 拍板的施工组织）

1. **持久化收敛轮**（红线，必须干净完美；新旧两套持久化契约共存=禁止宣发）：§2 三刀 + §3 的
   #19 GDrive 数据结构、#20 笔架静默加载+心智模型、#21 双 tab 本地互覆护栏、#22 无库新建、#23 transient
   挂库去向（必 grill）、#24 图库显示杂物、笔架文件家公民、导出图库、per-account pin、图库长驻轮询、
   主菜单精简（「不能让用户对持久化模型 confusion」＝最高优先级）；懒 hash **舍弃**（ADR-0025 补 superseded）。
2. **随手修轮**（subagent）：#2 液化组、#3 保序、#4 兄弟组、#5 录制窗、#6 改名抖动、#7 直方图护栏、
   #8 defringe、#12 分两支笔、#13 水印（宣发需要）、#14 剪贴板精简、#18 库全量备份、#27 device 图标收货。
3. **UI 整改轮**（可后置看 quota）：#9 模态化、#17 UI 骑士。
4. **single html 轮**（单独做好好验）：含 html 逃生 helper、iframe 自动重放（原 park 已被你改判入轮）。

## 3. ⬜ 未动 / 半成品（**无 park 出处**——逐条裁「做/park」）

产品面（0823 组会 + 0825 尾巴，画夏音 v0.3 的实弹反馈，基本整批未动）：
human feedback: 用【】标记决定
1. 手指/涂抹工具缺失（「硬伤」）+ 模糊工具黑边（0823）。【park到宣发后，这个是一个大版本需要专门设计】
2. 液化对图层组（0823）。【低优先，希望做】
3. nested 图层组移动保序计算错误（0825 medium）。【随手subagent做】
4. 只有图层组时无法建兄弟组 + 图层组 UX 重设计（拖拽/显示排序/移出并入移动）（0825 medium）【随手做】
5. 录制窗口被遮挡无自动排序（0823）。【修】
6. 图层组改名 UI 抖动（0823；P0 批未点名，待核）。【修】
7. alpha 直方图导出护栏（软橡皮/喷外误伤已三次事故）（0823）。【做】
8. png 导出默认 defringe（0823）。【随手做】
9. 导出/导入窗口模态化 + 多余模态清理（0823）。【希望能做，可以专门收集到ui轮】
10. 长按吸色影响节奏 → procreate 式按住吸色钮（0823，你标了要 grill）。【park到宣发后】
11. 画画误移画布（0823「不要自己做决定，得和我 grill」——欠一场 grill）。【park到宣发后】
12. 笔刷压感 toggle vs 分两支笔（0823 问句未答）。【分两支笔，笔压toggle sunset】
13. 导出自定义水印（0823）。【宣发需要】
14. 剪贴板/目录项精简（0823「剪贴板那几个…好好精简一下」）。【宣发前的打扫屋子】
15. 删除确认加「回收站里仍是完整明文」+「彻底删除」提级（0823 high；grep 证未做——与 P7 相邻但独立）。【这个是你提的，我没说过，宣发后做，需要grill ux】
16. ω 大开口线稿闭合老账（v0.10.11 案卷遗留）。【宣发后】
17. UI 骑士（菜单/slots/模态分类系统）（0823 提案）。【希望宣发前做，专门一批UX轮】
18. 库全量备份做不做（0823 未决问句）。【希望能做】
19. **Google Drive / 墙外网盘 provider 本体**（0823「宣发前铺好路」+0825「这个也应该做」——多库结构/folder【数据结构必做，也许需要真机真盘测一下，黄线是尽量避免宣发后后悔数据结构，这是我唯一的完美主义需求。我对要跟一辈子的migration代码比较洁癖】
    provider=路已铺，GDrive provider 未动；0825「会不会被柴刀」问句未答）。
20. Editor-only 笔架静默加载（「能静默就静默」已拍未实现；文件家公民全套另有 park 出处见 §4）。【该做，editor-only笔架这里心智模型还含混不清】
21. store 侧双 tab 同作品本地字节互覆护栏（0821 §7.5「进 store 轮」未做；app 侧 per-doc 锁已挡同设备主场景）。【听起来是红线，必做】
22. 无库「新建」popup 行为（v0.11.6 注留给你裁 transient 化；无库真 sunset 后现状待核——可能已变）。【打扫屋子，必做】
23. transient 挂库后的保存去向（焚画修后留在编辑器；保存仍走 settle→文件，无「进新库安家」入口）。【必grill，红线】
24. 图库隐藏杂物诚实性 grill + 「作品占用」口径（你原话「宣发轮结束之后我们 grill」——旧时间盘出处，需重新表态）。【显示其他扩展名的文件，不提供打开，必做】
25. spec 20260819 队列：TGA/GIF 格式、原位粘贴后置、iPad 三指 spike（0825 案卷「沿用 spec 不动」，列出供确认）。【宣发后】
26. 备份箱「即将推出」占位（0821 ▶ 拍板要挂；挂没挂待核）。【宣发后】
27. 设置 scope 微章 device 图标 = stopgap「机」字（SVG Icons TODO 挂着，等美工线）。【已经画好了，请收货】
28. localhost 逃生舱 Azure 白名单验证（码在；Azure 侧归你的手动件）。【宣发后】

## 4. ⏸ user-park 台账（有出处，重新过目即可，不用重裁）

| 项 | 出处 |
|---|---|
| 大文件异步保存 / 2k 保存网络瓶颈 | 0825 案卷 §7 parked 独立工单；0821 §8 确认维持 |【parked】
| 主菜单精简 | 0825「congratulations 阶段」 | 【宣发前做，打扫屋子】
【打扫物质=红线区，不能让用户对数据模型，持久化模型感到confusion，建立错误的持久化期待或者错误的心智模型。我现在的justifaction你能理解这个必须宣发前吧，是最高优先级】
| backup 箱 UI | 0825「加 UI 反而增加故障率…到时候还是可以加」+案卷 §7 |【parked】
| 笔架文件家公民全套 | 案卷 §2.8「可 park 不伤彻底性」 |【宣发前做，数据结构干净，持久化契约converge = 打扫干净屋子】
| html 内逃生脚本 helper | 0825「先 park」 | 【这个和single html是一起的，没做就是没做干净】
| 宣发页 iframe 自动重放 | 0825「等无头 multiplayer，parked」 | 【single html轮，需要做干净】
| timelapse 像素画 4:2:0 残糊 | 0821 §8 | 【没印象，宣发后】
| 曲线编辑器重做 | 0821「继续欠着」（曲线 UI 已禁 v0.10.28） | 【宣发后】
| 跟着画的笔/纹理笔刷 | 0825「现在不急，先留个口子」 | 【not actively planned】
| 导出图库 | P5 grill「parked: 导出图库功能」 | 【最好能持久化收敛轮做】
| 懒仲裁 hash | ADR-0025（真机见假冲突才做） | 【已经被判是不好的设计，舍弃】
| per-account pin | P3 Q8「结构支持、UX 不打磨」→agenda 不急（出处较弱，可重确认） | 【持久化收敛轮，打扫干净屋子，必做】
| 图库长驻云端轮询 | 0821 §6 维持 park | 【那是啥，建议必做】

---

【人类结论：

1. 持久化收敛轮（红线，必须干净完美。打扫干净屋子的红线。新旧两套持久化契约共存=禁止宣发）
2. 随手修轮（subagent举手之劳）
3. UI整改轮（可不做，看fable quota估计得放宣发后）
4. single html轮，单独做，然后好好验，当天做，和itch embedding一起测，之前不nudge
5. 产品工具项不是红线，可以宣发之后hotfix
6. 大概红线数据契约，所以需要严格的QA和测试夹具。这个也需要做】

## 5. 你的手动件（存在即列，非 nudge）

真机批清单（ai-docs/20260827-device-test-batch.md，时机归你）；itch 上传+真沙箱；prod push 拍板；
Azure localhost 白名单；encryption/wipe 两轮 store 发版的 exports 过目。

## 6. 状态刷新（2026-08-28 深夜二批，edited by Claude Fable 5——你的【】原文一字未动，状态以此节为准）

**§3 已落**：#3/#4(⚠行为变更:选中组新建=兄弟非嵌套,待你过目)/#5/#6(1.6px实锤修,抖动本体桌面无法复现留真机)/#7/#8 → v0.11.27；#22/#24/#27 → v0.11.26-27；#23(A1 自动安家)/#20(A2 终案笔架port+device槽) → v0.11.27-28；#12 → v0.11.30（⚠三条待你知情：固定笔=满宽非旧toggle半宽；老ora存过禁笔压的画重开恢复压感——sunset不留垫层的直接后果；存量rack手点「还原内置笔刷」拿7支新笔。⚠喷枪类拒拆=要发明flow值，留你裁决）；#13/#18 → v0.11.29（#18两取舍：范围含图片杂物、autoCache residency副作用）。
**§3 余**：#2 液化组（agent 在跑）、#9/#17（UI整改轮=宣发后，你已裁）、#19（A3 generic-dict 口径已拍待store侧落）、#21（A4 本地版本戳=store 0.8.0 收口件，进行中）、#14（并入A5主菜单精简=等你真机一句话）、#15/#16/#25/#26/#28/#10/#11/#1（宣发后 park，你已裁）。
**新增修**：galleryOnline 谓词根修（folder库无云 bug，六消费点）→ v0.11.29。
**store 0.8.0 批一已推**：graph 实例化（pin 真并联+跨账号缓存投毒清除）/reconcilePolicy 表态/构造期 fail-fast——版本待 A4 落完审版。

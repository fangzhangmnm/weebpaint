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

## 2. 🔧 进行中（你已拍板，我的当前执行队列，按序）

1. **{local:true} 清零 + store 删 cloudless**（你 0828 拍板「宣发前，只我自己设备受影响，不留 backward compat」）。
2. **encryption 独立成新 internal 库**（你 0828 拍板；store 构建期烤进自己 dist 保 tgz 自包含，app 另拉一份
   独立用 → 无库加密 .ora 探测/解密闭环）。
3. **wipe/无痕扫口子 + P7 还原出厂**（type-consent 比对进库契约——你 0825 已拍「typing check 需要库来做」，
   0828 再确认；扫描只返命名空间级库名+计数，永不返文件名）。
   store 侧发版 = exports 过目审版门（版本纪律，人类 gate 属固有非拖延）。

## 3. ⬜ 未动 / 半成品（**无 park 出处**——逐条裁「做/park」）

产品面（0823 组会 + 0825 尾巴，画夏音 v0.3 的实弹反馈，基本整批未动）：
1. 手指/涂抹工具缺失（「硬伤」）+ 模糊工具黑边（0823）。
2. 液化对图层组（0823）。
3. nested 图层组移动保序计算错误（0825 medium）。
4. 只有图层组时无法建兄弟组 + 图层组 UX 重设计（拖拽/显示排序/移出并入移动）（0825 medium）。
5. 录制窗口被遮挡无自动排序（0823）。
6. 图层组改名 UI 抖动（0823；P0 批未点名，待核）。
7. alpha 直方图导出护栏（软橡皮/喷外误伤已三次事故）（0823）。
8. png 导出默认 defringe（0823）。
9. 导出/导入窗口模态化 + 多余模态清理（0823）。
10. 长按吸色影响节奏 → procreate 式按住吸色钮（0823，你标了要 grill）。
11. 画画误移画布（0823「不要自己做决定，得和我 grill」——欠一场 grill）。
12. 笔刷压感 toggle vs 分两支笔（0823 问句未答）。
13. 导出自定义水印（0823）。
14. 剪贴板/目录项精简（0823「剪贴板那几个…好好精简一下」）。
15. 删除确认加「回收站里仍是完整明文」+「彻底删除」提级（0823 high；grep 证未做——与 P7 相邻但独立）。
16. ω 大开口线稿闭合老账（v0.10.11 案卷遗留）。
17. UI 骑士（菜单/slots/模态分类系统）（0823 提案）。
18. 库全量备份做不做（0823 未决问句）。
19. **Google Drive / 墙外网盘 provider 本体**（0823「宣发前铺好路」+0825「这个也应该做」——多库结构/folder
    provider=路已铺，GDrive provider 未动；0825「会不会被柴刀」问句未答）。
20. Editor-only 笔架静默加载（「能静默就静默」已拍未实现；文件家公民全套另有 park 出处见 §4）。
21. store 侧双 tab 同作品本地字节互覆护栏（0821 §7.5「进 store 轮」未做；app 侧 per-doc 锁已挡同设备主场景）。
22. 无库「新建」popup 行为（v0.11.6 注留给你裁 transient 化；无库真 sunset 后现状待核——可能已变）。
23. transient 挂库后的保存去向（焚画修后留在编辑器；保存仍走 settle→文件，无「进新库安家」入口）。
24. 图库隐藏杂物诚实性 grill + 「作品占用」口径（你原话「宣发轮结束之后我们 grill」——旧时间盘出处，需重新表态）。
25. spec 20260819 队列：TGA/GIF 格式、原位粘贴后置、iPad 三指 spike（0825 案卷「沿用 spec 不动」，列出供确认）。
26. 备份箱「即将推出」占位（0821 ▶ 拍板要挂；挂没挂待核）。
27. 设置 scope 微章 device 图标 = stopgap「机」字（SVG Icons TODO 挂着，等美工线）。
28. localhost 逃生舱 Azure 白名单验证（码在；Azure 侧归你的手动件）。

## 4. ⏸ user-park 台账（有出处，重新过目即可，不用重裁）

| 项 | 出处 |
|---|---|
| 大文件异步保存 / 2k 保存网络瓶颈 | 0825 案卷 §7 parked 独立工单；0821 §8 确认维持 |
| 主菜单精简 | 0825「congratulations 阶段」 |
| backup 箱 UI | 0825「加 UI 反而增加故障率…到时候还是可以加」+案卷 §7 |
| 笔架文件家公民全套 | 案卷 §2.8「可 park 不伤彻底性」 |
| html 内逃生脚本 helper | 0825「先 park」 |
| 宣发页 iframe 自动重放 | 0825「等无头 multiplayer，parked」 |
| timelapse 像素画 4:2:0 残糊 | 0821 §8 |
| 曲线编辑器重做 | 0821「继续欠着」（曲线 UI 已禁 v0.10.28） |
| 跟着画的笔/纹理笔刷 | 0825「现在不急，先留个口子」 |
| 导出图库 | P5 grill「parked: 导出图库功能」 |
| 懒仲裁 hash | ADR-0025（真机见假冲突才做） |
| per-account pin | P3 Q8「结构支持、UX 不打磨」→agenda 不急（出处较弱，可重确认） |
| 图库长驻云端轮询 | 0821 §6 维持 park |

## 5. 你的手动件（存在即列，非 nudge）

真机批清单（ai-docs/20260827-device-test-batch.md，时机归你）；itch 上传+真沙箱；prod push 拍板；
Azure localhost 白名单；encryption/wipe 两轮 store 发版的 exports 过目。

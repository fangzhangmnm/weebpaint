# 云本位残留架构自查（无地四问 · greenfield 对照）

> created 20260828 · by Claude Opus 5 (subagent audit) · reviewed & spot-verified by Claude Fable 5
> as-of v0.11.37 / store 0.8.0。出处 = user checklist dump 91 行「wave1 做完后跑 improve-codebase-architecture：
> 云本位残留 / single html 第一公民 / 无库第一公民 / 依赖反转库=插件 / 原生多库多账号 / as written in greenfield」。
> 只读审查未动文件。主 session 已实锤抽验：A（provider 单例无 homeAccountId pin）/ B（云盘 sink 判 storeAbsent
> 不判 galleryBackend）/ G（attach 中段 registry 写不设防）。裁决状态归总账 ledger §8 跟踪。

## 第一档：宣发前值得切（9 条）

- **A 多账号 pin 未接线（已裁必做的另一半）**：app-store.ts:36 模块 eval 期建**单例** OneDrive provider
  不带 homeAccountId；:175-179 全部 onedrive 条目共用。registry 每条目已存 homeAccountId、store 0.8.0
  pin 口子已交付——app 收货漏接。后果=attach 账号 B 的库拿 active 账号 A 的 token 读写=跨账号缓存投毒。
  另一半：mintOneDriveByAccount 已登录永不弹 account picker（无 prompt:"select_account"）→ 第二个账号
  根本铸不出来。切法：_buildStoreForGalleryEntry per-entry 建 pinned provider（auth 面保持单例）+ picker
  参数，~15 行。forgetFlow 临时店同修。
- **B 「导出到云盘」无库硬抛**：export-import-menu.ts:91 _cloudSinkBlocked 只问 storeAbsent（平台）不问
  galleryBackend().kind；:366 cloud option 无条件供给 → 无库 transient 选云盘 = requireStore 抛英文内部
  错误串（全仓唯一用户可触达的 requireStore 抛点）。~3 行。
- **C rename/encrypt 两动词没做 DocHome 表态**：renameCurrentSession 只挡 file 家漏 transient →
  requireStore 抛；encryptCurrent 对 file 家说「先打开或保存」（用户已存盘=假话）。范本=save-status.ts:84
  的 switch(home.kind)+assertNever。~20 行。**附带产品事实待 user 表态：加密动词=图库家专属**（无库/文件家
  不能加密；encryption.ts 宣称的「无库活着」只覆盖探测/解密）——无库=有库减配的唯一硬功能证据。
- **D isCloudEnabled 名字撒谎（云本位词根）**：cloud-capability.ts:30 = hasLiveStore()——folder 库零云也
  true。十余消费点被词根污染（boot-restore 端口名/结局枚举 "blank-cloud-off"、settings-menu:139 同一行里
  DOM 属性已叫 data-no-gallery 而谓词还叫 cloud）。切法=机械改名 hasGallery()/gallery-capability.ts/
  wp:gallery-capability-changed，tsc 兜底零行为变更。
- **E folder 图库用户被喂云文案（踩「不许建立错误持久化心智模型」红线）**：八处清单——save-status 云对勾
  「已同步云端」/「登录云端更安全」×2 / 「从云端刷新笔架」tooltip 与 br.refreshLocalOnly 自相矛盾 /
  「store 缺席模式」内部词泄漏 / 「随云同步到其他设备」/ st.filePulling ja 独走云 / cloud picker 三条。
  范本已在树上（br.refreshLocalOnly / save.savedLocalGalleryOffline / gm.offlineBanner）。
- **F blender-panel-url 无库静默丢写**：app-state.ts:47 乐观 ?.——无库 wireAppState(undefined) 全部写
  蒸发零提示；blender-panel-url 是纯编辑器设置被关在图库层。切法=迁 PREF_REGISTRY device scope，~10 行。
- **G attach() 非事务化破不变量**：swap 之后 _state 之前夹着 registry.touch/relabel 两个可 reject 的 IDB
  写 → 失败=hasLiveStore true 但 attachment detached：图库 UI 全开、卸载钮藏、绿灯门直接放行不 dispose、
  下次 attach 泄漏前实例。gallery-connect.ts:100 catch 同源半拉。切法=_state/_notify 提前+registry 写
  包 try/catch（簿记非承重），~6 行。
- **H single-html embed 清单无对账**：pack-single.mjs 六条内嵌资产手维护；deploy-assets 测试只逼 SW
  precache+deploy.yml 不查 pack-single → 新增 runtime-fetch 资产时单文件静默残废而 CI 全绿（fetch 失败
  全是 reportError log 档，single-smoke 收不到、只断言 embedKeys≥6 数量）。切法=deploy-assets 测试同时
  断言 pack-single embed 键，~5 行。
- **I 红线夹具在单文件壳零覆盖 + sourcemap 断**：preflight F1-F4/F7 全跑常规 build；单文件只有 F6 四条
  浅断言（没画一笔/没导出/没验资产被消费）；itch-iframe-fixture 是手动件。另 build.sh mv 后不回写
  sourceMappingURL → 两档产物 sourcemap 均断（实测）。

## 第二档：宣发后再切（7 条）

- **J** thumb cache key 非对称（default 免前缀特例）——派生缓存本可全删重生，恒前缀化 ~4 行。
- **K** forget 留孤儿缓存库（P3 verdicts §5 的「选择性 GC」半件没跟上 P7；P7 落成的是核弹全清）。
- **L** session-state `_phase` 全死（写 16 读 0；空态名就叫 "gallery" = 要清的旧心智模型本身）。删 17 处。
- **M** 接缝反向依赖 gallery/（itemToG 旧 GalleryItem 适配层 + import cloud-image-model/natural-order）
  ——「compromise 只会导致更多 adaption layer」。搬 ~80 行进 gallery/。
- **N** 放错家的通用模块（cloud-image-model 12 导出 10 个零云知识含 nextFreeExportName/flattenOntoWhite；
  enc-thumbs 从 gallery/ 拿 ORA 常量；natural-order/frame-gate 自述纯模块却住 gallery/）。
- **O** 死代码清扫一把过：save-status 未用 isSignedIn import+陈旧头注释；brush-rack-controller 两个死注入
  参数（app.ts:181 为喂它们把 isSignedIn 拉进笔架域）；i18n 三个 cloud-enabled 化石键；settings-menu:130
  不可达分支；crash-store homeKind 存而不读（file 家崩溃恢复静默落图库不告知）；app-store:179 恒等三元；
  app-prefs:54 _galleryLive 默认 true 与接缝「恒无库起步」立场相反。
- **P/Q** editor-session 公开面带 cloud 词自破「sync 无关」契约（改 remote-中性）；词汇噪音批
  （checkpoint-policy "cloud-refresh" / background-sync-jobs 占 sync 词 / reference-window 公开面 cloud /
  naming.galleryDefaultName 实为全 app 默认名 / fullscreen-busy 注释 / storage.ts gallery-thumbs 只改注释）。

## 第三档：合理妥协（已被结构/lint 看住，不算残留）

kind:none=第一公民形状（表态制+三道 lint+40 处 requireStore 仅 1 处用户可触达）；店懒出生+不变量（除 G）；
legacy "default" 特例三处不扩散+A3 契约测试；单文件运行时零形态嗅探、6/7 消费点默认值降级、存储访问收敛
9 器官；pack-single 自检 fail-fast 姿势正确（正则有小洞）；app-prefs 六类+cascade、笔架 port、T-crash
按家分发、factory-reset 结构前置、doc-home/save-status=范本。**打枪一条 subagent 误报**：body.dataset.mode
==="gallery" 是真 view-mode 旗非残留（仅 input.ts:187 注释夸大，顺手改）。

## 四问总判词

① **single html**：运行时真第一公民，验收上不成立（embed 无对账+夹具零覆盖=唯一能静默残废而 CI 全绿的交付物）。
② **无库**：结构上第一公民，词汇文案仍是有库减配（全部用户可见话术出自云本位剧本）+两项真减配（加密图库
专属、blender-panel-url 丢写）。
③ **库=插件**：依赖方向对（单接缝+lint+表态制），但接缝比自己写的契约宽（反向 import gallery/×2+适配层
+第三个绕缝 type-import）。
④ **多库多账号**：多库=原生结构；多账号=铺了路没通电（库口子已交付、registry 字段已存、app 没接线+
picker 铸不出第二账号）。

## 建议开工顺序

D（词根改名，判据错位随之消解）→ B/C/F/G（四把 ≤20 行小刀）→ E（文案批）→ A（多账号 pin）→ H/I
（single-html 验收）。第二档宣发后。

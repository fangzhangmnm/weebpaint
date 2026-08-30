# 图库连接语义重构（user 2026-08-30 拍板；supersedes P3 verdicts §1 的管理面布局部分）

> created 20260830 by Claude Fable 5
> as-of v0.12.1 / 2026-08-30

## user 拍板原话要点（对话，2026-08-30）

- 「退出登录的语义就是 disconnect」——**主动退出 = 卸库 + signOut**；「我说的不卸库说的是
  offline（token 自动过期/断网）」——被动离线才保持挂载。「主动退出不算」。
- 「有库的时候只有 disconnect 一个语义」+ 追加「库里面还是可以切换库的吧，就是库里面有
  switch 和 disconnect 两个选项」。
- 「没有库的时候 connect 应该路由到 onedrive or folder，全 codebase 用同一个路径」；旧选择
  sheet「UI 不大对：歧视 local folder（OneDrive 高亮 primary）、不应该是模态对话框，应该是
  菜单选项那种」。
- 「editor 里面的连接到库也用同一个菜单，editor 里面没法 disconnect 库，必须退到库里面」。
- 「editor connect 的时候，如果一开始打开的空画布没有被动过的话，不在库里面新建这个空白画布」。

## 落地形状（v0.12.1）

- 云 popup（cloudAccountPopup）：
  - **有库** = 当前库行（含·已离线后缀）+ [离线时「重新连接」] + 「切换图库…」（点开原地换成
    连接选项）+ 「断开连接」（绿灯门卸库 → onedrive 再 signOut）+ 账号 info 行。
  - **无库** = 连接选项直接就是菜单项：连接 OneDrive / OneDrive·换一个账号…（已登录才显，
    0.9.0 口子保留）/ 连接本地文件夹——平权、无 primary、无模态。file:// 下 OneDrive 项弹
    本地服务器指路（逃生舱不变）。
  - 编辑器「连接图库…」（无库才显）= 打开**同一个** popup 锚在汉堡钮（popup 在 galleryFull
    外层，编辑器态可显示）。编辑器无断开入口。
- 退役：名册切换行、忘记✕（registry 仍是身份/dbId/lastActive 内部器官，只是无 UI；孤儿缓存
  GC 照旧挂 P7）、cloudSignInBtn/cloudSignOutBtn、旧 choice-sheet 连接流、gm-row/gm-x CSS、
  i18n 键 gm.detachEntry/gm.detached/gm.forget×4/gal.menu.signIn/signOut。
- `adoptTransientIntoGallery` 返回收窄成 typed 三态（adopted/none/**untouched-blank**）：
  lazyblank ∧ 全层 bbox 空 → 不安家；switchFlow 把 untouched-blank 当 no-doc 办（落图库页，
  空白丢弃零损失，不触 2026-08-27 无痕焚画教训——那条护的是**动过**的 transient）。
- `resumePendingOneDriveConnect` 撤「已挂库就退」早退（换库 redirect 回程 boot 先挂回旧库，
  必须继续 switchFlow；同库由「已是当前图库」短路）。

## 已知代价（记录在案）

- 换库到**已知 folder 库**需重新走系统 picker（isSameEntry 去重复用户口）——名册 UI 退役的
  直接代价，user 拍板「没有切换（名册）」时已含。
- boot restore 开着画时，redirect 回程的换库续办会被收口开画 gate 挡下（状态行提示）——预期。

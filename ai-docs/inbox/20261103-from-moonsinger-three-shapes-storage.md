# 便条（来自 MoonSinger 会话 2026-11-03）：三种出货形态的存储行为 + 设备接口（全家对齐）；WeebPaint 现状差距

> created 20261103 by Claude Opus 5.5（MoonSinger 侧会话代 user 投递）

- **user 原话**：「我想要的，全家对齐，包括weebpaint记账和未来的catsup」「现在weebpaint是itch和html模式有本地库吗，无地模式的窄接口！！！」「收到一个统一的抽象设备接口里面是本来就要做的纪律。我们需要系统的理一下深模块窄接口，所有的存储，非store的，需要这么走，然后store自己也需要响应开关」。
- **推荐稿**：家族根 `ai-docs/20261103-three-shapes-storage-contract.md`（官网 / itch 内嵌 / 备用版三种形态；逐类字节落盘 / 只放内存 / 不提供；设备接口提案 .h）。还没定稿：等 user 拍四件 + Fable 审。家族周账 F-140。
- **WeebPaint 现状（2026-11-03 读代码，没改；推荐稿 §4 同文）**：
  - 单文件版在 Chromium 双击打开时能挂本地文件夹图库（`gallery-connect.ts canPickFolderGallery` 只拦框里和存储被没收）→ 名册 + 缓存落在所有双击打开的 html 共用的那份存储。是否保留 = 推荐稿 §5 Q3。
  - OneDrive 入口在单文件版 / itch 版都露（`gallery-manage-ui.ts` 只看 `isAuthConfigured()`），回跳地址没登记 → 登不上（推断，没在 itch 上点过）= 「做不到的要画灰 + 明说」的缺口。
  - 崩溃影子（`crash-store.ts`）在 itch 版落在 itch 公共网址，别的 itch 游戏读得到；08-25「知情接受」只说过 file:// 共桶。
  - 形态判定散在 `isStandaloneHtml()` / `detectStoreAbsent()` / `pickerAllowedInFrame()` / `isAuthConfigured()` 四处，没有一处回答「这个形态给不给」；`gallery-capability.ts` 只答「现在挂没挂着图库」。08-21 定过方向的「启用云端功能」开关（`src/cloud-capability.ts` 单一接缝 + lint）也没做 = 推荐稿 §3 里的 `cloud` 位。
- **优先级**：待 user 拍板；WeebPaint 按自己的账走（之前那张 `20261103-from-moonsinger-double-click-folder.md` 是同一串的前半）。

- **11-03 稍后 user 拍板，本便条上面几条按此更正**（家族规范已改写，以那份为准）：itch 内嵌 = 整站 zip（「不要把鸡蛋放在一个篮子里」）；**共用存储的威胁模型 = 命名空间混乱，不是偷窥；只有用户加密的才有防扫描的语义**——所以「itch 版崩溃影子落在 itch 公共网址」**不算缺口**（不加密的照存，加密件 WeebPaint 本来就只存密文）；备用版本地文件夹图库 = 保留（「和weebpaint对齐，然后能记住吗」）；Safari 不验、留报告入口。还算缺口的：OneDrive 入口在单文件 / itch 露但登不上；形态判定散四处。
- **11-03 第三轮 user 拍板（照家族规范 §1 第 9–13 条）**：① 深模块分层——持久化深模块最底层、知道部署形态、对消费者报 availability；**崩溃恢复是建在它上面的深模块**（WeebPaint `crash-store.ts` / `crash-banner.ts` / `checkpoint-policy.ts` 是现成样板）；进程也是深模块；调用者看得到健康状态，损管在深模块里。② **记住口令：备用版（本地双击）支持、itch 不开**（「itch版的语义应该更像试用版，玩一下」）——推翻 10-17「单文件 / itch 关掉」里的单文件那一半，WeebPaint 单文件版要改。③ 篡改 = 命名空间撞车，便宜的防护照做。④ 文件名混淆 = 用户自己的事（WXHW ADR-0007 同口径）。⑤ 拖文件夹进 itch 框当图库 = wishlist，归无地统一轮。
- **11-03 Fable 规则书**（Claude Fable 5.1）：家族根 `ai-docs/20261103-three-shapes-rulebook.md`。WeebPaint 这一轮 = 规则书 §6 道 2（§4 检查表第 2、3、4、5、6、9 项 + 单文件版记住口令改开 + 披露 + `standalone-smoke` 加 itch 夹具）；Fable 只看记住口令 diff、`deployment-policy` 单测、守卫改动。**11-03 第二稿**：叶子改名 `deployment.ts`（user「shape.ts 谜语人」）；这一轮 = 家族根 `ai-docs/20261103-work-orders.md` **工单 B**（上面那些 + 收 store 2.2.2 / gallery 0.8.10）。

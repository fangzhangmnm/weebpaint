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

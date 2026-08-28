# 真机批统一清单（0.11 纪元 · 无地工程全量）

> created 20260827 · by Claude Fable 5
> as-of v0.11.21 / 2026-08-27。合并源：0825 案卷 §6 + P3 案卷 §5 + P6 台账已知失败 + spec 20260819 §10。此后新增真机项**只往这里记**，别再散。
> 用法（按 user 习惯「只测正常用」调过）：每个场景 = 正常用一轮，★ 项是**新机制的关键路径**，值得专门踩一脚；其余顺带看。测完即交付，结果按场景回帖即可。

**现状**：prod = v0.10.33；dev = v0.11.21——0.11 纪元 22 个版本零真机。基准件 = 夏音 v0.3（最胖 timelapse）。

## 场景 A：日常桌面（dev URL，正常画画）

正常画一轮 = P1–P5 大面回归（打开单按钮 / 标题栏画名+dirty 点 / boot 三态恢复 / 设置页 scope 分区）。专门踩：

1. ★ **切库全流程**：图库页云 popup →「连接图库…」→ 本地文件夹（选个空夹）→ 播种二选（试「继承当前笔刷与设置」：新库笔刷 = 旧库快照）→ 画一张存一张 → 切回 OneDrive 库 → 再切回来（列表卡标来源、复用同条目）。
2. ★ **绿灯门 + 逃生**：断网画一张（dirty）→ 试切库 → 应弹「N 张未上云」sheet → 试「下载备份」（应先推、推不动的逐张下载）→「仍要切换」→ 回来后 dirty 补推。
3. ★ **收口开画 gate**：开着画试切库/卸下 → 应被拦「先关闭当前画」。
4. **卸下图库** → 编辑器照常（Editor Only）、文件菜单出现「连接图库…」单入口 → 重连回来数据无恙。
5. **忘记条目**：忘记一个有 dirty 的库 → 确认文案应带 ⚠ 未上云警示；忘记后源文件不动。
6. ★ **离线横幅**：登录态过期/断网 → 顶部「图库已离线—重新连接」横幅 → 一键重连 → 补推。
7. **多账号**（有第二 MSA 就试）：连接 OneDrive 选另一账号 → 两个库条目并存、切换要求登录属正常。
8. ★ **T-crash**：画几笔不存，杀进程（任务管理器）→ 重开应见恢复横幅，恢复出的画标 dirty；正常关闭不应见横幅。
9. **revert v2**（P4）：正常用一轮打开点还原。
10. **timelapse 照常**（与保存同字节；夏音 v0.3 开一次不卡笔 = §7 基准）。

## 场景 B：iPad（手感终审 + 登录流）

1. ★ **redirect + 待领养**：Editor Only 画一张（不存）→ 连接 OneDrive（iOS 走 redirect）→ 回程 boot 应显式领养「你创建图库前画的那幅在这里」。
2. 手感回归（streamline/taper/压感——0.11 没动引擎但过一手）。
3. beforeunload 各退出路径（关 tab / 划掉 PWA / 反复拦）。
4. paste 事件 vs `clipboard.read()` 权限弹窗对照；透明 PNG 贴微信/Discord 的 alpha 表现（spec §10.2/3）。
5. iPad 三指手势 contenteditable spike 收不收（spec §10.4，真机裁决）。

## 场景 C：单文件 file://（`bash scripts/build-single.sh` → 双击 dist/weebpaint-single.html）

1. ★ **Chromium 双击**：能画能存（下载）、FSA picker 真调用（保存/打开）、drop .ora → 原位编辑 → Ctrl+S 写回 → 改 mtime 冲突路径（spec §10.6）。
2. ★ **加密路径**：单文件形态开/存加密 .ora（7z blob 注入未实测——P6 已知失败）。
3. **folder 图库**（file:// 下 FSA picker 挂库）：句柄跨 OS 改名存活？标签自愈？持久权限静默重取（重开不再弹授权）？
4. **两个本地 html 互开**：Web Locks 互认 scope、crash 库共桶行为（Chromium file:// 共桶——已知接受，看别炸）。
5. **Firefox 双击**：boot 一开（P6 未跑）。
6. **Safari 双击**（Mac）：★ 不白屏 = 及格（应自动进纯内存 Editor Only——无地探针路径）。
7. Ctrl+Shift+C 是否被 DevTools 吞（spec §10.1）。

## 场景 D：itch（先夹具后真站）

1. 本地：`python3 -m http.server` → tools/itch-iframe-fixture.html：boot 不炸、paste 降级链（Chrome iframe 无 clipboard allow）、IDB 分区。
2. 真 itch 上传（user 决策 embedding「决定放，好玩嘛」）：同上 + SW 无注册无报错。

## 场景 E：逃生舱（可选，一次性确认）

`python3 -m http.server` 服 single html → `http://localhost:8000` 开 → 试 OneDrive 登录。**前置**：Azure 侧确认 `http://localhost` redirect URI 在册（不在 = 逃生舱不通，记录即可不修）。

## 回流

folder 库的 native move/mtime/权限过期表现（场景 C.3）请顺手记录 → 回流 store 仓真机矩阵（`../20260813 internal-store/ai-docs/20260825-localfile-knight-store-round.md` 挂账）；假冲突观察喂 ADR-0025（懒 hash park 的启动条件）。

## 存量 0.10.x 残留（低优先）

0.10.28–33 的「真机未验」标记（P0 图层组、cloud override 三轮、badge 去压扁）——该批已在 prod 日常使用中隐式验证，正常用没炸即视为过；不专门跑。

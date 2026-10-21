# ADR-0012 工具条终形收尾对账（总账 #4）

> created 20261021 by Claude Fable 5.1 · as-of v0.14.39 · 方法 = 拿 ADR-0012「决定」六条 + 修订 ⑦ 的顶栏串，逐条对 `index.html` 顶栏、`src/common/verbs.ts` 动词表、`src/lasso.ts`。只对账不动码；剩下的判断类条目归 user（总账 #95）。

## 对上了的

| ADR 条目 | 现状 | 在哪 |
|---|---|---|
| 顶栏 `菜单 云保存 \| 笔 手指 橡皮 套索 形状 \| fx 图层 颜色`（修订 ⑦） | 一致：`menuButton` `topSaveBtn` \| `toolPen` `toolSmudge` `toolEraser` `toolLasso` `toolShape` \| `topAdjustBtn` `layersButton` `activeSwatch` | `index.html` 顶栏 |
| 决定 1 工具栏放动词、不放 engine / preset | 五个 `data-verb` 位 + 三个面板位，没有 preset 钮 | 同上 |
| 决定 2 笔 = paint 族 | 笔位子工具只剩 `freehand`（形状 09-18 独立成第五动词位，修订 ⑦） | `verbs.ts` |
| 决定 2 手指 = 涂抹族，各自图标 | `smear / dull / paint / blur / sharpen / liquify` 六项（修订 ④：六项同一个手指图标，钮面按子工具刷） | `verbs.ts` |
| 决定 2 套索位收填色（「油漆桶进套索试一下吧」） | `select / fill` 两个子工具；ADR-0004「填色与选区不互通」语义没动 | `verbs.ts` |
| 决定 4 子工具经长按 + 角上小三角 | 动词钮长按 / 右键出子工具菜单；小三角 = `slotCaretHtml`（修订 ⑥） | `ui/icon.ts`、`ui/popup-menu.ts` |
| 决定 6 吸色不是工具 | 顶栏吸色钮已撤；左栏 `#leftPick` + 色板吸管 + I 键 + Alt / 长按 | `index.html` 注释、`ui/left-dial.ts` |

## 剩下的（三条判断类 + 一条口径）

| # | 条目 | 现状 | 要 user 定什么 |
|---|---|---|---|
| a | 橡皮「整笔智能擦」子工具（决定 2：「后者待做，UI 先留位」） | 没做；`verbs.ts` 第 33 行留了一句注释，没有留位 | 要不要立项（需要每笔归属图，是引擎活不是 UI 活）；还是 ADR 改口「不留位」 |
| b | 手指「克隆」子工具（决定 2） | 没做；`verbs.ts` 第 44 行注释「引擎另案」；左栏取样钮的接口已为「定源点」留门（修订 ⑥ 末） | 同上：立项还是改口 |
| c | 平移钮 `#toolHand`（`tool-hand-conditional`：触屏隐藏，鼠标场景显示） | ADR 没写它；它是鼠标用户的平移入口，不是动词 | 认它为「非动词的输入设备补偿钮」写进 ADR，还是撤掉改成空格 / 中键 |
| d | 套索 = 「套索 / 魔棒 / 矩形 / 选区笔 / 填色」（决定 2） | 实现是**两级**：动词子工具只有 `select / fill`；魔棒 / 矩形 / 椭圆 / 多边形 / 选区笔是套索 EditMode 自己的形状（`lasso.ts` `SubTool`），在上下文条上切 | 只是口径：ADR 那一行按实现改成两级，还是把形状也提成动词子工具（会让长按菜单变长、小三角失去「一级」语义） |

没有别的剩余：形状笔（修订 ⑦）、手指笔架（修订 ②）、上下文条左段子工具栈（修订 ③）、图层调整弹层（修订 ⑥）都已落地并在各自修订里记了版本。

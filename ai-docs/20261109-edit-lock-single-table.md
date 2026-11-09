# 修改锁：把「锁着时什么能动」收成一张表（v0.14.64）

> created 2026-11-09 by Claude Fable 5.1 · as-of v0.14.64 / 2026-11-09
> user 2026-11-09：「我觉得还是 Fable 你做吧。然后既然你做的话，你就顺便想办法把那些模块的逻辑给理干净，看看这些模块能不能架构进一步的优化。」
> 家族标准 = 家族根 `ai-docs/20261108-edit-lock-standard.md`；数据怎么流 = 本仓 `ai-docs/20261103-pipelines.md`「锁」一节。这一份只记：改之前哪里不对、改成什么形状、接口前后对照。

## 1. 这一轮要交的功能

锁着的画上，选区能动了（user 11-08：「如果我想进去拷东西或者导出的话我们应该不拦着它对吧」）：

- 套索工具能框、能加减；全选 / 反选 / 去选 / 扩张收缩 / 从图层建选区能用；复制、合并复制能用。
- 填充、删除、剪切、粘贴、变换、移到新层照旧不让。
- 油漆桶锁着整个不起作用（不出预览、不落色、切走不清选区）。
- 锁着时能撤销 / 重做自己刚动的选区和图层可见性，翻到画面内容那一步就停。
- 只动过选区 → 解锁之后不欠任何待保存改动（选区从不进文件）。

## 2. 改之前哪里不对

「锁着时什么能动」写在四个地方，用四套词：

| 层 | 以前的写法 | 词 |
|---|---|---|
| 指针 / 快捷键 | `interaction-lock` 的只读策略表 + 快捷键按类放行 | 意图（`pointer:draw`…）、类别（`sc.cat.lasso`…） |
| 面板按钮 | `edit-lock-door.ts` 里一串面板的选择器，加几条例外 | CSS 选择器 |
| 写令牌 | `edit-lock.ts` 的 `LOOK_LABELS` | 写令牌的标签 |
| 撤销 / 重做 | 写死两个假标签 `"undo"` / `"redo"` | 整类拒 |

每放开一类操作要四处各改一遍，而且会互相对不上。读代码时查出来的实际后果：

1. 键盘上的复制锁着时被拦（复制所在的那一类整类不收），虽然策略表写着复制 = 读、放行。
2. 点当前图层的名字，锁着时能进到改名框（存不进去，但界面这一层没拦住）。
3. 图层组的折叠锁着时点不动——它只是界面状态，不在文件里。
4. **写令牌有个结构上的缝**：几个微步并成一步（`checkpoint: false` 留开令牌）时，只有开令牌的那一个微步过闸，后面并进来的不过。现在没有能利用它的路径（留开令牌的两条流程第一步都是内容），但放开看法之后这个缝就是真的：「先一个放行的操作留开令牌，后面不放行的搭车过门」。
5. 锁着时进来的任何变化都记成「动过看法」，解锁就标脏——翻参考图的页、框个选区也算，解锁后凭空多出一次保存。

## 3. 改成什么形状

**一张表**（`src/edit-lock-table.ts`，零依赖、纯数据）：键 = 操作的名字 = 写令牌的标签；列进去的是「看法」，带一个 `inFile`（进不进文件）；没列的一律是内容。

**各层都拿操作的名字来问**：

- 指针：`pointer-route.pointerOp(role, tool, floating)` 算出这一下要做的操作，交给 `interaction-lock.allows(intent, { op })`。
- 快捷键：每条可以自带 `op`（字面量或现算），或者声明自己其实是另一种意图（复制 = `intent: "copy"`）。
- 面板按钮：控件自己在 HTML / 模板里标 `data-op`；`edit-lock-door.ts` 只取最近的那个去查表，自己不再写任何面板的名字。
- 写令牌：`Workpiece.assertWritable(label)`；`begin` 和 `History.withPoint` 并进开着的令牌时都调它。
- 撤销 / 重做：`History` 拿要翻的那一步的标签问同一个口；几个不同名字的微步并成的一步，标签 = 名字用 `+` 连起来（表里查不到 → 内容）。

**「欠着的看法」由写门记**：进文件的看法锁着时过写门 → `edit-lock.ts` 记一笔；解锁那一刻会话 `takeLookOwed()` 取走、标脏。会话自己不再猜「锁着时进来的变化是什么」。

保存那一层和库那一层没动，也不看表：锁着就是一个字节都不写。

## 4. 接口前后对照

### 以前（v0.14.63）

```ts
// src/edit-lock.ts
export const LOOK_LABELS: ReadonlySet<string>;                 // ["layerVisible"]
export function editWriteGate(label?: string): string | null;

// src/ui/interaction-lock.ts
export interface IntentCtx { shortcutCategory?: string }

// src/backend/workpiece/workpiece.ts
class Workpiece { writeGate; begin(label?): WriteToken }        // 只有 begin 问门

// src/backend/workpiece/history.ts
class History { undo(): boolean; redo(): boolean }               // 问 writeGate("undo" / "redo")

// src/edit-lock-door.ts —— 内部常量 SURFACES / CHROME（选择器名单）
// src/session-state.ts —— 内部标志 _lookChangedWhileLocked
```

### 现在（v0.14.64）

```ts
// src/edit-lock-table.ts（新）
export interface LookOp { readonly inFile: boolean }
export const LOOK_OPS: Readonly<Record<string, LookOp>>;        // layerVisible（进文件）、selection（不进）
export const OP_VIEW = "view"; export const OP_CONTENT = "content";   // data-op 的两个保留词
export function isLookOp(op): boolean;
export function lookOpInFile(op): boolean;
export function controlAllowedWhileLocked(op): boolean;

// src/edit-lock.ts
export function editWriteGate(label?: string): string | null;  // 查表；进文件的看法记一笔欠着；"load" 清掉欠的
export function takeLookOwed(): boolean;                        // 解锁后问一次，问完清零
// LOOK_LABELS 删了

// src/ui/interaction-lock.ts
export interface IntentCtx { shortcutCategory?: string; op?: string }   // readonly：op 是看法 → 放

// src/pointer-route.ts
export function pointerOp(role: string | null, tool: string, floating: boolean): string | undefined;

// src/input.ts
interface KeyboardShortcut { /* … */ op?: string | ((i) => string | undefined); intent?: Intent }

// src/backend/workpiece/workpiece.ts
class Workpiece { writeGate; assertWritable(label?): void; begin(label?): WriteToken }

// src/backend/workpiece/undo-stack.ts
class UndoStack { peekLabel(dir: "undo" | "redo"): string | undefined }

// src/backend/workpiece/history.ts
class History { peekLabel(dir): string | undefined; undo(); redo() }   // 按要翻的那一步的标签问门；并进来的微步也问
```

删掉的：`edit-lock-door.ts` 的 `SURFACES` / `CHROME` 选择器名单、`session-state.ts` 的 `_lookChangedWhileLocked`、`styles.css` 里的面板名单。

顺手改的一个名字：清除选区内像素的写令牌标签 `clearSel` → `clearSelectionPixels`（它是内容，旧名字读起来像「去选」，现在标签是分类的键，不能让人看错）。

## 5. 没解锁时行为不变

写门没锁时一律返回空，界面那一层没锁时直接放，所以解着的画上只有一处看得见的差别：撤销栈里并成一步的操作，标签从「第一个微步的名字」变成「各名字用 + 连起来」（没有别的代码读这个标签）。全量单测 1709 条照绿。

## 6. 守卫（`test/edit-lock-guard.test.mjs`）

- 表里的每个词必须真是某个写入口在用的标签（写错字 = 那一类永远放不出来）。
- `index.html` 和图层行模板里的 `data-op` 只许是 `view` / `content` / 表里的词。
- `styles.css` 那条「不变淡」的例外名单必须和表一样。
- `edit-lock-door.ts` 里不许出现面板的选择器。
- src 里不许再出现第二份看法名单。
- 快捷键表里字面量的 `op` 必须在表里。

## 7. 没做的

- 选区扩张 / 收缩的小窗开着时，Ctrl+Z 取消它这一下锁着不一定收（要翻的那一步是内容时不收）；小窗自己的「取消」能用。
- 锁态是在浮着一块变换的中途、从别的标签页变过来的：浮着的那块留在原地，应用 / 取消都被拒，要先点「接着改」。没有替人收摊（自动只许拦）。
- 硬盘上的单个文件那条路仍然只有单测，没有真 app 验收（无头浏览器点不了系统的文件选择框）。
- 这一轮的验收都是无头浏览器，没有真机。

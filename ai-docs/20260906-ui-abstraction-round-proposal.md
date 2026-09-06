# UI 抽象轮策划：上下文工具条深模块 · 子工具长按标准件 · 顶栏动词化（现状 .h + 提案 .h）

> 作者：Claude Fable 5.1（claude-fable-5-1）· created 20260906 · as-of dev v0.13.9 · 状态：**策划稿，等 user「没问题」再动码**
> 决策依据：ADR-0012（动词原则）+ `20260905-grill-agenda-toolbar-smudge-routing.md` §0b 拍板栏（context-toolbar 深模块 / 子工具长按 /
> 单笔位 + 小三角 / 「…」= 工具条自带 / 断点表 / 滤镜笔搬手指位 / 油漆桶进套索 / 吸色不是工具）。
> 家规：重构策划附「现状 .h + 提案 .h」；实现中形状变了回写 §2。

## 0. 目标一句话

顶栏从 8 个工具位收成 4 个动词位（`笔 · 橡皮 · 手指 · 套索`），子工具靠长按 + 小三角；六条各写各皮的上下文工具条收成
一个 DOM 工厂深模块（同一 y / 高 / 居中 / 「…」溢出）；SE2 竖屏不再溢出。行为语义（ADR-0004 填色不互通、ADR-0005 形状笔、
长按吸色、滤镜笔模式）**一律不变**，这轮只动壳。

## 1. 现状 .h（api/ 现值 v0.13.9，节选）

```ts
// api/src/ui/context-toolbar.d.ts —— 只是登记表（C4 2026-09-02）：量顶栏下缘给 popup 让位，不管 chrome
export declare function registerContextToolbar(el: HTMLElement | null): void;
export declare function contextToolbarIds(): string[];
export declare function contextToolbarBottom(): number;

// api/src/toolbar.d.ts —— 1230 行 god file：顶栏工具钮 + 形状/套索/吸色三条工具条的渲染都在里面
export declare function updateShapeToolbar(): void;
export declare function updateLassoToolbar(): void;     // 也管 #pickerToolbar 显隐
export declare function setTool(tool: string): void;    // tool ∈ brush|eraser|shapeBrush|lasso|fill|picker|hand|filterBrush（裸 string）
export declare function _syncEditModeUI(): void;
export declare const RACK_PANEL_BY_TOOL: Record<string, string>;
export declare function initToolbar(ctx: AppContext): void;

// src/filters-adjust.ts（未导出）—— 第四条工具条 #filterBrushToolbar（.crop-toolbar 皮），按 Filter 声明渲染：
//   brushVariants / sampleModes / mixModes / boundaryModes / brushSliders → select-field / ramp-slider
// src/doc-ops.ts —— 第五条 #cropToolbar（.crop-toolbar 皮）
// index.html —— #shapeToolbarStack / #lassoToolbarStack / #pickerToolbar 三条静态 .lasso-toolbar-stack 皮（y=50 h=38 居中）
//   vs #filterBrushToolbar / #cropToolbar 两条 .crop-toolbar 皮（y=56 h=44）——「手指工具条位置不对」的病根

// 已有可复用标准件
export declare function createSelectField(opts): SelectField;                 // ui/select-field（C6）
export declare function togglePopupMenu<T>(opts): void;                       // ui/popup-menu（C1）：compact 弹层、外点关、band
export declare function makeRampSlider(o): RampSliderHandle;                  // ui/ramp-slider
// 小三角先例：styles.css .lasso-slot / .lasso-slot-caret（8px 角标）——形状工具条 v0.6.25 变体组槽 + 套索集合运算槽在用
// 长按：input.ts LONG_PRESS_MS = 450（画布长按吸色，desk.longPressPick 默认开）

// 顶栏（index.html #topBar）：菜单 保存 | 笔 形状 手指 橡皮 吸色 套索 油漆桶 (手) | 调整 图层 颜色   —— SE2 375 宽超 51px
```

## 2. 提案 .h（pin 住的契约）

### 2.1 `src/ui/context-toolbar.ts` —— 登记表 → DOM 工厂深模块

```ts
export type ToolbarItem =
  | { kind: "title"; text: string }
  | { kind: "sep" }
  | { kind: "button"; id: string; icon: IconName; title: string; pressed?: () => boolean; disabled?: () => boolean; onClick(): void;
      /** 角上小三角 = 有变体菜单：已选中再点 / 长按 → popup-menu（形状变体槽语义，v0.6.25） */
      variants?: { items: () => PopupMenuItem[]; onPick(id: string): void } }
  | { kind: "select"; id: string; items: () => SelectItem[]; value: () => string; onChange(v: string): void; title?: string }
  | { kind: "slider"; id: string; label: string; min: number; max: number; step: number; value: () => number; fmt?: (v: number) => string; onInput(v: number): void }
  | { kind: "custom"; id: string; mount(host: HTMLElement): () => void };   // 逃生口：套索集合运算等特殊件先原样搬进来

export interface ContextToolbarSpec {
  id: string;                          // 也是 DOM id（探针/测试用）
  rows: ToolbarItem[][];               // 多行（套索 = 选区方式 / 选区操作 两行）；每行独立溢出
  priority?: (item: ToolbarItem) => number;   // 溢出时先折谁（缺省：越靠右越先折；title/sep 永不折）
}
export interface ContextToolbarHandle {
  el: HTMLElement;
  show(): void; hide(): void; isVisible(): boolean;
  refresh(): void;                     // 受控值重画（pressed/disabled/select value/slider value）
  replaceRows(rows: ToolbarItem[][]): void;   // 同 id 换内容（滤镜笔切 variant）
  dispose(): void;
}
/** 建一条上下文工具条：固定 top = 顶栏下缘 + 8，居中，宽 ≤ 视口 − 32，行高 38；一行放不下 → 尾部项折进「…」（popup-menu compact）。
 *  同一时刻允许多条可见（套索双行、以后图层类型条），z 归 --z-toolbar；contextToolbarBottom() 语义不变。 */
export function mountContextToolbar(spec: ContextToolbarSpec): ContextToolbarHandle;
export function contextToolbarBottom(): number;
export function contextToolbarIds(): string[];
// registerContextToolbar(el) 保留一轮给还没迁的静态条（crop），迁完删
```

### 2.2 `src/ui/subtool-slot.ts` —— 子工具长按标准件（顶栏动词位用）

```ts
export interface SubTool { id: string; icon: IconName; title: string }
export interface SubToolSlotOpts {
  el: HTMLButtonElement;               // 顶栏那颗 .tool 钮
  tools: () => SubTool[];              // ≥2 才画小三角
  current: () => string;               // 当前子工具 id（钮面图标随之换）
  onTap(): void;                       // 单击 = 选中动词（若已是当前动词则不切子工具，只保持）
  onPick(id: string): void;            // 长按/右键/已选中再点 → 菜单选子工具
  longPressMs?: number;                // 缺省 450（与画布长按同值）
}
export interface SubToolSlotHandle { refresh(): void; dispose(): void }
export function attachSubToolSlot(o: SubToolSlotOpts): SubToolSlotHandle;
// 视觉：钮面 <use href> 换成当前子工具图标；角标复用 .lasso-slot-caret 形制（8px，右下）；菜单 = popup-menu compact 带勾选。
// 手势：pointerdown 起 450ms 计时，移动 > 8px 取消（同 input.ts LONG_PRESS_CANCEL_SQ）；触屏长按不触发 contextmenu（preventDefault）。
```

### 2.3 顶栏动词表（`src/toolbar.ts` 内的数据，ADR-0012 §2）

```ts
export type Verb = "brush" | "eraser" | "smudge" | "lasso";
export const VERB_SUBTOOLS: Record<Verb, SubTool[]> = {
  brush:  [{ id: "freehand", icon: "pencil" }, { id: "shape", icon: "shapes" }],
  eraser: [{ id: "pixel", icon: "eraser" }],                                     // 「整笔」智能擦：另案落地时追加
  smudge: [{ id: "smear", icon: "finger" }, { id: "dull", icon: "blend" }, { id: "blur", icon: "blur" }, { id: "sharpen", icon: "sharpen" },
           { id: "liquify", icon: "liquify" }, { id: "clone", icon: "stamp" /* 引擎另案；先不列 */ }],
  lasso:  [{ id: "lasso", icon: "lasso" }, { id: "wand", icon: "magic-wand" }, { id: "rect", icon: "select-rectangle" },
           { id: "pen", icon: "pencil" }, { id: "fill", icon: "paint-bucket" }],
};
/** 子工具 → 现有 editMode / 滤镜笔 payload 的路由表（行为零变更，只换入口）：
 *  brush/freehand → setTool("brush")；brush/shape → setTool("shapeBrush")；eraser/pixel → setTool("eraser")
 *  smudge/smear|dull → _enterFilterBrushMode(smudge, variant)；smudge/blur|sharpen → sharpenBlur variant；smudge/liquify → liquify
 *  lasso/lasso|wand|rect|pen → setTool("lasso") + 套索子工具；lasso/fill → setTool("fill")（ADR-0004 进出 commit/清选区规则不变） */
export function setVerb(verb: Verb, sub?: string): void;       // setTool 保留为底层（裸 string 一轮内收成 typed）
```
记忆：每个动词的当前子工具**要跨 session 记住**（不然每次开 app 手指位都回「手指」）——持久化落 `desk.subTool: Partial<Record<Verb, string>>`
（per-doc，跟画走，与 toolStates 同层）。**这是新持久化字段，需要 user 点头**（家规：改持久化结构先同意）。

### 2.4 顶栏终形与断点表

`菜单 云保存 | 笔 橡皮 手指 套索 | fx 图层 颜色`（9 位）。实测口径（32px 钮、2px 间隙、8px 组 padding）≈ 290px：

| 视口宽 | 容器 | 策略 |
|---|---|---|
| ≥ 768（iPad 竖屏起） | 充裕 | 全显 |
| 390–767（手机竖屏大） | ~360 | 全显（290 + 分隔） |
| 375（SE2） | 349 | 全显，余量 ~60 |
| 320（SE1） | 294 | 全显但间隙 2→0、组 padding 8→4（≈ 270）；不再溢出 |

上下文工具条断点：一行 ≤ 视口 − 32；放不下的尾项进「…」（select 折进去时变菜单二级项）。iPad 竖屏套索双行照旧。

### 2.5 吸色搬家（ADR-0012 §6）

- 撤 `#toolPicker`。保留：画布长按（默认开，现状不变）+ **左栏一颗非工具钮** `#railPick`（按住吸色 / 点一下进临时吸色态直到下一次落笔，Procreate 修饰键思路）+ 色板里的吸管钮 + 渐变条上直接吸（ramp-editor 加 `pickAt(t)`）。
- 路由：全部走 `setColor()` → color target 栈（笔色 / fill 待填色 / 选中色标），零新路由。
- 吸色工具条（合并/当前图层取样）变成吸色态的上下文条（同一深模块）。

### 2.6 落地批次（每批 dev push + 探针 + 截图；全部 app 层）

| 批 | 内容 | 验证 |
|---|---|---|
| U1 | `context-toolbar` DOM 工厂 + 「…」溢出；先迁 **手指/滤镜笔条**（filters-adjust `_renderFilterBrushToolbar` → spec）和 **裁切条**（doc-ops）：两条 .crop-toolbar 皮消失，位置对齐 y=50/h=38 | 探针量 5 条工具条 y/高一致；SE2 视口下溢出项进「…」 |
| U2 | 迁形状 / 套索（双行）/ 吸色三条静态条（index.html 三段 HTML 删，toolbar.ts 三段渲染 → spec；`custom` 逃生口兜住集合运算等特殊件） | 现有 shape/lasso 探针与 test/context-toolbar.test 改口径；行为零变更 |
| U3 | `subtool-slot` 标准件 + 顶栏动词化：笔位收形状、套索位收填色、手指位收模糊/锐化/液化（滤镜笔 variant → 子工具）；`desk.subTool` 记忆（需 user 点头） | 探针：长按出菜单/选子工具钮面换图标/行为路由到旧 editMode；SE2 375 不溢出 |
| U4 | 吸色搬家（撤图标、左栏钮、色板吸管、渐变条吸色）；`toolHand` 条件位不变 | 探针：三入口吸到的色落到当前 color target |
| U5 | 清账：删 registerContextToolbar 旧路、toolbar.ts 切薄（目标 −400 行）、i18n/图标收货、真机批场景 G 登记 | 1444+ 测绿；gen-api 重打；提案 §2 回写 |

### 2.7 图标需求（家规：显式报告 + 登记 `20260708 SVG Icons/TODO.md`）

已有可直接用：`pencil shapes finger eraser lasso magic-wand select-rectangle paint-bucket stamp more eyedropper`。
**缺 4 个，先中文烤 stopgap 顶位**：`blend`（混色/揉）、`blur`（模糊）、`sharpen`（锐化）、`liquify`（液化）。智能橡皮的 `eraser-stroke` 等另案再登记。

## 3. 不做 / 风险

- 不做 declarative UI 框架、不动主菜单（UI 纪元 C 系列拍板沿用）；行为语义零变更（形状笔仍是 editMode shapeBrush，填色仍是 fill 模式）。
- toolbar.ts 1230 行：只沿三条工具条渲染的接缝切，不重写 setTool/同步逻辑；input.ts 的画布长按与顶栏钮长按是两套监听，互不干扰。
- 子工具记忆的持久化字段（§2.3）与吸色左栏钮的位置（左栏现在是 dial：粗细/透明 + undo/redo）都要 user 点头。
- 「…」折进去的 select 变二级菜单：可用性略降，只在窄屏发生。

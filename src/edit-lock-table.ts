// edit-lock-table —— 修改锁的分类表：「锁着的时候什么能动」只此一处。created 2026-11-09 by Claude Fable 5.1
//   家族标准（家族根 ai-docs/20261108-edit-lock-standard.md 第三½节）：东西分三类——
//     内容：锁着不能动；
//     看法：锁着能动，但锁着期间对文件一个字节都不写，导出 / 复制 / 另存为跟着眼前的样子；
//     视口：不碰这幅画（平移、缩放、工具选项、面板开合…），照常。
//   user 2026-11-08：「每个 app 要给自己分类，同意，就逼出窄接口」「这些看法…你可以修，但只是说…没法保存到文件里」。
//
// **键 = 操作的名字 = 写令牌的标签**（Workpiece.begin / History.withPoint 的 label——唯一的写入口上每个操作自带的那个词）。
//   没列进来的一律算内容（往拦的方向默认）。指针、快捷键、面板按钮、写令牌、撤销重做，五处都来查这一张表，不各写各的名单：
//     指针       input.ts 的 pointerOp → interaction-lock.allows(intent, { op })
//     快捷键     input.ts 快捷键表每条的 op → 同上
//     面板按钮   index.html / vue-templates.ts 里的 data-op → edit-lock-door.ts 在捕获阶段查
//     写令牌     Workpiece.writeGate → edit-lock.editWriteGate(label)（并进同一步的每个微步都问）
//     撤销重做   History 拿「要翻的那一步」的标签问同一个口
//   保存（editor-session）和库（@internal/store）那两层不看这张表：锁着就是一个字节都不写，没有例外。
//
// 零依赖、纯数据：界面那一头（interaction-lock）和写入口那一头（edit-lock）都 import 它，它不 import 任何东西。

/** 一类「看法」。 */
export interface LookOp {
  /** 这类看法进不进文件。进 = 锁着时动过，解锁那一刻要转成正式的待保存改动（user 11-08：「切换可见性在编辑模式里面当然是需要保存的…
   *  只是说在锁定模式的时候，你 dirty 的时候也没法写」）；不进 = 解锁时什么都不欠。 */
  readonly inFile: boolean;
}

/** 看法的明文名单。加一类 = 在这里加一行 + 给它的入口标上 op（test/edit-lock-guard.test.mjs 钉：名单里的词必须真是某个写入口在用的标签）。 */
export const LOOK_OPS: Readonly<Record<string, LookOp>> = Object.freeze({
  layerVisible: { inFile: true },    // 图层的眼睛（可见性）：影响成品、存在文件里
  selection:    { inFile: false },   // 选区（画 / 加减 / 全选 / 反选 / 去选 / 扩张收缩 / 从图层建）：从不进文件，只是「要复制哪一块」
});

/** 面板按钮专用的两个保留词（data-op 的取值 = 这两个之一，或者 LOOK_OPS 里的一个词）。 */
export const OP_VIEW = "view";         // 不碰这幅画：工具选项、面板的壳（关闭 / 拖动）、取消、只读的复制
export const OP_CONTENT = "content";   // 改内容：不细分是哪一个操作，锁着就是不让

const has = (op: string | null | undefined): op is string => op != null && Object.prototype.hasOwnProperty.call(LOOK_OPS, op);

/** 这个操作是不是看法（锁着也能做）。没给 / 没列 = 不是。 */
export function isLookOp(op: string | null | undefined): boolean { return has(op); }
/** 这个看法进不进文件（不是看法 → false）。 */
export function lookOpInFile(op: string | null | undefined): boolean { return has(op) && LOOK_OPS[op]!.inFile; }
/** 面板按钮：标了这个 data-op 的控件锁着时让不让点。view / 看法 → 让；其余（content、认不出来的词）→ 不让。 */
export function controlAllowedWhileLocked(op: string | null | undefined): boolean { return op === OP_VIEW || has(op); }

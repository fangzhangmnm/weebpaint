/** 一类「看法」。 */
export interface LookOp {
    /** 这类看法进不进文件。进 = 锁着时动过，解锁那一刻要转成正式的待保存改动（user 11-08：「切换可见性在编辑模式里面当然是需要保存的…
     *  只是说在锁定模式的时候，你 dirty 的时候也没法写」）；不进 = 解锁时什么都不欠。 */
    readonly inFile: boolean;
}
/** 看法的明文名单。加一类 = 在这里加一行 + 给它的入口标上 op（test/edit-lock-guard.test.mjs 钉：名单里的词必须真是某个写入口在用的标签）。 */
export declare const LOOK_OPS: Readonly<Record<string, LookOp>>;
/** 面板按钮专用的两个保留词（data-op 的取值 = 这两个之一，或者 LOOK_OPS 里的一个词）。 */
export declare const OP_VIEW = "view";
export declare const OP_CONTENT = "content";
/** 这个操作是不是看法（锁着也能做）。没给 / 没列 = 不是。 */
export declare function isLookOp(op: string | null | undefined): boolean;
/** 这个看法进不进文件（不是看法 → false）。 */
export declare function lookOpInFile(op: string | null | undefined): boolean;
/** 面板按钮：标了这个 data-op 的控件锁着时让不让点。view / 看法 → 让；其余（content、认不出来的词）→ 不让。 */
export declare function controlAllowedWhileLocked(op: string | null | undefined): boolean;

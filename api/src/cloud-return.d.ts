export type ReturnPlan = {
    kind: "none";
} | {
    kind: "list";
    total: number;
} | {
    kind: "ask";
    neverUploaded: number;
    others: number;
};
/** dirty = 库 dirty.count()；neverUploaded = 列举里 float 的份数。
 *  openDocAutosaveOnly = 开着的这份就是 (c)（isOpenDocAutosaveOnly）：它不是「回来发现的事」——人正在画它，按存或离开才传；每次切 app 回来都说「没传上去」= 假警报，
 *  人学会了无视，真分叉时也点掉（家族周账 F-200，user 11-05 报的 MoonSinger，同一段代码）。所以只有它一份 = 不说；它还在图库「要处理」列表里，字节在设备上，存钮亮着，离开就传。
 *  要问 (a) 时不减：「现在全传」确实会连它一起传，「还有 N 份」要算上它，面上的话才是真的。 */
export declare function planReturn(dirty: number, neverUploaded: number, openDocAutosaveOnly?: boolean): ReturnPlan;
/** 开着的这份是不是「只是自动保存」：两边都说是才算（Opus 11-05，两条都是核代码 / 探针抓出来的）。
 *  库：列表说它改过没传（unpushed）。不看这个 = isPushPending 第一次改动就为真，那时字节可能还没落盘、不在 dirty.count 里，再减 1 就把别的画藏掉了。
 *  这一页：sessionPending（isPushPending ∧ 没按过存）。不看这个 = 刷新 / 被系统杀掉重开之后 EditorSession 是新的，存钮显示干净、离开也不传，这条通知是唯一的信号，撤了就是谎报。
 *  conflict / ghost 是真要人选的，float 是 (a)，都不算。在续传（resumeOwedPush）之前算：owed 的那份续传之后状态变了，不该再减。 */
export declare function isOpenDocAutosaveOnly(files: readonly {
    identifier: string;
    syncState?: string | null;
}[], openId: string | null, sessionPending: boolean): boolean;
/** (c) 那条通知要点名的身份：传过、还有东西要传的（不含从没传过的，那是 (a)）。except = 开着的那份（只是自动保存时不点它的名）。 */
export declare function stillLocalIds(files: readonly {
    identifier: string;
    syncState?: string | null;
}[], except: string | null): string[];
/** 列举里「从没传过且有字节要传」的身份。local-only 是干净的（pushAll 不推它），不算。 */
export declare function neverUploadedIds(files: readonly {
    identifier: string;
    syncState?: string | null;
}[]): Set<string>;

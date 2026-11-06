// src/cloud-return.ts —— 回来（开机登录好 / 网回来）时没传的东西怎么办（家族规则书 §1 第 15 条，2026-11-03 夜改写；工单 G2）。
// created 2026-11-03 by Claude Opus 5.5
//   (a) 从没传过（syncState float）→ 问一次；第一次把东西放进某个账号是人的决定。
//   (b) 传过、人按过存、当时没传成 → 自动续传不问；app 只对开着那份知道（EditorSession.isPushOwed）。
//   (c) 传过、只是自动保存落了本机 → 不自动传，进「要处理」列表；别的画有 (c) 时说一声、给「传上去」（人点了 = 同意）；开着的这份不算（见 planReturn）。
//   库的 pushAll 不分这三种（不加筛选，user 11-03）：a、c 同时有时，面上两样都说、人点了才一起传（Fable 11-03 拍）。
//   纯函数：node 直测。

export type ReturnPlan =
  | { kind: "none" }
  | { kind: "list"; total: number }
  | { kind: "ask"; neverUploaded: number; others: number };

/** dirty = 库 dirty.count()；neverUploaded = 列举里 float 的份数。
 *  openDocAutosaveOnly = 开着的这份就是 (c)（isOpenDocAutosaveOnly）：它不是「回来发现的事」——人正在画它，按存或离开才传；每次切 app 回来都说「没传上去」= 假警报，
 *  人学会了无视，真分叉时也点掉（家族周账 F-200，user 11-05 报的 MoonSinger，同一段代码）。所以只有它一份 = 不说；它还在图库「要处理」列表里，字节在设备上，存钮亮着，离开就传。
 *  要问 (a) 时不减：「现在全传」确实会连它一起传，「还有 N 份」要算上它，面上的话才是真的。 */
export function planReturn(dirty: number, neverUploaded: number, openDocAutosaveOnly = false): ReturnPlan {
  if (dirty <= 0) return { kind: "none" };
  if (neverUploaded > 0) return { kind: "ask", neverUploaded, others: Math.max(0, dirty - neverUploaded) };
  const total = dirty - (openDocAutosaveOnly ? 1 : 0);
  return total > 0 ? { kind: "list", total } : { kind: "none" };
}

/** 开着的这份是不是「只是自动保存」：两边都说是才算（Opus 11-05，两条都是核代码 / 探针抓出来的）。
 *  库：列表说它改过没传（unpushed）。不看这个 = isPushPending 第一次改动就为真，那时字节可能还没落盘、不在 dirty.count 里，再减 1 就把别的画藏掉了。
 *  这一页：sessionPending（isPushPending ∧ 没按过存）。不看这个 = 刷新 / 被系统杀掉重开之后 EditorSession 是新的，存钮显示干净、离开也不传，这条通知是唯一的信号，撤了就是谎报。
 *  conflict / ghost 是真要人选的，float 是 (a)，都不算。在续传（resumeOwedPush）之前算：owed 的那份续传之后状态变了，不该再减。 */
export function isOpenDocAutosaveOnly(files: readonly { identifier: string; syncState?: string | null }[], openId: string | null, sessionPending: boolean): boolean {
  if (!openId || !sessionPending) return false;
  return files.some((f) => f.identifier === openId && f.syncState === "unpushed");
}

/** (c) 那条通知要点名的身份：传过、还有东西要传的（不含从没传过的，那是 (a)）。except = 开着的那份（只是自动保存时不点它的名）。 */
export function stillLocalIds(files: readonly { identifier: string; syncState?: string | null }[], except: string | null): string[] {
  return files.filter((f) => f.identifier !== except && (f.syncState === "unpushed" || f.syncState === "conflict" || f.syncState === "ghost")).map((f) => f.identifier);
}

/** 列举里「从没传过且有字节要传」的身份。local-only 是干净的（pushAll 不推它），不算。 */
export function neverUploadedIds(files: readonly { identifier: string; syncState?: string | null }[]): Set<string> {
  return new Set(files.filter((f) => f.syncState === "float").map((f) => f.identifier));
}

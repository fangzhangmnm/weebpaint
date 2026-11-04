// src/cloud-return.ts —— 回来（开机登录好 / 网回来）时没传的东西怎么办（家族规则书 §1 第 15 条，2026-11-03 夜改写；工单 G2）。
// created 2026-11-03 by Claude Opus 5.5
//   (a) 从没传过（syncState float）→ 问一次；第一次把东西放进某个账号是人的决定。
//   (b) 传过、人按过存、当时没传成 → 自动续传不问；app 只对开着那份知道（EditorSession.isPushOwed）。
//   (c) 传过、只是自动保存落了本机 → 不传不问，进「要处理」列表。
//   库的 pushAll 不分这三种（不加筛选，user 11-03）：a、c 同时有时，面上两样都说、人点了才一起传（Fable 11-03 拍）。
//   纯函数：node 直测。

export type ReturnPlan =
  | { kind: "none" }
  | { kind: "list"; total: number }
  | { kind: "ask"; neverUploaded: number; others: number };

/** dirty = 库 dirty.count()；neverUploaded = 列举里 float 的份数。 */
export function planReturn(dirty: number, neverUploaded: number): ReturnPlan {
  if (dirty <= 0) return { kind: "none" };
  if (neverUploaded <= 0) return { kind: "list", total: dirty };
  return { kind: "ask", neverUploaded, others: Math.max(0, dirty - neverUploaded) };
}

/** 列举里「从没传过且有字节要传」的身份。local-only 是干净的（pushAll 不推它），不算。 */
export function neverUploadedIds(files: readonly { identifier: string; syncState?: string | null }[]): Set<string> {
  return new Set(files.filter((f) => f.syncState === "float").map((f) => f.identifier));
}

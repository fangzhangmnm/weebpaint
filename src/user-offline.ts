// user-offline.ts —— 「离线继续」的记忆（家族设计稿 ai-docs/20261103-cloud-gate-design.md §3；created 2026-11-03 by Claude Opus 5.5，工单 G；CatsUp 同形）。
//   叶子、零依赖：app-store 把 cloudOnline 接进 OneDrive 那家 store 的 isOnline，库在离线态一条网都不打（store 2.2.4 起 collection 也一起）。
//   **只在内存**：刷新就没了（user「离线选择只记到网回来」）；test/cloud-gate.test.mjs 机械核这个名字不出现在任何持久层写入里。
let userOffline = false;

export function isUserOffline(): boolean { return userOffline; }
export function setUserOffline(v: boolean): void { userOffline = v; }
/** 浏览器说有网（navigator.onLine 不可全信，但 false 是可信的）。 */
export function browserOnline(): boolean { return typeof navigator === "undefined" || navigator.onLine !== false; }
/** 网盘这条路现在通不通 = 浏览器有网 ∧ 用户没选「离线继续」。app 里问「能不能上云」一律问它，不直接看 navigator.onLine。 */
export function cloudOnline(): boolean { return browserOnline() && !userOffline; }

// 只清自己的离线壳（created 2026-10-21 by Claude Fable 5.1；逻辑原在 topbar-menu.ts「强制更新」里，还原出厂也要它，抽成一处）。
//   家族 2026-10-01 规矩：缓存和 service worker 按域名算——weebpaint.com 的 `/`（正式版）和 `/dev/` 同源，「全部注销 / 全部删除」会把另一边的
//   离线壳一起清掉。自己的 = 管着当前页面的那一个 service worker + 名字以 `weebpaint-` 开头的缓存（service-worker.js 的 CACHE_NAME 前缀）。
//   IDB / localStorage 一律不碰——那是「还原出厂」的事（factory-reset.ts），两个钮不合并（user 10-21：强制更新 = 只清缓存；彻底删除 = 变成新的）。
export const OWN_CACHE_PREFIX = "weebpaint-";

/** 注销管着当前页面的 SW + 删自己前缀的 Cache Storage。失败只吞单项（壳清不干净不该挡住 reload）。 */
export async function clearOwnShell(): Promise<void> {
  if (navigator.serviceWorker) {
    const r = await navigator.serviceWorker.getRegistration();
    if (r) await r.unregister().catch(() => {});
  }
  if (typeof caches !== "undefined") {
    const keys = await caches.keys();
    for (const k of keys) if (k.startsWith(OWN_CACHE_PREFIX)) await caches.delete(k).catch(() => {});
  }
}

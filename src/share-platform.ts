// share-platform.ts —— 黑匣子（诊断日志）的「分享」该不该走系统分享面板。
// created 2026-11-09 by Claude Opus 5.5（家族周账 F-111；user 2026-10-27「黑匣子的分享windows下面应该是下载，windows的分享就是个流氓软件」）。
// 只给手机 / 平板系统（iOS / iPadOS / Android）；别的（Windows / Mac / Linux 桌面、Quest）一律下载 .txt。
// Windows 上的 Edge / Chrome 也有 navigator.share，弹出来的是系统分享面板，所以不能只看有没有这个函数。
// iPadOS 的 Safari / Edge 默认自称 Macintosh：看触点数认出来（Mac 桌面是 0）。
// 只管黑匣子：作品导出 / 笔刷的分享（session.ts、brush-io.ts）不归这里。小黑屋 src/share-platform.ts 同一份。

export interface SharePlatformNav { share?: unknown; userAgent?: string; maxTouchPoints?: number }

export function shareSheetPlatform(nav: SharePlatformNav = navigator): boolean {
  if (typeof nav.share !== "function") return false;
  const ua = nav.userAgent ?? "";
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && (nav.maxTouchPoints ?? 0) > 1;
}

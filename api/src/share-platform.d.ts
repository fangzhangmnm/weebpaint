export interface SharePlatformNav {
    share?: unknown;
    userAgent?: string;
    maxTouchPoints?: number;
    platform?: string;
}
/** iOS / iPadOS / Android。 */
export declare function isMobileShareOs(nav?: SharePlatformNav): boolean;
/** 黑匣子的「分享」走不走系统分享面板：手机 / 平板系统且浏览器有 share；别的（Windows / Mac / Linux 桌面、Quest）一律下载。 */
export declare function shareSheetPlatform(nav?: SharePlatformNav): boolean;

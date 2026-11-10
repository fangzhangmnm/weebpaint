// 黑匣子「分享」只给手机 / 平板系统，桌面一律下载（家族周账 F-111）。created 2026-11-09 by Claude Opus 5.5
import { readFileSync } from "node:fs";
import { describe, it, assert, eq } from "./runner.mjs";
import { shareSheetPlatform } from "../src/share-platform.ts";

const share = () => {};
const UA = {
  winEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  iPadEdgeDesktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15 EdgiOS/130.0.0.0",
  iPhoneEdge: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/130.0.0.0 Mobile/15E148 Safari/605.1.15",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  quest: "Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/35.0 Chrome/130.0.0.0 VR Safari/537.36",
};

describe("黑匣子分享 / 下载（F-111）", () => {
  it("Windows 上的 Edge 有 navigator.share 也走下载；Mac 桌面、Quest 也下载", () => {
    eq(shareSheetPlatform({ share, userAgent: UA.winEdge, maxTouchPoints: 0 }), false);
    eq(shareSheetPlatform({ share, userAgent: UA.winEdge, maxTouchPoints: 10 }), false, "Windows 触屏本也下载");
    eq(shareSheetPlatform({ share, userAgent: UA.macSafari, maxTouchPoints: 0 }), false);
    eq(shareSheetPlatform({ share, userAgent: UA.quest, maxTouchPoints: 0 }), false);
  });
  it("iPhone / iPad（含自称 Macintosh 的）/ Android 走分享；没有 share 一律下载", () => {
    eq(shareSheetPlatform({ share, userAgent: UA.iPhoneEdge, maxTouchPoints: 5 }), true);
    eq(shareSheetPlatform({ share, userAgent: UA.iPadEdgeDesktop, maxTouchPoints: 5 }), true);
    eq(shareSheetPlatform({ share, userAgent: UA.android, maxTouchPoints: 5 }), true);
    eq(shareSheetPlatform({ userAgent: UA.iPhoneEdge, maxTouchPoints: 5 }), false);
  });
  it("接线：诊断日志面板用这个判断，不再只看 typeof navigator.share", () => {
    const src = readFileSync("src/diag-log-sheet.ts", "utf8");
    assert(/const canShare = shareSheetPlatform\(\)/.test(src));
    assert(!/typeof navigator\.share/.test(src));
  });
});

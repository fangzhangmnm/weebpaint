// 命名器官（P1）契约测试：三粒度拍板的格式钉死（verdicts §2.1）。
// created 2026-08-26 by Claude Fable 5.
import { describe, it, assert, eq } from "./runner.mjs";
import { galleryDefaultName, downloadStamp, downloadName } from "../src/naming.ts";

const AT = new Date(2026, 7, 26, 9, 5);   // 2026-08-26 09:05（月份 0 基）

describe("naming · 命名器官（画=日粒度+hex4 / 下载=分钟戳）", () => {
  it("galleryDefaultName = yyyymmdd-hex4（v217 惯例；禁「未命名」的落点）", () => {
    for (let i = 0; i < 20; i++) {
      const n = galleryDefaultName(AT);
      assert(/^20260826-[0-9a-f]{4}$/.test(n), `格式：${n}`);
    }
  });
  it("downloadStamp = YYYYMMDD-HHMM（补零）", () => {
    eq(downloadStamp(AT), "20260826-0905");
    eq(downloadStamp(new Date(2026, 0, 3, 23, 59)), "20260103-2359");
  });
  it("downloadName = 基名-戳（基名原样，不吞夹前缀/空格）", () => {
    eq(downloadName("练习/夏音", AT), "练习/夏音-20260826-0905");
  });
});

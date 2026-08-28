// created 2026-08-28 by Claude Fable 5
// F7 无库满功能：无库画两笔 → 导出与另存 hub → 导出图片 → 真下载 PNG（magic 验字节）。
// 契约：无地=除云外全功能——导出链（GL readback → encode → 水印合成 → 下载）不依赖任何库/持久化。
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import { CTX_ZH, startServer, bootPage, makeChecker, evClick, drawStroke, clickChoice } from "./harness.mjs";

const srv = await startServer();
const browser = await chromium.launch();
const context = await browser.newContext({ ...CTX_ZH, acceptDownloads: true });
const c = makeChecker("F7 export");
const { page, errors } = await bootPage(context, srv.url);

await drawStroke(page);
await evClick(page, "menuButton");
const dl = page.waitForEvent("download", { timeout: 30_000 });
await evClick(page, "menuExportImage");
await page.waitForTimeout(400);
await clickChoice(page, "导出图片");
const download = await dl;
const name = download.suggestedFilename();
c.expect("filename .png", name.endsWith(".png"), name);
const path = await download.path();
const bytes = await readFile(path);
c.expect("PNG magic", bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47, `len=${bytes.length}`);
c.expect("non-trivial size", bytes.length > 1000, `len=${bytes.length}`);

await browser.close(); await srv.close();
c.finish(errors);

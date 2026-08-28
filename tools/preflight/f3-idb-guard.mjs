// created 2026-08-28 by Claude Fable 5
// F3 跑手：esbuild 打包 entry（真 local-cache）→ 真浏览器真 IDB 里重放 A4 契约。
// 前置：preflight.sh 已把 f3-idb-guard.entry.ts 打成 tmp/preflight-f3.js + tmp/preflight-f3.html。
import { chromium } from "playwright";
import { startServer, wirePage, makeChecker } from "./harness.mjs";

const srv = await startServer();
const browser = await chromium.launch();
const context = await browser.newContext();
const c = makeChecker("F3 idb-guard");
const errors = [];
const page = await context.newPage();
wirePage(page, errors);
await page.goto(srv.url + "tmp/preflight-f3.html", { waitUntil: "load" });
const res = await page.evaluate(() => window.__F3__());
for (const f of res.fails) c.expect(f, false);

await browser.close(); await srv.close();
c.finish(errors);

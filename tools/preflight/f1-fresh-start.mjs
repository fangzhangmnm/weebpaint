// created 2026-08-28 by Claude Fable 5
// F1 无痕首启诚实（wave 6；吸收 v0.11.22 tmp/nogallery-smoke.mjs 六探针并入库）+ 足迹纪律扫。
// 契约：fresh context（无 IDB 无 MSAL）boot = 无库模式——图库不可开、「连接图库…」显形、能画；
//   **绝不**出现幽灵图库/自动建店（店懒出生：store 命名空间 "weebpaint.*" 的 IDB 零出现）；
//   所有新建 IDB 库名必须带 GUID 前缀（足迹纪律，F5 re-scope 的落点之一）。
import { chromium } from "playwright";
import { CTX_ZH, startServer, bootPage, makeChecker, listDbs } from "./harness.mjs";

const srv = await startServer();
const browser = await chromium.launch();
const context = await browser.newContext(CTX_ZH);
const c = makeChecker("F1 fresh-start");
const { page, errors } = await bootPage(context, srv.url);

const probe = await page.evaluate(() => ({
  connectVisible: !(document.getElementById("menuConnectGallery")?.hidden ?? true),
  galleryEntryHidden: document.getElementById("menuGallery")?.hidden ?? null,
  galleryOverlayHidden: document.getElementById("galleryFull")?.classList.contains("hidden") ?? null,
  scopeLabels: document.querySelectorAll(".menu-section-label").length,
  noGalleryAttr: document.body.hasAttribute("data-no-gallery"),
  hasCanvas: !!document.querySelector("canvas"),
}));
c.expect("connectVisible", probe.connectVisible === true);
c.expect("galleryEntryHidden", probe.galleryEntryHidden === true);
c.expect("galleryOverlayHidden", probe.galleryOverlayHidden === true);
c.expect("scopeLabels==0", probe.scopeLabels === 0);
c.expect("noGalleryAttr", probe.noGalleryAttr === true);
c.expect("hasCanvas", probe.hasCanvas === true);

// 足迹纪律：无库 boot 只许 GUID 前缀库；店命名空间（weebpaint.<databaseId>）必须零出现（店懒出生）。
const dbs = await listDbs(page);
c.expect("no store-namespace DBs", !dbs.some((n) => n === "weebpaint" || n.startsWith("weebpaint.")), JSON.stringify(dbs));
c.expect("all DBs GUID-prefixed", dbs.every((n) => n.startsWith("weebpaint-bd6cece69075d759.")), JSON.stringify(dbs));

await browser.close(); await srv.close();
c.finish(errors);

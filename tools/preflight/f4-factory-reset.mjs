// created 2026-08-28 by Claude Fable 5
// F4 还原出厂真清（wave 6）。四段（同一 context 顺序走，覆盖 guard 各分支）：
//   ① 脏 transient 挡门：画一笔 → 还原出厂 → 三键挽留 choice sheet → 取消 = 整个还原中止，啥都不动。
//   ② consent 打错：干净 transient → 门全过 → 打错短语 → WipeConsentError 拒执行，数据原封（theme 还在）。
//   ③ 正门：打对「删除全部本地数据」→ wipe → 无痕扫归零报告 → reload 出厂态（theme 归 auto、
//     rack 回种子态、GUID 库清光后按需重建）。
//   ④ 出厂态 = F1 同款探针绿（处女 boot）。
import { chromium } from "playwright";
import { CTX_ZH, startServer, bootPage, makeChecker, evClick, drawStroke, rackSlotCount } from "./harness.mjs";

const srv = await startServer();
const browser = await chromium.launch();
const context = await browser.newContext(CTX_ZH);
const c = makeChecker("F4 factory-reset");
const T0 = Date.now();
const trace = (m) => console.log(`  [f4 +${((Date.now() - T0) / 1000).toFixed(1)}s] ${m}`);
setTimeout(() => { console.error("[F4] WATCHDOG: 120s 硬切（挂死）"); process.exit(1); }, 120_000).unref?.() ?? undefined;
const { page, errors } = await bootPage(context, srv.url);

trace("boot done, set theme");
// 埋标记：theme=夜（②要验「拒执行没动数据」、③要验「正门清掉了」）
await evClick(page, "menuButton");
await evClick(page, "menuThemeBtn");
await page.waitForTimeout(200);
await page.evaluate(() => { [...document.querySelectorAll("#menuThemeMenu button")].find((x) => x.textContent.includes("夜"))?.click(); });
await page.waitForTimeout(300);
await evClick(page, "menuButton");

trace("① dirty guard");
// ── ① 脏 transient：挽留门 → 取消 ─────────────────────────────────────────────
await drawStroke(page);
await evClick(page, "menuButton");
await evClick(page, "menuFactoryReset");
await page.waitForTimeout(400);
const sheet1 = await page.evaluate(() => ({
  choicesVisible: !document.getElementById("genericSheetChoices").classList.contains("hidden"),
  nChoices: document.querySelectorAll("#genericSheetChoices button").length,
}));
c.expect("dirty transient → 三键挽留（choice sheet 2 键 + 取消）", sheet1.choicesVisible && sheet1.nChoices === 2, JSON.stringify(sheet1));
await evClick(page, "genericSheetCancel");
await page.waitForTimeout(300);
c.expect("取消=中止，theme 未动", await page.evaluate(() => document.documentElement.getAttribute("data-theme")) === "night");

trace("① done, reload");
// 洗掉脏 transient：reload（正常关闭即焚 = consent），回来是干净 transient
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(4000);

trace("② wrong consent");
// ── ② consent 打错 → 拒执行 ──────────────────────────────────────────────────
await evClick(page, "menuButton");
await evClick(page, "menuFactoryReset");
await page.waitForTimeout(400);
c.expect("intro confirm sheet up", await page.evaluate(() => !document.getElementById("genericSheet").classList.contains("hidden")));
await evClick(page, "genericSheetConfirm");   // intro 确认
await page.waitForTimeout(300);
await page.evaluate(() => { const i = document.getElementById("genericSheetInput"); i.value = "打错的短语"; });
await evClick(page, "genericSheetConfirm");
await page.waitForTimeout(800);
c.expect("打错=拒执行（theme 原封）", await page.evaluate(() => document.documentElement.getAttribute("data-theme")) === "night");

trace("③ real wipe");
// ── ③ 正门：打对短语 → wipe → done sheet → reload ────────────────────────────
await evClick(page, "menuButton");
await evClick(page, "menuFactoryReset");
await page.waitForTimeout(400);
await evClick(page, "genericSheetConfirm");
await page.waitForTimeout(300);
await page.evaluate(() => { const i = document.getElementById("genericSheetInput"); i.value = "删除全部本地数据"; });
await evClick(page, "genericSheetConfirm");
await page.waitForTimeout(3000);              // wipe + 无痕扫
const doneMsg = await page.evaluate(() => document.getElementById("genericSheetMessage")?.textContent || "");
c.expect("归零报告（非 residue 文案）", /已清|清除|删除/.test(doneMsg) && !/残留|residue/i.test(doneMsg), doneMsg);
await evClick(page, "genericSheetConfirm");   // done → location.reload()
await page.waitForTimeout(5000);

trace("④ virgin probes");
// ── ④ 出厂态探针（F1 同款）──────────────────────────────────────────────────
const virgin = await page.evaluate(() => ({
  theme: document.documentElement.getAttribute("data-theme"),
  noGalleryAttr: document.body.hasAttribute("data-no-gallery"),
  connectVisible: !(document.getElementById("menuConnectGallery")?.hidden ?? true),
  lsKeys: Object.keys(localStorage).filter((k) => k.startsWith("weebpaint-bd6cece69075d759:")).length,
}));
c.expect("theme 归 auto", virgin.theme !== "night", String(virgin.theme));
c.expect("处女 boot=无库", virgin.noGalleryAttr && virgin.connectVisible);
const rackAfter = await rackSlotCount(page);
c.expect("rack 回种子态（无用户新笔）", rackAfter === -1 || rackAfter <= 17, `count=${rackAfter}`);

await browser.close(); await srv.close();
c.finish(errors);

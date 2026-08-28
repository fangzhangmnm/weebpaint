// created 2026-08-28 by Claude Fable 5
// F2 reload 存活 + T-crash 恢复（wave 6）。三段：
//   ① 设置（device 层，theme=夜）reload 后还在——device-kv localStorage 契约。
//   ② 无库新建一支笔 reload 后还在——device-rack-slot「仅 reload 不应该丢」（A2 唯一拍板）。
//   ③ 画两笔 → 30s 空闲盲快照落盘 → **CDP Page.crash 真崩渲染进程**（不触发 pagehide=真事故）
//     → 重开 boot 出恢复横幅（cb.crashFound）。对照组：正常 reload 的 transient 不出横幅
//     （pagehide 正常关闭即删 = consent transient 拍板，不是丢数据）。
import { chromium } from "playwright";
import { CTX_ZH, startServer, bootPage, makeChecker, evClick, drawStroke, rackSlotCount } from "./harness.mjs";

const srv = await startServer();
const browser = await chromium.launch();
const context = await browser.newContext(CTX_ZH);
const c = makeChecker("F2 reload-survival");
const T0 = Date.now();
const trace = (m) => console.log(`  [f2 +${((Date.now() - T0) / 1000).toFixed(1)}s] ${m}`);
setTimeout(() => { console.error("[F2] WATCHDOG: 150s 硬切（挂死）"); process.exit(1); }, 150_000).unref?.();
const { page, errors } = await bootPage(context, srv.url);

// ── ① theme=夜（菜单真 UI 路径：menuButton → menuThemeBtn → 弹层「夜」）─────────────
await evClick(page, "menuButton");
await evClick(page, "menuThemeBtn");
await page.waitForTimeout(200);
await page.evaluate(() => {
  const btns = [...document.querySelectorAll("#menuThemeMenu button")];
  const b = btns.find((x) => (x.textContent || "").includes("夜"));
  if (!b) throw new Error("theme 夜 option not found");
  b.click();
});
await page.waitForTimeout(300);
c.expect("theme applied", await page.evaluate(() => document.documentElement.getAttribute("data-theme")) === "night");
await evClick(page, "menuButton");   // 收菜单

// ── ② 新建一支笔（brushRackNew → 编辑器 → 保存）────────────────────────────────
await page.waitForTimeout(900);      // 等 slot 首次 seed 的 400ms 防抖落盘
const before = await rackSlotCount(page);
c.expect("rack slot seeded", before > 0, `count=${before}`);
await evClick(page, "brushRackNew");
await page.waitForTimeout(300);
await evClick(page, "brushSettingsSave");
await page.waitForTimeout(900);      // setItem → 400ms 防抖 persist
const after = await rackSlotCount(page);
c.expect("new brush persisted (+1)", after === before + 1, `before=${before} after=${after}`);

// ── reload → ①② 存活 ────────────────────────────────────────────────────────
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(4000);
c.expect("theme survives reload", await page.evaluate(() => document.documentElement.getAttribute("data-theme")) === "night");
const afterReload = await rackSlotCount(page);
c.expect("rack survives reload", afterReload === after, `after=${after} reload=${afterReload}`);
// 对照：正常 reload（pagehide）后 transient 不出恢复横幅（正常关闭即删=consent，不是事故）
c.expect("no crash banner after clean reload", await page.evaluate(() => !document.body.textContent.includes("上次异常退出")));

// ── ③ T-crash：画 → 等盲快照（30s 空闲 + 余量）→ 真崩 → 重开见横幅 ─────────────────
trace("stroke + 36s idle for blind snapshot");
await drawStroke(page);
await page.waitForTimeout(36_000);   // AUTOSAVE_IDLE_MS=30s 盲快照 + encode 余量
trace("crashing renderer via CDP");
const cdp = await context.newCDPSession(page);
// Page.crash 的应答随连接一起死——promise 可能永不 settle，必须 race 超时（首跑挂死实锤）
await Promise.race([cdp.send("Page.crash").catch(() => {}), new Promise((r) => setTimeout(r, 3000))]);
await Promise.race([page.close({ runBeforeUnload: false }).catch(() => {}), new Promise((r) => setTimeout(r, 3000))]);
trace("reopening after crash");
const { page: page2, errors: errors2 } = await bootPage(context, srv.url);
c.expect("crash banner appears", await page2.evaluate(() => document.body.textContent.includes("上次异常退出")));

await browser.close(); await srv.close();
c.finish([...errors.filter((e) => !/crash/i.test(e)), ...errors2]);

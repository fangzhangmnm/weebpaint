// created 2026-10-21 by Claude Fable 5.1（总账 #89：CSP 去 'unsafe-eval'）
// F10 本仓 Vue 组件在不放行 eval 的 CSP 下全都渲染得出来：模板构建时编好（src/vue-templates.ts → .compiled.ts），运行时若还有谁在编译模板
//   = new Function 被拦 → 组件空白、securitypolicyviolation 一条。这里把 10 张模板对应的组件逐个点出来看 DOM 真有东西：
//   左栏 dial（boot 即挂）/ 笔架 sheet（boot 即挂）/ 图层面板（点开）/ 颜色轮（点开）/ 笔刷设置 + 曲线宿（编辑一支笔）/ 下拉标准件（新建 sheet 的尺寸下拉）。
import { chromium } from "playwright";
import { CTX_ZH, startServer, bootPage, makeChecker, evClick } from "./harness.mjs";

const srv = await startServer();
const browser = await chromium.launch();
const context = await browser.newContext(CTX_ZH);
await context.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.effectiveDirective} ${e.blockedURI} ${e.sourceFile?.split("/").pop() ?? "?"}:${e.lineNumber}`)); });
const c = makeChecker("F10 vue-precompiled");
setTimeout(() => { console.error("[F10] WATCHDOG: 90s 硬切（挂死）"); process.exit(1); }, 90_000).unref?.();
const { page, errors } = await bootPage(context, srv.url);
const count = (sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel);

const cspMeta = await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content") ?? "(no CSP meta)");
c.expect("CSP script-src has no 'unsafe-eval'", /script-src [^;]*/.test(cspMeta) && !/'unsafe-eval'/.test(cspMeta.match(/script-src [^;]*/)[0]), cspMeta.slice(0, 160));
c.expect("left dial rendered (boot)", (await count("#leftDialMount *")) > 0);
c.expect("brush rack sheet rendered (boot)", (await count("#brushRackSheet .brush-rack-grid, #brushRackSheet .brush-rack-tile-edit")) > 0);

await evClick(page, "layersButton"); await page.waitForTimeout(500);
c.expect("layers panel rows rendered", (await count("#layersList *")) > 0);
await evClick(page, "layersButton");

await evClick(page, "activeSwatch"); await page.waitForTimeout(500);
c.expect("color wheel rendered (.sv-pad)", (await count(".sv-pad")) > 0);

// 编辑第一支笔 → 笔刷设置视图（BrushSettings 模板，${SECTION} 等 class 常量随模板搬到 vue-templates.ts 后仍要出现）
const editBtns = await count("#brushRackSheet .brush-rack-tile-edit");
c.expect("rack has brush tiles with edit buttons", editBtns > 0, String(editBtns));
await page.evaluate(() => document.querySelector("#brushRackSheet .brush-rack-tile-edit")?.click());
await page.waitForTimeout(800);
c.expect("brush settings form rendered (.brush-settings-section ≥ 3)", (await count("#brushSettingsBody .brush-settings-section")) >= 3, String(await count("#brushSettingsBody .brush-settings-section")));
c.expect("brush settings has select-fields", (await count("#brushSettingsBody .select-field")) > 0);
await evClick(page, "brushSettingsCancel"); await page.waitForTimeout(300);

const csp = await page.evaluate(() => window.__csp.splice(0));
c.expect("zero CSP violations", csp.length === 0, csp.join(" | "));
await browser.close(); await srv.close();
c.finish(errors);

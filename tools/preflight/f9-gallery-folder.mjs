// created 2026-10-21 by Claude Fable 5.1（周账 F-56 迁库：store 2.1.2 + gallery 0.8.5 收货的无头验证）
// F9 本地文件夹图库一圈：无头里没有 OneDrive、也没有真 FSA 目录选择器，但 OPFS 的目录句柄和 FSA 同一个接口
//   （getFileHandle / values / removeEntry；没有 queryPermission → gallery-connect 视为「无权限 API 的平台 = 可用」），
//   所以把 showDirectoryPicker 换成「给 OPFS 的一个子目录」就能把 folder provider（folder = 另一朵云）整条路跑起来：
//   连接 → 新建作品 → 画一笔 → 回图库（退出推云）→ 卡片 ⋯ 菜单（0.6.2：出卡片进 #galleryMount、position fixed；
//   0.8.1：没有「推送到云端 / 重新上传」）→ 送到回收站 → 回收站视图（chrome 换字）→ 恢复 → 备份箱视图（0.5.0 搁置区）→ reload 不炸 → CSP 零拦截。
import { chromium } from "playwright";
import { CTX_ZH, startServer, bootPage, makeChecker, evClick, drawStroke } from "./harness.mjs";

const srv = await startServer();
const browser = await chromium.launch();
const context = await browser.newContext(CTX_ZH);
await context.addInitScript(() => {
  window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle("f9-gallery", { create: true });
});
const c = makeChecker("F9 gallery-folder");
const T0 = Date.now();
const trace = (m) => console.log(`  [f9 +${((Date.now() - T0) / 1000).toFixed(1)}s] ${m}`);
setTimeout(() => { console.error("[F9] WATCHDOG: 120s 硬切（挂死）"); process.exit(1); }, 120_000).unref?.();
const { page, errors } = await bootPage(context, srv.url);
const namesOnScreen = () => page.evaluate(() => [...document.querySelectorAll("#galleryMount .gallery-tile-name")].map((n) => n.textContent.trim()));
const clickTileMenu = (name) => page.evaluate((nm) => {
  const t = [...document.querySelectorAll("#galleryMount .gallery-tile")].find((x) => (x.querySelector(".gallery-tile-name")?.textContent ?? "").trim().startsWith(nm));
  if (!t) throw new Error("no tile " + nm);
  t.querySelector(".gallery-tile-menu-btn").click();
}, name);
const openMenuItems = () => page.evaluate(() => [...document.querySelectorAll("#galleryMount .gallery-tile-menu-popup:not(.hidden) button")].map((b) => b.textContent.trim()));
const clickMenuItem = (text) => page.evaluate((tx) => {
  const b = [...document.querySelectorAll("#galleryMount .gallery-tile-menu-popup:not(.hidden) button")].find((x) => x.textContent.trim().startsWith(tx));
  if (!b) throw new Error("no menu item " + tx);
  b.click();
}, text);
const confirmIfUp = () => page.evaluate(() => { const s = document.getElementById("genericSheet"); if (s && !s.classList.contains("hidden")) { document.getElementById("genericSheetConfirm").click(); return true; } return false; });

trace("① connect folder gallery (OPFS as FSA)");
await evClick(page, "menuButton"); await evClick(page, "menuConnectGallery"); await page.waitForTimeout(300);
await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").includes("连接本地文件夹")); if (!b) throw new Error("no connect-folder item"); b.click(); });
// 新库会弹「继承当前笔刷 / 出厂」播种 choice sheet（gallery-manage-ui switchFlowBody，store collectionPeek "absent"）：选出厂
await page.waitForTimeout(1500);
const seedChoices = await page.evaluate(() => [...document.querySelectorAll("#genericSheetChoices button")].map((b) => b.textContent.trim()));
c.expect("seed choice sheet (继承 / 出厂) shown for a fresh folder", seedChoices.length === 2, JSON.stringify(seedChoices));
await page.evaluate(() => { const b = [...document.querySelectorAll("#genericSheetChoices button")].find((x) => !x.textContent.includes("继承")); if (!b) throw new Error("no 出厂 choice"); b.click(); });
// attach = 建店 + OPFS 首次列举，无头里要几秒：轮询到 data-no-gallery 消失为止（上限 20 s），别用固定睡眠猜
for (let i = 0; i < 40 && (await page.evaluate(() => document.body.hasAttribute("data-no-gallery"))); i++) await page.waitForTimeout(500);
await page.waitForTimeout(800);
const att = await page.evaluate(() => ({ noGallery: document.body.hasAttribute("data-no-gallery"), galleryVisible: !document.getElementById("galleryFull").classList.contains("hidden") }));
c.expect("folder gallery attached (data-no-gallery gone)", !att.noGallery, JSON.stringify(att));
if (!att.galleryVisible) { await evClick(page, "menuButton"); await evClick(page, "menuGallery"); await page.waitForTimeout(1500); }
c.expect("gallery screen visible", await page.evaluate(() => !document.getElementById("galleryFull").classList.contains("hidden")));

trace("② new doc + stroke + back to gallery");
await evClick(page, "galleryAddBtn"); await evClick(page, "addNew"); await page.waitForTimeout(300);
await page.evaluate(() => { document.getElementById("newDocName").value = "f9-probe"; });
await evClick(page, "newDocConfirm"); await page.waitForTimeout(3000);
c.expect("editor open after new doc", await page.evaluate(() => document.body.dataset.mode !== "gallery"));
await drawStroke(page);
await evClick(page, "menuButton"); await evClick(page, "menuGallery"); await page.waitForTimeout(4000);
const names1 = await namesOnScreen();
c.expect("doc tile f9-probe listed", names1.includes("f9-probe"), JSON.stringify(names1));

trace("③ tile ⋯ menu: teleported + no direction verbs");
await clickTileMenu("f9-probe"); await page.waitForTimeout(400);
const menu = await page.evaluate(() => {
  const m = document.querySelector("#galleryMount .gallery-tile-menu-popup:not(.hidden)");
  if (!m) return null;
  const cs = getComputedStyle(m);
  return { parentIsMount: m.parentElement?.id === "galleryMount", position: cs.position, z: cs.zIndex, items: [...m.querySelectorAll("button")].map((b) => b.textContent.trim()) };
});
c.expect("menu teleported to #galleryMount + position fixed (0.6.2)", !!menu && menu.parentIsMount && menu.position === "fixed", JSON.stringify(menu));
c.expect("menu z = --z-menu (400)", !!menu && menu.z === "400", JSON.stringify(menu));
c.expect("no 推送到云端 / 重新上传 (0.8.1 vocabulary)", !!menu && !menu.items.some((s) => /推送到云端|重新上传/.test(s)), JSON.stringify(menu?.items));
c.expect("menu has 送到回收站", !!menu && menu.items.some((s) => s.includes("送到回收站")), JSON.stringify(menu?.items));

trace("④ to trash → trash view → restore");
await clickMenuItem("送到回收站"); await page.waitForTimeout(600);
await confirmIfUp(); await page.waitForTimeout(3000);
c.expect("tile gone from files", !(await namesOnScreen()).includes("f9-probe"), JSON.stringify(await namesOnScreen()));
await evClick(page, "galleryMenuBtn"); await evClick(page, "galleryMenuTrash"); await page.waitForTimeout(2500);
const trash = await page.evaluate(() => ({ title: document.getElementById("galleryAsideTitle")?.textContent, emptyLocal: document.getElementById("galleryEmptyAsideLocalLabel")?.textContent, barVisible: !document.getElementById("galleryTrashBar").classList.contains("hidden") }));
const names2 = await namesOnScreen();
c.expect("trash view lists f9-probe", names2.some((n) => n.startsWith("f9-probe")), JSON.stringify(names2));
c.expect("trash chrome: title 回收站 / 清空本地回收站 / bar visible", trash.title === "回收站" && trash.emptyLocal === "清空本地回收站" && trash.barVisible, JSON.stringify(trash));
await clickTileMenu("f9-probe"); await page.waitForTimeout(400);
const asideItems = await openMenuItems();
c.expect("aside menu has 恢复", asideItems.some((s) => s.startsWith("恢复")), JSON.stringify(asideItems));
await clickMenuItem("恢复"); await page.waitForTimeout(600); await confirmIfUp(); await page.waitForTimeout(3000);

trace("⑤ backup box view (0.5.0 aside)");
await evClick(page, "galleryMenuBtn"); await evClick(page, "galleryMenuBackupBox"); await page.waitForTimeout(2000);
const backup = await page.evaluate(() => ({
  title: document.getElementById("galleryAsideTitle")?.textContent, emptyLocal: document.getElementById("galleryEmptyAsideLocalLabel")?.textContent,
  emptyCloud: document.getElementById("galleryEmptyAsideCloudLabel")?.textContent, menuTitle: document.getElementById("galleryTrashMenuBtn")?.getAttribute("title"),
  mountText: document.getElementById("galleryMount")?.textContent ?? "", barVisible: !document.getElementById("galleryTrashBar").classList.contains("hidden"),
}));
c.expect("backup chrome: 备份箱 / 清空本地备份箱 / 清空云端备份箱 / 备份箱操作", backup.title === "备份箱" && backup.emptyLocal === "清空本地备份箱" && backup.emptyCloud === "清空云端备份箱" && backup.menuTitle === "备份箱操作" && backup.barVisible, JSON.stringify({ ...backup, mountText: backup.mountText.slice(0, 80) }));
c.expect("backup empty-state text", /备份箱是空的/.test(backup.mountText), backup.mountText.slice(0, 120));
await evClick(page, "galleryTrashBack"); await page.waitForTimeout(2500);
c.expect("tile restored in files", (await namesOnScreen()).includes("f9-probe"), JSON.stringify(await namesOnScreen()));
c.expect("files chrome back: bar hidden", await page.evaluate(() => document.getElementById("galleryTrashBar").classList.contains("hidden")));

trace("⑥ reload survives, CSP quiet");
await page.reload({ waitUntil: "load" }); await page.waitForTimeout(4500);
c.expect("reload: gallery still attached", await page.evaluate(() => !document.body.hasAttribute("data-no-gallery")));
c.expect("no CSP / eval blocks", !errors.some((e) => /\[csp\]|Content Security Policy|EvalError/i.test(e)), errors.filter((e) => /csp|EvalError/i.test(e)).join(" | "));
await browser.close(); await srv.close();
c.finish(errors);

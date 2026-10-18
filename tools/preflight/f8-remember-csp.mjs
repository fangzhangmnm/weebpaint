// created 2026-10-17 by Claude Opus 5.5
// F8 记住密码 + CSP（2026-10-17，user「口令同意。口令加一个过期时间，最多一个月。」「csp…一起上」）。
// 契约：① 首启不建记住密码的库（@internal/encryption 0.2.2：读不建库）；② 开页恢复路径接在真 IDB 上：库里有一条合法记录但没有 verifier
//   （= 别处重置过 / 无库模式）→ 开页即删、不解锁；③ 首启 + 主菜单 / 主题 / 图库管理面板一圈下来 CSP 零拦截、零页面错误。
//   勾上并重开不用输的那一段要有库 + verifier（无头里连不了图库）→ 节点单测 test/remember-password.test.mjs + 真机。
import { chromium } from "playwright";
import { CTX_ZH, startServer, bootPage, makeChecker, evClick, listDbs } from "./harness.mjs";

const DB = "weebpaint-bd6cece69075d759.remember";
const srv = await startServer();
const browser = await chromium.launch();
const context = await browser.newContext(CTX_ZH);
await context.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.effectiveDirective} ${e.blockedURI}`)); });
const c = makeChecker("F8 remember-csp");
setTimeout(() => { console.error("[F8] WATCHDOG: 60s 硬切（挂死）"); process.exit(1); }, 60_000).unref?.();
const { page, errors } = await bootPage(context, srv.url);
const csp = [];
const collect = async () => { csp.push(...(await page.evaluate(() => window.__csp.splice(0)))); };

c.expect("no remember DB on first boot", !(await listDbs(page)).includes(DB), JSON.stringify(await listDbs(page)));

// 菜单一圈（CSP 会挡的多半是内联样式 / blob 图 / 动态脚本）
await evClick(page, "menuButton"); await page.waitForTimeout(250);
await evClick(page, "menuThemeBtn"); await page.waitForTimeout(250);
await evClick(page, "menuButton"); await page.waitForTimeout(250);
const manage = await page.evaluate(() => { const b = document.getElementById("menuConnectGallery"); b?.click(); return !!b; });
await page.waitForTimeout(600);
c.expect("gallery-manage entry reachable", manage);
await page.keyboard.press("Escape"); await page.waitForTimeout(200);
await collect();

// 合法的 0.2.x 记录（过期时间进 AAD，和库同一个格式）写进去 → 重开：没有 verifier = 删掉、不解锁
await page.evaluate((db) => new Promise((resolve, reject) => {
  const req = indexedDB.open(db, 1);
  req.onupgradeneeded = () => req.result.createObjectStore("secret");
  req.onsuccess = async () => {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12)); const expiresAt = Date.now() + 86400_000;
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(`internal-encryption.remember.v1|${expiresAt}`) }, key, new TextEncoder().encode("f8-pw"));
    const tx = req.result.transaction("secret", "readwrite"); tx.objectStore("secret").put({ v: 1, key, iv, ct, expiresAt }, "password");
    tx.oncomplete = () => { req.result.close(); resolve(); }; tx.onerror = () => reject(tx.error);
  };
  req.onerror = () => reject(req.error);
}), DB);
await page.reload({ waitUntil: "load" }); await page.waitForTimeout(3000);
const left = await page.evaluate((db) => new Promise((resolve) => {
  const req = indexedDB.open(db, 1);
  req.onupgradeneeded = () => req.result.createObjectStore("secret");
  req.onsuccess = () => { const g = req.result.transaction("secret").objectStore("secret").get("password"); g.onsuccess = () => { resolve(g.result ?? null); req.result.close(); }; };
  req.onerror = () => resolve("open-failed");
}), DB);
c.expect("remembered record without a verifier is dropped on boot", left == null, JSON.stringify(left));
await collect();
c.expect("zero CSP violations", csp.length === 0, csp.join(" | "));

await browser.close(); await srv.close();
c.finish(errors);

// P6 单文件 headless smoke（Chromium file://）：boot 不炸、EMBED 生效、版本水印、SW 没注册。
// created 2026-08-27 by Claude Fable 5. 用法：bash scripts/build-standalone.sh && node tools/standalone-smoke.mjs（playwright 档，不进 npm test 硬线）
import { chromium } from "playwright";
import { resolve } from "node:path";

const file = "file://" + resolve("dist/weebpaint-standalone.html");
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
await page.goto(file, { waitUntil: "load" });
await page.waitForTimeout(3000);   // boot 收尾（异步链）

const probe = await page.evaluate(async () => {
  const g = window;
  const canvas = document.querySelector("canvas");
  return {
    embed: !!g.__WEEBPAINT_EMBED__,
    embedKeys: g.__WEEBPAINT_EMBED__ ? Object.keys(g.__WEEBPAINT_EMBED__).length : 0,
    swRegs: await (async () => { try { return "serviceWorker" in navigator ? (await navigator.serviceWorker.getRegistrations()).length : -1; } catch { return 0; } })(),   // file:// 查询本身就抛 = 无 SW
    hasCanvas: !!canvas,
    canvasSize: canvas ? [canvas.width, canvas.height] : null,
    title: document.title,
    bodyChildren: document.body.childElementCount,
  };
});
// 2026-10-17「在这台设备上记住密码」单文件 / itch 形态关掉（file:// 共桶、itch 共域）：库里塞一条合法记录 → 重开 → 必须原样不动
//   （网页版没 verifier 时开页就删它 = 读过；这里不动 = 根本没读）。added by Claude Opus 5.5
const REMEMBER_DB = "weebpaint-bd6cece69075d759.remember";
const idbRecord = (mode) => page.evaluate(([db, mode]) => new Promise((resolve) => {
  const req = indexedDB.open(db, 1);
  req.onupgradeneeded = () => req.result.createObjectStore("secret");
  req.onerror = () => resolve("idb-unavailable");
  req.onsuccess = async () => {
    const d = req.result, done = (v) => { d.close(); resolve(v); };
    if (mode === "seed") {
      const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      const iv = crypto.getRandomValues(new Uint8Array(12)); const expiresAt = Date.now() + 86400_000;
      const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(`internal-encryption.remember.v1|${expiresAt}`) }, key, new TextEncoder().encode("smoke-pw"));
      const tx = d.transaction("secret", "readwrite"); tx.objectStore("secret").put({ v: 1, key, iv, ct, expiresAt }, "password"); tx.oncomplete = () => done("seeded");
    } else {
      const g = d.transaction("secret").objectStore("secret").get("password"); g.onsuccess = () => done(g.result ? "present" : "absent");
    }
  };
}), [REMEMBER_DB, mode]);
const seeded = await idbRecord("seed");
let rememberProbe = seeded;
if (seeded === "seeded") {
  await page.reload({ waitUntil: "load" }); await page.waitForTimeout(3000);
  rememberProbe = await idbRecord("read");
  await page.evaluate((db) => new Promise((r) => { const q = indexedDB.deleteDatabase(db); q.onsuccess = q.onerror = q.onblocked = () => r(); }), REMEMBER_DB);   // 收拾：别给 file:// 共桶留东西
}
probe.rememberRecordAfterReload = rememberProbe;
console.log(JSON.stringify(probe, null, 2));
const fatal = errors.filter((e) => !/favicon|manifest/.test(e));
if (fatal.length) { console.error("ERRORS:\n" + fatal.join("\n")); }
await browser.close();
if (!probe.embed || probe.embedKeys < 6) { console.error("FAIL: embed 缺失"); process.exit(1); }
if (probe.swRegs !== 0) { console.error("FAIL: SW 注册数 = " + probe.swRegs); process.exit(1); }
if (!probe.hasCanvas) { console.error("FAIL: 无 canvas（boot 挂了）"); process.exit(1); }
if (probe.rememberRecordAfterReload !== "present" && probe.rememberRecordAfterReload !== "idb-unavailable") { console.error("FAIL: 单文件版读了「记住密码」的库（应整个关掉）: " + probe.rememberRecordAfterReload); process.exit(1); }
if (fatal.length) process.exit(1);
console.log("SMOKE OK");

// 参考窗整机探针（playwright，Chromium；不进 npm test 硬线）。created 2026-09-29 by Claude Fable 5.1
//   参考窗组件 2026-09-29 抽进 @internal/reference-window 包。库自己的探针用的是假菜单；这里在**真 app** 里验
//   库和宿主接上之后的样子：真的弹出菜单、真的图标 sprite、真的四语文案、真的导入漏斗。
// 用法：bash scripts/build-standalone.sh && node tools/probes/reference-window.mjs
// 契约：① 主菜单开参考窗 → 经文件框导入三张图 → 牌组里三张；
//      ② ＋ 菜单里有「往前挪 / 往后挪」，带图标、有文案（不是缺图标占位、不是英文兜底以外的空串）；
//      ③ 点「往前挪」：顺序变、菜单不关、还在看同一张；到头的那一项消失；
//      ④ 点计数：跳转列表一张一行、当前那张带勾；点某一行跳过去；
//      ⑤ 全程零 pageerror / console.error。
import { chromium } from "playwright";
import { resolve } from "node:path";
const file = "file://" + resolve("dist/weebpaint-standalone.html");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
await page.goto(file, { waitUntil: "load" });
await page.waitForTimeout(3000);

const checks = [];
const add = (name, ok, info = "") => checks.push({ name, ok: !!ok, info: String(info) });
const ref = () => page.evaluate(() => {
  const el = document.getElementById("referencePanel");
  return { open: el.open, size: el.deck.size, index: el.deck.index, order: el.deck.cards().map((c) => c.bytes?.size ?? 0), count: el.shadowRoot.querySelector(".chip-count").textContent };
});
const spot = (sel) => page.evaluate((s) => {
  const r = document.getElementById("referencePanel").shadowRoot.querySelector(s).getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, sel);
const menuRows = () => page.evaluate(() => [...document.querySelectorAll(".popup-menu-item")].filter((b) => b.offsetParent !== null).map((b) => ({
  label: b.querySelector(".menu-item-label")?.textContent ?? "",
  icon: b.querySelector("svg use")?.getAttribute("href") ?? "",
  missing: !!b.querySelector("[data-icon-missing]"),
})));
const clickRow = (label) => page.evaluate((l) => {
  const b = [...document.querySelectorAll(".popup-menu-item")].find((x) => x.offsetParent !== null && x.querySelector(".menu-item-label")?.textContent === l);
  if (!b) return false;
  b.click(); return true;
}, label);
async function realClick(at) { await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(150); }

// ① 开窗 + 导入三张（大小各不相同，好认顺序）
await page.evaluate(() => document.getElementById("menuReference").click());
await page.waitForTimeout(300);
//   三张图现场生成（带噪点的纯色块，字节数各不相同）：不依赖仓里恰好有哪些图片文件
const pngs = await page.evaluate(async () => {
  const out = [];
  for (const [color, n] of [["#c0392b", 40], ["#27ae60", 72], ["#2980b9", 120]]) {
    const c = document.createElement("canvas"); c.width = c.height = n;
    const x = c.getContext("2d"); x.fillStyle = color; x.fillRect(0, 0, n, n);
    for (let i = 0; i < n * 4; i++) { x.fillStyle = `rgb(${(i * 37) % 255},${(i * 91) % 255},${(i * 53) % 255})`; x.fillRect((i * 17) % n, (i * 29) % n, 1, 1); }
    out.push(c.toDataURL("image/png").split(",")[1]);
  }
  return out;
});
for (const [i, b64] of pngs.entries()) {
  await page.setInputFiles("#referenceFileInput", { name: `probe-${i + 1}.png`, mimeType: "image/png", buffer: Buffer.from(b64, "base64") });
  await page.waitForTimeout(900);
}
const s0 = await ref();
add("开窗并导入三张 → 牌组里三张，在看第三张", s0.open && s0.size === 3 && s0.index === 2 && s0.count === "3/3", JSON.stringify(s0));

// ② ＋ 菜单
await page.evaluate(() => document.getElementById("referencePanel").classList.remove("away", "idle"));
await realClick(await spot(".plus"));
const rows = await menuRows();
const lang = await page.evaluate(() => document.documentElement.lang || navigator.language);
const earlier = rows.find((r) => r.icon === "#back"), later = rows.find((r) => r.icon === "#forward");
add("在最后一张：菜单里有「往前挪」（带图标、有文案），没有「往后挪」", !!earlier && earlier.label.length > 0 && !earlier.missing && !later, `lang=${lang} rows=${rows.map((r) => `${r.label}[${r.icon}]`).join(" | ")}`);

// ③ 往前挪
await clickRow(earlier?.label);
await page.waitForTimeout(200);
const s1 = await ref(), rows1 = await menuRows();
add("点「往前挪」→ 顺序变、还在看同一张、计数 2/3", s1.order[1] === s0.order[2] && s1.order[2] === s0.order[1] && s1.index === 1 && s1.count === "2/3", `${JSON.stringify(s0.order)} → ${JSON.stringify(s1.order)} index=${s1.index} ${s1.count}`);
add("菜单没关，而且现在两个方向都有", rows1.some((r) => r.icon === "#back") && rows1.some((r) => r.icon === "#forward"), rows1.map((r) => r.label).join(" | "));
await page.keyboard.press("Escape");
await page.waitForTimeout(150);

// ④ 跳转列表
await realClick(await spot("[data-jump]"));
const jump = await menuRows();
add("点计数 → 一张一行，当前那张带勾", jump.length === 3 && jump[1].icon === "#check" && !jump[0].icon && !jump[2].icon && jump.every((r) => r.label.length > 2), jump.map((r) => `${r.label}[${r.icon}]`).join(" | "));
await clickRow(jump[0]?.label);
await page.waitForTimeout(200);
const s2 = await ref();
add("点第一行 → 跳到第一张", s2.index === 0 && s2.count === "1/3", JSON.stringify(s2));

// ⑤ 持久化整条路（2026-09-29 format 3）：画一笔 → 导出 hub「存为本地 .ora」（去掉 OS 保存框 → 走下载兜底）
//    → 拿到字节（与 Ctrl+S 同源：session.encodeCurrentOra）→ 从文件框导回来 → 参考原样回来。
//    这条路经过 side-windows.collectReferenceFilesForSave / ora encode / ora decode（布局归一化）/ applyLoadedReferences（库解清单）。
{
  const canvas = await page.$("canvas"); const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2 - 30, box.y + box.height / 2); await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + box.width / 2 - 30 + i * 5, box.y + box.height / 2 + (i % 3));
  await page.mouse.up(); await page.waitForTimeout(300);
  await page.evaluate(() => { try { delete globalThis.showSaveFilePicker; } catch {} });
  const dlPromise = page.waitForEvent("download", { timeout: 15000 });
  await page.evaluate(() => document.getElementById("menuExportImage").click());
  await page.waitForTimeout(300);
  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll(".sheet-action")].filter((b) => b.offsetParent !== null);
    const b = btns.find((x) => /\.ora/.test(x.textContent));
    if (!b) return btns.map((x) => x.textContent);
    b.click(); return "ok";
  });
  const download = await dlPromise;
  const oraPath = await download.path();
  add("导出 hub「存为本地 .ora」→ 拿到字节", clicked === "ok" && !!oraPath, `${JSON.stringify(clicked)} ${download.suggestedFilename()}`);

  // 导回来（intake hub：.ora → 开成新 doc）
  await page.setInputFiles("#oraFileInput", oraPath);
  await page.waitForTimeout(2500);
  const back = await page.evaluate(() => {
    const el = document.getElementById("referencePanel");
    return { size: el.deck.size, index: el.deck.index, names: el.deck.cards().map((c) => c.name), order: el.deck.cards().map((c) => c.bytes?.size ?? 0), vp: el.deck.cards().map((c) => !!c.vp), open: el.open };
  });
  add("导回来 → 参考原样回来（张数、顺序、名字、当前页、视口、窗开着）",
    back.size === 3 && back.index === 0 && JSON.stringify(back.order) === JSON.stringify(s2.order) && back.names.join(",") === "probe-1.png,probe-3.png,probe-2.png" && back.vp.every(Boolean) && back.open === true,
    JSON.stringify(back));
}
// ⑥
add("全程零报错", errors.length === 0, errors.join(" ; ").slice(0, 400));

await browser.close();
let failed = 0;
for (const c of checks) { if (!c.ok) failed++; console.log(`  ${c.ok ? "✓" : "✗"} ${c.name}  [${c.info}]`); }
console.log(failed ? "[probe] ✗ reference-window" : "[probe] ✓ reference-window");
process.exit(failed ? 1 : 0);

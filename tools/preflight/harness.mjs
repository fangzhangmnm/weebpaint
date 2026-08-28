// created 2026-08-28 by Claude Fable 5
// wave 6 preflight 夹具共用底座：静态 server（serve 仓根，dist/ 与 tmp/ 都可达）+ page 工具。
// 设计：每个夹具独立进程、独立起 server（随机端口）——夹具之间零共享态，×3 轮连跑天然干净。
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, normalize, sep } from "node:path";

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".wasm": "application/wasm", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };

/** 起静态 server（root=仓根）。回 { url, close }。 */
export async function startServer(root = process.cwd()) {
  const rootAbs = resolve(root);
  const srv = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
      let file = normalize(resolve(rootAbs, "." + path));
      if (!file.startsWith(rootAbs + sep) && file !== rootAbs) { res.writeHead(403).end(); return; }
      if (path.endsWith("/")) file = resolve(file, "index.html");
      const body = await readFile(file);
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" }).end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${srv.address().port}/`, close: () => new Promise((r) => srv.close(r)) };
}

/** 统一 context 选项：zh-CN——app 按 locale 挑首启语言，夹具断言全是中文 label（headless 默认 en 会全体错位）。 */
export const CTX_ZH = { locale: "zh-CN" };

/** 新开 page + 错误收集（pageerror / console.error 全记；favicon/manifest 噪音过滤在 fatalErrors）。 */
export function wirePage(page, errors) {
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
}
export const fatalErrors = (errors) => errors.filter((e) => !/favicon|manifest|Failed to load resource.*40[34]/.test(e));

export async function bootPage(context, url, { settleMs = 4000 } = {}) {
  const errors = [];
  const page = await context.newPage();
  wirePage(page, errors);
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(settleMs);   // boot 链 + fixup 相收尾（对齐 nogallery-smoke 经验值）
  return { page, errors };
}

/** 断言收集器：不中断（全部跑完统一报），exit code 归 finish()。 */
export function makeChecker(fixtureName) {
  const fails = [];
  return {
    expect(name, cond, detail = "") { if (!cond) fails.push(name + (detail ? ` — ${detail}` : "")); },
    finish(errors = []) {
      const fatal = fatalErrors(errors);
      for (const e of fatal) fails.push("page error: " + e);
      if (fails.length) { console.error(`[${fixtureName}] FAIL\n  ` + fails.join("\n  ")); process.exit(1); }
      console.log(`[${fixtureName}] OK`);
    },
  };
}

// ── app 驱动小工具（evaluate-click：菜单可见性与手势无关，smoke 只验行为）─────────────
export const evClick = (page, id) => page.evaluate((i) => { const el = document.getElementById(i); if (!el) throw new Error("no element #" + i); el.click(); }, id);
/** 点 genericSheetChoices 里 label 含 text 的按钮（choice sheet 动态生成）。 */
export const clickChoice = (page, text) => page.evaluate((t) => {
  const btns = [...document.querySelectorAll("#genericSheetChoices button")];
  const b = btns.find((x) => (x.textContent || "").includes(t));
  if (!b) throw new Error(`choice "${t}" not found in [${btns.map((x) => x.textContent).join(", ")}]`);
  b.click();
}, text);
/** 画一笔（真 pointer 事件走 page.mouse；board 中央短划线）。 */
export async function drawStroke(page, { dx = 120 } = {}) {
  const box = await page.locator("#board").boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx - dx / 2, cy);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(cx - dx / 2 + (dx * i) / 8, cy + Math.sin(i) * 6);
  await page.mouse.up();
  await page.waitForTimeout(300);
}

// ── IDB 探针（page.evaluate 侧）────────────────────────────────────────────────
/** 列本 origin 全部 IDB 库名。 */
export const listDbs = (page) => page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name ?? ""));
/** 读 device-rack 槽的 items 数（库不存在回 -1，绝不顺手创建）。 */
export const rackSlotCount = (page) => page.evaluate(async () => {
  const name = "weebpaint-bd6cece69075d759.device-rack";
  const dbs = (await indexedDB.databases()).map((d) => d.name);
  if (!dbs.includes(name)) return -1;
  return new Promise((res, rej) => {
    const req = indexedDB.open(name);
    req.onerror = () => rej(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const g = db.transaction("slot", "readonly").objectStore("slot").get("rack");
      g.onsuccess = () => { db.close(); res(g.result?.items?.length ?? 0); };
      g.onerror = () => { db.close(); rej(g.error); };
    };
  });
});

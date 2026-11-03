// 持久层显式白名单（家族规程，user 2026-09-03「touch idb or local storage 必须显式白名单」；WXHW test/storage-whitelist.test.mjs 同形；
//   WeebPaint 2026-10-21 补——周账 F-58 发现 6：家族唯一没有这张表的毕业 app）。扫 src/ vendor/ + service-worker.js / theme-guard.js 里所有碰
//   IndexedDB / localStorage / sessionStorage / Cache Storage / navigator.storage 的文件，每个命中文件必须在 ALLOW 里且写明用途；
//   新文件一碰持久层就红——想加就来这里登记并同步 CLAUDE.md「持久层白名单」表。created 2026-10-21 by Claude Fable 5.1
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, eq, assert } from "./runner.mjs";

const ALLOW = {
  "src/storage.ts": "IDB `weebpaint`（裸名）：gallery-thumbs / image-thumbs 缩略图派生缓存 + checkpoint-ring（revert 快照环）；全删可再生 / 可丢（二等）",
  "src/crash-store.ts": "IDB `weebpaint-bd6cece69075d759.crash`：T-crash 崩溃快照（二等；还原出厂自扫）",
  "src/device-rack-slot.ts": "IDB `weebpaint-bd6cece69075d759.device-rack`：无库笔架单槽（reload 不丢；四等设备态）",
  "src/device-kv.ts": "localStorage `weebpaint-bd6cece69075d759:*`：device 层标量唯一器官（resume-slate / diag-log / 偏好；四等）",
  "src/boot-snapshot.ts": "localStorage：boot 语言快照旧键 `weebpaint.boot.lang` 只读 + 清扫（升级兜底；新键经 device-kv）",
  "src/store-absent.ts": "localStorage：缺席平台探针（写读删一次）+ `weebpaint.nostore` 开关（dev / 测试）",
  "src/gallery/gallery-shell.ts": "navigator.storage.estimate 只读：图库底栏配额提示",
  "src/shell-reset.ts": "Cache Storage 删键 + SW 注销：只动自己前缀 `weebpaint-` 的壳缓存、只注销管着当前页面的 SW（强制更新 / 还原出厂共用）",
  "src/factory-reset.ts": "还原出厂：indexedDB.deleteDatabase 自家 GUID 库 + 裸 `weebpaint` 库、localStorage 自家前缀键；store 命名空间经库的 wipeAppNamespace（typed consent）",
  "service-worker.js": "Cache Storage `weebpaint-<hash>`：app 壳预缓存 + 运行时缓存",
  "theme-guard.js": "localStorage 只读：首帧前落主题（防闪白），读的是 device-kv 的主题键",
  "vendor/msal/msal-browser.min.js": "MSAL token 缓存（IDB / localStorage / sessionStorage）：由 @internal/store 的 auth 配置驱动，app 不直接调",
};
const TOKEN = /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|\bIDBFS\b|\bcaches\.(open|keys|delete|match)\b|navigator\.storage\b/;
const ROOTS = ["src", "vendor"];
const FILES = ["service-worker.js", "theme-guard.js"];

function* walk(dir) { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) yield* walk(p); else if (/\.(ts|js|mjs)$/.test(f) && !f.endsWith(".d.ts")) yield p; } }
function hitsIn(p) {
  const out = [];
  readFileSync(p, "utf8").split("\n").forEach((line, i) => {
    if (/^\s*\/\//.test(line)) return;
    const code = line.replace(/\/\/(?![^"'`]*["'`]\s*[,;)]).*$/, "");   // 剥行尾注释（URL 里的 // 在引号内，不剥）
    if (TOKEN.test(code)) out.push(i + 1);
  });
  return out;
}

describe("storage-whitelist", () => {
  it("碰持久层的文件全在显式白名单里（src / vendor / service-worker.js / theme-guard.js）", () => {
    const bad = [];
    const files = [...FILES, ...ROOTS.flatMap((r) => [...walk(r)])].map((p) => p.replace(/\\/g, "/"));
    for (const p of files) {
      const h = hitsIn(p);
      if (h.length && !(p in ALLOW)) bad.push(`${p} (lines ${h.slice(0, 5).join(",")}${h.length > 5 ? "…" : ""})`);
    }
    assert(bad.length === 0, "files touching persistent storage without a whitelist entry (register in test + CLAUDE.md 持久层白名单):\n" + bad.join("\n"));
  });
  it("白名单里没有幽灵条目（文件存在且确实碰持久层）", () => {
    const ghosts = Object.keys(ALLOW).filter((p) => { try { return hitsIn(p).length === 0; } catch { return true; } });
    assert(ghosts.length === 0, "whitelist entries that no longer touch storage (prune): " + ghosts.join(", "));
  });
  // 库里替 app 开的 IDB（上面的 token 扫不到——indexedDB 在 tgz 里）：按把手名登记。
  //   @internal/encryption createPasswordKeeper = IDB `weebpaint-bd6cece69075d759.remember`（ADR-0015）：建 = src/encryption.ts；递 = src/app.ts；用 = src/remember-password.ts（注入进来的，不认这个名字）。
  //   @internal/gallery registry = IDB `weebpaint-bd6cece69075d759.gallery-registry`（0.8.7 起库名由 src/gallery-pkg-init.ts 配）；thumbs / facts 本仓没用包的 IDB（缩略图走 storage.ts）。
  //   @internal/store = IDB `weebpaint.<databaseId>`（+ 2.2.0 的 `.staging` 分库，本仓没有流式读）+ localStorage `weebpaint.<databaseId>.*`（含 2.1.4 `internal.upload-session:*`）：只经 src/app-store.ts。
  const LIB_HANDLES = { createPasswordKeeper: ["src/encryption.ts"], passwordKeeper: ["src/encryption.ts", "src/app.ts"], configureGalleryRegistry: ["src/gallery-pkg-init.ts"] };
  it("库持有的 IDB（记住密码 / 图库名册）只经登记过的接缝", () => {
    const bad = [];
    for (const p of [...walk("src")].map((x) => x.replace(/\\/g, "/"))) {
      const code = readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "")).join("\n");
      for (const [name, allowed] of Object.entries(LIB_HANDLES)) if (new RegExp(`\\b${name}\\b`).test(code) && !allowed.includes(p)) bad.push(`${p}: ${name}`);
    }
    assert(bad.length === 0, "library-held IndexedDB handle used outside its seam:\n" + bad.join("\n"));
  });
});

// ---- 2026-11-03 家族规则书 §1 第 3 条 / §4 第 2 项（工单 B 第 4 步，Claude Opus 5.5）：锁名、广播频道名、SW 也只用自家名字 ----
//   itch 上所有网页游戏共一个源、Chromium 里所有双击打开的网页共一个桶：锁管理器 / BroadcastChannel / SW 注册都是这个源里共用的，
//   裸名（"weebpaint-doc:"）会和别人撞。前缀 token = src/config.ts 的 APP_NS（仓里一处字面量）。
const { APP_NS } = await import("../src/config.ts");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "")).join("\n");
const SRC_FILES = () => [...walk("src")].map((p) => p.replace(/\\/g, "/"));
const LIB_FILES = () => { try { return [...walk("node_modules/@internal")].map((p) => p.replace(/\\/g, "/")); } catch { return []; } };

describe("storage-whitelist · 自家前缀（锁 / 频道 / SW）", () => {
  it("前缀 token 在 src 里只有 config.ts 一处字面量；theme-guard.js 照抄的那份和它一致", () => {
    eq(APP_NS, "weebpaint-bd6cece69075d759");
    const bad = SRC_FILES().filter((p) => p !== "src/config.ts" && stripComments(readFileSync(p, "utf8")).includes(APP_NS));
    assert(bad.length === 0, "APP_NS literal outside src/config.ts (import it instead):\n" + bad.join("\n"));
    const tg = stripComments(readFileSync("theme-guard.js", "utf8"));
    const m = tg.match(/localStorage\.getItem\("([^"]+):pref:color-theme"\)/);
    assert(m && m[1] === APP_NS, "theme-guard.js theme key must be `${APP_NS}:pref:color-theme` (device-kv prefix)");
  });
  // 用 Web Locks 的文件：每个都登记、写明锁名长什么样；锁名一律经 _key()（= `${APP_NS}.doc-lock:` + gallery-id + 相对 path）。
  const LOCKS = { "src/instance-locks.ts": "`${APP_NS}.doc-lock:<gallery-id>:<相对path>`（双实例互认，建议性护栏）" };
  it("navigator.locks 只在登记过的文件里用，锁名带自家前缀", () => {
    const bad = [];
    for (const p of [...SRC_FILES(), ...LIB_FILES()]) {
      const c = stripComments(readFileSync(p, "utf8"));
      if (/\bnavigator\.locks\b|\blocks\.(request|query)\s*\(/.test(c) && !(p in LOCKS)) bad.push(p);
    }
    assert(bad.length === 0, "Web Locks used outside the registry (register the lock name with the APP_NS prefix here):\n" + bad.join("\n"));
    const il = stripComments(readFileSync("src/instance-locks.ts", "utf8"));
    assert(/const LOCK_PREFIX = `\$\{APP_NS\}\.doc-lock:`;/.test(il), "LOCK_PREFIX must be `${APP_NS}.doc-lock:`");
    const requests = (il.match(/\blocks\.request\s*\(/g) || []).length, keyed = (il.match(/\blocks\.request\s*\(\s*_key\(/g) || []).length;
    assert(requests > 0 && requests === keyed, `every locks.request must take _key(...) (requests ${requests}, keyed ${keyed})`);
    assert(/const _key = [^\n]*=> `\$\{LOCK_PREFIX\}/.test(il), "_key() must start with LOCK_PREFIX");
  });
  // BroadcastChannel：现在一个都没有（本仓 + @internal 库）。要开就来这里登记名字，名字必须以 APP_NS 开头。
  const CHANNELS = {};
  it("new BroadcastChannel(...) 只在登记过的文件里、名字带自家前缀（现状：零个）", () => {
    const bad = [];
    for (const p of [...SRC_FILES(), ...LIB_FILES()]) {
      const c = stripComments(readFileSync(p, "utf8"));
      if (/\bnew\s+BroadcastChannel\s*\(/.test(c) && !(p in CHANNELS)) bad.push(p);
    }
    assert(bad.length === 0, "BroadcastChannel opened without a registered APP_NS-prefixed name:\n" + bad.join("\n"));
  });
  // SW：scope 是网址路径不是名字——在共用源（itch / 双击）上根本不注册（policy.serviceWorker = false，test/deployment-guard 钉表）；
  //   官网上注册相对 ./service-worker.js、不另给 scope（= app 自己那一层目录，/ 或 /dev/）；壳缓存名按家族命名规矩 `weebpaint-<hash>`、只动自己前缀。
  it("SW：只在 pwa-shell 注册、门上挂 policy.serviceWorker、不给 scope、壳缓存名都是 weebpaint- 开头", () => {
    const regs = SRC_FILES().filter((p) => /serviceWorker\.register\s*\(/.test(stripComments(readFileSync(p, "utf8"))));
    eq(regs.join(","), "src/pwa-shell.ts");
    const ps = stripComments(readFileSync("src/pwa-shell.ts", "utf8"));
    assert(/if \(currentPolicy\(\)\.serviceWorker && [^\n]*\n[\s\S]*?serviceWorker\.register\("\.\/service-worker\.js"\)/.test(ps), "register must sit behind currentPolicy().serviceWorker and use the relative script with no scope option");
    assert(!/serviceWorker\.register\([^)]*scope/.test(ps), "no explicit scope");
    const sw = stripComments(readFileSync("service-worker.js", "utf8"));
    const names = [...sw.matchAll(/CACHE_NAME = (["`])([^"`]*)\1/g)].map((m) => m[2]);
    assert(names.length >= 2 && names.every((n) => n.startsWith("weebpaint-")), "every CACHE_NAME assignment starts with weebpaint- : " + names.join(", "));
    for (const m of sw.matchAll(/caches\.keys\(\)\)?\.filter\(\(k\) => ([^\n]+)/g)) assert(/k\.startsWith\("weebpaint-"\)/.test(m[1]), "caches.keys() must be filtered to our own prefix: " + m[1]);
  });
});

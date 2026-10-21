// 持久层显式白名单（家族规程，user 2026-09-03「touch idb or local storage 必须显式白名单」；WXHW test/storage-whitelist.test.mjs 同形；
//   WeebPaint 2026-10-21 补——周账 F-58 发现 6：家族唯一没有这张表的毕业 app）。扫 src/ vendor/ + service-worker.js / theme-guard.js 里所有碰
//   IndexedDB / localStorage / sessionStorage / Cache Storage / navigator.storage 的文件，每个命中文件必须在 ALLOW 里且写明用途；
//   新文件一碰持久层就红——想加就来这里登记并同步 CLAUDE.md「持久层白名单」表。created 2026-10-21 by Claude Fable 5.1
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, assert } from "./runner.mjs";

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

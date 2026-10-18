// 部署清单守卫（2026-10-17：theme-guard.js 加进 index.html + SW 预缓存，却漏了 .github/workflows/deploy.yml 的逐个文件清单 → /dev/ 404、主题防闪白失效）。
// 工作流注释早就写着「加任何 runtime fetch 的根目录 asset，必须同时改三处」——这里把第二处机械化：index.html 引用的本站根目录文件、
// SW STATIC_PRECACHE 里的根目录文件，必须在 deploy.yml 的 `for f in …` 清单里（vendor/ dist/ 整个拷，不用列）。created 2026-10-17 by Claude Opus 5.5
import { readFileSync } from "node:fs";
import { describe, it, assert } from "./runner.mjs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const wf = read(".github/workflows/deploy.yml");
const listed = new Set((wf.match(/for f in ([\s\S]*?); do/)?.[1] ?? "").replace(/\\\n/g, " ").split(/\s+/).filter(Boolean));
const COPIED_DIRS = ["vendor/", "dist/"];
const rootFile = (p) => { const x = p.replace(/^\.\//, "").split(/[?#]/)[0]; return x && !x.includes("/") ? x : null; };

describe("deploy-list", () => {
  it("index.html 引用的根目录文件都在 deploy.yml 清单里", () => {
    const html = read("index.html");
    const refs = [...html.matchAll(/\b(?:src|href)="(\.\/[^"]+)"/g)].map((m) => m[1]).filter((p) => !COPIED_DIRS.some((d) => p.replace(/^\.\//, "").startsWith(d)));
    const missing = [...new Set(refs.map(rootFile).filter(Boolean))].filter((f) => !listed.has(f));
    assert(missing.length === 0, "root files referenced by index.html but not deployed: " + missing.join(", "));
  });
  it("SW 预缓存的根目录文件都在 deploy.yml 清单里", () => {
    const pre = (read("service-worker.js").match(/const STATIC_PRECACHE = \[([\s\S]*?)\];/)?.[1] ?? "").match(/"\.\/[^"]*"/g)?.map((s) => s.slice(1, -1)) ?? [];
    const missing = pre.map(rootFile).filter(Boolean).filter((f) => !listed.has(f));
    assert(missing.length === 0, "root files precached by the SW but not deployed: " + missing.join(", "));
  });
});

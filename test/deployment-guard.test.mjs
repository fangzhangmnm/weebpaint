// 部署方式只认一次（家族规则书 ai-docs/20261103-three-shapes-rulebook.md §1 第 6 / 9 条、§2、§4 第 3 / 4 / 13 项；家族工单 B）。
//   created 2026-11-03 by Claude Opus 5.5
//   ① 除 src/deployment.ts 外，源码不许读 location.protocol / window.top / self === top / 烤进来的 deployment 标记；
//   ② deployment-policy 逐格 = 规则书 §2；③ 每个开关在 deployment-policy.ts 以外至少被一个源码文件读到（没有挂空的开关）；
//   ④ 官网网址只在 src/config.ts 一处（文案插值它）；⑤ 打包器烤的标记串 = deployment.ts 认的那串。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, eq, assert } from "./runner.mjs";
const { policy } = await import("../src/deployment-policy.ts");
const { classifyDeployment, deployment, embedded, localFileName, DEPLOYMENT_META } = await import("../src/deployment.ts");
const { SITE_URL, SITE_HOST } = await import("../src/config.ts");

function* walk(dir) { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) yield* walk(p); else if (/\.(ts|js|mjs)$/.test(f) && !f.endsWith(".d.ts")) yield p.replace(/\\/g, "/"); } }
// 剥注释（块注释 + 行注释；行注释只剥 `//` 前面是行首或空白的，URL 里的 // 在字符串里不剥）
const code = (p) => readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "")).join("\n");
const SRC = [...walk("src")];

describe("deployment · 只认一次", () => {
  const FORBIDDEN = [
    [/\blocation\.protocol\b/, "location.protocol"],
    [/\bwindow\.top\b|\bself\.top\b|\bglobalThis\.top\b/, "window.top"],
    [/\bself\s*[!=]==?\s*(window\.)?top\b|\btop\s*[!=]==?\s*(window\.)?self\b/, "self === top"],
    [/name=\\?["']?deployment\b/, "deployment marker"],
  ];
  it("① 除 src/deployment.ts 外源码不读 location.protocol / window.top / self === top / 部署标记", () => {
    const bad = [];
    for (const p of SRC) {
      if (p === "src/deployment.ts") continue;
      const c = code(p);
      for (const [re, what] of FORBIDDEN) if (re.test(c)) bad.push(`${p}: ${what}`);
    }
    assert(bad.length === 0, "deployment facts read outside src/deployment.ts (ask deployment() / embedded() / policy instead):\n" + bad.join("\n"));
  });
  it("判定：file: → local（优先于标记）；itch 标记 → itch；否则 site", () => {
    eq(classifyDeployment("file:", null), "local");
    eq(classifyDeployment("file:", "itch"), "local", "itch 那份被下载下来双击 = 共桶的本地文件，按协议走");
    eq(classifyDeployment("https:", "itch"), "itch");
    eq(classifyDeployment("https:", null), "site");
    eq(classifyDeployment("http:", null), "site", "逃生舱 http://localhost 服单文件 = 按官网走");
    eq(classifyDeployment("https:", "something-else"), "site");
    eq(classifyDeployment(undefined, undefined), "site");
  });
  it("测试环境里（DOM shim：没有 file:、没有标记）：site · 没有本地文件名", () => {
    eq(deployment(), "site"); eq(localFileName(), null);
    // embedded()：shim 的 window.top 是 undefined → self !== top → true（= 旧 pickerAllowedInFrame 在 shim 里的「不放行」，行为没变）
    eq(typeof embedded(), "boolean");
  });
  it("⑤ 打包器烤给 itch 那份的标记 = deployment.ts 认的那串", () => {
    const packer = readFileSync("scripts/pack-standalone.mjs", "utf8");
    assert(packer.includes(DEPLOYMENT_META), `scripts/pack-standalone.mjs must bake exactly ${DEPLOYMENT_META}`);
    assert(/content="itch"/.test(DEPLOYMENT_META) && /name="deployment"/.test(DEPLOYMENT_META), "marker shape");
  });
});

describe("deployment-policy · 规则书 §2 逐格", () => {
  // 列：网盘 / 文件夹图库 / 记住口令 / 共桶披露 / 离线壳 / 去官网
  const TABLE = {
    site:  { cloud: true,  folderGallery: true,  rememberPassword: true,  rememberPasswordSharedBucket: false, serviceWorker: true,  siteHint: false },
    itch:  { cloud: false, folderGallery: false, rememberPassword: false, rememberPasswordSharedBucket: false, serviceWorker: false, siteHint: true },
    local: { cloud: false, folderGallery: true,  rememberPassword: true,  rememberPasswordSharedBucket: true,  serviceWorker: false, siteHint: true },
  };
  for (const [d, row] of Object.entries(TABLE)) {
    it(`② ${d}：每一格`, () => {
      const got = policy(d);
      eq(Object.keys(got).sort().join(","), Object.keys(row).sort().join(","), "开关集合（加 / 删开关要同时改这张表和规则书）");
      for (const [k, v] of Object.entries(row)) eq(got[k], v, `${d}.${k}`);
    });
  }
  it("共桶披露只在给记住口令的形态上出现", () => {
    for (const d of Object.keys(TABLE)) if (policy(d).rememberPasswordSharedBucket) assert(policy(d).rememberPassword, d);
  });
  it("表是冻住的（运行时没人能改一格）", () => {
    assert(Object.isFrozen(policy("site")) && Object.isFrozen(policy("itch")) && Object.isFrozen(policy("local")), "frozen");
  });
  it("③ 每个开关在 deployment-policy.ts 以外至少被一个源码文件读到（没有挂空的开关）", () => {
    const readers = {};
    for (const k of Object.keys(TABLE.site)) {
      const re = new RegExp(`(?:currentPolicy\\(\\)|\\bpolicy\\([^)]*\\))\\.${k}\\b`);
      readers[k] = SRC.filter((p) => p !== "src/deployment-policy.ts" && re.test(code(p)));
    }
    const dead = Object.entries(readers).filter(([, ps]) => ps.length === 0).map(([k]) => k);
    assert(dead.length === 0, "policy switches with no consumer (rulebook §4 #13 — wire them or delete them): " + dead.join(", "));
  });
});

describe("SITE_URL · 一处", () => {
  it("④ 官网网址只在 src/config.ts（文案里插值 {site}，不写死）", () => {
    eq(SITE_URL, "https://weebpaint.com"); eq(SITE_HOST, "weebpaint.com");
    const bad = SRC.filter((p) => p !== "src/config.ts" && /weebpaint\.com/.test(code(p)));
    assert(bad.length === 0, "site URL literal outside src/config.ts:\n" + bad.join("\n"));
  });
  it("「去官网」那几句都带 {site} 占位（四种语言）", async () => {
    const { S } = await import("../src/i18n/strings.ts");
    for (const k of ["gm.cloudOnSiteSub", "gm.cloudOnSiteHelp", "boot.siteHintNoFolder", "boot.siteHintFolder"]) {
      for (const lang of ["zh", "en", "ja", "tok"]) assert(S[k]?.[lang]?.includes("{site}"), `${k}.${lang} must interpolate {site}`);
    }
  });
});

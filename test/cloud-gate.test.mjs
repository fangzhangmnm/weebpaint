// test/cloud-gate.test.mjs —— 掉登录 / 没网闸门（工单 G；家族设计稿 ai-docs/20261103-cloud-gate-design.md §7 验收 / §8 守卫）。created 2026-11-03 by Claude Opus 5.5
//   状态机用假端口（src/cloud-gate.ts 零 DOM；用例照 CatsUp test/cloud-gate.test.ts，多开机本地那段的超时）；真浏览器那一半 = test/probes/probe-cloud-gate.mjs。
import { describe, it, eq, assert } from "./runner.mjs";
import fs from "node:fs";
const { CloudGate, parseRenewFailure, reasonOf, isInteractionCode } = await import("../src/cloud-gate.ts");
const { createGateStack } = await import("../src/gate-stack.ts");
const { S } = await import("../src/i18n/strings.ts");
const { policyAllows } = await import("../src/ui/interaction-lock.ts");

const read = (p) => fs.readFileSync(p, "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "")).join("\n");
function* walk(dir) { for (const f of fs.readdirSync(dir)) { const p = `${dir}/${f}`; if (fs.statSync(p).isDirectory()) yield* walk(p); else if (/\.ts$/.test(f)) yield p; } }
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

function rig(over = {}) {
  const log = [];
  const st = { online: over.online ?? true, attached: over.attached ?? true, offline: false, cover: null, escape: null, signIn: null, goOffline: null, bar: "none", signIns: 0, catchUps: 0, afterPass: 0, renews: 0, checks: 0 };
  const gate = new CloudGate({
    attached: () => st.attached,
    browserOnline: () => st.online,
    renew: async () => { st.renews++; return over.renew ? over.renew() : { kind: "ok" }; },
    check: async (g) => { st.checks++; if (over.check) await over.check(g); },
    signInInteractive: () => { st.signIns++; },
    ui: {
      showChecking: (onEscape) => { st.cover = "checking"; st.escape = onEscape; },
      showBlocked: (reason, h) => { st.cover = reason; st.signIn = h.signIn; st.goOffline = h.offline; },
      hide: () => { st.cover = null; },
    },
    bar: { show: () => { st.bar = "offline"; }, reconnecting: () => { st.bar = "reconnecting"; }, hide: () => { st.bar = "none"; } },
    setUserOffline: (v) => { st.offline = v; },
    userOffline: () => st.offline,
    catchUp: async () => { st.catchUps++; },
    afterPass: () => { st.afterPass++; },
    note: (m) => { log.push(m); },
    hardTimeoutMs: over.hardTimeoutMs ?? 40,
    recheckMs: over.recheckMs ?? 0,
  });
  return { gate, st, log };
}

describe("闸门状态机（设计稿 §7）", () => {
  it("① 没挂库：开机 / 醒来零闸，罩子从没出现；本地那段照跑", async () => {
    const { gate, st } = rig({ attached: false });
    let shown = false, ran = false;
    const orig = st;
    const o = await gate.run("boot", { before: async () => { ran = true; shown = orig.cover !== null; } });
    eq(o, "no-gate"); assert(ran, "本地恢复照跑"); assert(!shown, "没罩"); eq(st.cover, null); eq(st.renews, 0, "不续签");
    eq(await gate.run("wake"), "no-gate");
  });
  it("② 登录好 + 云端没动：罩一下就放行，没有面、没有条；本地恢复跑在罩子底下、在问云端之前", async () => {
    const order = [];
    const { gate, st } = rig({ renew: async () => { order.push("renew"); return { kind: "ok" }; }, check: async () => { order.push("check"); } });
    const o = await gate.run("boot", { before: async () => { assert(st.cover === "checking", "本地恢复时已经罩着"); order.push("restore"); } });
    eq(o, "pass"); eq(order.join(), "restore,renew,check"); eq(st.cover, null); eq(st.bar, "none"); eq(st.afterPass, 1);
  });
  it("这台设备上没账号（退出登录过 / 从没登录）：不当登录墙，放行、不弹闸（§9）", async () => {
    const { gate, st } = rig({ renew: async () => ({ kind: "no-account" }) });
    eq(await gate.run("boot"), "no-login"); eq(st.cover, null); eq(st.bar, "none"); assert(!st.offline, "不算离线");
  });
  it("③ 续签失败（要人交互）：闸「登录过期了」两个钮；点离线继续 → 放行、常驻条、之后没有登录 / 云端请求；online + 续签成功 → 条收掉、补传", async () => {
    let renewOk = false;
    const { gate, st } = rig({ renew: async () => (renewOk ? { kind: "ok" } : { kind: "failed", code: "login_required" }) });
    const p = gate.run("boot");
    await tick(); eq(st.cover, "expired", "闸");
    assert(st.signIn && st.goOffline, "两个钮");
    const renewsAtGate = st.renews;
    st.goOffline(); eq(await p, "offline");
    eq(st.cover, null, "放行"); eq(st.bar, "offline", "常驻条"); assert(st.offline, "userOffline");
    eq(st.renews, renewsAtGate, "离线继续之后没有再续签"); eq(st.checks, 0, "没有问云端");
    renewOk = true; st.offline = true;
    gate.onCloudMaybeBack(); await tick();
    assert(!st.offline, "回来了"); eq(st.catchUps, 1, "补传"); eq(st.bar, "none", "条收掉");
  });
  it("③′「重新登录」= 交互登录；跳走前闸门留着（不放输入）", async () => {
    const { gate, st } = rig({ renew: async () => ({ kind: "failed", code: "interaction_required" }) });
    void gate.run("boot"); await tick();
    st.signIn(); eq(st.signIns, 1); eq(st.cover, "expired", "还罩着");
    assert(gate.isRunning(), "这一轮没结束");
    st.goOffline(); await tick();
  });
  it("④ 没网：直接进闸，不等超时、不续签", async () => {
    const { gate, st } = rig({ online: false, hardTimeoutMs: 100000 });
    void gate.run("boot"); await tick();
    eq(st.cover, "no-network"); eq(st.renews, 0);
    // 没网时点「重新登录」= 再核一次（不去跳一个注定失败的页）
    st.signIn(); await tick(); eq(st.signIns, 0); eq(st.cover, "no-network");
    // 网回来了：闸开着 = 自己重新核，通过就放行
    st.online = true; gate.onCloudMaybeBack(); await tick(); eq(st.cover, null, "放行"); eq(st.afterPass, 1);
  });
  it("⑤ 云端慢：点「先离线用」立刻放行（不等）；迟到的结果作废（abandoned = true，库不换字节）", async () => {
    const hang = deferred();
    let abandoned = () => false;
    const { gate, st } = rig({ hardTimeoutMs: 100000, check: async (g) => { abandoned = g.abandoned; await hang.promise; } });
    const p = gate.run("boot");
    await tick(); eq(st.cover, "checking"); assert(!abandoned(), "还没作废");
    st.escape();
    eq(await p, "offline"); eq(st.cover, null); assert(st.offline, "离线"); eq(st.bar, "offline");
    assert(abandoned(), "迟到的结果作废");
    hang.resolve(); await tick();
    eq(st.afterPass, 0, "迟到的结果不会算放行");
  });
  it("⑤′ 云端慢：不点，到硬超时自动进闸「网盘没有回应」；迟到的结果作废", async () => {
    const hang = deferred();
    let abandoned = () => false;
    const { gate, st } = rig({ hardTimeoutMs: 30, check: async (g) => { abandoned = g.abandoned; await hang.promise; } });
    void gate.run("boot");
    await tick(60); eq(st.cover, "no-response"); assert(abandoned(), "作废");
    st.goOffline(); await tick();
  });
  it("硬超时默认 8 s（设计稿 §4，艺术类 app 不要更短）；拉取 / 面开始之后不再计时（它们有自己的出口）", async () => {
    assert(/const HARD_TIMEOUT_MS = 8000;/.test(read("src/cloud-gate.ts")), "8 s");
    const hang = deferred();
    const { gate, st } = rig({ hardTimeoutMs: 20, check: async (g) => { g.onLongWait(); await hang.promise; } });
    const p = gate.run("boot");
    await tick(60); eq(st.cover, "checking", "超时停了，没进闸");
    hang.resolve(); eq(await p, "pass");
  });
  it("⑥ 醒来走同一套；已选离线且仍没网 → 不再弹闸（条还在）", async () => {
    const { gate, st } = rig({ online: false });
    void gate.run("boot"); await tick(); st.goOffline(); await tick();
    eq(st.bar, "offline");
    const r = st.renews;
    eq(await gate.run("wake"), "offline-kept"); eq(st.cover, null, "没闸"); eq(st.bar, "offline", "条还在"); eq(st.renews, r, "没网不续签");
  });
  it("⑥′ 已选离线、有网但续签还是不行：醒来不弹闸，条留着", async () => {
    const { gate, st } = rig({ renew: async () => ({ kind: "failed", code: "login_required" }) });
    void gate.run("boot"); await tick(); st.goOffline(); await tick();
    eq(await gate.run("wake"), "offline-kept"); await tick();
    eq(st.cover, null); assert(st.offline); eq(st.bar, "offline");
  });
  it("醒来：同一套（罩 → 续签 → 问云端）；刚核对过不再罩（切个标签回来不吃第一下点击）", async () => {
    const { gate, st } = rig({ recheckMs: 100000 });
    eq(await gate.run("boot"), "pass"); const c = st.checks;
    eq(await gate.run("wake"), "recent"); eq(st.checks, c, "不重复问");
    const r2 = rig({ recheckMs: 0 });
    await r2.gate.run("boot"); const c2 = r2.st.checks;
    eq(await r2.gate.run("wake"), "pass"); eq(r2.st.checks, c2 + 1, "过了窗口照走一遍");
  });
  it("单飞：这一轮没走完再来一次，共用同一轮", async () => {
    const hang = deferred();
    const { gate, st } = rig({ hardTimeoutMs: 100000, check: async () => { await hang.promise; } });
    const a = gate.run("boot"); await tick();
    const b = gate.run("wake"); await tick();
    eq(st.checks, 1); hang.resolve(); eq(await a, "pass"); eq(await b, "pass");
  });
  it("库的 offlineEscape 接缝：闸门这一轮拿到同一个逃生信号；轮外 = null（走库默认那条通知）", async () => {
    const hang = deferred();
    const { gate, st } = rig({ hardTimeoutMs: 100000, check: async () => { await hang.promise; } });
    eq(gate.escapeProbe(), null);
    void gate.run("boot"); await tick();
    const probe = gate.escapeProbe(); assert(probe, "有信号");
    let fired = false; void probe.then(() => { fired = true; });
    st.escape(); await tick(); assert(fired, "同一个信号"); hang.resolve();
  });
  it("闸门外点「先离线用」（比如回前台的快进正在拉）= 离线继续", async () => {
    const { gate, st } = rig();
    gate.escape(); assert(st.offline); eq(st.bar, "offline");
  });
  it("⑧ 原因分类：interaction 码 → 登录过期了；别的 → 网盘没有回应；没网优先", () => {
    eq(reasonOf("login_required", true), "expired"); eq(reasonOf("interaction_required", true), "expired"); eq(reasonOf("consent_required", true), "expired");
    eq(reasonOf("monitor_window_timeout", true), "no-response"); eq(reasonOf("no_network_connectivity", true), "no-response"); eq(reasonOf(null, true), "no-response");
    eq(reasonOf("login_required", false), "no-network");
  });
  it("⑧ 原因码：解析库的日志行；库的格式变了这里红（库零改，读的是它写进 ui.reportError 的那一行）", () => {
    const f = parseRenewFailure("[auth] silent token renewal failed (boot-probe): name=InteractionRequiredAuthError code=login_required sub=  msg=x\n  account=…");
    eq(f?.where, "boot-probe"); eq(f?.code, "login_required"); eq(f?.name, "InteractionRequiredAuthError");
    eq(parseRenewFailure("[auth] init: redirectResponse=no"), null);
    const lib = read("node_modules/@internal/store/dist/base/providers/auth.js");
    assert(lib.includes("[auth] silent token renewal failed (${where}): name=${") && lib.includes("} code=${") && lib.includes("} sub=${"), "库里的日志行还是这个形状");
  });
});

describe("开机本地那段（WeebPaint 的 initAuth 和恢复并行，这段可能碰网）", () => {
  it("本地恢复跑在罩子底下、在问云端之前", async () => {
    const order = [];
    const { gate, st } = rig({ renew: async () => { order.push("renew"); return { kind: "ok" }; }, check: async () => { order.push("check"); } });
    eq(await gate.run("boot", { before: async () => { assert(st.cover === "checking", "已经罩着"); order.push("restore"); } }), "pass");
    eq(order.join(), "restore,renew,check");
  });
  it("云端慢、卡在本地那段：点「先离线用」立刻放行；库拿到同一个信号", async () => {
    const hang = deferred();
    const { gate, st } = rig({ hardTimeoutMs: 100000 });
    let probe = null;
    const p = gate.run("boot", { before: async () => { probe = gate.escapeProbe(); await hang.promise; } });
    await tick(); assert(probe, "before 里拿得到信号");
    let fired = false; void probe.then(() => { fired = true; });
    st.escape();
    eq(await p, "offline"); assert(fired, "库收到信号转读本机"); eq(st.cover, null); assert(st.offline);
    hang.resolve();
  });
  it("云端慢、不点：到硬超时把信号发给库，进闸「网盘没有回应」", async () => {
    const hang = deferred();
    const { gate, st } = rig({ hardTimeoutMs: 20 });
    let fired = false;
    void gate.run("boot", { before: async () => { void gate.escapeProbe().then(() => { fired = true; }); await hang.promise; } });
    await tick(60);
    assert(fired, "库收到信号"); eq(st.cover, "no-response"); eq(st.renews, 0);
    st.goOffline(); await tick(); hang.resolve();
  });
  it("人在口令面板上（pauseHardTimer）：不拿超时打断", async () => {
    const hang = deferred();
    const { gate, st } = rig({ hardTimeoutMs: 20 });
    const p = gate.run("boot", { before: async () => { gate.pauseHardTimer(); await hang.promise; } });
    await tick(60); eq(st.cover, "checking", "还在核对");
    hang.resolve(); eq(await p, "pass");
  });
  it("没挂库 / 选了离线：本地那段照跑，不罩", async () => {
    let ran = false;
    const a = rig({ attached: false });
    eq(await a.gate.run("boot", { before: async () => { ran = true; } }), "no-gate"); assert(ran); eq(a.st.cover, null);
  });
});

describe("闸门栈", () => {
  const views = () => { const seen = []; const s = createGateStack((t) => { seen.push(t?.title ?? null); }); return { s, seen }; };
  it("能叠：收掉上面那张，下面那张还在、还锁着；第一张的 Promise 会回（单槽版永远不回）", async () => {
    const { s, seen } = views();
    const a = s.open({ title: "核对", actions: [] }), b = s.open({ title: "冲突", actions: [{ label: "x", value: "x" }] });
    eq(seen.at(-1), "冲突");
    s.pick(0); eq(await b.result, "x"); assert(s.isUp()); eq(seen.at(-1), "核对");
    a.close("y"); eq(await a.result, "y"); assert(!s.isUp()); eq(seen.at(-1), null);
  });
  it("settleTop 收最上面那张；按钮的 onPick 在点击的同步栈里（iOS 红线：loginRedirect 不能在 Promise 续体里）", () => {
    const { s } = views();
    let called = false;
    s.open({ title: "闸", actions: [{ label: "登录", value: "signin", onPick: () => { called = true; } }] });
    s.pick(0);
    assert(called, "pick 返回前已经调了");
    s.open({ title: "t", actions: [] }); s.settleTop(); assert(!s.isUp());
  });
});

describe("交互锁 gate", () => {
  it("键盘 / 指针 / 写操作都不放；面板和通知放；修饰键清位放", () => {
    for (const i of ["pointer:draw", "pointer:navigate", "pointer:pick", "key:shortcut", "paste", "copy", "doc:mutate", "persist", "export:read", "menu"]) assert(!policyAllows("gate", i), i);
    for (const i of ["dialog", "gate", "notice", "key:modifier"]) assert(policyAllows("gate", i), i);
  });
  it("闸门一开就拉这把锁、全收了才放（sheets.ts）；后开的面板永远在上面（ui/sheet.ts），不然开机解锁的口令面板压在罩子底下 = 死锁", () => {
    const src = read("src/sheets.ts");
    assert(/_releaseGateLock \?\?= acquireLock\("gate"\)/.test(src) && /_releaseGateLock\?\.\(\); _releaseGateLock = null;/.test(src));
    assert(/z = Math\.max\(z \+ 1, _zBase\(/.test(read("src/ui/sheet.ts")));
  });
});

describe("守卫（设计稿 §8）", () => {
  const app = strip(read("src/app.ts"));
  it("① 开机路径：挂了库走闸门；initAuth 只在开机起一次；库的 open 用闸门的逃生信号；快进带 probe、迟到的结果作废", () => {
    eq((app.match(/\binitAuth\(\)/g) ?? []).length, 1, "authBootP");
    assert(/gateHost\.gate\.run\("boot", \{ before: localBoot \}\)/.test(app), "开机过闸门");
    assert(/Promise\.race<Raced>\(\[/.test(read("src/cloud-gate.ts")) && /Promise\.race<R>\(\[/.test(read("src/cloud-gate.ts")), "问云端、本地那段都和逃生、超时赛跑");
    const ss = strip(read("src/session-state.ts"));
    assert(/localDirty: \(\) => es\.isDirty\(\) \|\| !!_refreshGuard\?\.abandoned\(\)/.test(ss) && /\n\s*probe,/.test(ss), "快进");
    assert(/if \(_refreshRun\) \{ if \(g\) _refreshGuard = g; return g \? _refreshRun/.test(ss), "闸门加入在途的那一趟");
    assert(/const inGate = storeGate\.escapeProbe\?\.\(\);/.test(read("src/store-ui.ts")), "库的 offlineEscape 走同一个信号");
  });
  it("② 只有 OneDrive 图库闸（文件夹图库本地即在线、无库和网盘无关）；isOnline 只接给 OneDrive 那家", () => {
    assert(/a\.kind === "attached" && a\.entry\.kind === "onedrive"/.test(app));
    const st = strip(read("src/app-store.ts"));
    assert(/_createRealStore\(prov, \(\) => true, entry\.dbId\);/.test(st), "folder 不吃 isOnline");
    assert(/entry\.dbId === "defaultStore" \? undefined : entry\.dbId, cloudOnline\)/.test(st), "OneDrive 吃");
  });
  it("③ 文案四语都有、原因三句分开、不拿失败 / 错误当标题、不含指挥句", () => {
    const keys = ["gate.checking", "gate.escape", "gate.blockedTitle", "gate.reason.expired", "gate.reason.noNetwork", "gate.reason.noResponse", "gate.signIn", "gate.offline", "gate.bar", "gate.barN", "gate.barReconnecting", "gate.barList"];
    for (const k of keys) for (const lang of ["zh", "en", "ja", "tok"]) assert(S[k]?.[lang], `${k}.${lang}`);
    eq(new Set(["gate.reason.expired", "gate.reason.noNetwork", "gate.reason.noResponse"].map((k) => S[k].zh)).size, 3);
    for (const k of keys) { assert(!/失败|错误|请检查|请确认|请先/.test(S[k].zh), S[k].zh); assert(!/failed|error|please|check your/i.test(S[k].en), S[k].en); }
    assert(S["gate.barN"].zh.includes("{n}") && S["gate.barN"].en.includes("{n}") && S["gate.barN"].ja.includes("{n}") && S["gate.barN"].tok.includes("{n}"));
  });
  it("④ userOffline 不落盘：只住 user-offline.ts 的内存变量", () => {
    assert(!/localStorage|indexedDB|deviceKv/.test(strip(read("src/user-offline.ts"))));
    for (const p of ["src/device-kv.ts", "src/crash-store.ts", "src/diag-log.ts", "src/app-prefs.ts", "src/app-state.ts"]) assert(!/user-offline/.test(read(p)), p);
  });
  it("问「能不能上云」问 cloudOnline，不直接看 navigator.onLine", () => {
    const bad = [...walk("src")].filter((p) => p !== "src/user-offline.ts" && /navigator\.onLine/.test(strip(read(p))));
    eq(bad.join(), "");
  });
  it("回线 / 回前台静默补登；原因码从库的日志行收进来", () => {
    assert(/retrySilentQuietly\("foreground"\)/.test(app), "回前台（以前只有回线）");
    assert(/addEventListener\("online", async \(\) => \{\s*\n\s*gateHost\.gate\.onCloudMaybeBack\(\);/.test(app), "回线");
    assert(/noteRenewFailureLine\(/.test(read("src/store-ui.ts")));
  });
  it("同一轮库的面只问一次：恢复时问过了，问云端那步不再问（登录和恢复并行才有这条路）", () => {
    assert(/if \(storeGate\.lastOpenChoice\) return;\s*\n\s*const blob = await _file\(name\)\.open\(\);/.test(strip(read("src/session-state.ts"))));
    assert(/showChecking: \(onEscape\) => \{[\s\S]*?storeGate\.lastOpenChoice = null;/.test(read("src/cloud-gate-host.ts")));
  });
  it("闸门上的「重新登录」在点击的同步栈里起跳（iOS 红线）", () => {
    assert(/value: "signin", primary: true, onPick: \(\) => b\.signIn\(\)/.test(read("src/cloud-gate-host.ts")));
  });
  it("从离线回来不自己批量推：WeebPaint 的推送 = 人按「存」（10-26「列表面」）", () => {
    const body = app.slice(app.indexOf("catchUp: async () => {"), app.indexOf("afterPass: () => {"));
    assert(body.length > 0 && !/pushAll/.test(body));
    assert(/offerPushLocalOnly\(\)/.test(body));
  });
});

describe("F-147 B：点「有新版本」前（WeebPaint 不做 A：blur 自动推 = 改消费语义）", () => {
  const ss = strip(read("src/session-state.ts")), es = strip(read("src/editor-session/editor-session.ts"));
  const body = ss.slice(ss.indexOf("async function flushBeforeReload"), ss.indexOf("// 逃生分叉") >= 0 ? ss.indexOf("async function _forkAfterEscape") : undefined);
  it("onBeforeReload 走 flushBeforeReload；false = 取消、这次不刷新", () => {
    assert(/return session\.flushBeforeReload\(\);/.test(strip(read("src/app.ts"))));
    assert(/if \(\(await this\.d\.onBeforeReload\(\)\) === false\) return;/.test(read("src/pwa-shell.ts")));
  });
  it("干净的什么都不做；改过没传的问人；先落本地不设时限、推最多等 5 s", () => {
    assert(/if \(!es\.isDirty\(\) && !es\.isPushPending\(\) && !pending\) return true;/.test(body), "干净的");
    assert(/openChoiceSheet<"save" \| "local">/.test(body), "问人");
    assert(/await es\.flushLocal\(\);\s*\n\s*await Promise\.race\(\[es\.flushAndPush\(\), new Promise\(\(r\) => setTimeout\(r, RELOAD_PUSH_WAIT_MS\)\)\]\);/.test(body), "两步");
    assert(/export const RELOAD_PUSH_WAIT_MS = 5000;/.test(read("src/config.ts")));
    assert(/if \(_localHomeKind\(\)\) return leaveLocalDoc\(\);/.test(body), "文件家 / 临时：三键挽留");
  });
  it("es.start：切后台 / pagehide 只落本地；blur 按 policy，policy 不含 blur", () => {
    assert(/visibilityState === "hidden"\) void persist\(false\)/.test(es), "hidden");
    assert(/addEventListener\?\.\("pagehide", \(e: Event\) => \{ if \(!\(e as \{ persisted\?: boolean \}\)\.persisted\) void persist\(false\); \}\)/.test(es), "pagehide 路径不许推");
    assert(/addEventListener\?\.\("blur", \(\) => \{ void persist\(pushOn\.has\("blur"\)\); \}\)/.test(es), "blur");
    assert(/policy: \{ autosaveMs: 0, pushOn: \["exit"\] \}/.test(ss), "WeebPaint 的推送 = 退出 / 人按存");
  });
});

describe("F-148：这幅画是不是加密的，以 open 之后的字节为准", () => {
  const ss = strip(read("src/session-state.ts"));
  it("库的 isEncrypted 看本地字节：语义变了要重审这条", () => {
    assert(/\/\*\* 本地字节是否加密容器。 \*\/\s*\n\s*isEncrypted\(\)/.test(read("node_modules/@internal/store/dist/create-store.d.ts")));
  });
  it("每个 es.open 之后都再看一次（等它）；锁着的第二台认出容器要问口令再开", () => {
    const lines = ss.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!/=\s*await es\.open\(toFull\(/.test(lines[i])) continue;
      const after = lines.slice(i, i + 12).join("\n");
      assert(/await _refreshEncrypted\(\)/.test(after), `es.open 之后没有再看一次：${lines[i].trim().slice(0, 70)}`);
    }
    eq((ss.match(/!opened && !encBefore && await _file\(\w+(?:\.name)?\)\.isEncrypted\(\)/g) ?? []).length, 2, "openItem + restore");
    assert(!/[^d]_refreshEncrypted\(\);\s*\n\s*void _captureCheckpoint\(item\.name/.test(ss) || /await _refreshEncrypted\(\);/.test(ss));
  });
  it("分叉会写出明文（saveAs = 新身份）：加密的画不分叉，放下回图库", () => {
    const body = ss.slice(ss.indexOf("async function _forkAfterEscape"));
    assert(/await _refreshEncrypted\(\);\s*\n\s*if \(_enc\.encrypted\) \{[\s\S]*?await _leaveDocUnsaved\(\);\s*\n\s*return;/.test(body));
  });
});

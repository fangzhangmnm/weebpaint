// cloud-gate-host.ts —— 闸门的组装层：把状态机（cloud-gate.ts）接到罩子（sheets.ts）、常驻条（通知栈）、文案（i18n）、登录（注入）。created 2026-11-03 by Claude Opus 5.5（工单 G）
//   「挂了库」= 挂着 OneDrive 图库。文件夹图库本地即在线，无库（Editor-only）和网盘无关：都永不闸（设计稿 §2）。
//   WeebPaint 的 initAuth 在 app.ts 开机就起，和恢复并行：这里只等它（authBoot），不再起一次。
//   退出 = 卸库 + 退出登录（gallery-manage-ui），所以「挂着 OneDrive」就等于这台有账号：没有 no-account 这条路；MSAL 缓存空了 = 登录过期。
import { closeNotice, showNotice, type NoticeHandle } from "@internal/workbench-elements";
import { CloudGate, takeRenewFailureCode, type GateReason, type RenewResult } from "./cloud-gate.ts";
import { openSyncGate } from "./sheets.ts";
import type { GateHandle } from "./gate-stack.ts";
import { t, type Key } from "./i18n/index.ts";
import { browserOnline, isUserOffline, setUserOffline } from "./user-offline.ts";
import { storeGate } from "./store-ui.ts";

const OFFLINE_BAR_ID = "offline-bar";
const QUIET_RETRY_MS = 60_000;      // 静默补登最多一分钟一次：刷新令牌真过期时每次都是一个隐藏 iframe
const BAR_POLL_MS = 5000;           // 选了离线时份数跟着变；库没有 dirty 事件
const REASON_KEY: Record<GateReason, Key> = { expired: "gate.reason.expired", "no-network": "gate.reason.noNetwork", "no-response": "gate.reason.noResponse" };

export interface CloudGateHostDeps {
  attached(): boolean;
  authBoot: Promise<unknown>;
  isSignedIn(): boolean;
  retrySilentSignIn(): Promise<boolean>;
  /** 交互登录：在点击的同步栈里调（iOS 红线）。 */
  signIn(): void;
  check(g: { abandoned: () => boolean; onLongWait: () => void }): Promise<unknown>;
  dirtyCount(): Promise<number>;
  openAttentionList(): void;
  catchUp(): Promise<void>;
  afterPass(): void;
  note(msg: string): void;
}

export function createCloudGateHost(d: CloudGateHostDeps) {
  let cover: GateHandle<string> | null = null;
  const closeCover = (): void => { cover?.close(); cover = null; };

  async function renew(): Promise<RenewResult> {
    await d.authBoot.catch(() => {});   // 失败已在 app.ts 记过；MSAL 没载下来 = 下面续签也不成，走硬超时 / 闸
    if (d.isSignedIn()) return { kind: "ok" };
    takeRenewFailureCode();
    const ok = await d.retrySilentSignIn();
    const code = ok ? null : takeRenewFailureCode();
    d.note(`silent renew → ${ok ? "ok" : "failed"}${code ? ` code=${code}` : ""}`);   // 设计稿 §7 ⑧
    return ok ? { kind: "ok" } : { kind: "failed", code: code ?? (browserOnline() ? "no_tokens_found" : null) };
  }

  let bar: NoticeHandle | null = null;
  let barTimer = 0;
  let barPainting = false;
  const barText = (n: number): string => (n > 0 ? t("gate.barN", { n: String(n) }) : t("gate.bar"));
  function setBar(text: string, withList: boolean): void {
    closeNotice(OFFLINE_BAR_ID);
    bar = showNotice({
      id: OFFLINE_BAR_ID, level: "info", text, dismissible: false, tapToDismiss: false,
      ...(withList ? { actions: [{ label: t("gate.barList"), onClick: () => d.openAttentionList() }] } : {}),
    });
  }
  function paintBar(): void {
    if (!isUserOffline() || barPainting) return;
    barPainting = true;
    void d.dirtyCount().catch(() => 0).then((n) => {
      barPainting = false;
      if (!isUserOffline()) return;
      const text = barText(n);
      if (bar?.isOpen()) bar.setText(text); else setBar(text, true);
    });
  }
  function hideBar(): void {
    clearInterval(barTimer); barTimer = 0;
    closeNotice(OFFLINE_BAR_ID); bar = null;
  }

  const tune = { recheckMs: 30_000 };   // 探针调（__wpProbe.gateTune）；不是偏好
  const gate: CloudGate = new CloudGate({
    attached: () => d.attached(),
    browserOnline,
    renew,
    check: async (g) => { await d.check(g); },
    signInInteractive: () => d.signIn(),
    ui: {
      showChecking: (onEscape) => {
        closeCover();
        storeGate.lastOpenChoice = null;   // 新的一轮：库的面还没问过
        const h = openSyncGate<string>({ title: t("gate.checking"), message: "", showSpinner: true, quietStart: true, actions: [{ label: t("gate.escape"), value: "escape" }] });
        cover = h;
        void h.result.then((v) => { if (cover === h) cover = null; if (v === "escape") onEscape(); });
      },
      showBlocked: (reason, b) => {
        closeCover();
        const h = openSyncGate<string>({
          title: t("gate.blockedTitle"), message: t(REASON_KEY[reason]),
          actions: [
            { label: t("gate.signIn"), value: "signin", primary: true, onPick: () => b.signIn() },   // 同步栈里起跳（iOS 红线）
            { label: t("gate.offline"), value: "offline" },
          ],
        });
        cover = h;
        void h.result.then((v) => {
          if (cover === h) cover = null;
          if (v === "offline") b.offline();
          else if (v === "signin") gate.reshowBlocked();   // 离页之前不放输入；跳走失败 / 没网 = 回到这张
        });
      },
      hide: closeCover,
    },
    bar: {
      show: () => { paintBar(); if (!barTimer) barTimer = window.setInterval(paintBar, BAR_POLL_MS); },
      reconnecting: () => { if (bar?.isOpen()) bar.setText(t("gate.barReconnecting")); else setBar(t("gate.barReconnecting"), false); },
      hide: hideBar,
    },
    setUserOffline,
    userOffline: isUserOffline,
    catchUp: () => d.catchUp(),
    afterPass: () => d.afterPass(),
    note: d.note,
    get recheckMs() { return tune.recheckMs; },
  });

  // 库那头的接缝（store-ui.ts）：库的 open 在闸门这一轮里用同一个逃生信号；面弹出来人在看，别拿超时打断；闸门外点「跳过到离线」= 离线继续。
  storeGate.escapeProbe = () => gate.escapeProbe();
  storeGate.onFace = () => gate.pauseHardTimer();
  storeGate.goOffline = () => gate.escape();

  let lastQuietRetryAt = -Infinity;
  /** 回线 / 回前台：没登录但挂着 OneDrive → 静默补一次。开机探测没成 / 中途过期之后，不补就只能手动登录（设计稿 §1）。 */
  function retrySilentQuietly(why: string): void {
    if (gate.isRunning() || isUserOffline() || d.isSignedIn() || !d.attached() || !browserOnline()) return;
    const now = Date.now();
    if (now - lastQuietRetryAt < QUIET_RETRY_MS) return;
    lastQuietRetryAt = now;
    d.note(`silent renew retry (${why})`);
    void renew().catch((e) => d.note(`silent renew retry threw: ${String(e)}`));
  }
  function wake(why: string): void {
    void gate.run("wake").then((o) => { if (o !== "no-gate" && o !== "recent") d.note(`wake (${why}) → ${o}`); }, (e) => d.note(`wake threw: ${String(e)}`));
  }
  return { gate, wake, retrySilentQuietly, paintBar, tune };
}

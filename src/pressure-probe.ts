// 压感自诊探针（纯逻辑，零 DOM）。created 2026-09-02 by Claude Fable 5.1.
//
// 背景（2026-08-29 案 + 2026-09-02 user「每次都事故就不是事故了…鼠绘不误报，笔检测没压感弹 toast…
//   每次 session 弹一次」）：Windows 数位板驱动没开 Windows Ink 时浏览器**只收到 mouse 事件**，恒压 0.5，
//   在 Web 平台上与真鼠标同构——不存在「直接断言你配置错了」的 API。能做的是两路零/极低误报的间接证据：
//
//   ① pen-flat：pointerType==="pen" 但整笔压力恒定（≥24 样本、路径 ≥60px、极差 <1e-4）。
//      真压感笔的传感器噪声不可能整笔一个值 → 零误报。抓的是「驱动给了 pen 事件但压感通道坏了」
//      （某些 Huion+Firefox / 无压感 MPP 笔）。**抓不到 Windows Ink 关闭的那类**（它们是 mouse）。
//   ② absolute-mouse（只在 Windows 判）：mouse 指针**瞬移**——相邻两次 move 间隔 ≥100ms 且位移 ≥250px，
//      且 coalesced 首样本已在远端（真鼠标从静止起步的第一帧不可能一步 250px；瞬移 = 绝对坐标设备，
//      即数位板走鼠标模式时笔离开感应区再落到别处）。累计 2 次才判。真鼠标只有 OS 搬光标（alt-tab
//      回来 / 焦点跳）才会瞬移——调用方在 pointerleave / blur / visibilitychange 时 resetBaseline() 兜掉。
//      这一路是**唯一**能抓到「朋友没开 Windows Ink」的证据；误报面 = 真鼠标在画布上连续瞬移两次。
//
// 一次判定后停摆（session 一次；toast 的「每 session 一次」由消费方 pressure-toast.ts 再守一层）。

export type PressureDoubt = "pen-flat" | "absolute-mouse";

export interface ProbeSample {
  pointerType: string;
  pressure: number;
  buttons: number;
  x: number;
  y: number;
  t: number;                                   // ms（performance.now / event.timeStamp 同源即可）
  /** getCoalescedEvents()[0] 的位置（有则用来区分「连续快甩」与「瞬移」）；可给 thunk 懒取。 */
  coalescedFirst?: { x: number; y: number } | null | (() => { x: number; y: number } | null);
}
export interface ProbeOpts {
  /** absolute-mouse 只在 Windows 判（Windows Ink 是 Windows 专属机制；别处瞬移无处方可开）。 */
  windows: boolean;
}

export const PEN_FLAT_MIN_SAMPLES = 24;
export const PEN_FLAT_MIN_PATH_PX = 60;
export const PEN_FLAT_EPS = 1e-4;
export const JUMP_MIN_PX = 250;
export const JUMP_MIN_GAP_MS = 100;
export const JUMP_COUNT = 2;

interface PenStrokeAcc { n: number; min: number; max: number; path: number; lx: number; ly: number }

export class PressureProbe {
  private readonly _opts: ProbeOpts;
  private _pen = new Map<number, PenStrokeAcc>();
  private _mouseLast: { x: number; y: number; t: number } | null = null;
  private _jumps = 0;
  private _verdict: PressureDoubt | null = null;

  constructor(opts: ProbeOpts) { this._opts = opts; }

  /** 已出过判定（停摆）。 */
  get verdict(): PressureDoubt | null { return this._verdict; }
  get jumps(): number { return this._jumps; }

  /** 每个 pointermove（含 hover）喂一次。返回判定（一次性，之后恒 null）。 */
  observeMove(pointerId: number, s: ProbeSample): PressureDoubt | null {
    if (this._verdict) return null;
    if (s.pointerType === "pen") { this._penMove(pointerId, s); return null; }
    if (s.pointerType === "mouse" && this._opts.windows) return this._mouseMove(s);
    return null;
  }

  /** pointerup / pointercancel 喂一次（pen-flat 在整笔结束时判）。 */
  observeUp(pointerId: number, s?: ProbeSample): PressureDoubt | null {
    if (this._verdict) { this._pen.delete(pointerId); return null; }
    if (s && s.pointerType === "pen") this._penMove(pointerId, s);
    const acc = this._pen.get(pointerId);
    this._pen.delete(pointerId);
    if (!acc) return null;
    if (acc.n >= PEN_FLAT_MIN_SAMPLES && acc.path >= PEN_FLAT_MIN_PATH_PX && (acc.max - acc.min) < PEN_FLAT_EPS) {
      return (this._verdict = "pen-flat");
    }
    return null;
  }

  /** 光标离开画布 / 窗口失焦 / 页面隐藏：瞬移基线作废（OS 搬光标不算证据）。 */
  resetBaseline(): void { this._mouseLast = null; }

  private _penMove(id: number, s: ProbeSample) {
    if (!s.buttons) { return; }                          // hover 不算笔画
    // 0 = 抬笔瞬间 / 起手 warmup 的「未知」值（input.ts effectivePressureFor 同款语义），不计入极差。
    const p = s.pressure;
    let acc = this._pen.get(id);
    if (!acc) { acc = { n: 0, min: Infinity, max: -Infinity, path: 0, lx: s.x, ly: s.y }; this._pen.set(id, acc); }
    acc.path += Math.hypot(s.x - acc.lx, s.y - acc.ly);
    acc.lx = s.x; acc.ly = s.y;
    if (p > 0) { acc.n++; if (p < acc.min) acc.min = p; if (p > acc.max) acc.max = p; }
  }

  private _mouseMove(s: ProbeSample): PressureDoubt | null {
    const last = this._mouseLast;
    this._mouseLast = { x: s.x, y: s.y, t: s.t };
    if (!last) return null;
    const dt = s.t - last.t;
    const d = Math.hypot(s.x - last.x, s.y - last.y);
    if (dt < JUMP_MIN_GAP_MS || d < JUMP_MIN_PX) return null;
    // 连续快甩：coalesced 首样本还贴着上一位置（鼠标从静止起步不可能一步到位）→ 不是瞬移。
    const cf = typeof s.coalescedFirst === "function" ? s.coalescedFirst() : s.coalescedFirst;
    if (cf && Math.hypot(cf.x - last.x, cf.y - last.y) < JUMP_MIN_PX) return null;
    this._jumps++;
    if (this._jumps >= JUMP_COUNT) return (this._verdict = "absolute-mouse");
    return null;
  }
}

/** 浏览器适配：PointerEvent → ProbeSample（唯一碰 DOM 形状的地方；input.ts 一行调用）。 */
export function sampleFromPointerEvent(e: PointerEvent): ProbeSample {
  return {
    pointerType: e.pointerType, pressure: e.pressure, buttons: e.buttons,
    x: e.clientX, y: e.clientY, t: e.timeStamp,
    // 懒取：只有 mouse 瞬移候选才会去问 coalesced（getCoalescedEvents 每次分配数组，别在每个 move 上白花）
    coalescedFirst: () => {
      const co = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : null;
      return co && co.length ? { x: co[0].clientX, y: co[0].clientY } : null;
    },
  };
}

/** Windows 平台判定（UA-CH 优先，UA 字符串兜底）。 */
export function isWindowsPlatform(nav: { userAgentData?: { platform?: string }; userAgent?: string } | undefined
  = (globalThis as { navigator?: Navigator }).navigator): boolean {
  if (!nav) return false;
  const p = nav.userAgentData?.platform;
  if (p) return p === "Windows";
  return /Windows NT/.test(nav.userAgent || "");
}

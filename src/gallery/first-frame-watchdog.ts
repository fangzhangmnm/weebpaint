// first-frame-watchdog.ts —— 图库首帧看门狗（纯逻辑零 DOM；timers 可注入，node 直测）。
// created 2026-08-31 by Claude Fable 5.
//
// 案发 2026-08-31（iPad 主屏 PWA，长画多次锁屏后回图库）：store.watchFolder 的首帧永远不来 →
//   图库 loading 空白（而且 loading 文字被 v-show 一起藏了，见 gallery.ts A1）→ 用户只能重开 app 碰运气。
//   看门狗把「等不到」变成可见、可自救：到点报 stall，gallery.ts 显「读取超时 + 重试」并上报/记日志。
//
// 语义：
// - arm(folder)：开始等该夹首帧（替换上一次 arm；同夹重 arm 也重置计时）。
// - frame(folder)：该夹来帧 → 解除；**别夹**的帧不算（换夹途中的旧帧不能替新夹销账）。
// - cancel()：退订/换视图/无库 → 解除，不再触发。
// - 到点未解除 → onStall({ folder, elapsedMs }) 恰好一次；之后只有再 arm 才会再报。

export interface WatchdogTimers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface FirstFrameWatchdog {
  arm(folder: string): void;
  frame(folder: string): void;
  cancel(): void;
  isArmed(): boolean;
}

const REAL_TIMERS: WatchdogTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export function createFirstFrameWatchdog(
  onStall: (info: { folder: string; elapsedMs: number }) => void,
  opts?: { timeoutMs?: number; timers?: WatchdogTimers; now?: () => number },
): FirstFrameWatchdog {
  const timeoutMs = opts?.timeoutMs ?? 8000;
  const timers = opts?.timers ?? REAL_TIMERS;
  const now = opts?.now ?? (() => Date.now());
  let handle: unknown = null;
  let folder: string | null = null;
  let armedAt = 0;

  function disarm(): void {
    if (handle != null) { timers.clear(handle); handle = null; }
    folder = null;
  }
  return {
    arm(f: string): void {
      disarm();
      folder = f;
      armedAt = now();
      handle = timers.set(() => {
        const elapsedMs = now() - armedAt;
        const stalledFolder = folder ?? f;
        handle = null; folder = null;
        onStall({ folder: stalledFolder, elapsedMs });
      }, timeoutMs);
    },
    frame(f: string): void {
      if (folder !== null && f === folder) disarm();
    },
    cancel(): void { disarm(); },
    isArmed: () => handle != null,
  };
}

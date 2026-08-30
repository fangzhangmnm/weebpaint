// flow-lock.ts —— attach/detach 流程的 promise 互斥（单飞道）。
// created 2026-08-30 by Claude Fable 5. 案卷 = ai-docs/20260830-reconnect-gallery-online-flag-race.md §BUG D。
//
// 为什么要有：redirect 回程时 bootAttachFromRegistry（boot 链）与 resumePendingOneDriveConnect→switchFlow
//   （wp:auth-changed 链）可并发 detach/attach；attachment 器官的 attach-while-attached 响亮 throw 挡得住
//   双挂，但挡不住「输家 catch 里的兜底把赢家的活店拔掉」这类交错。流程级串行是结构解。
// 语义：fn 串进同一条 promise 链——前一个流程 settle（成败皆可）后才跑下一个；错误原样穿透给调用方，
//   链本身吞错不断（后续流程照跑）。**不可重入**：锁内 await 另一个走锁的流程 = 死锁，别嵌套。

export type FlowLock = <T>(fn: () => Promise<T>) => Promise<T>;

export function createFlowLock(): FlowLock {
  let chain: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const p = chain.then(fn, fn);          // 前序失败不传染：无论如何轮到我就跑
    chain = p.catch(() => undefined);      // 链自身吞错（调用方拿原样 p，错误不丢）
    return p;
  };
}

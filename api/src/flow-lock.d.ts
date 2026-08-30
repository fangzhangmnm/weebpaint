export type FlowLock = <T>(fn: () => Promise<T>) => Promise<T>;
export declare function createFlowLock(): FlowLock;

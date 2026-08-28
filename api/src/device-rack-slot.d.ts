import type { RackPersistence } from "./brush-rack-controller.ts";
/** 槽的持久化 kv（注入口给 node 测试；prod 默认 = IDB 单键实现）。 */
export interface RackSlotKv {
    get(): Promise<{
        items: {
            id: string;
            uat: number;
            value: unknown;
        }[];
    } | null>;
    put(v: {
        items: {
            id: string;
            uat: number;
            value: unknown;
        }[];
    }): Promise<void>;
}
export declare function createDeviceRackSlot(opts?: {
    getInitData?: () => {
        id: string;
        value: unknown;
    }[] | Promise<{
        id: string;
        value: unknown;
    }[]>;
    kv?: RackSlotKv;
    writeDelayMs?: number;
}): RackPersistence & {
    persistent(): boolean;
};

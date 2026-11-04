import type { StoreUI } from "@internal/store";
import { lockSyncGate } from "./sheets.ts";
export type RenameOldAnswer = "trash" | "keep" | "cancel";
export declare function makeResolveRenameOld(gate?: typeof lockSyncGate): ({ oldName, newName, reason }: {
    oldName: string;
    newName: string;
    reason: "diverged" | "unknown-lineage";
}) => Promise<RenameOldAnswer>;
/** 闸门的接缝（cloud-gate-host.ts 接线；store-ui 在 app-store 之前求值，不能反过来 import）。 */
export declare const storeGate: {
    escapeProbe: (() => Promise<void> | null) | null;
    onFace: (() => void) | null;
    goOffline: (() => void) | null;
    lastOpenChoice: "keepMine" | "takeCloud" | "cancel" | null;
};
export declare const storeUI: StoreUI;

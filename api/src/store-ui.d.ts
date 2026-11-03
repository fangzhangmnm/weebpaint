import type { StoreUI } from "@internal/store";
import { lockSyncGate } from "./sheets.ts";
export type RenameOldAnswer = "trash" | "keep" | "cancel";
export declare function makeResolveRenameOld(gate?: typeof lockSyncGate): ({ oldName, newName, reason }: {
    oldName: string;
    newName: string;
    reason: "diverged" | "unknown-lineage";
}) => Promise<RenameOldAnswer>;
export declare const storeUI: StoreUI;

import type { RackPersistence } from "./brush-rack-controller.ts";
export type RackFormatNews = "too-new" | "newer-minor";
export declare function configureRackFormatNotice(sink: (kind: RackFormatNews) => void): void;
export declare function guardRackFormat(inner: RackPersistence): RackPersistence;

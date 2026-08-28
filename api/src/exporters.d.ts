import type { PaintingView } from "./backend/workpiece/painting-view.ts";
import type { AlphaAudit } from "./backend/algorithms/alpha-audit.ts";
import type { WatermarkRaster } from "./backend/algorithms/watermark.ts";
export interface ExportOpts {
    scope?: string;
    cropRect?: {
        x: number;
        y: number;
        w: number;
        h: number;
    } | null;
    defringe?: boolean;
    bg?: string;
    onAudit?: (a: AlphaAudit) => void;
    watermark?: WatermarkRaster;
}
export interface Exporter {
    id: string;
    label: string;
    ext: string;
    mime?: string;
    kind: "project" | "image";
    encode: (doc: PaintingView, opts?: ExportOpts) => Promise<Blob>;
    busyHint?: string;
}
export declare function registerExporter(spec: Exporter): void;
export declare function getExporter(id: string): Exporter;
export declare function listExporters(): Exporter[];
export declare function listExportersByKind(kind: string): Exporter[];

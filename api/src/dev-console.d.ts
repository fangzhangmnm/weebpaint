import { fetchOraThumbnail } from "./gallery/cloud-thumbs.ts";
import { promptPassword } from "./crypto-state.ts";
import { registerFilter, listFilters } from "./filters.ts";
import { registerExporter, listExporters } from "./exporters.ts";
declare global {
    interface Window {
        WeebPaint?: {
            fetchOraThumbnail?: typeof fetchOraThumbnail;
            cloudThumbStats?: () => unknown;
            cloudThumbResetStats?: () => void;
            cloudThumbSkipCache?: (on?: boolean) => void;
            clearCloudThumbCache?: () => Promise<number>;
            promptPassword?: (o?: Parameters<typeof promptPassword>[0]) => Promise<string | null>;
            pocFetchThumb?: (name?: string) => Promise<Blob>;
            registerFilter?: typeof registerFilter;
            listFilters?: typeof listFilters;
            registerExporter?: typeof registerExporter;
            listExporters?: typeof listExporters;
            [k: string]: unknown;
        };
    }
}
export declare function initDevConsole(): void;

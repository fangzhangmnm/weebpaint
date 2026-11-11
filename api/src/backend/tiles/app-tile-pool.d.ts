import { CpuTilePool, type TileCodec } from "./cpu-tile-pool.ts";
export declare const RAW_TILE_QUOTA_BYTES: number;
/**
 * 额度的口（CatsUp 0-3a，2026-11-11）：没压缩的图块总共能占多少，由宿主说了算（内核占多少内存归宿主管，0-3 计划里要开的口）。
 * 必须在第一次建池（第一次 appTilePool()）之前调；池已经建了再调 = 抛（额度不中途改，别让已经在池里的东西换规矩）。
 * 画画软件不调（= RAW_TILE_QUOTA_BYTES）。额度要接上压缩（setTilePoolCodec）才生效，同上面的说明。
 */
export declare function setTilePoolRawQuota(bytes: number): void;
export declare function setTilePoolLeakReporter(fn: (info: string) => void): void;
export declare function setTilePoolCodec(codec: TileCodec): void;
export declare function appTilePool(): CpuTilePool;

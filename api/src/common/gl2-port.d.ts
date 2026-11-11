import type { DirtyRect } from "./dirty-rects.ts";
export type FBOPrec = "u8" | "f16" | "f32";
export interface Gl2Caps {
    maxTextureSize: number;
    maxArrayLayers: number;
    maxTextureUnits: number;
    floatColorBuffer: boolean;
}
export interface PooledFBO {
    readonly w: number;
    readonly h: number;
    readonly prec: FBOPrec;
}
export interface Gl2Texture {
    readonly kind: "tex2d";
}
export type ExternalImage = {
    readonly gl: WebGLTexture;
    readonly w: number;
    readonly h: number;
    readonly prec: "u8";
} | {
    readonly pixels: Uint8Array | Uint8ClampedArray;
    readonly w: number;
    readonly h: number;
    readonly prec: "u8";
};
export interface ExternalTexture extends Gl2Texture {
    readonly external: true;
    readonly w: number;
    readonly h: number;
    /**
     * 这片薄层的像素在这一块里变了（画布像素坐标；一帧里可以叫好几次，内核自己记成单子；CatsUp 贴图主线 1-4d 第 6 条）。
     * 叫过一次 = 宿主说「我改了像素就报」：之后合成时，要是从上次合成到现在别的什么都没变，内核只在报过的块里重合（单子两两不相交、总面积过半就整张）。
     * 从没叫过 = 每次合成都当它整张变了（以前的样子）。说不清哪一块 = 报整张。
     * 宿主的义务：叫过之后，改了像素没报 = 那一块在显示上留着旧的，直到下一次整张合成（抬笔落层、撤销这些）；存盘不受影响（存盘的合成图永远整张重合）。
     */
    markChanged(x: number, y: number, w: number, h: number): void;
}
/** 给显卡接口用：包出来的外来薄层挂上 markChanged。 */
export declare function attachChangeLog<T extends object>(o: T): T & {
    markChanged(x: number, y: number, w: number, h: number): void;
};
/** 内核取：这片外来薄层上次取了之后报过的块（取完清空）。null = 从没报过（宿主不报 = 当它每次整张变了）。 */
export declare function takeExternalChanges(t: ExternalTexture): DirtyRect[] | null;
export type TexUploadFormat = "rgba8" | "rgba16f" | "r8" | "r32f";
export type Gl2Blend = "none" | "premult-over" | "max-alpha";
export type Gl2TexSource = Gl2Texture | PooledFBO | Gl2TileArena;
export interface Gl2DrawSpec {
    program: string;
    target: PooledFBO | "screen";
    viewport?: [number, number, number, number];
    clear?: [number, number, number, number];
    scissor?: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    rects?: readonly DirtyRect[];
    blend?: Gl2Blend;
    uniforms?: Record<string, number | boolean | number[] | Float32Array>;
    textures?: Record<string, Gl2TexSource | {
        src: Gl2TexSource;
        filter: "nearest" | "linear";
    }>;
}
export interface Gl2TileArena {
    readonly kind: "arena";
    readonly tileSize: number;
    readonly capacity: number;
    recreate(newCapacity: number): void;
    uploadSlice(slice: number, pixels: Uint8Array): void;
    copySlice(from: PooledFBO, slice: number, srcX: number, srcY: number, w: number, h: number): void;
    dispose(): void;
}
export interface Gl2Port {
    readonly caps: Gl2Caps;
    readonly isLost: boolean;
    readonly generation: number;
    onInvalidated(cb: () => void): void;
    program(name: string, vert?: string, frag?: string): void;
    warmProgram?(name: string, vert: string, frag: string): void;
    borrowFBO(w: number, h: number, prec?: FBOPrec): PooledFBO;
    returnFBO(f: PooledFBO): void;
    clearPool(): void;
    readonly fboPoolStats: {
        count: number;
        bytes: number;
    };
    fboPoolHas?(w: number, h: number, prec: FBOPrec): boolean;
    readonly fboPoolBudgetBytes?: number;
    clearFBO(f: PooledFBO, rgba: [number, number, number, number]): void;
    draw(spec: Gl2DrawSpec): void;
    drawInstanced(spec: Gl2DrawSpec, instances: Float32Array, count: number): void;
    readPixels(src: PooledFBO, x: number, y: number, w: number, h: number): Uint8Array;
    createTexture(): Gl2Texture;
    uploadTexture(tex: Gl2Texture, format: TexUploadFormat, w: number, h: number, data: ArrayBufferView): void;
    deleteTexture(tex: Gl2Texture): void;
    wrapExternal(src: ExternalImage): ExternalTexture;
    createTileArena(tileSize: number, initialSlices: number): Gl2TileArena;
    readonly arenaStats: {
        count: number;
        bytes: number;
    };
}

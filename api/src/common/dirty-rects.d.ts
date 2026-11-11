export interface DirtyRect {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
}
/** 小格边长（像素 / 格；2 的幂）。 */
export declare const DIRTY_CELL = 8;
/** 总面积超过画布的这么多 = 整张。 */
export declare const RECT_FULL_FRACTION = 0.5;
/** 一张画布（w × h）上的脏格子位图。格子边长 cell（缩小图每一级都用同样的 cell：下一级的一格 = 这一级的 2×2 格）。 */
export declare class DirtyCells {
    readonly w: number;
    readonly h: number;
    readonly cell: number;
    readonly cols: number;
    readonly rows: number;
    private readonly bits;
    private n;
    constructor(w: number, h: number, cell?: number);
    /** 标上这个方框碰到的格（夹进画布；空的不标）。 */
    mark(x: number, y: number, w: number, h: number): void;
    /** 标了几格。 */
    get count(): number;
    get empty(): boolean;
    /** 脏格盖住的像素占画布多少（边上的格只算画布里的那部分）。 */
    fraction(): number;
    /** 每行连着的脏格并成一段（夹在画布里）：两两不相交，按行、再按 x 排。 */
    runs(): DirtyRect[];
    /** 下一级缩小图（w >> 1、h >> 1，至少 1）的脏格：这一级 2×2 格或起来（同样的 cell）。 */
    half(): DirtyCells;
}
/** 一帧报来的方框 → 行段（两两不相交），或 "full"（总面积过半）。空 = []。 */
export declare function dirtyRuns(input: readonly DirtyRect[], W: number, H: number): DirtyRect[] | "full";
/** 断言：单子两两不相交（只给测试和 debug 用；O(n²)）。 */
export declare function assertDisjoint(rects: readonly DirtyRect[]): void;
/** 行段的断言（线性）：按行、再按 x 排、同一行不重叠、行带不交错。内核画之前查（违反 = 抛，不悄悄画两遍）。 */
export declare function assertRuns(runs: readonly DirtyRect[]): void;

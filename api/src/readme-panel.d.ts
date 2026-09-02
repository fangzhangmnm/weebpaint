/** 打开说明书；带 sectionId 则滚到该节并闪一下（id 见 readme-docs.ts）。 */
export declare function openReadmePanel(sectionId?: string): void;
export declare function closeReadmePanel(): void;
/** 深链：#help 或 #help/<id>。返回是否命中。 */
export declare function readmeSectionFromHash(hash: string): {
    section: string | null;
} | null;
export declare function initReadmePanel(): void;

export interface VerbSegmentTool {
    id: string;
    icon: string;
    title: string;
}
export interface VerbSegmentOpts {
    tools: () => VerbSegmentTool[];
    current: () => string;
    onPick(id: string): void;
    ariaLabel?: string;
}
export interface VerbSegmentHandle {
    el: HTMLElement;
    refresh(): void;
    dispose(): void;
}
export declare function mountVerbSegment(host: HTMLElement, o: VerbSegmentOpts): VerbSegmentHandle;

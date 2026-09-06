export interface SubTool {
    id: string;
    icon: string;
    title: string;
}
export interface SubToolSlotOpts {
    el: HTMLButtonElement;
    tools: () => SubTool[];
    current: () => string;
    onTap(): void;
    onReveal(): void;
    longPressMs?: number;
}
export interface SubToolSlotHandle {
    refresh(): void;
    reveal(): void;
    dispose(): void;
}
export declare function attachSubToolSlot(o: SubToolSlotOpts): SubToolSlotHandle;

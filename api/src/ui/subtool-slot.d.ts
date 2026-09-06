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
    onPick(id: string): void;
    longPressMs?: number;
}
export interface SubToolSlotHandle {
    refresh(): void;
    openMenu(): void;
    dispose(): void;
}
export declare function attachSubToolSlot(o: SubToolSlotOpts): SubToolSlotHandle;

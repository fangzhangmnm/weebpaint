export declare const COMPILED_WITH_VUE = "3.5.35";
/** render 函数要从 Vue 里拿的 helper（vendor/vue 完整构建全有）。 */
export declare const HELPERS: readonly string[];
export declare function brushSettingsHostRender(Vue: any): any;
export declare function brushSettingsRender(Vue: any): any;
export declare function colorWheelHostRender(Vue: any): any;
export declare function colorWheelRender(Vue: any): any;
export declare function curveEditorRender(Vue: any): any;
export declare function layersPanelRender(Vue: any): any;
export declare function layerRowRender(Vue: any): any;
export declare function leftDialRender(Vue: any): any;
export declare function rackSheetRender(Vue: any): any;
export declare function selectFieldRender(Vue: any): any;
/** 一次拿全：组件按名取 render（src/vue-render.ts 把 vendor 的 Vue 递进来）。 */
export declare function renders(Vue: any): {
    brushSettingsHost: any;
    brushSettings: any;
    colorWheelHost: any;
    colorWheel: any;
    curveEditor: any;
    layersPanel: any;
    layerRow: any;
    leftDial: any;
    rackSheet: any;
    selectField: any;
};

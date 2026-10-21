// 生成物 —— scripts/compile-vue-templates.mjs 自 src/vue-templates.ts 编译（@vue/compiler-dom 3.5.35 prod）。勿手改：改模板后 npm run build。
// 用途：组件用这些 render 函数、运行时不编译模板 = 页面 CSP 不放行 eval（总账 #89，ADR-0015）。入口 = src/vue-render.ts。
/* eslint-disable */
// @ts-nocheck
export const COMPILED_WITH_VUE = "3.5.35";
/** render 函数要从 Vue 里拿的 helper（vendor/vue 完整构建全有）。 */
export const HELPERS: readonly string[] = ["Fragment","Teleport","createBlock","createCommentVNode","createElementBlock","createElementVNode","createTextVNode","createVNode","normalizeClass","normalizeStyle","openBlock","renderList","resolveComponent","toDisplayString","vModelText","withDirectives","withModifiers"];

export function brushSettingsHostRender(Vue: any): any {
  const { resolveComponent: _resolveComponent, openBlock: _openBlock, createBlock: _createBlock, createCommentVNode: _createCommentVNode } = Vue
  
  return function render(_ctx, _cache) {
    const _component_BrushSettings = _resolveComponent("BrushSettings")
  
    return (_ctx.draft)
      ? (_openBlock(), _createBlock(_component_BrushSettings, {
          key: _ctx.draft.id,
          draft: _ctx.draft,
          "blend-modes": _ctx.blendModes,
          onDelete: _ctx.onDelete,
          onExport: _ctx.onExport
        }, null, 8 /* PROPS */, ["draft", "blend-modes", "onDelete", "onExport"]))
      : _createCommentVNode("v-if", true)
  }
}

export function brushSettingsRender(Vue: any): any {
  const { toDisplayString: _toDisplayString, createElementVNode: _createElementVNode, vModelText: _vModelText, withDirectives: _withDirectives, resolveComponent: _resolveComponent, createVNode: _createVNode, Fragment: _Fragment, openBlock: _openBlock, createElementBlock: _createElementBlock, createCommentVNode: _createCommentVNode, createTextVNode: _createTextVNode } = Vue
  
  const _hoisted_1 = { class: "brush-settings-section" }
  const _hoisted_2 = { class: "brush-settings-section-title" }
  const _hoisted_3 = { class: "brush-settings-row brush-settings-row-full" }
  const _hoisted_4 = { class: "brush-settings-row brush-settings-row-full" }
  const _hoisted_5 = { class: "brush-settings-row brush-settings-row-full" }
  const _hoisted_6 = { class: "brush-settings-row brush-settings-row-full" }
  const _hoisted_7 = { class: "brush-settings-section" }
  const _hoisted_8 = { class: "brush-settings-section-title" }
  const _hoisted_9 = { class: "brush-settings-row brush-settings-row-full" }
  const _hoisted_10 = { class: "brush-settings-row" }
  const _hoisted_11 = { class: "brush-settings-val" }
  const _hoisted_12 = { class: "brush-settings-row" }
  const _hoisted_13 = { class: "brush-settings-val" }
  const _hoisted_14 = { class: "brush-settings-row" }
  const _hoisted_15 = { class: "brush-settings-val" }
  const _hoisted_16 = { class: "brush-settings-section" }
  const _hoisted_17 = { class: "brush-settings-section-title" }
  const _hoisted_18 = { class: "brush-settings-row" }
  const _hoisted_19 = ["max", "value"]
  const _hoisted_20 = { class: "brush-settings-val" }
  const _hoisted_21 = { class: "brush-settings-row" }
  const _hoisted_22 = ["value"]
  const _hoisted_23 = { class: "brush-settings-val" }
  const _hoisted_24 = { class: "brush-settings-section" }
  const _hoisted_25 = { class: "brush-settings-section-title" }
  const _hoisted_26 = { class: "brush-settings-row" }
  const _hoisted_27 = { class: "brush-settings-val" }
  const _hoisted_28 = { class: "brush-settings-row" }
  const _hoisted_29 = { class: "brush-settings-val" }
  const _hoisted_30 = { class: "brush-settings-row" }
  const _hoisted_31 = { class: "brush-settings-val" }
  const _hoisted_32 = { class: "brush-settings-section" }
  const _hoisted_33 = { class: "brush-settings-section-title" }
  const _hoisted_34 = { class: "brush-settings-row" }
  const _hoisted_35 = { class: "brush-settings-val" }
  const _hoisted_36 = { class: "brush-settings-section" }
  const _hoisted_37 = { class: "brush-settings-section-title" }
  const _hoisted_38 = { class: "brush-settings-row" }
  const _hoisted_39 = { class: "brush-settings-val" }
  const _hoisted_40 = { class: "brush-settings-row" }
  const _hoisted_41 = { class: "brush-settings-val" }
  const _hoisted_42 = { class: "brush-settings-row" }
  const _hoisted_43 = { class: "brush-settings-val" }
  const _hoisted_44 = { class: "brush-settings-section" }
  const _hoisted_45 = { class: "brush-settings-section-title" }
  const _hoisted_46 = { class: "brush-settings-row brush-settings-row-full" }
  const _hoisted_47 = { class: "brush-settings-row brush-settings-row-full" }
  const _hoisted_48 = { class: "brush-settings-row" }
  const _hoisted_49 = { class: "brush-settings-val" }
  const _hoisted_50 = { class: "brush-settings-row brush-settings-row-full" }
  const _hoisted_51 = { class: "brush-settings-row brush-settings-row-full" }
  const _hoisted_52 = { style: {"font-size":"11px","color":"var(--ink-soft)"} }
  const _hoisted_53 = ["aria-pressed"]
  const _hoisted_54 = { class: "brush-settings-section" }
  const _hoisted_55 = { class: "brush-settings-section-title" }
  const _hoisted_56 = { class: "brush-settings-row" }
  const _hoisted_57 = ["value"]
  const _hoisted_58 = { class: "brush-settings-val" }
  const _hoisted_59 = { class: "brush-settings-section" }
  const _hoisted_60 = { class: "brush-settings-section-title" }
  const _hoisted_61 = { class: "brush-settings-row" }
  const _hoisted_62 = { class: "brush-settings-val" }
  const _hoisted_63 = { class: "brush-settings-row" }
  const _hoisted_64 = { class: "brush-settings-val" }
  const _hoisted_65 = { class: "brush-settings-row" }
  const _hoisted_66 = { class: "brush-settings-val" }
  const _hoisted_67 = { class: "brush-settings-section" }
  const _hoisted_68 = { class: "brush-settings-section" }
  
  return function render(_ctx, _cache) {
    const _component_SelectField = _resolveComponent("SelectField")
    const _component_CurveEditor = _resolveComponent("CurveEditor")
  
    return (_openBlock(), _createElementBlock("div", null, [
      _createElementVNode("div", _hoisted_1, [
        _createElementVNode("div", _hoisted_2, _toDisplayString(_ctx.L.basic), 1 /* TEXT */),
        _createElementVNode("div", _hoisted_3, [
          _createElementVNode("label", null, _toDisplayString(_ctx.L.name), 1 /* TEXT */),
          _withDirectives(_createElementVNode("input", {
            type: "text",
            "onUpdate:modelValue": _cache[0] || (_cache[0] = $event => ((_ctx.draft.name) = $event))
          }, null, 512 /* NEED_PATCH */), [
            [_vModelText, _ctx.draft.name]
          ])
        ]),
        _createElementVNode("div", _hoisted_4, [
          _createElementVNode("label", null, _toDisplayString(_ctx.L.tool), 1 /* TEXT */),
          _createVNode(_component_SelectField, {
            modelValue: _ctx.draft.tool,
            "onUpdate:modelValue": _cache[1] || (_cache[1] = $event => ((_ctx.draft.tool) = $event)),
            options: { brush: _ctx.L.toolBrush, eraser: _ctx.L.toolEraser },
            band: "modal"
          }, null, 8 /* PROPS */, ["modelValue", "options"])
        ]),
        _createElementVNode("div", _hoisted_5, [
          _createElementVNode("label", null, _toDisplayString(_ctx.L.blendMode), 1 /* TEXT */),
          _createVNode(_component_SelectField, {
            modelValue: _ctx.draft.blendMode,
            "onUpdate:modelValue": _cache[2] || (_cache[2] = $event => ((_ctx.draft.blendMode) = $event)),
            options: _ctx.blendModes,
            band: "modal"
          }, null, 8 /* PROPS */, ["modelValue", "options"])
        ]),
        _createElementVNode("div", _hoisted_6, [
          _createElementVNode("label", null, _toDisplayString(_ctx.L.folder), 1 /* TEXT */),
          _withDirectives(_createElementVNode("input", {
            type: "text",
            "onUpdate:modelValue": _cache[3] || (_cache[3] = $event => ((_ctx.draft.folder) = $event))
          }, null, 512 /* NEED_PATCH */), [
            [_vModelText, _ctx.draft.folder]
          ])
        ])
      ]),
      _createElementVNode("div", _hoisted_7, [
        _createElementVNode("div", _hoisted_8, _toDisplayString(_ctx.L.shape), 1 /* TEXT */),
        _createElementVNode("div", _hoisted_9, [
          _createElementVNode("label", null, _toDisplayString(_ctx.L.shapeKind), 1 /* TEXT */),
          _createVNode(_component_SelectField, {
            modelValue: _ctx.draft.shape.kind,
            "onUpdate:modelValue": _cache[4] || (_cache[4] = $event => ((_ctx.draft.shape.kind) = $event)),
            options: { round: _ctx.L.round, ellipse: _ctx.L.ellipse },
            band: "modal"
          }, null, 8 /* PROPS */, ["modelValue", "options"])
        ]),
        (_ctx.draft.shape.kind === 'ellipse')
          ? (_openBlock(), _createElementBlock(_Fragment, { key: 0 }, [
              _createElementVNode("div", _hoisted_10, [
                _createElementVNode("label", null, _toDisplayString(_ctx.L.aspect), 1 /* TEXT */),
                _withDirectives(_createElementVNode("input", {
                  type: "range",
                  min: "0.1",
                  max: "1",
                  step: "0.05",
                  "onUpdate:modelValue": _cache[5] || (_cache[5] = $event => ((_ctx.draft.shape.aspect) = $event))
                }, null, 512 /* NEED_PATCH */), [
                  [
                    _vModelText,
                    _ctx.draft.shape.aspect,
                    void 0,
                    { number: true }
                  ]
                ]),
                _createElementVNode("span", _hoisted_11, _toDisplayString(_ctx.draft.shape.aspect.toFixed(2)), 1 /* TEXT */)
              ]),
              _createElementVNode("div", _hoisted_12, [
                _createElementVNode("label", null, _toDisplayString(_ctx.L.rotation), 1 /* TEXT */),
                _withDirectives(_createElementVNode("input", {
                  type: "range",
                  min: "0",
                  max: "180",
                  step: "1",
                  "onUpdate:modelValue": _cache[6] || (_cache[6] = $event => ((_ctx.draft.shape.rotation) = $event))
                }, null, 512 /* NEED_PATCH */), [
                  [
                    _vModelText,
                    _ctx.draft.shape.rotation,
                    void 0,
                    { number: true }
                  ]
                ]),
                _createElementVNode("span", _hoisted_13, _toDisplayString(Math.round(_ctx.draft.shape.rotation)) + "°", 1 /* TEXT */)
              ])
            ], 64 /* STABLE_FRAGMENT */))
          : _createCommentVNode("v-if", true),
        _createElementVNode("div", _hoisted_14, [
          _createElementVNode("label", null, _toDisplayString(_ctx.L.hardness), 1 /* TEXT */),
          _withDirectives(_createElementVNode("input", {
            type: "range",
            min: "0",
            max: "1",
            step: "0.05",
            "onUpdate:modelValue": _cache[7] || (_cache[7] = $event => ((_ctx.draft.shape.hardness) = $event))
          }, null, 512 /* NEED_PATCH */), [
            [
              _vModelText,
              _ctx.draft.shape.hardness,
              void 0,
              { number: true }
            ]
          ]),
          _createElementVNode("span", _hoisted_15, _toDisplayString(_ctx.draft.shape.hardness.toFixed(2)), 1 /* TEXT */)
        ])
      ]),
      _createElementVNode("div", _hoisted_16, [
        _createElementVNode("div", _hoisted_17, _toDisplayString(_ctx.L.sizeTitle), 1 /* TEXT */),
        _createElementVNode("div", _hoisted_18, [
          _createElementVNode("label", null, _toDisplayString(_ctx.L.sizeBase), 1 /* TEXT */),
          _createElementVNode("input", {
            type: "range",
            min: "1",
            max: _ctx.draft.size.max || 200,
            step: "1",
            value: _ctx.draft.size.base,
            onInput: _cache[8] || (_cache[8] = e => _ctx.draft.size.base = _ctx.quantizeSize(+e.target.value))
          }, null, 40 /* PROPS, NEED_HYDRATION */, _hoisted_19),
          _createElementVNode("span", _hoisted_20, _toDisplayString(_ctx.draft.size.base) + " px", 1 /* TEXT */)
        ]),
        _createElementVNode("div", _hoisted_21, [
          _createElementVNode("label", null, _toDisplayString(_ctx.L.sizeMax), 1 /* TEXT */),
          _createElementVNode("input", {
            type: "range",
            min: "10",
            max: "1000",
            step: "1",
            value: _ctx.draft.size.max,
            onInput: _cache[9] || (_cache[9] = e => _ctx.draft.size.max = _ctx.quantizeSize(+e.target.value))
          }, null, 40 /* PROPS, NEED_HYDRATION */, _hoisted_22),
          _createElementVNode("span", _hoisted_23, _toDisplayString(_ctx.draft.size.max) + " px", 1 /* TEXT */)
        ])
      ]),
      _createElementVNode("div", _hoisted_24, [
        _createElementVNode("div", _hoisted_25, _toDisplayString(_ctx.L.dynamics), 1 /* TEXT */),
        _createElementVNode("div", _hoisted_26, [
          _cache[28] || (_cache[28] = _createElementVNode("label", null, "size", -1 /* CACHED */)),
          _withDirectives(_createElementVNode("input", {
            type: "range",
            min: "-1",
            max: "1",
            step: "0.05",
            "onUpdate:modelValue": _cache[10] || (_cache[10] = $event => ((_ctx.draft.sizeCoeff) = $event))
          }, null, 512 /* NEED_PATCH */), [
            [
              _vModelText,
              _ctx.draft.sizeCoeff,
              void 0,
              { number: true }
            ]
          ]),
          _createElementVNode("span", _hoisted_27, _toDisplayString(_ctx.draft.sizeCoeff.toFixed(2)), 1 /* TEXT */)
        ]),
        _createElementVNode("div", _hoisted_28, [
          _cache[29] || (_cache[29] = _createElementVNode("label", null, "opacity", -1 /* CACHED */)),
          _withDirectives(_createElementVNode("input", {
            type: "range",
            min: "-1",
            max: "1",
            step: "0.05",
            "onUpdate:modelValue": _cache[11] || (_cache[11] = $event => ((_ctx.draft.opaCoeff) = $event))
          }, null, 512 /* NEED_PATCH */), [
            [
              _vModelText,
              _ctx.draft.opaCoeff,
              void 0,
              { number: true }
            ]
          ]),
          _createElementVNode("span", _hoisted_29, _toDisplayString(_ctx.draft.opaCoeff.toFixed(2)), 1 /* TEXT */)
        ]),
        _createElementVNode("div", _hoisted_30, [
          _cache[30] || (_cache[30] = _createElementVNode("label", null, "flow", -1 /* CACHED */)),
          _withDirectives(_createElementVNode("input", {
            type: "range",
            min: "-1",
            max: "1",
            step: "0.05",
            "onUpdate:modelValue": _cache[12] || (_cache[12] = $event => ((_ctx.draft.flowCoeff) = $event))
          }, null, 512 /* NEED_PATCH */), [
            [
              _vModelText,
              _ctx.draft.flowCoeff,
              void 0,
              { number: true }
            ]
          ]),
          _createElementVNode("span", _hoisted_31, _toDisplayString(_ctx.draft.flowCoeff.toFixed(2)), 1 /* TEXT */)
        ])
      ]),
      _createElementVNode("div", _hoisted_32, [
        _createElementVNode("div", _hoisted_33, _toDisplayString(_ctx.L.defaults), 1 /* TEXT */),
        _createElementVNode("div", _hoisted_34, [
          _createElementVNode("label", null, _toDisplayString(_ctx.L.defaultOpa), 1 /* TEXT */),
          _withDirectives(_createElementVNode("input", {
            type: "range",
            min: "0",
            max: "1",
            step: "0.05",
            "onUpdate:modelValue": _cache[13] || (_cache[13] = $event => ((_ctx.draft.defaultOpa) = $event))
          }, null, 512 /* NEED_PATCH */), [
            [
              _vModelText,
              _ctx.draft.defaultOpa,
              void 0,
              { number: true }
            ]
          ]),
          _createElementVNode("span", _hoisted_35, _toDisplayString(Math.round(_ctx.draft.defaultOpa*100)) + "%", 1 /* TEXT */)
        ])
      ]),
      _createElementVNode("div", _hoisted_36, [
        _createElementVNode("div", _hoisted_37, _toDisplayString(_ctx.L.smooth), 1 /* TEXT */),
        _createElementVNode("div", _hoisted_38, [
          _cache[31] || (_cache[31] = _createElementVNode("label", null, "streamline", -1 /* CACHED */)),
          _withDirectives(_createElementVNode("input", {
            type: "range",
            min: "0",
            max: "1",
            step: "0.05",
            "onUpdate:modelValue": _cache[14] || (_cache[14] = $event => ((_ctx.draft.smooth.streamline) = $event))
          }, null, 512 /* NEED_PATCH */), [
            [
              _vModelText,
              _ctx.draft.smooth.streamline,
              void 0,
              { number: true }
            ]
          ]),
          _createElementVNode("span", _hoisted_39, _toDisplayString(_ctx.draft.smooth.streamline.toFixed(2)), 1 /* TEXT */)
        ]),
        _createElementVNode("div", _hoisted_40, [
          _cache[32] || (_cache[32] = _createElementVNode("label", null, "stabilization", -1 /* CACHED */)),
          _withDirectives(_createElementVNode("input", {
            type: "range",
            min: "0",
            max: "1",
            step: "0.05",
            "onUpdate:modelValue": _cache[15] || (_cache[15] = $event => ((_ctx.draft.smooth.stabilization) = $event))
          }, null, 512 /* NEED_PATCH */), [
            [
              _vModelText,
              _ctx.draft.smooth.stabilization,
              void 0,
              { number: true }
            ]
          ]),
          _createElementVNode("span", _hoisted_41, _toDisplayString(_ctx.draft.smooth.stabilization.toFixed(2)), 1 /* TEXT */)
        ]),
        _createElementVNode("div", _hoisted_42, [
          _cache[33] || (_cache[33] = _createElementVNode("label", null, "pressure LPF", -1 /* CACHED */)),
          _withDirectives(_createElementVNode("input", {
            type: "range",
            min: "0",
            max: "200",
            step: "5",
            "onUpdate:modelValue": _cache[16] || (_cache[16] = $event => ((_ctx.draft.pressureLPF) = $event))
          }, null, 512 /* NEED_PATCH */), [
            [
              _vModelText,
              _ctx.draft.pressureLPF,
              void 0,
              { number: true }
            ]
          ]),
          _createElementVNode("span", _hoisted_43, _toDisplayString(Math.round(_ctx.draft.pressureLPF)) + " ms", 1 /* TEXT */)
        ])
      ]),
      _createElementVNode("div", _hoisted_44, [
        _createElementVNode("div", _hoisted_45, _toDisplayString(_ctx.L.advanced), 1 /* TEXT */),
        _createElementVNode("div", _hoisted_46, [
          _createElementVNode("label", null, _toDisplayString(_ctx.L.composite), 1 /* TEXT */),
          _createVNode(_component_SelectField, {
            modelValue: _ctx.draft.compositeMode,
            "onUpdate:modelValue": _cache[17] || (_cache[17] = $event => ((_ctx.draft.compositeMode) = $event)),
            options: { wash: _ctx.L.wash, buildup: _ctx.L.buildup },
            band: "modal"
          }, null, 8 /* PROPS */, ["modelValue", "options"])
        ]),
        (_ctx.draft.pressureCurve)
          ? (_openBlock(), _createElementBlock(_Fragment, { key: 0 }, [
              _createElementVNode("div", _hoisted_47, [
                _createElementVNode("label", null, _toDisplayString(_ctx.L.pressureCurve), 1 /* TEXT */),
                _createElementVNode("button", {
                  type: "button",
                  class: "brush-rack-action",
                  style: {"justify-self":"end"},
                  onClick: _cache[18] || (_cache[18] = (...args) => (_ctx.dropCurve && _ctx.dropCurve(...args)))
                }, _toDisplayString(_ctx.L.useGamma), 1 /* TEXT */)
              ]),
              _createVNode(_component_CurveEditor, {
                curve: _ctx.draft.pressureCurve
              }, null, 8 /* PROPS */, ["curve"])
            ], 64 /* STABLE_FRAGMENT */))
          : (_openBlock(), _createElementBlock(_Fragment, { key: 1 }, [
              _createElementVNode("div", _hoisted_48, [
                _cache[34] || (_cache[34] = _createElementVNode("label", null, "pressureGamma", -1 /* CACHED */)),
                _withDirectives(_createElementVNode("input", {
                  type: "range",
                  min: "0.2",
                  max: "3",
                  step: "0.05",
                  "onUpdate:modelValue": _cache[19] || (_cache[19] = $event => ((_ctx.draft.pressureGamma) = $event))
                }, null, 512 /* NEED_PATCH */), [
                  [
                    _vModelText,
                    _ctx.draft.pressureGamma,
                    void 0,
                    { number: true }
                  ]
                ]),
                _createElementVNode("span", _hoisted_49, _toDisplayString(_ctx.draft.pressureGamma.toFixed(2)), 1 /* TEXT */)
              ]),
              _createElementVNode("div", _hoisted_50, [
                _createElementVNode("label", null, _toDisplayString(_ctx.L.pressureCurve), 1 /* TEXT */),
                _createElementVNode("button", {
                  type: "button",
                  class: "brush-rack-action",
                  style: {"justify-self":"end"},
                  onClick: _cache[20] || (_cache[20] = (...args) => (_ctx.useCurve && _ctx.useCurve(...args)))
                }, _toDisplayString(_ctx.L.useCurve), 1 /* TEXT */)
              ])
            ], 64 /* STABLE_FRAGMENT */)),
        _createElementVNode("div", _hoisted_51, [
          _createElementVNode("label", null, [
            _cache[35] || (_cache[35] = _createTextVNode("pixelMode", -1 /* CACHED */)),
            _cache[36] || (_cache[36] = _createElementVNode("br", null, null, -1 /* CACHED */)),
            _createElementVNode("span", _hoisted_52, _toDisplayString(_ctx.L.pixelModeHelp), 1 /* TEXT */)
          ]),
          _createElementVNode("button", {
            type: "button",
            class: "brush-rack-action",
            style: {"justify-self":"end"},
            "aria-pressed": _ctx.draft.pixelMode,
            onClick: _cache[21] || (_cache[21] = $event => (_ctx.draft.pixelMode = !_ctx.draft.pixelMode))
          }, _toDisplayString(_ctx.draft.pixelMode ? _ctx.L.on : _ctx.L.off), 9 /* TEXT, PROPS */, _hoisted_53)
        ])
      ]),
      _createElementVNode("div", _hoisted_54, [
        _createElementVNode("div", _hoisted_55, _toDisplayString(_ctx.L.spacingTitle), 1 /* TEXT */),
        _createElementVNode("div", _hoisted_56, [
          _createElementVNode("label", null, _toDisplayString(_ctx.L.spacing), 1 /* TEXT */),
          _createElementVNode("input", {
            type: "range",
            min: "1",
            max: "200",
            step: "1",
            value: Math.round(_ctx.draft.spacing*100),
            onInput: _cache[22] || (_cache[22] = e => _ctx.draft.spacing = (+e.target.value)/100)
          }, null, 40 /* PROPS, NEED_HYDRATION */, _hoisted_57),
          _createElementVNode("span", _hoisted_58, _toDisplayString(Math.round(_ctx.draft.spacing*100)) + "%", 1 /* TEXT */)
        ])
      ]),
      _createElementVNode("div", _hoisted_59, [
        _createElementVNode("div", _hoisted_60, _toDisplayString(_ctx.L.taper), 1 /* TEXT */),
        _createElementVNode("div", _hoisted_61, [
          _createElementVNode("label", null, _toDisplayString(_ctx.L.taperIn), 1 /* TEXT */),
          _withDirectives(_createElementVNode("input", {
            type: "range",
            min: "0",
            max: "5",
            step: "0.1",
            "onUpdate:modelValue": _cache[23] || (_cache[23] = $event => ((_ctx.draft.taper.in) = $event))
          }, null, 512 /* NEED_PATCH */), [
            [
              _vModelText,
              _ctx.draft.taper.in,
              void 0,
              { number: true }
            ]
          ]),
          _createElementVNode("span", _hoisted_62, _toDisplayString(_ctx.draft.taper.in.toFixed(1)), 1 /* TEXT */)
        ]),
        _createElementVNode("div", _hoisted_63, [
          _createElementVNode("label", null, _toDisplayString(_ctx.L.taperOut), 1 /* TEXT */),
          _withDirectives(_createElementVNode("input", {
            type: "range",
            min: "0",
            max: "5",
            step: "0.1",
            "onUpdate:modelValue": _cache[24] || (_cache[24] = $event => ((_ctx.draft.taper.out) = $event))
          }, null, 512 /* NEED_PATCH */), [
            [
              _vModelText,
              _ctx.draft.taper.out,
              void 0,
              { number: true }
            ]
          ]),
          _createElementVNode("span", _hoisted_64, _toDisplayString(_ctx.draft.taper.out.toFixed(1)), 1 /* TEXT */)
        ]),
        _createElementVNode("div", _hoisted_65, [
          _createElementVNode("label", null, _toDisplayString(_ctx.L.taperFloor), 1 /* TEXT */),
          _withDirectives(_createElementVNode("input", {
            type: "range",
            min: "0",
            max: "1",
            step: "0.05",
            "onUpdate:modelValue": _cache[25] || (_cache[25] = $event => ((_ctx.draft.taperFloor) = $event))
          }, null, 512 /* NEED_PATCH */), [
            [
              _vModelText,
              _ctx.draft.taperFloor,
              void 0,
              { number: true }
            ]
          ]),
          _createElementVNode("span", _hoisted_66, _toDisplayString(_ctx.draft.taperFloor.toFixed(2)), 1 /* TEXT */)
        ])
      ]),
      _createElementVNode("div", _hoisted_67, [
        _createElementVNode("button", {
          type: "button",
          class: "brush-rack-action",
          onClick: _cache[26] || (_cache[26] = $event => (_ctx.$emit('export')))
        }, _toDisplayString(_ctx.L.exportBrush), 1 /* TEXT */)
      ]),
      _createElementVNode("div", _hoisted_68, [
        _createElementVNode("button", {
          type: "button",
          class: "brush-rack-action",
          style: {"background":"rgba(220,38,38,0.1)","color":"#dc2626","border-color":"#dc2626"},
          onClick: _cache[27] || (_cache[27] = $event => (_ctx.$emit('delete')))
        }, _toDisplayString(_ctx.L.deleteBrush), 1 /* TEXT */)
      ])
    ]))
  }
}

export function colorWheelHostRender(Vue: any): any {
  const { resolveComponent: _resolveComponent, openBlock: _openBlock, createBlock: _createBlock } = Vue
  
  return function render(_ctx, _cache) {
    const _component_ColorWheel = _resolveComponent("ColorWheel")
  
    return (_openBlock(), _createBlock(_component_ColorWheel, {
      color: _ctx.color,
      onPick: _ctx.onPick,
      onPickRequest: _ctx.onPickRequest
    }, null, 8 /* PROPS */, ["color", "onPick", "onPickRequest"]))
  }
}

export function colorWheelRender(Vue: any): any {
  const { createElementVNode: _createElementVNode, normalizeStyle: _normalizeStyle, Fragment: _Fragment, openBlock: _openBlock, createElementBlock: _createElementBlock } = Vue
  
  const _hoisted_1 = ["aria-label"]
  const _hoisted_2 = ["aria-label", "aria-valuenow"]
  const _hoisted_3 = { class: "picker-row" }
  const _hoisted_4 = ["value"]
  const _hoisted_5 = ["title", "aria-label"]
  
  return function render(_ctx, _cache) {
    return (_openBlock(), _createElementBlock(_Fragment, null, [
      _createElementVNode("canvas", {
        ref: "pad",
        class: "sv-pad",
        width: "240",
        height: "180",
        "aria-label": _ctx.L.svPad
      }, null, 8 /* PROPS */, _hoisted_1),
      _createElementVNode("div", {
        ref: "hueEl",
        class: "hue-slider ramp-slider",
        role: "slider",
        tabindex: "0",
        "aria-label": _ctx.L.hue,
        "aria-valuenow": _ctx.hueDeg,
        "aria-valuemin": "0",
        "aria-valuemax": "360",
        onKeydown: _cache[0] || (_cache[0] = (...args) => (_ctx.onHueKey && _ctx.onHueKey(...args)))
      }, [
        _createElementVNode("div", {
          class: "ramp-slider-thumb",
          style: _normalizeStyle({ left: (_ctx.hsv.h / 360 * 100) + '%' })
        }, null, 4 /* STYLE */)
      ], 40 /* PROPS, NEED_HYDRATION */, _hoisted_2),
      _createElementVNode("div", _hoisted_3, [
        _createElementVNode("span", {
          class: "picker-preview",
          style: _normalizeStyle({ background: _ctx.hex })
        }, null, 4 /* STYLE */),
        _createElementVNode("input", {
          ref: "hexInput",
          type: "text",
          maxlength: "24",
          value: _ctx.hexText,
          onKeydown: _cache[1] || (_cache[1] = (...args) => (_ctx.onHexKey && _ctx.onHexKey(...args))),
          onBlur: _cache[2] || (_cache[2] = (...args) => (_ctx.onHexBlur && _ctx.onHexBlur(...args))),
          onDblclick: _cache[3] || (_cache[3] = (...args) => (_ctx.onHexDblClick && _ctx.onHexDblClick(...args))),
          "aria-label": "HEX"
        }, null, 40 /* PROPS, NEED_HYDRATION */, _hoisted_4),
        _createElementVNode("button", {
          class: "cw-pick",
          type: "button",
          title: _ctx.L.pick,
          "aria-label": _ctx.L.pick,
          onClick: _cache[4] || (_cache[4] = $event => (_ctx.$emit('pickRequest')))
        }, [...(_cache[5] || (_cache[5] = [
          _createElementVNode("svg", {
            viewBox: "0 0 24 24",
            "aria-hidden": "true"
          }, [
            _createElementVNode("use", { href: "#eyedropper" })
          ], -1 /* CACHED */)
        ]))], 8 /* PROPS */, _hoisted_5)
      ])
    ], 64 /* STABLE_FRAGMENT */))
  }
}

export function curveEditorRender(Vue: any): any {
  const { openBlock: _openBlock, createElementBlock: _createElementBlock } = Vue
  
  const _hoisted_1 = {
    ref: "host",
    class: "brush-settings-curve"
  }
  
  return function render(_ctx, _cache) {
    return (_openBlock(), _createElementBlock("div", _hoisted_1, null, 512 /* NEED_PATCH */))
  }
}

export function layersPanelRender(Vue: any): any {
  const { renderList: _renderList, Fragment: _Fragment, openBlock: _openBlock, createElementBlock: _createElementBlock, resolveComponent: _resolveComponent, createBlock: _createBlock } = Vue
  
  return function render(_ctx, _cache) {
    const _component_LayerRow = _resolveComponent("LayerRow")
  
    return (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.rows, (r) => {
      return (_openBlock(), _createBlock(_component_LayerRow, {
        key: r.layer.id,
        layer: r.layer,
        depth: r.depth,
        "is-group": r.isGroup,
        collapsed: r.collapsed,
        "child-leaf-count": r.childLeafCount,
        active: r.active,
        "is-ref": r.isRef,
        expanded: _ctx.layersUi.expandedId === r.layer.id,
        "menu-open": _ctx.layersUi.menuId === r.layer.id,
        renaming: _ctx.layersUi.renameId === r.layer.id,
        "can-up": r.canUp,
        "can-down": r.canDown,
        "can-del": r.canDel,
        "can-duplicate": r.canDuplicate,
        "can-merge-down": r.canMergeDown,
        "has-px": r.hasPx,
        "can-move-out": r.canMoveOut,
        "move-targets": r.moveTargets
      }, null, 8 /* PROPS */, ["layer", "depth", "is-group", "collapsed", "child-leaf-count", "active", "is-ref", "expanded", "menu-open", "renaming", "can-up", "can-down", "can-del", "can-duplicate", "can-merge-down", "has-px", "can-move-out", "move-targets"]))
    }), 128 /* KEYED_FRAGMENT */))
  }
}

export function layerRowRender(Vue: any): any {
  const { normalizeClass: _normalizeClass, createElementVNode: _createElementVNode, openBlock: _openBlock, createElementBlock: _createElementBlock, createCommentVNode: _createCommentVNode, withModifiers: _withModifiers, toDisplayString: _toDisplayString, createTextVNode: _createTextVNode, Teleport: _Teleport, createBlock: _createBlock, normalizeStyle: _normalizeStyle, Fragment: _Fragment } = Vue
  
  const _hoisted_1 = ["data-layer-id"]
  const _hoisted_2 = ["title", "innerHTML"]
  const _hoisted_3 = ["title", "innerHTML"]
  const _hoisted_4 = ["value"]
  const _hoisted_5 = {
    key: 0,
    class: "layer-group-count"
  }
  const _hoisted_6 = ["title"]
  const _hoisted_7 = ["title"]
  const _hoisted_8 = ["title"]
  const _hoisted_9 = ["title"]
  const _hoisted_10 = ["title"]
  const _hoisted_11 = { class: "menu-item-label" }
  const _hoisted_12 = ["disabled"]
  const _hoisted_13 = { class: "menu-item-label" }
  const _hoisted_14 = {
    key: 0,
    class: "menu-sep"
  }
  const _hoisted_15 = { class: "menu-item-label" }
  const _hoisted_16 = { class: "menu-item-label" }
  const _hoisted_17 = { class: "menu-item-label" }
  const _hoisted_18 = { class: "menu-item-label" }
  const _hoisted_19 = ["aria-pressed"]
  const _hoisted_20 = { class: "menu-item-label" }
  const _hoisted_21 = { class: "menu-item-state" }
  const _hoisted_22 = ["aria-pressed"]
  const _hoisted_23 = { class: "menu-item-label" }
  const _hoisted_24 = { class: "menu-item-state" }
  const _hoisted_25 = ["aria-pressed"]
  const _hoisted_26 = { class: "menu-item-label" }
  const _hoisted_27 = { class: "menu-item-state" }
  const _hoisted_28 = ["disabled"]
  const _hoisted_29 = { class: "menu-item-label" }
  const _hoisted_30 = ["disabled"]
  const _hoisted_31 = { class: "menu-item-label" }
  const _hoisted_32 = ["disabled"]
  const _hoisted_33 = { class: "menu-item-label" }
  const _hoisted_34 = ["disabled"]
  const _hoisted_35 = { class: "menu-item-label" }
  const _hoisted_36 = { class: "layer-slider-row" }
  const _hoisted_37 = ["title"]
  const _hoisted_38 = ["value"]
  const _hoisted_39 = { class: "layer-slider-val" }
  const _hoisted_40 = { class: "layer-slider-row" }
  
  return function render(_ctx, _cache) {
    return (_openBlock(), _createElementBlock(_Fragment, null, [
      _createElementVNode("div", {
        class: _normalizeClass(["layer-row", { active: _ctx.active, clipping: _ctx.layer.clippingMask, reference: _ctx.isRef, 'layer-group-row': _ctx.isGroup, 'layer-nested': _ctx.depth > 0 }]),
        style: _normalizeStyle({ marginLeft: _ctx.railPad + 'px' }),
        "data-layer-id": String(_ctx.layer.id),
        onClick: _cache[23] || (_cache[23] = (...args) => (_ctx.onRowClick && _ctx.onRowClick(...args)))
      }, [
        _createElementVNode("button", {
          type: "button",
          class: _normalizeClass(["layer-vis", { 'hidden-icon': !_ctx.layer.visible }]),
          title: _ctx.layer.visible ? _ctx.L.visible : _ctx.L.hidden,
          onClick: _cache[0] || (_cache[0] = (...args) => (_ctx.vis && _ctx.vis(...args))),
          innerHTML: _ctx.layer.visible ? _ctx.EYE_OPEN : _ctx.EYE_OFF
        }, null, 10 /* CLASS, PROPS */, _hoisted_2),
        (_ctx.isGroup)
          ? (_openBlock(), _createElementBlock("button", {
              key: 0,
              type: "button",
              class: "layer-folder",
              title: _ctx.collapsed ? _ctx.L.expandGroup : _ctx.L.collapseGroup,
              onClick: _cache[1] || (_cache[1] = (...args) => (_ctx.toggleCollapse && _ctx.toggleCollapse(...args))),
              innerHTML: _ctx.collapsed ? _ctx.FOLDER_CLOSED : _ctx.FOLDER_OPEN
            }, null, 8 /* PROPS */, _hoisted_3))
          : _createCommentVNode("v-if", true),
        (_ctx.renaming)
          ? (_openBlock(), _createElementBlock("input", {
              key: 1,
              type: "text",
              class: "layer-name-input",
              value: _ctx.layer.name,
              onClick: _cache[2] || (_cache[2] = _withModifiers(() => {}, ["stop"])),
              onBlur: _cache[3] || (_cache[3] = (...args) => (_ctx.onRenameCommit && _ctx.onRenameCommit(...args))),
              onKeydown: _cache[4] || (_cache[4] = (...args) => (_ctx.onRenameKey && _ctx.onRenameKey(...args)))
            }, null, 40 /* PROPS, NEED_HYDRATION */, _hoisted_4))
          : (_openBlock(), _createElementBlock("span", {
              key: 2,
              class: "layer-name",
              onClick: _cache[5] || (_cache[5] = (...args) => (_ctx.onNameClick && _ctx.onNameClick(...args)))
            }, [
              _createTextVNode(_toDisplayString(_ctx.layer.name), 1 /* TEXT */),
              (_ctx.isGroup && _ctx.collapsed)
                ? (_openBlock(), _createElementBlock("span", _hoisted_5, " (" + _toDisplayString(_ctx.childLeafCount) + ")", 1 /* TEXT */))
                : _createCommentVNode("v-if", true)
            ])),
        (_ctx.layer.clippingMask)
          ? (_openBlock(), _createElementBlock("span", {
              key: 3,
              class: "layer-clip-chip",
              title: _ctx.L.clippedTip
            }, [...(_cache[31] || (_cache[31] = [
              _createElementVNode("svg", {
                viewBox: "0 0 24 24",
                "aria-hidden": "true"
              }, [
                _createElementVNode("use", { href: "#clipping-mask" })
              ], -1 /* CACHED */)
            ]))], 8 /* PROPS */, _hoisted_6))
          : _createCommentVNode("v-if", true),
        (!_ctx.isGroup && _ctx.layer.lockAlpha)
          ? (_openBlock(), _createElementBlock("span", {
              key: 4,
              class: "layer-lock-chip",
              title: _ctx.L.lockAlphaTip
            }, [...(_cache[32] || (_cache[32] = [
              _createElementVNode("svg", {
                viewBox: "0 0 24 24",
                width: "13",
                height: "13",
                "aria-hidden": "true"
              }, [
                _createElementVNode("use", { href: "#lock-alpha" })
              ], -1 /* CACHED */)
            ]))], 8 /* PROPS */, _hoisted_7))
          : _createCommentVNode("v-if", true),
        (_ctx.isRef)
          ? (_openBlock(), _createElementBlock("span", {
              key: 5,
              class: "layer-ref-chip",
              title: _ctx.L.refTip
            }, [...(_cache[33] || (_cache[33] = [
              _createElementVNode("svg", {
                viewBox: "0 0 24 24",
                "aria-hidden": "true"
              }, [
                _createElementVNode("use", { href: "#reference-layer" })
              ], -1 /* CACHED */)
            ]))], 8 /* PROPS */, _hoisted_8))
          : _createCommentVNode("v-if", true),
        _createElementVNode("button", {
          type: "button",
          ref: "menuBtn",
          class: "layer-tools-btn",
          title: _ctx.L.layerMenu,
          onClick: _cache[6] || (_cache[6] = (...args) => (_ctx.toggleMenu && _ctx.toggleMenu(...args)))
        }, [...(_cache[34] || (_cache[34] = [
          _createElementVNode("svg", {
            viewBox: "0 0 24 24",
            "aria-hidden": "true"
          }, [
            _createElementVNode("use", { href: "#more" })
          ], -1 /* CACHED */)
        ]))], 8 /* PROPS */, _hoisted_9),
        _createElementVNode("button", {
          type: "button",
          ref: "badgeBtn",
          class: _normalizeClass(["layer-mode-badge", { active: _ctx.expanded }]),
          title: _ctx.badgeTitle,
          onClick: _cache[7] || (_cache[7] = (...args) => (_ctx.toggleBadge && _ctx.toggleBadge(...args)))
        }, _toDisplayString(_ctx.modeBadge), 11 /* TEXT, CLASS, PROPS */, _hoisted_10),
        (_openBlock(), _createBlock(_Teleport, { to: "body" }, [
          (_ctx.menuOpen)
            ? (_openBlock(), _createElementBlock("div", {
                key: 0,
                ref: "menuEl",
                class: "menu-panel layer-tools-popup",
                onClick: _cache[22] || (_cache[22] = _withModifiers(() => {}, ["stop"]))
              }, [
                _createElementVNode("button", {
                  class: "menu-item menu-item-with-icon",
                  type: "button",
                  onClick: _cache[8] || (_cache[8] = $event => (_ctx.act('rename')))
                }, [
                  _cache[35] || (_cache[35] = _createElementVNode("svg", {
                    viewBox: "0 0 24 24",
                    "aria-hidden": "true"
                  }, [
                    _createElementVNode("use", { href: "#rename" })
                  ], -1 /* CACHED */)),
                  _createElementVNode("span", _hoisted_11, _toDisplayString(_ctx.L.rename), 1 /* TEXT */)
                ]),
                _createElementVNode("button", {
                  class: "menu-item menu-item-with-icon",
                  type: "button",
                  disabled: !_ctx.canDuplicate,
                  onClick: _cache[9] || (_cache[9] = $event => (_ctx.act('duplicate')))
                }, [
                  _cache[36] || (_cache[36] = _createElementVNode("svg", {
                    viewBox: "0 0 24 24",
                    "aria-hidden": "true"
                  }, [
                    _createElementVNode("use", { href: "#copy" })
                  ], -1 /* CACHED */)),
                  _createElementVNode("span", _hoisted_13, _toDisplayString(_ctx.L.duplicate), 1 /* TEXT */)
                ], 8 /* PROPS */, _hoisted_12),
                (_ctx.isGroup || _ctx.moveTargets.length || _ctx.canMoveOut)
                  ? (_openBlock(), _createElementBlock("hr", _hoisted_14))
                  : _createCommentVNode("v-if", true),
                (_ctx.isGroup)
                  ? (_openBlock(), _createElementBlock("button", {
                      key: 1,
                      class: "menu-item menu-item-with-icon",
                      type: "button",
                      onClick: _cache[10] || (_cache[10] = $event => (_ctx.act('ungroup')))
                    }, [
                      _cache[37] || (_cache[37] = _createElementVNode("svg", {
                        viewBox: "0 0 24 24",
                        "aria-hidden": "true"
                      }, [
                        _createElementVNode("use", { href: "#explode-folder" })
                      ], -1 /* CACHED */)),
                      _createElementVNode("span", _hoisted_15, _toDisplayString(_ctx.L.ungroup), 1 /* TEXT */)
                    ]))
                  : _createCommentVNode("v-if", true),
                (_ctx.isGroup)
                  ? (_openBlock(), _createElementBlock("button", {
                      key: 2,
                      class: "menu-item menu-item-with-icon",
                      type: "button",
                      onClick: _cache[11] || (_cache[11] = $event => (_ctx.act('collapseToLayer')))
                    }, [
                      _cache[38] || (_cache[38] = _createElementVNode("svg", {
                        viewBox: "0 0 24 24",
                        "aria-hidden": "true"
                      }, [
                        _createElementVNode("use", { href: "#merge-layers" })
                      ], -1 /* CACHED */)),
                      _createElementVNode("span", _hoisted_16, _toDisplayString(_ctx.L.collapseToLayer), 1 /* TEXT */)
                    ]))
                  : _createCommentVNode("v-if", true),
                (_ctx.moveTargets.length)
                  ? (_openBlock(), _createElementBlock("label", {
                      key: 3,
                      class: "menu-item layer-move-into menu-item-with-icon",
                      onClick: _cache[13] || (_cache[13] = _withModifiers(() => {}, ["stop"]))
                    }, [
                      _cache[39] || (_cache[39] = _createElementVNode("svg", {
                        viewBox: "0 0 24 24",
                        "aria-hidden": "true"
                      }, [
                        _createElementVNode("use", { href: "#move-to-folder" })
                      ], -1 /* CACHED */)),
                      _createElementVNode("span", _hoisted_17, _toDisplayString(_ctx.L.moveIntoGroup), 1 /* TEXT */),
                      _createElementVNode("button", {
                        ref: "moveBtn",
                        type: "button",
                        class: "layer-move-select select-field",
                        onClick: _cache[12] || (_cache[12] = _withModifiers(() => {}, ["stop"]))
                      }, null, 512 /* NEED_PATCH */)
                    ]))
                  : _createCommentVNode("v-if", true),
                (_ctx.canMoveOut)
                  ? (_openBlock(), _createElementBlock("button", {
                      key: 4,
                      class: "menu-item menu-item-with-icon",
                      type: "button",
                      onClick: _cache[14] || (_cache[14] = $event => (_ctx.act('moveOut')))
                    }, [
                      _cache[40] || (_cache[40] = _createElementVNode("svg", {
                        viewBox: "0 0 24 24",
                        "aria-hidden": "true"
                      }, [
                        _createElementVNode("use", { href: "#move-out-folder" })
                      ], -1 /* CACHED */)),
                      _createElementVNode("span", _hoisted_18, _toDisplayString(_ctx.L.moveOut), 1 /* TEXT */)
                    ]))
                  : _createCommentVNode("v-if", true),
                _cache[48] || (_cache[48] = _createElementVNode("hr", { class: "menu-sep" }, null, -1 /* CACHED */)),
                (!_ctx.isGroup)
                  ? (_openBlock(), _createElementBlock("button", {
                      key: 5,
                      class: "menu-item layer-menu-toggle",
                      type: "button",
                      role: "menuitemcheckbox",
                      "aria-pressed": _ctx.layer.lockAlpha ? 'true' : 'false',
                      onClick: _cache[15] || (_cache[15] = (...args) => (_ctx.toggleLock && _ctx.toggleLock(...args)))
                    }, [
                      _cache[41] || (_cache[41] = _createElementVNode("svg", {
                        viewBox: "0 0 24 24",
                        "aria-hidden": "true"
                      }, [
                        _createElementVNode("use", { href: "#lock-alpha" })
                      ], -1 /* CACHED */)),
                      _createElementVNode("span", _hoisted_20, _toDisplayString(_ctx.L.lockAlpha), 1 /* TEXT */),
                      _createElementVNode("span", _hoisted_21, _toDisplayString(_ctx.layer.lockAlpha ? _ctx.L.on : _ctx.L.off), 1 /* TEXT */)
                    ], 8 /* PROPS */, _hoisted_19))
                  : _createCommentVNode("v-if", true),
                _createElementVNode("button", {
                  class: "menu-item layer-menu-toggle",
                  type: "button",
                  role: "menuitemcheckbox",
                  "aria-pressed": _ctx.layer.clippingMask ? 'true' : 'false',
                  onClick: _cache[16] || (_cache[16] = (...args) => (_ctx.toggleClip && _ctx.toggleClip(...args)))
                }, [
                  _cache[42] || (_cache[42] = _createElementVNode("svg", {
                    viewBox: "0 0 24 24",
                    "aria-hidden": "true"
                  }, [
                    _createElementVNode("use", { href: "#clipping-mask" })
                  ], -1 /* CACHED */)),
                  _createElementVNode("span", _hoisted_23, _toDisplayString(_ctx.isGroup ? _ctx.L.clipGroup : _ctx.L.clip), 1 /* TEXT */),
                  _createElementVNode("span", _hoisted_24, _toDisplayString(_ctx.layer.clippingMask ? _ctx.L.on : _ctx.L.off), 1 /* TEXT */)
                ], 8 /* PROPS */, _hoisted_22),
                (!_ctx.isGroup)
                  ? (_openBlock(), _createElementBlock("button", {
                      key: 6,
                      class: "menu-item layer-menu-toggle",
                      type: "button",
                      role: "menuitemcheckbox",
                      "aria-pressed": _ctx.isRef ? 'true' : 'false',
                      onClick: _cache[17] || (_cache[17] = (...args) => (_ctx.toggleRef && _ctx.toggleRef(...args)))
                    }, [
                      _cache[43] || (_cache[43] = _createElementVNode("svg", {
                        viewBox: "0 0 24 24",
                        "aria-hidden": "true"
                      }, [
                        _createElementVNode("use", { href: "#reference-layer" })
                      ], -1 /* CACHED */)),
                      _createElementVNode("span", _hoisted_26, _toDisplayString(_ctx.L.refLayer), 1 /* TEXT */),
                      _createElementVNode("span", _hoisted_27, _toDisplayString(_ctx.isRef ? _ctx.L.on : _ctx.L.off), 1 /* TEXT */)
                    ], 8 /* PROPS */, _hoisted_25))
                  : _createCommentVNode("v-if", true),
                _cache[49] || (_cache[49] = _createElementVNode("hr", { class: "menu-sep" }, null, -1 /* CACHED */)),
                (!_ctx.isGroup)
                  ? (_openBlock(), _createElementBlock("button", {
                      key: 7,
                      class: "menu-item menu-item-with-icon",
                      type: "button",
                      disabled: !_ctx.canMergeDown,
                      onClick: _cache[18] || (_cache[18] = $event => (_ctx.act('mergeDown')))
                    }, [
                      _cache[44] || (_cache[44] = _createElementVNode("svg", {
                        viewBox: "0 0 24 24",
                        "aria-hidden": "true"
                      }, [
                        _createElementVNode("use", { href: "#merge-layer-down" })
                      ], -1 /* CACHED */)),
                      _createElementVNode("span", _hoisted_29, _toDisplayString(_ctx.L.mergeDown), 1 /* TEXT */)
                    ], 8 /* PROPS */, _hoisted_28))
                  : _createCommentVNode("v-if", true),
                (!_ctx.isGroup)
                  ? (_openBlock(), _createElementBlock("button", {
                      key: 8,
                      class: "menu-item menu-item-with-icon",
                      type: "button",
                      disabled: !_ctx.hasPx,
                      onClick: _cache[19] || (_cache[19] = $event => (_ctx.act('explodeColors')))
                    }, [
                      _cache[45] || (_cache[45] = _createElementVNode("svg", {
                        viewBox: "0 0 24 24",
                        "aria-hidden": "true"
                      }, [
                        _createElementVNode("use", { href: "#separate-colors" })
                      ], -1 /* CACHED */)),
                      _createElementVNode("span", _hoisted_31, _toDisplayString(_ctx.L.explodeColors), 1 /* TEXT */)
                    ], 8 /* PROPS */, _hoisted_30))
                  : _createCommentVNode("v-if", true),
                (!_ctx.isGroup)
                  ? (_openBlock(), _createElementBlock("button", {
                      key: 9,
                      class: "menu-item menu-item-with-icon",
                      type: "button",
                      disabled: !_ctx.hasPx,
                      onClick: _cache[20] || (_cache[20] = $event => (_ctx.act('clear')))
                    }, [
                      _cache[46] || (_cache[46] = _createElementVNode("svg", {
                        viewBox: "0 0 24 24",
                        "aria-hidden": "true"
                      }, [
                        _createElementVNode("use", { href: "#clear-document" })
                      ], -1 /* CACHED */)),
                      _createElementVNode("span", _hoisted_33, _toDisplayString(_ctx.L.clearContent), 1 /* TEXT */)
                    ], 8 /* PROPS */, _hoisted_32))
                  : _createCommentVNode("v-if", true),
                _createElementVNode("button", {
                  class: "menu-item menu-danger menu-item-with-icon",
                  type: "button",
                  disabled: !_ctx.canDel,
                  onClick: _cache[21] || (_cache[21] = $event => (_ctx.act('del')))
                }, [
                  _cache[47] || (_cache[47] = _createElementVNode("svg", {
                    viewBox: "0 0 24 24",
                    "aria-hidden": "true"
                  }, [
                    _createElementVNode("use", { href: "#trash-can" })
                  ], -1 /* CACHED */)),
                  _createElementVNode("span", _hoisted_35, _toDisplayString(_ctx.isGroup ? _ctx.L.delGroup : _ctx.L.del), 1 /* TEXT */)
                ], 8 /* PROPS */, _hoisted_34)
              ], 512 /* NEED_PATCH */))
            : _createCommentVNode("v-if", true)
        ]))
      ], 14 /* CLASS, STYLE, PROPS */, _hoisted_1),
      (_openBlock(), _createBlock(_Teleport, { to: "body" }, [
        (_ctx.expanded)
          ? (_openBlock(), _createElementBlock("div", {
              key: 0,
              ref: "adjEl",
              class: "menu-panel layer-adjust-popup hidden",
              onClick: _cache[30] || (_cache[30] = _withModifiers(() => {}, ["stop"]))
            }, [
              _createElementVNode("label", _hoisted_36, [
                _createElementVNode("span", {
                  class: "layer-slider-icon",
                  title: _ctx.L.opa
                }, [...(_cache[50] || (_cache[50] = [
                  _createElementVNode("svg", {
                    viewBox: "0 0 24 24",
                    "aria-hidden": "true"
                  }, [
                    _createElementVNode("use", { href: "#opacity" })
                  ], -1 /* CACHED */)
                ]))], 8 /* PROPS */, _hoisted_37),
                _createElementVNode("input", {
                  type: "range",
                  min: "0",
                  max: "100",
                  value: _ctx.opacityPct,
                  onInput: _cache[24] || (_cache[24] = (...args) => (_ctx.opaInput && _ctx.opaInput(...args))),
                  onChange: _cache[25] || (_cache[25] = (...args) => (_ctx.opaCommit && _ctx.opaCommit(...args))),
                  onPointerup: _cache[26] || (_cache[26] = (...args) => (_ctx.opaCommit && _ctx.opaCommit(...args))),
                  onPointercancel: _cache[27] || (_cache[27] = (...args) => (_ctx.opaCommit && _ctx.opaCommit(...args))),
                  onClick: _cache[28] || (_cache[28] = _withModifiers(() => {}, ["stop"]))
                }, null, 40 /* PROPS, NEED_HYDRATION */, _hoisted_38),
                _createElementVNode("span", _hoisted_39, _toDisplayString(_ctx.opacityPct), 1 /* TEXT */)
              ]),
              _createElementVNode("label", _hoisted_40, [
                _createElementVNode("span", null, _toDisplayString(_ctx.L.mode), 1 /* TEXT */),
                _createElementVNode("button", {
                  ref: "modeBtn",
                  type: "button",
                  class: "select-field layer-mode-select",
                  style: {"grid-column":"span 2"},
                  onClick: _cache[29] || (_cache[29] = _withModifiers(() => {}, ["stop"]))
                }, null, 512 /* NEED_PATCH */)
              ])
            ], 512 /* NEED_PATCH */))
          : _createCommentVNode("v-if", true)
      ]))
    ], 64 /* STABLE_FRAGMENT */))
  }
}

export function leftDialRender(Vue: any): any {
  const { createElementVNode: _createElementVNode, openBlock: _openBlock, createElementBlock: _createElementBlock, normalizeStyle: _normalizeStyle, toDisplayString: _toDisplayString, normalizeClass: _normalizeClass, Fragment: _Fragment } = Vue
  
  const _hoisted_1 = ["max", "value", "disabled", "aria-label"]
  const _hoisted_2 = ["title", "aria-label", "aria-pressed"]
  const _hoisted_3 = {
    viewBox: "0 0 24 24",
    width: "20",
    height: "20",
    "aria-hidden": "true"
  }
  const _hoisted_4 = ["href"]
  const _hoisted_5 = { class: "size-popup-circle-frame" }
  const _hoisted_6 = { class: "size-popup-text" }
  const _hoisted_7 = ["value", "disabled", "aria-label"]
  const _hoisted_8 = ["title"]
  
  return function render(_ctx, _cache) {
    return (_openBlock(), _createElementBlock(_Fragment, null, [
      _createElementVNode("input", {
        ref: "sizeSlider",
        id: "sizeSlider",
        class: "left-sidebar-slider",
        type: "range",
        min: "0",
        max: _ctx.sizePosMax,
        step: "1",
        value: _ctx.sizePos,
        disabled: !_ctx.canDraw,
        orient: "vertical",
        "aria-label": _ctx.L.size,
        onInput: _cache[0] || (_cache[0] = (...args) => (_ctx.onSizeInput && _ctx.onSizeInput(...args)))
      }, null, 40 /* PROPS, NEED_HYDRATION */, _hoisted_1),
      _cache[7] || (_cache[7] = _createElementVNode("span", {
        class: "left-sidebar-label",
        "aria-hidden": "true"
      }, [
        _createElementVNode("svg", {
          viewBox: "0 0 24 24",
          width: "14",
          height: "14",
          "aria-hidden": "true"
        }, [
          _createElementVNode("use", { href: "#brush-width" })
        ])
      ], -1 /* CACHED */)),
      _createElementVNode("button", {
        class: "left-sidebar-brush left-sidebar-pick",
        id: "leftPick",
        type: "button",
        title: _ctx.pickTitle,
        "aria-label": _ctx.pickTitle,
        "aria-pressed": _ctx.picking ? 'true' : 'false',
        onPointerdown: _cache[1] || (_cache[1] = (...args) => (_ctx.pickDown && _ctx.pickDown(...args))),
        onPointerup: _cache[2] || (_cache[2] = (...args) => (_ctx.pickUp && _ctx.pickUp(...args))),
        onPointercancel: _cache[3] || (_cache[3] = (...args) => (_ctx.pickUp && _ctx.pickUp(...args))),
        onClick: _cache[4] || (_cache[4] = (...args) => (_ctx.pickClick && _ctx.pickClick(...args)))
      }, [
        (_openBlock(), _createElementBlock("svg", _hoisted_3, [
          _createElementVNode("use", {
            href: '#' + _ctx.pickIcon
          }, null, 8 /* PROPS */, _hoisted_4)
        ]))
      ], 40 /* PROPS, NEED_HYDRATION */, _hoisted_2),
      _createElementVNode("div", {
        class: _normalizeClass(["size-popup", { hidden: !_ctx.popup.visible }]),
        style: _normalizeStyle({ left: _ctx.popup.left + 'px', top: _ctx.popup.top + 'px' }),
        "aria-hidden": "true"
      }, [
        _createElementVNode("div", _hoisted_5, [
          _createElementVNode("div", {
            class: "size-popup-circle",
            style: _normalizeStyle({ width: _ctx.popup.dia + 'px', height: _ctx.popup.dia + 'px', opacity: _ctx.popup.opacity })
          }, null, 4 /* STYLE */)
        ]),
        _createElementVNode("span", _hoisted_6, _toDisplayString(_ctx.popup.text), 1 /* TEXT */)
      ], 6 /* CLASS, STYLE */),
      _createElementVNode("input", {
        ref: "opaSlider",
        id: "opacitySlider",
        class: "left-sidebar-slider",
        type: "range",
        min: "1",
        max: "100",
        step: "1",
        value: _ctx.opaPct,
        disabled: !_ctx.canDraw,
        orient: "vertical",
        "aria-label": _ctx.L.opacity,
        onInput: _cache[5] || (_cache[5] = (...args) => (_ctx.onOpaInput && _ctx.onOpaInput(...args)))
      }, null, 40 /* PROPS, NEED_HYDRATION */, _hoisted_7),
      _createElementVNode("span", {
        class: "left-sidebar-label",
        title: _ctx.L.opacity,
        "aria-hidden": "true"
      }, [...(_cache[6] || (_cache[6] = [
        _createElementVNode("svg", {
          viewBox: "0 0 24 24",
          width: "14",
          height: "14",
          "aria-hidden": "true"
        }, [
          _createElementVNode("use", { href: "#opacity" })
        ], -1 /* CACHED */)
      ]))], 8 /* PROPS */, _hoisted_8)
    ], 64 /* STABLE_FRAGMENT */))
  }
}

export function rackSheetRender(Vue: any): any {
  const { toDisplayString: _toDisplayString, createElementVNode: _createElementVNode, createTextVNode: _createTextVNode, openBlock: _openBlock, createElementBlock: _createElementBlock, createCommentVNode: _createCommentVNode, Fragment: _Fragment, renderList: _renderList, normalizeStyle: _normalizeStyle, withModifiers: _withModifiers } = Vue
  
  const _hoisted_1 = {
    key: 0,
    class: "brush-rack-grid"
  }
  const _hoisted_2 = { style: {"padding":"20px","text-align":"center","color":"var(--ink-soft)"} }
  const _hoisted_3 = { class: "brush-rack-grid" }
  const _hoisted_4 = { style: {"padding":"20px","text-align":"center","color":"var(--ink-soft)"} }
  const _hoisted_5 = { class: "brush-rack-folders" }
  const _hoisted_6 = ["aria-pressed", "onClick"]
  const _hoisted_7 = { class: "brush-rack-grid" }
  const _hoisted_8 = ["aria-pressed", "onClick"]
  const _hoisted_9 = { class: "brush-rack-tile-name" }
  const _hoisted_10 = ["title", "onClick"]
  
  return function render(_ctx, _cache) {
    return (_ctx.rackEmpty)
      ? (_openBlock(), _createElementBlock("div", _hoisted_1, [
          _createElementVNode("div", _hoisted_2, [
            _createTextVNode(_toDisplayString(_ctx.L.rackEmpty), 1 /* TEXT */),
            _cache[1] || (_cache[1] = _createElementVNode("br", null, null, -1 /* CACHED */)),
            _cache[2] || (_cache[2] = _createElementVNode("br", null, null, -1 /* CACHED */)),
            _createElementVNode("button", {
              class: "brush-rack-action",
              onClick: _cache[0] || (_cache[0] = $event => (_ctx.reset()))
            }, _toDisplayString(_ctx.L.resetRack), 1 /* TEXT */)
          ])
        ]))
      : (!_ctx.brushes.length)
        ? (_openBlock(), _createElementBlock(_Fragment, { key: 1 }, [
            _cache[3] || (_cache[3] = _createElementVNode("div", { class: "brush-rack-folders" }, null, -1 /* CACHED */)),
            _createElementVNode("div", _hoisted_3, [
              _createElementVNode("div", _hoisted_4, _toDisplayString(_ctx.L.empty), 1 /* TEXT */)
            ])
          ], 64 /* STABLE_FRAGMENT */))
        : (_openBlock(), _createElementBlock(_Fragment, { key: 2 }, [
            _createElementVNode("div", _hoisted_5, [
              (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.folders, (f) => {
                return (_openBlock(), _createElementBlock("button", {
                  key: f,
                  type: "button",
                  class: "brush-rack-folder",
                  "aria-pressed": f === _ctx.effectiveFolder,
                  onClick: $event => (_ctx.selectFolder(f))
                }, _toDisplayString(_ctx.folderLabel(f)), 9 /* TEXT, PROPS */, _hoisted_6))
              }), 128 /* KEYED_FRAGMENT */))
            ]),
            _createElementVNode("div", _hoisted_7, [
              (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.tiles, (b) => {
                return (_openBlock(), _createElementBlock("div", {
                  key: b.id,
                  class: "brush-rack-tile",
                  role: "button",
                  tabindex: 0,
                  "aria-pressed": b.id === _ctx.activeId,
                  onClick: $event => (_ctx.selectBrush(b.id))
                }, [
                  _createElementVNode("div", {
                    class: "brush-rack-tile-preview",
                    style: _normalizeStyle(_ctx.tileStyle(b))
                  }, null, 4 /* STYLE */),
                  _createElementVNode("span", _hoisted_9, _toDisplayString(b.name), 1 /* TEXT */),
                  _createElementVNode("button", {
                    type: "button",
                    class: "brush-rack-tile-edit",
                    title: _ctx.L.edit,
                    onClick: _withModifiers($event => (_ctx.editBrush(b.id)), ["stop"])
                  }, [...(_cache[4] || (_cache[4] = [
                    _createElementVNode("svg", {
                      viewBox: "0 0 24 24",
                      "aria-hidden": "true"
                    }, [
                      _createElementVNode("use", { href: "#more" })
                    ], -1 /* CACHED */)
                  ]))], 8 /* PROPS */, _hoisted_10)
                ], 8 /* PROPS */, _hoisted_8))
              }), 128 /* KEYED_FRAGMENT */))
            ])
          ], 64 /* STABLE_FRAGMENT */))
  }
}

export function selectFieldRender(Vue: any): any {
  const { openBlock: _openBlock, createElementBlock: _createElementBlock } = Vue
  
  const _hoisted_1 = ["disabled"]
  
  return function render(_ctx, _cache) {
    return (_openBlock(), _createElementBlock("button", {
      ref: "btn",
      type: "button",
      class: "select-field",
      disabled: _ctx.disabled
    }, null, 8 /* PROPS */, _hoisted_1))
  }
}

/** 一次拿全：组件按名取 render（src/vue-render.ts 把 vendor 的 Vue 递进来）。 */
export function renders(Vue: any) {
  return {
    brushSettingsHost: brushSettingsHostRender(Vue),
    brushSettings: brushSettingsRender(Vue),
    colorWheelHost: colorWheelHostRender(Vue),
    colorWheel: colorWheelRender(Vue),
    curveEditor: curveEditorRender(Vue),
    layersPanel: layersPanelRender(Vue),
    layerRow: layerRowRender(Vue),
    leftDial: leftDialRender(Vue),
    rackSheet: rackSheetRender(Vue),
    selectField: selectFieldRender(Vue),
  };
}

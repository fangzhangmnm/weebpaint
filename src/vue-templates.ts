// Vue 模板的 SSoT（#89，2026-10-21 by Claude Fable 5.1）：本仓 Vue 组件的模板字符串全住这里，构建时 scripts/compile-vue-templates.mjs
//   用 @vue/compiler-dom（版本 = vendor/vue 的运行时版本）编成 render 函数 → src/vue-templates.compiled.ts（生成物进仓，守卫测试盯它不过期），
//   组件通过 src/vue-render.ts 拿 `render:`。运行时不再编译模板 = 页面 CSP 不放行 'unsafe-eval'（index.html；test/csp-guard.test.mjs）。
//   做法照 @internal/gallery 0.8.4（ai-docs/20261017-0.8.4-precompiled-templates.md）。改模板 → npm run build 重生。
//   ⚠ 组件里不准再写 `template:`（test/vue-templates-compiled.test.mjs 结构守卫）：写了 = 运行时 new Function = 被 CSP 拦、组件空白。
//   ⚠ 本文件只在构建时被 node import（不进 bundle）：模板串里的 ${} 只准引用本文件内的常量（下面 brush-settings 的几个 class 名）。
//   模板原来各住各的组件文件旁（rack-sheet / layers-panel / color-wheel / brush-config-view / select-field / left-dial），改模板时对照组件 setup 返回的绑定名。

// brush-settings 表单里的 class 名（原 ui/brush-config-view.ts 顶部；只有模板用）
const SECTION = "brush-settings-section";
const TITLE = "brush-settings-section-title";
const ROW = "brush-settings-row";
const ROW_FULL = "brush-settings-row brush-settings-row-full";
const VAL = "brush-settings-val";

export const RACK_SHEET_TEMPLATE = `
      <div v-if="rackEmpty" class="brush-rack-grid">
        <div style="padding:20px;text-align:center;color:var(--ink-soft);">
          {{ L.rackEmpty }}<br><br>
          <button class="brush-rack-action" @click="reset()">{{ L.resetRack }}</button>
        </div>
      </div>
      <template v-else-if="!brushes.length">
        <div class="brush-rack-folders"></div>
        <div class="brush-rack-grid">
          <div style="padding:20px;text-align:center;color:var(--ink-soft);">{{ L.empty }}</div>
        </div>
      </template>
      <template v-else>
        <div class="brush-rack-folders">
          <button v-for="f in folders" :key="f" type="button" class="brush-rack-folder"
            :aria-pressed="f === effectiveFolder" @click="selectFolder(f)">{{ folderLabel(f) }}</button>
        </div>
        <div class="brush-rack-grid">
          <div v-for="b in tiles" :key="b.id" class="brush-rack-tile" role="button" :tabindex="0"
            :aria-pressed="b.id === activeId" @click="selectBrush(b.id)">
            <div class="brush-rack-tile-preview" :style="tileStyle(b)"></div>
            <span class="brush-rack-tile-name">{{ b.name }}</span>
            <button type="button" class="brush-rack-tile-edit" :title="L.edit" @click.stop="editBrush(b.id)"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#more"/></svg></button>
          </div>
        </div>
      </template>
    `;
export const LAYERS_PANEL_TEMPLATE = `
    <template v-for="r in rows" :key="r.layer.id">
      <LayerRow
        :layer="r.layer"
        :depth="r.depth"
        :is-group="r.isGroup"
        :collapsed="r.collapsed"
        :child-leaf-count="r.childLeafCount"
        :active="r.active"
        :is-ref="r.isRef"
        :expanded="layersUi.expandedId === r.layer.id"
        :menu-open="layersUi.menuId === r.layer.id"
        :renaming="layersUi.renameId === r.layer.id"
        :can-up="r.canUp" :can-down="r.canDown" :can-del="r.canDel"
        :can-duplicate="r.canDuplicate" :can-merge-down="r.canMergeDown" :has-px="r.hasPx"
        :can-move-out="r.canMoveOut" :move-targets="r.moveTargets"
      />
    </template>
  `;
export const LAYER_ROW_TEMPLATE = `
    <div
      class="layer-row"
      :class="{ active, clipping: layer.clippingMask, reference: isRef, 'layer-group-row': isGroup, 'layer-nested': depth > 0 }"
      :style="{ marginLeft: railPad + 'px' }"
      :data-layer-id="String(layer.id)"
      @click="onRowClick"
    >
      <!-- 眼睛**始终第一**（组/叶都是）→ 眼睛列对齐，组不再有误导性缩进。 -->
      <button type="button" class="layer-vis" :class="{ 'hidden-icon': !layer.visible }"
        :title="layer.visible ? L.visible : L.hidden"
        @click="vis"
        v-html="layer.visible ? EYE_OPEN : EYE_OFF"></button>

      <!-- 组：文件夹图标点击折叠（去三角），排在眼睛之后。叶不显。不缩进，组内层靠 .layer-nested 左竖条标归属。 -->
      <button v-if="isGroup" type="button" class="layer-folder" :title="collapsed ? L.expandGroup : L.collapseGroup"
        @click="toggleCollapse" v-html="collapsed ? FOLDER_CLOSED : FOLDER_OPEN"></button>

      <input v-if="renaming" type="text" class="layer-name-input" :value="layer.name"
        @click.stop @blur="onRenameCommit" @keydown="onRenameKey" />
      <span v-else class="layer-name" @click="onNameClick">{{ layer.name }}<span v-if="isGroup && collapsed" class="layer-group-count"> ({{ childLeafCount }})</span></span>

      <span v-if="layer.clippingMask" class="layer-clip-chip" :title="L.clippedTip"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#clipping-mask"/></svg></span>
      <!-- v0.5.8：锁α chip 用 #lock-alpha（不透明度锁）而非通用 #lock——与 ⋯ 菜单 toggle 同图形 -->
      <span v-if="!isGroup && layer.lockAlpha" class="layer-lock-chip" :title="L.lockAlphaTip">
        <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><use href="#lock-alpha"/></svg>
      </span>
      <!-- 参考层 chip：SVG（#reference-layer），不用语言相关的文字图标（家族规则；旧「参/R」已废） -->
      <span v-if="isRef" class="layer-ref-chip" :title="L.refTip"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#reference-layer"/></svg></span>

      <button type="button" ref="menuBtn" class="layer-tools-btn" :title="L.layerMenu" @click="toggleMenu"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#more"/></svg></button>

      <button type="button" ref="badgeBtn" class="layer-mode-badge" :class="{ active: expanded }"
        :title="badgeTitle" @click="toggleBadge">{{ modeBadge }}</button>

      <Teleport to="body"><div v-if="menuOpen" ref="menuEl" class="menu-panel layer-tools-popup" @click.stop>
        <button class="menu-item menu-item-with-icon" type="button" @click="act('rename')"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#rename"/></svg><span class="menu-item-label">{{ L.rename }}</span></button>

        <!-- 复制（叶+组皆可；组=递归深拷，disabled 按叶数预算） -->
        <button class="menu-item menu-item-with-icon" type="button" :disabled="!canDuplicate" @click="act('duplicate')"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#copy"/></svg><span class="menu-item-label">{{ L.duplicate }}</span></button>

        <!-- 图层组 reparent：解组（仅组）/ 移入某组（dropdown，不挤占菜单空间）/ 移出组。编组 = 「+」里新建空组 -->
        <hr class="menu-sep" v-if="isGroup || moveTargets.length || canMoveOut" />
        <button v-if="isGroup" class="menu-item menu-item-with-icon" type="button" @click="act('ungroup')"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#explode-folder"/></svg><span class="menu-item-label">{{ L.ungroup }}</span></button>
        <button v-if="isGroup" class="menu-item menu-item-with-icon" type="button" @click="act('collapseToLayer')"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#merge-layers"/></svg><span class="menu-item-label">{{ L.collapseToLayer }}</span></button>
        <label v-if="moveTargets.length" class="menu-item layer-move-into menu-item-with-icon" @click.stop><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#move-to-folder"/></svg><span class="menu-item-label">{{ L.moveIntoGroup }}</span>
          <button ref="moveBtn" type="button" class="layer-move-select select-field" @click.stop></button>
        </label>
        <button v-if="canMoveOut" class="menu-item menu-item-with-icon" type="button" @click="act('moveOut')"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#move-out-folder"/></svg><span class="menu-item-label">{{ L.moveOut }}</span></button>

        <hr class="menu-sep" />
        <!-- v267 (user)：层属性 toggle 收进 ⋯ 菜单（点了不关菜单，可连续切） -->
        <button v-if="!isGroup" class="menu-item layer-menu-toggle" type="button" role="menuitemcheckbox" :aria-pressed="layer.lockAlpha ? 'true' : 'false'" @click="toggleLock"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#lock-alpha"/></svg><span class="menu-item-label">{{ L.lockAlpha }}</span><span class="menu-item-state">{{ layer.lockAlpha ? L.on : L.off }}</span></button>
        <button class="menu-item layer-menu-toggle" type="button" role="menuitemcheckbox" :aria-pressed="layer.clippingMask ? 'true' : 'false'" @click="toggleClip"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#clipping-mask"/></svg><span class="menu-item-label">{{ isGroup ? L.clipGroup : L.clip }}</span><span class="menu-item-state">{{ layer.clippingMask ? L.on : L.off }}</span></button>
        <button v-if="!isGroup" class="menu-item layer-menu-toggle" type="button" role="menuitemcheckbox" :aria-pressed="isRef ? 'true' : 'false'" @click="toggleRef"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#reference-layer"/></svg><span class="menu-item-label">{{ L.refLayer }}</span><span class="menu-item-state">{{ isRef ? L.on : L.off }}</span></button>

        <hr class="menu-sep" />
        <button v-if="!isGroup" class="menu-item menu-item-with-icon" type="button" :disabled="!canMergeDown" @click="act('mergeDown')"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#merge-layer-down"/></svg><span class="menu-item-label">{{ L.mergeDown }}</span></button>
        <button v-if="!isGroup" class="menu-item menu-item-with-icon" type="button" :disabled="!hasPx" @click="act('explodeColors')"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#separate-colors"/></svg><span class="menu-item-label">{{ L.explodeColors }}</span></button>
        <button v-if="!isGroup" class="menu-item menu-item-with-icon" type="button" :disabled="!hasPx" @click="act('clear')"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#clear-document"/></svg><span class="menu-item-label">{{ L.clearContent }}</span></button>
        <button class="menu-item menu-danger menu-item-with-icon" type="button" :disabled="!canDel" @click="act('del')"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#trash-can"/></svg><span class="menu-item-label">{{ isGroup ? L.delGroup : L.del }}</span></button>
      </div></Teleport>
    </div>

    <!-- 调整弹层（2026-09-11）：Teleport 到 body（逃出面板 backdrop-filter 包含块，与 ⋯ 菜单同理），popup-menu 收养定位/关闭纪律 -->
    <Teleport to="body"><div v-if="expanded" ref="adjEl" class="menu-panel layer-adjust-popup hidden" @click.stop>
      <label class="layer-slider-row">
        <span class="layer-slider-icon" :title="L.opa"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#opacity"/></svg></span>
        <input type="range" min="0" max="100" :value="opacityPct"
          @input="opaInput" @change="opaCommit" @pointerup="opaCommit" @pointercancel="opaCommit" @click.stop />
        <span class="layer-slider-val">{{ opacityPct }}</span>
      </label>
      <label class="layer-slider-row">
        <span>{{ L.mode }}</span>
        <button ref="modeBtn" type="button" class="select-field layer-mode-select" style="grid-column: span 2;" @click.stop></button>
      </label>
      <!-- v267 (user)：剪裁 / 锁α / 参考 toggle 已收进 ⋯ 菜单，这里只留 透明度 + 模式 -->
    </div></Teleport>
  `;
export const COLOR_WHEEL_HOST_TEMPLATE = `<ColorWheel :color="color" @pick="onPick" @pick-request="onPickRequest" />`;
export const COLOR_WHEEL_TEMPLATE = `
    <canvas ref="pad" class="sv-pad" width="240" height="180" :aria-label="L.svPad"></canvas>
    <div ref="hueEl" class="hue-slider ramp-slider" role="slider" tabindex="0" :aria-label="L.hue"
      :aria-valuenow="hueDeg" aria-valuemin="0" aria-valuemax="360" @keydown="onHueKey">
      <div class="ramp-slider-thumb" :style="{ left: (hsv.h / 360 * 100) + '%' }"></div>
    </div>
    <div class="picker-row">
      <span class="picker-preview" :style="{ background: hex }"></span>
      <input ref="hexInput" type="text" maxlength="24" :value="hexText" @keydown="onHexKey" @blur="onHexBlur"
        @dblclick="onHexDblClick" aria-label="HEX" />
      <button class="cw-pick" type="button" :title="L.pick" :aria-label="L.pick" @click="$emit('pickRequest')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#eyedropper"/></svg>
      </button>
    </div>
  `;
export const BRUSH_SETTINGS_HOST_TEMPLATE = `<BrushSettings v-if="draft" :key="draft.id" :draft="draft" :blend-modes="blendModes" @delete="onDelete" @export="onExport" />`;
export const BRUSH_SETTINGS_TEMPLATE = `
  <div>
    <!-- 基本 -->
    <div class="${SECTION}">
      <div class="${TITLE}">{{ L.basic }}</div>
      <div class="${ROW_FULL}"><label>{{ L.name }}</label><input type="text" v-model="draft.name"></div>
      <div class="${ROW_FULL}"><label>{{ L.tool }}</label>
        <SelectField v-model="draft.tool" :options="{ brush: L.toolBrush, eraser: L.toolEraser }" band="modal" />
      </div>
      <div class="${ROW_FULL}"><label>{{ L.blendMode }}</label>
        <SelectField v-model="draft.blendMode" :options="blendModes" band="modal" />
      </div>
      <div class="${ROW_FULL}"><label>{{ L.folder }}</label><input type="text" v-model="draft.folder"></div>
    </div>

    <!-- 形状 -->
    <div class="${SECTION}">
      <div class="${TITLE}">{{ L.shape }}</div>
      <div class="${ROW_FULL}"><label>{{ L.shapeKind }}</label>
        <SelectField v-model="draft.shape.kind" :options="{ round: L.round, ellipse: L.ellipse }" band="modal" />
      </div>
      <template v-if="draft.shape.kind === 'ellipse'">
        <div class="${ROW}"><label>{{ L.aspect }}</label><input type="range" min="0.1" max="1" step="0.05" v-model.number="draft.shape.aspect"><span class="${VAL}">{{ draft.shape.aspect.toFixed(2) }}</span></div>
        <div class="${ROW}"><label>{{ L.rotation }}</label><input type="range" min="0" max="180" step="1" v-model.number="draft.shape.rotation"><span class="${VAL}">{{ Math.round(draft.shape.rotation) }}°</span></div>
      </template>
      <div class="${ROW}"><label>{{ L.hardness }}</label><input type="range" min="0" max="1" step="0.05" v-model.number="draft.shape.hardness"><span class="${VAL}">{{ draft.shape.hardness.toFixed(2) }}</span></div>
    </div>

    <!-- 粗细 -->
    <div class="${SECTION}">
      <div class="${TITLE}">{{ L.sizeTitle }}</div>
      <div class="${ROW}"><label>{{ L.sizeBase }}</label><input type="range" min="1" :max="draft.size.max || 200" step="1" :value="draft.size.base" @input="e => draft.size.base = quantizeSize(+e.target.value)"><span class="${VAL}">{{ draft.size.base }} px</span></div>
      <div class="${ROW}"><label>{{ L.sizeMax }}</label><input type="range" min="10" max="1000" step="1" :value="draft.size.max" @input="e => draft.size.max = quantizeSize(+e.target.value)"><span class="${VAL}">{{ draft.size.max }} px</span></div>
    </div>

    <!-- 压感 dynamics -->
    <div class="${SECTION}">
      <div class="${TITLE}">{{ L.dynamics }}</div>
      <div class="${ROW}"><label>size</label><input type="range" min="-1" max="1" step="0.05" v-model.number="draft.sizeCoeff"><span class="${VAL}">{{ draft.sizeCoeff.toFixed(2) }}</span></div>
      <div class="${ROW}"><label>opacity</label><input type="range" min="-1" max="1" step="0.05" v-model.number="draft.opaCoeff"><span class="${VAL}">{{ draft.opaCoeff.toFixed(2) }}</span></div>
      <div class="${ROW}"><label>flow</label><input type="range" min="-1" max="1" step="0.05" v-model.number="draft.flowCoeff"><span class="${VAL}">{{ draft.flowCoeff.toFixed(2) }}</span></div>
    </div>

    <!-- 默认值 -->
    <div class="${SECTION}">
      <div class="${TITLE}">{{ L.defaults }}</div>
      <div class="${ROW}"><label>{{ L.defaultOpa }}</label><input type="range" min="0" max="1" step="0.05" v-model.number="draft.defaultOpa"><span class="${VAL}">{{ Math.round(draft.defaultOpa*100) }}%</span></div>
    </div>

    <!-- 笔画平滑 -->
    <div class="${SECTION}">
      <div class="${TITLE}">{{ L.smooth }}</div>
      <div class="${ROW}"><label>streamline</label><input type="range" min="0" max="1" step="0.05" v-model.number="draft.smooth.streamline"><span class="${VAL}">{{ draft.smooth.streamline.toFixed(2) }}</span></div>
      <div class="${ROW}"><label>stabilization</label><input type="range" min="0" max="1" step="0.05" v-model.number="draft.smooth.stabilization"><span class="${VAL}">{{ draft.smooth.stabilization.toFixed(2) }}</span></div>
      <div class="${ROW}"><label>pressure LPF</label><input type="range" min="0" max="200" step="5" v-model.number="draft.pressureLPF"><span class="${VAL}">{{ Math.round(draft.pressureLPF) }} ms</span></div>
    </div>

    <!-- 高级 -->
    <div class="${SECTION}">
      <div class="${TITLE}">{{ L.advanced }}</div>
      <div class="${ROW_FULL}"><label>{{ L.composite }}</label>
        <SelectField v-model="draft.compositeMode" :options="{ wash: L.wash, buildup: L.buildup }" band="modal" />
      </div>
      <!-- 压感曲线（2026-09-05 批 4，user 0830「压感同意用anim-curve」）：有曲线 → 编辑器替代 gamma 行；无 → gamma 滑条 + 「改用曲线」 -->
      <template v-if="draft.pressureCurve">
        <div class="${ROW_FULL}"><label>{{ L.pressureCurve }}</label><button type="button" class="brush-rack-action" style="justify-self:end;" @click="dropCurve">{{ L.useGamma }}</button></div>
        <CurveEditor :curve="draft.pressureCurve" />
      </template>
      <template v-else>
        <div class="${ROW}"><label>pressureGamma</label><input type="range" min="0.2" max="3" step="0.05" v-model.number="draft.pressureGamma"><span class="${VAL}">{{ draft.pressureGamma.toFixed(2) }}</span></div>
        <div class="${ROW_FULL}"><label>{{ L.pressureCurve }}</label><button type="button" class="brush-rack-action" style="justify-self:end;" @click="useCurve">{{ L.useCurve }}</button></div>
      </template>
      <div class="${ROW_FULL}">
        <label>pixelMode<br><span style="font-size:11px;color:var(--ink-soft);">{{ L.pixelModeHelp }}</span></label>
        <button type="button" class="brush-rack-action" style="justify-self:end;" :aria-pressed="draft.pixelMode" @click="draft.pixelMode = !draft.pixelMode">{{ draft.pixelMode ? L.on : L.off }}</button>
      </div>
    </div>

    <!-- 间距 -->
    <div class="${SECTION}">
      <div class="${TITLE}">{{ L.spacingTitle }}</div>
      <div class="${ROW}"><label>{{ L.spacing }}</label><input type="range" min="1" max="200" step="1" :value="Math.round(draft.spacing*100)" @input="e => draft.spacing = (+e.target.value)/100"><span class="${VAL}">{{ Math.round(draft.spacing*100) }}%</span></div>
    </div>

    <!-- 收尾 taper -->
    <div class="${SECTION}">
      <div class="${TITLE}">{{ L.taper }}</div>
      <div class="${ROW}"><label>{{ L.taperIn }}</label><input type="range" min="0" max="5" step="0.1" v-model.number="draft.taper.in"><span class="${VAL}">{{ draft.taper.in.toFixed(1) }}</span></div>
      <div class="${ROW}"><label>{{ L.taperOut }}</label><input type="range" min="0" max="5" step="0.1" v-model.number="draft.taper.out"><span class="${VAL}">{{ draft.taper.out.toFixed(1) }}</span></div>
      <!-- taperFloor：收尾包络能压到的最低压感系数。1 = 不收（taper 失效），0 = 收到全无。
           v415 接线时才发现它一直没有 UI —— 存了、同步了，却没人能改。 -->
      <div class="${ROW}"><label>{{ L.taperFloor }}</label><input type="range" min="0" max="1" step="0.05" v-model.number="draft.taperFloor"><span class="${VAL}">{{ draft.taperFloor.toFixed(2) }}</span></div>
    </div>

    <!-- 导出 / 删除（编排在 app：confirm / 落 trash / 下载文件） -->
    <div class="${SECTION}">
      <button type="button" class="brush-rack-action" @click="$emit('export')">{{ L.exportBrush }}</button>
    </div>
    <div class="${SECTION}">
      <button type="button" class="brush-rack-action" style="background:rgba(220,38,38,0.1);color:#dc2626;border-color:#dc2626;" @click="$emit('delete')">{{ L.deleteBrush }}</button>
    </div>
  </div>
  `;
export const CURVE_EDITOR_TEMPLATE = `<div ref="host" class="brush-settings-curve"></div>`;
export const SELECT_FIELD_TEMPLATE = `<button ref="btn" type="button" class="select-field" :disabled="disabled"></button>`;
export const LEFT_DIAL_TEMPLATE = `
      <!-- 2026-09-10：左栏 = 笔粗滑条 · 取样钮 · 不透明滑条，永远在（不能画时滑条 disabled）；笔架钮 / 尺钮已撤 -->
      <input ref="sizeSlider" id="sizeSlider" class="left-sidebar-slider" type="range" min="0" :max="sizePosMax" step="1"
        :value="sizePos" :disabled="!canDraw" orient="vertical" :aria-label="L.size" @input="onSizeInput" />
      <!-- 笔粗图标位 = 纯标签（v0.6.32 迁出的笔压 toggle 已于 2026-08-28 整条 sunset：不要压感 = 选「固定xx」笔） -->
      <span class="left-sidebar-label" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><use href="#brush-width"/></svg>
      </span>
      <!-- 2026-09-06 一次性取样钮（两滑条之间，Procreate 修饰键的位置，但用我们的吸管而不是方框；图标随 context 变） -->
      <button class="left-sidebar-brush left-sidebar-pick" id="leftPick" type="button" :title="pickTitle" :aria-label="pickTitle"
        :aria-pressed="picking ? 'true' : 'false'" @pointerdown="pickDown" @pointerup="pickUp" @pointercancel="pickUp" @click="pickClick">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><use :href="'#' + pickIcon"/></svg>
      </button>
      <div class="size-popup" :class="{ hidden: !popup.visible }" :style="{ left: popup.left + 'px', top: popup.top + 'px' }" aria-hidden="true">
        <div class="size-popup-circle-frame">
          <div class="size-popup-circle" :style="{ width: popup.dia + 'px', height: popup.dia + 'px', opacity: popup.opacity }"></div>
        </div>
        <span class="size-popup-text">{{ popup.text }}</span>
      </div>
      <input ref="opaSlider" id="opacitySlider" class="left-sidebar-slider" type="range" min="1" max="100" step="1"
        :value="opaPct" :disabled="!canDraw" orient="vertical" :aria-label="L.opacity" @input="onOpaInput" />
      <span class="left-sidebar-label" :title="L.opacity" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><use href="#opacity"/></svg>
      </span>
    `;

#!/usr/bin/env bash
# created 2026-08-28 by Claude Fable 5
# wave 6 上传前 ritual（清单=ai-docs/20260828-wave6-redline-qa-fixtures.md §2）：
#   单元硬线（本仓 + store 仓）一遍 → 构建两档 → 浏览器夹具批 F1-F8 连跑 N 轮（默认 3；
#   F2/F3 本质是竞态夹具，单轮绿不算数）。任何一步红 = 不上传。
# 用法：bash scripts/preflight.sh [轮数]
# 长跑纪律：实时 flush 每步耗时；日志落 tmp/preflight-<时间戳>.log（tee，人类可随时看）。
set -euo pipefail
cd "$(dirname "$0")/.."
ROUNDS="${1:-3}"
LOG="tmp/preflight-$(date +%Y%m%d-%H%M%S).log"
mkdir -p tmp
exec > >(tee "$LOG") 2>&1
say() { echo "[preflight $(date +%H:%M:%S)] $*"; }
step() {  # step <名字> <命令...>：计时 + 失败即停
  local name="$1"; shift
  local t0=$SECONDS
  say "▶ $name"
  "$@" || { say "✗ $name FAILED ($((SECONDS - t0))s)"; exit 1; }
  say "✓ $name ($((SECONDS - t0))s)"
}

STORE_DIR="../20260813 internal-store"

step "unit: weebpaint (npm test)"    npm test
step "unit: store (npm test)"        bash -c "cd \"$STORE_DIR\" && npm test"
step "gl-smoke"                      npm run smoke
step "build (dist)"                  bash scripts/build.sh
step "build-standalone"                  bash scripts/build-standalone.sh
step "F3 bundle"                     bash -c "tools/esbuild/esbuild tools/preflight/f3-idb-guard.entry.ts --bundle --format=iife --outfile=tmp/preflight-f3.js && printf '%s' '<!doctype html><script src=\"/tmp/preflight-f3.js\"></script>' > tmp/preflight-f3.html"

for r in $(seq 1 "$ROUNDS"); do
  say "═══ 夹具批 第 $r/$ROUNDS 轮 ═══"
  step "F1 fresh-start (round $r)"   node tools/preflight/f1-fresh-start.mjs
  step "F2 reload-survival (round $r)" node tools/preflight/f2-reload-survival.mjs
  step "F3 idb-guard (round $r)"     node tools/preflight/f3-idb-guard.mjs
  step "F4 factory-reset (round $r)" node tools/preflight/f4-factory-reset.mjs
  step "F6 standalone-html (round $r)"   node tools/standalone-smoke.mjs
  step "F7 export (round $r)"        node tools/preflight/f7-export.mjs
  step "F8 remember-csp (round $r)"  node tools/preflight/f8-remember-csp.mjs   # 2026-10-17 记住密码 + CSP 零拦截
  step "F9 gallery-folder (round $r)" node tools/preflight/f9-gallery-folder.mjs   # 2026-10-21 迁库：OPFS 当本地文件夹图库，图库包 0.8.5 一圈（菜单出卡片 / 回收站 / 备份箱）
  step "F10 vue-precompiled (round $r)" node tools/preflight/f10-vue-precompiled.mjs   # 2026-10-21 #89：CSP 无 unsafe-eval 下本仓 Vue 组件逐个渲染出来、零拦截
  step "F11 reference-video (round $r)" node tools/preflight/f11-reference-video.mjs   # 2026-10-21 参考窗 0.5.0：清单 minor 更新提示一次 + 视频卡（只放内存、上一帧 / 下一帧）
done

say "ALL GREEN（$ROUNDS 轮）→ 夹具批通过。log=$LOG"

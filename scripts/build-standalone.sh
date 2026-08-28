#!/usr/bin/env bash
# build-standalone.sh —— 常规 build + 单文件打包（P6）。产物 = dist/weebpaint-standalone.html（gitignored）。
# created 2026-08-27 by Claude Fable 5.
set -e
cd "$(dirname "$0")/.."
bash scripts/build.sh
node scripts/pack-standalone.mjs

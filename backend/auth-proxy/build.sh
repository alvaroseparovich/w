#!/usr/bin/env bash
set -euo pipefail
DIR=$(cd "$(dirname "$0")" && pwd)
OUT="$DIR/build"
rm -rf "$OUT"
mkdir -p "$OUT"

pushd "$DIR" >/dev/null
npm ci --omit=dev
zip -rq "$OUT/auth-proxy.zip" node_modules package.json server.js lambda-handler.js
popd >/dev/null

echo "Built $OUT/auth-proxy.zip"

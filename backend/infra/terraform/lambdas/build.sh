#!/usr/bin/env bash
set -euo pipefail
DIR=$(cd "$(dirname "$0")" && pwd)

for fn in define-auth create-auth verify-auth pre-signup pre-token-gen; do
  pushd "$DIR/$fn" >/dev/null
  zip -qr "../$fn.zip" .
  popd >/dev/null
  echo "Built $fn.zip"
done

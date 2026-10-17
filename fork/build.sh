#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required to build OpenCode" >&2
  exit 1
fi

cd "$ROOT_DIR"
bun install --ignore-scripts

(
  cd "$ROOT_DIR/packages/cli"
  bun run script/build.ts --single --skip-install --skip-web-ui
)

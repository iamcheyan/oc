#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RESET='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ALLOWLIST="$SCRIPT_DIR/upstream-seams.allowlist"
UPSTREAM_REF="${UPSTREAM_REF:-upstream/dev}"

cd "$ROOT_DIR"

git rev-parse --verify "$UPSTREAM_REF" >/dev/null 2>&1 || {
  echo -e "${RED}Missing $UPSTREAM_REF. Run: git fetch upstream${RESET}"
  exit 1
}

allowed=()
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    '' | \#*) continue ;;
    *) allowed+=("$line") ;;
  esac
done < "$ALLOWLIST"
[ "${#allowed[@]}" -gt 0 ] || {
  echo -e "${RED}Empty seam allowlist: $ALLOWLIST${RESET}"
  exit 1
}

is_seam() {
  local file="$1"
  local item
  for item in "${allowed[@]}"; do
    [ "$file" = "$item" ] && return 0
  done
  return 1
}

is_fork_owned() {
  case "$1" in
    fork/* | packages/opencode-vim/* | packages/miniapps/* | packages/bedrock-scanner/* | .oc/*)
      return 0
      ;;
    packages/web/* | packages/ui/*)
      return 0
      ;;
    patches/*)
      return 0
      ;;
    script/*)
      return 0
      ;;
    sdks/vscode/*)
      return 0
      ;;
    specs/*)
      return 0
      ;;
    perf/*)
      return 0
      ;;
    scripts/*)
      return 0
      ;;
    README.md | package.json | bun.lock | .gitignore | .opencode/.gitignore | .github/workflows/fork-build.yml | sqlc.yaml | sst.config.ts | sst-env.d.ts | tsconfig.json | turbo.json | screenshot-uk.png)
      return 0
      ;;
  esac
  return 1
}

failed=0
echo -e "${CYAN}Checking fork ownership against $UPSTREAM_REF...${RESET}"

while IFS= read -r file; do
  [ -n "$file" ] || continue
  if is_fork_owned "$file" || is_seam "$file"; then
    continue
  fi
  echo -e "${RED}Unexpected fork diff outside owned paths:${RESET} $file"
  failed=1
done < <(git diff --name-only "$UPSTREAM_REF"...HEAD)

while IFS= read -r file; do
  [ -n "$file" ] || continue
  if ! is_seam "$file"; then
    echo -e "${RED}FORK-SEAM marker found outside allowlist:${RESET} $file"
    failed=1
  fi
done < <(rg -l 'FORK-SEAM \(opencode-vim\)' packages/opencode/src packages/tui/src 2>/dev/null || true)

for file in "${allowed[@]}"; do
  if [ ! -f "$file" ]; then
    echo -e "${RED}Allowlisted seam file is missing:${RESET} $file"
    failed=1
    continue
  fi
  if ! rg -q 'FORK-SEAM \(opencode-vim\)' "$file"; then
    echo -e "${RED}Allowlisted file has no seam marker:${RESET} $file"
    failed=1
  fi
done

[ "$failed" -eq 0 ] || exit 1
echo -e "${GREEN}Fork ownership check passed (${#allowed[@]} upstream seam files).${RESET}"

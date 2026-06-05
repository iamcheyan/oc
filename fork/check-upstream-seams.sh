#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ALLOWLIST="$SCRIPT_DIR/upstream-seams.allowlist"
DRIFT_ALLOWLIST="$SCRIPT_DIR/upstream-drift.allowlist"
UPSTREAM_REF="${UPSTREAM_REF:-upstream/dev}"
UPSTREAM_SRC="$ROOT_DIR/packages/opencode/src"

cd "$ROOT_DIR"

if [ ! -d "$UPSTREAM_SRC" ]; then
  echo -e "${RED}Missing $UPSTREAM_SRC${RESET}"
  exit 1
fi

ALLOWED=()
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    '' | \#*) continue ;;
    *) ALLOWED+=("$line") ;;
  esac
done < "$ALLOWLIST"

if [ "${#ALLOWED[@]}" -eq 0 ]; then
  echo -e "${RED}Empty allowlist: $ALLOWLIST${RESET}"
  exit 1
fi

is_allowed() {
  local file="$1"
  local allowed
  for allowed in "${ALLOWED[@]}"; do
    if [ "$file" = "$allowed" ]; then
      return 0
    fi
  done
  return 1
}

MARKER_PATTERN='OPENCODE_TUI_ROOT_COMPONENTS|OPENCODE_MINIMAL|FORK-SEAM|Fork: Rejecting a permission'

echo -e "${CYAN}Checking upstream seam allowlist...${RESET}"

FAILED=0

if command -v rg >/dev/null 2>&1; then
  SEARCH() { rg -l "$1" "$2" 2>/dev/null || true; }
  GREP() { rg -q "$1" "$2" 2>/dev/null; }
  GREPN() { rg -n "$1" "$2" 2>/dev/null || true; }
else
  SEARCH() { grep -Rl "$1" "$2" 2>/dev/null || true; }
  GREP() { grep -q "$1" "$2" 2>/dev/null; }
  GREPN() { grep -n "$1" "$2" 2>/dev/null || true; }
fi

while IFS= read -r path; do
  [ -z "$path" ] && continue
  file="${path#$ROOT_DIR/}"
  if ! is_allowed "$file"; then
    echo -e "${RED}✗ Fork seam marker in non-allowlisted file:${RESET} $file"
    FAILED=1
  fi
done <<EOF
$(SEARCH "$MARKER_PATTERN" "$UPSTREAM_SRC")
EOF

SESSION_INDEX="packages/opencode/src/cli/cmd/tui/routes/session/index.tsx"
if GREP '^export const context' "$ROOT_DIR/$SESSION_INDEX"; then
  echo -e "${RED}✗ $SESSION_INDEX must not export Session context (use opencode-vim/src/context/session-context.ts)${RESET}"
  FAILED=1
fi

if GREP 'OPENCODE_MINIMAL' "$ROOT_DIR/packages/opencode/src/cli/cmd/tui/context/theme.tsx"; then
  echo -e "${RED}✗ theme.tsx must not contain OPENCODE_MINIMAL (use opencode-vim useForkTheme)${RESET}"
  FAILED=1
fi

check_required() {
  local file="$1"
  local pattern="$2"
  if ! GREP "$pattern" "$file"; then
    echo -e "${YELLOW}⚠ Expected seam missing in ${file#$ROOT_DIR/}: $pattern${RESET}"
  fi
}

check_required "$ROOT_DIR/packages/opencode/src/cli/cmd/tui/app.tsx" 'OPENCODE_TUI_ROOT_COMPONENTS'
check_required "$ROOT_DIR/packages/opencode/src/cli/cmd/tui/app.tsx" 'OPENCODE_MINIMAL'
check_required "$ROOT_DIR/packages/opencode/src/session/processor.ts" 'FORK-SEAM \(opencode-vim\): permission reject'

for allowed in "${ALLOWED[@]}"; do
  if [ ! -f "$ROOT_DIR/$allowed" ]; then
    echo -e "${RED}✗ Allowlisted file missing: $allowed${RESET}"
    FAILED=1
  fi
done

if [ "$FAILED" -ne 0 ]; then
  echo ""
  echo -e "${RED}Upstream seam check failed.${RESET}"
  echo -e "Allowed seam files:"
  for allowed in "${ALLOWED[@]}"; do
    echo -e "  - ${CYAN}$allowed${RESET}"
  done
fi

if [ "$FAILED" -eq 0 ] && [ -f "$DRIFT_ALLOWLIST" ] && git rev-parse --verify "$UPSTREAM_REF" >/dev/null 2>&1; then
  DRIFT_ALLOWED=()
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      '' | \#*) continue ;;
      *) DRIFT_ALLOWED+=("$line") ;;
    esac
  done < "$DRIFT_ALLOWLIST"

  DRIFT_FAILED=0
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    if is_allowed "$file"; then
      continue
    fi
    allowed_drift=1
    for drift in "${DRIFT_ALLOWED[@]}"; do
      if [ "$file" = "$drift" ]; then
        allowed_drift=0
        break
      fi
    done
    if [ "$allowed_drift" -ne 0 ]; then
      echo -e "${RED}✗ Unexpected diff vs ${UPSTREAM_REF}:${RESET} $file"
      DRIFT_FAILED=1
    fi
  done <<EOF
$(git diff --name-only "$UPSTREAM_REF" -- "$UPSTREAM_SRC" 2>/dev/null || true)
EOF

  if [ "$DRIFT_FAILED" -ne 0 ]; then
    echo -e "${DIM}Allowed drift files:${RESET}"
    for drift in "${DRIFT_ALLOWED[@]}"; do
      echo -e "  - ${CYAN}$drift${RESET}"
    done
    FAILED=1
  else
    echo -e "${GREEN}✓ Upstream drift check OK (${#DRIFT_ALLOWED[@]} allowed)${RESET}"
  fi
fi

if [ "$FAILED" -ne 0 ]; then
  exit 1
fi

echo -e "${GREEN}✓ Upstream seam allowlist OK (${#ALLOWED[@]} files)${RESET}"
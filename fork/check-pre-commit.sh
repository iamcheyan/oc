#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
RESET='\033[0m'

blocked_paths=(
  ".oc/quick-model.jsonc"
  ".oc/vim.jsonc"
  ".oc/routing.jsonc"
  ".opencode/mina-routing.jsonc"
)

secret_regex='(sk-[A-Za-z0-9_-]{32,}|AIza[0-9A-Za-z_-]{20,}|ghp_[0-9A-Za-z_]{30,}|github_pat_[0-9A-Za-z_]{30,}|AKIA[0-9A-Z]{16}|xox[baprs]-[0-9A-Za-z-]{20,})'
sensitive_assignment_regex='(api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|auth[_-]?token|secret|password|credential)[^[:alnum:]_:-]{0,20}[:=][[:space:]]*["'\'']?[^"'\''][[:space:]}]{12,}'

failed=0

is_blocked_path() {
  local file="$1"
  local blocked
  for blocked in "${blocked_paths[@]}"; do
    [ "$file" = "$blocked" ] && return 0
  done
  return 1
}

report() {
  echo -e "${RED}pre-commit blocked:${RESET} $1" >&2
  failed=1
}

scan_staged_file() {
  local file="$1"
  local content

  if is_blocked_path "$file"; then
    report "$file is local machine state and must not be committed"
    return
  fi

  if ! content="$(git show ":$file" 2>/dev/null)"; then
    return
  fi

  if printf '%s\n' "$content" | grep -Eq '"quick_model"[[:space:]]*:'; then
    report "$file contains quick_model slots; store them in ~/.config/opencode/quick-model.jsonc"
  fi

  if printf '%s\n' "$content" | grep -Eq "$secret_regex"; then
    report "$file contains a value that looks like a real API key or token"
  fi

  if printf '%s\n' "$content" | grep -Eiv '(\$\{\{[[:space:]]*secrets\.|\{env:|\{file:|REDACTED|redacted|example|placeholder|\.\.\.|<[^>]+>)' \
    | grep -Eiq "$sensitive_assignment_regex"; then
    report "$file contains a sensitive-looking assignment; use env/file references instead"
  fi
}

while IFS= read -r -d '' file; do
  scan_staged_file "$file"
done < <(git diff --cached --name-only -z --diff-filter=ACMR)

if [ "$failed" -ne 0 ]; then
  echo -e "${YELLOW}Commit aborted before secrets or local model-slot state reached git history.${RESET}" >&2
  exit 1
fi

echo -e "${GREEN}pre-commit secret/local-state check passed.${RESET}"

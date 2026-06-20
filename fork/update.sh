#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
UPSTREAM_URL="https://github.com/anomalyco/opencode.git"
UPSTREAM_REF="upstream/main"

cd "$ROOT_DIR"

fail() {
  echo -e "${RED}$*${RESET}" >&2
  exit 1
}

run_checks() {
  echo -e "${CYAN}Checking fork boundaries...${RESET}"
  bash -n fork/update.sh fork/build.sh fork/check-upstream-seams.sh
  bash fork/check-upstream-seams.sh

  echo -e "${CYAN}Testing opencode-vim...${RESET}"
  (
    cd packages/opencode-vim
    bun test
    bun run typecheck
  )

  echo -e "${CYAN}Building fork binaries...${RESET}"
  bash fork/build.sh
}

if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
  fail "Worktree is not clean. Commit or stash your changes before syncing."
fi

branch="$(git branch --show-current)"
[ -n "$branch" ] || fail "Detached HEAD is not supported."

if ! git remote get-url upstream >/dev/null 2>&1; then
  git remote add upstream "$UPSTREAM_URL"
fi

echo -e "${CYAN}Fetching origin and upstream...${RESET}"
git fetch origin
git fetch upstream
git rev-parse --verify "$UPSTREAM_REF" >/dev/null 2>&1 || fail "Missing $UPSTREAM_REF."

origin_ref="refs/remotes/origin/$branch"
origin_head=""
if git show-ref --verify --quiet "$origin_ref"; then
  origin_head="$(git rev-parse "$origin_ref")"
  if ! git merge-base --is-ancestor "$origin_ref" HEAD; then
    fail "origin/$branch contains commits not present locally. Reconcile that branch before syncing."
  fi
fi

upstream_count="$(git rev-list --count "HEAD..$UPSTREAM_REF")"
if [ "$upstream_count" -eq 0 ]; then
  echo -e "${GREEN}Already based on the latest $UPSTREAM_REF.${RESET}"
  run_checks
  exit 0
fi

backup="backup/${branch}-before-upstream-$(date +%Y%m%d-%H%M%S)"
git branch "$backup"
git push origin "$backup:$backup"
echo -e "${GREEN}Created safety branch origin/$backup.${RESET}"

echo -e "${CYAN}Rebasing fork commits onto $UPSTREAM_REF ($upstream_count new commits)...${RESET}"
if ! git rebase "$UPSTREAM_REF"; then
  echo -e "${YELLOW}Rebase stopped on a conflict.${RESET}"
  echo "Resolve files, then run:"
  echo "  git add <resolved-files>"
  echo "  git rebase --continue"
  echo "To return to the pre-sync state:"
  echo "  git rebase --abort"
  echo "The remote safety branch is origin/$backup."
  exit 1
fi

run_checks

echo -e "${CYAN}Publishing rebased $branch...${RESET}"
if [ -n "$origin_head" ]; then
  git push --force-with-lease="$branch:$origin_head" origin "HEAD:$branch"
else
  git push -u origin "HEAD:$branch"
fi

echo -e "${GREEN}Sync complete: $branch now follows $(git rev-parse --short "$UPSTREAM_REF").${RESET}"

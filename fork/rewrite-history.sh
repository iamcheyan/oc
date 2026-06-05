#!/usr/bin/env bash
set -euo pipefail

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[90m'
RESET='\033[0m'

echo -e "${BOLD}${RED}⚠️  WARNING: This will rewrite history!${RESET}"
echo ""
echo "This script will:"
echo "  1. Save your current branch name"
echo "  2. Create a backup branch"
echo "  3. Reset to upstream/dev"
echo "  4. Remove .github directory"
echo "  5. Cherry-pick your custom commits"
echo ""
echo -e "${YELLOW}Make sure you have pushed any important work to a backup branch first!${RESET}"
echo ""
read -p "Continue? (y/N): " confirm

if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Aborted."
  exit 0
fi

# Save current state
CURRENT_BRANCH=$(git branch --show-current)
BACKUP_BRANCH="backup-$(date +%Y%m%d-%H%M%S)"

echo ""
echo -e "${DIM}Creating backup branch: $BACKUP_BRANCH${RESET}"
git branch "$BACKUP_BRANCH"
echo -e "  ${GREEN}✓ Backup created${RESET}"

# Find the merge base with upstream
echo ""
echo -e "${DIM}Finding merge base with upstream/dev...${RESET}"
MERGE_BASE=$(git merge-base HEAD upstream/dev)
echo -e "  Merge base: ${CYAN}${MERGE_BASE:0:12}${RESET}"

# Find commits that are unique to our branch (not in upstream)
echo ""
echo -e "${DIM}Finding your custom commits...${RESET}"
OUR_COMMITS=$(git rev-list --reverse "${MERGE_BASE}..HEAD" --not upstream/dev)

echo -e "  Found ${CYAN}$(echo "$OUR_COMMITS" | grep -c '^' || echo 0)${RESET} custom commit(s)"

# Reset to upstream/dev
echo ""
echo -e "${YELLOW}Resetting to upstream/dev...${RESET}"
git reset --hard upstream/dev
echo -e "  ${GREEN}✓ Reset complete${RESET}"

# Remove .github directory
echo ""
echo -e "${DIM}Removing .github directory...${RESET}"
if [ -d ".github" ]; then
  git rm -rf .github
  git commit -m "chore: remove .github directory (fork doesn't use GitHub Actions)"
  echo -e "  ${GREEN}✓ .github removed and committed${RESET}"
else
  echo -e "  ${DIM}  .github already removed${RESET}"
fi

# Cherry-pick our commits
echo ""
echo -e "${YELLOW}Re-applying your custom commits...${RESET}"
FAILED_COMMITS=""
for commit in $OUR_COMMITS; do
  commit_msg=$(git log -1 --format=%s "$commit")
  echo -e "  Applying: ${DIM}${commit_msg:0:50}${RESET}"
  
  if git cherry-pick "$commit" --no-commit 2>/dev/null; then
    # Check if there are any changes to commit
    if git diff --cached --quiet; then
      echo -e "    ${DIM}  (no changes, skipping)${RESET}"
      git cherry-pick --abort 2>/dev/null || true
    else
      git commit -m "$commit_msg"
      echo -e "    ${GREEN}✓ Success${RESET}"
    fi
  else
    echo -e "    ${RED}✗ Failed${RESET}"
    FAILED_COMMITS="$FAILED_COMMITS $commit"
    git cherry-pick --abort 2>/dev/null || true
  fi
done

echo ""
if [ -z "$FAILED_COMMITS" ]; then
  echo -e "${GREEN}${BOLD}History rewritten successfully!${RESET}"
  echo ""
  echo -e "${YELLOW}Next steps:${RESET}"
  echo -e "  1. Review the changes: ${CYAN}git log --oneline -10${RESET}"
  echo -e "  2. Force push: ${CYAN}git push origin $CURRENT_BRANCH --force-with-lease${RESET}"
  echo -e "  3. Or use your alias: ${CYAN}pat local${RESET}"
  echo ""
  echo -e "${DIM}If something goes wrong, you can restore from backup:${RESET}"
  echo -e "  ${CYAN}git reset --hard $BACKUP_BRANCH${RESET}"
else
  echo -e "${RED}${BOLD}Some commits failed to apply${RESET}"
  echo -e "Failed commits: $FAILED_COMMITS"
  echo ""
  echo "You may need to manually apply these changes."
  echo -e "Restore from backup if needed: ${CYAN}git reset --hard $BACKUP_BRANCH${RESET}"
fi

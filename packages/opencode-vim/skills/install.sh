#!/usr/bin/env bash
# Install opencode-vim bundled skills to ~/.opencode/skills/
set -euo pipefail

SKILLS_DIR="$HOME/.opencode/skills"

# Find the skills directory relative to this script
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Also check if we're being called from the project root
if [ ! -d "$SCRIPT_DIR/git-master" ]; then
  # Try finding from project root
  PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
  SCRIPT_DIR="$PROJECT_ROOT/packages/opencode-vim/skills"
fi

mkdir -p "$SKILLS_DIR"

installed=0
for skill in git-master git-workflow; do
  src="$SCRIPT_DIR/$skill/SKILL.md"
  dest="$SKILLS_DIR/$skill/SKILL.md"
  if [ -f "$src" ]; then
    mkdir -p "$SKILLS_DIR/$skill"
    if [ -f "$dest" ] && diff -q "$src" "$dest" >/dev/null 2>&1; then
      echo "  $skill: already installed"
    else
      cp "$src" "$dest"
      echo "  $skill: installed ✓"
      installed=$((installed + 1))
    fi
  else
    echo "  $skill: source not found at $src"
  fi
done

echo ""
if [ "$installed" -gt 0 ]; then
  echo "Skills installed! Use /skill git-master to start."
else
  echo "All skills already installed. Use /skill git-master to start."
fi
echo ""
echo "Press Enter to continue..."
read -r

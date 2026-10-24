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

# ─── Paths ────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CLI_DIR="$ROOT_DIR/packages/cli"
VIM_DIR="$ROOT_DIR/packages/opencode-vim"
VIM_ENTRY="$VIM_DIR/src/index.ts"

if [ ! -f "$VIM_ENTRY" ]; then
  echo -e "${RED}Error: Entry point not found: $VIM_ENTRY${RESET}"
  exit 1
fi

# ─── Load nvm and use latest Node.js ──────────────────────────────────────────
load_nvm() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    echo -e "${DIM}Loading nvm...${RESET}"
    set +eu
    source "$NVM_DIR/nvm.sh"
    set -eu
    local latest_node
    set +u
    latest_node=$(nvm ls --no-colors 2>/dev/null | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' | sort -V | tail -1)
    set -u
    if [ -n "$latest_node" ]; then
      echo -e "${DIM}Using latest Node.js: $latest_node${RESET}"
      set +e
      nvm use "$latest_node" >/dev/null 2>&1
      set -e
    fi
  fi
}

# ─── Load Bun ─────────────────────────────────────────────────────────────────
load_bun() {
  load_nvm

  if command -v bun &>/dev/null; then
    echo -e "${DIM}bun $(bun --version) found in PATH${RESET}"
    return
  fi

  echo -e "${YELLOW}bun not found. Installing bun...${RESET}"
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"

  if ! command -v bun &>/dev/null; then
    echo -e "${RED}Failed to install bun. Please install manually: https://bun.sh${RESET}"
    exit 1
  fi
  echo -e "${GREEN}bun $(bun --version) installed${RESET}"
}

# ─── Platform detection ───────────────────────────────────────────────────────
detect_platform() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Linux)  PLATFORM_OS="linux" ;;
    Darwin) PLATFORM_OS="darwin" ;;
    MINGW*|MSYS*|CYGWIN*) PLATFORM_OS="windows" ;;
    *) echo -e "${RED}Unsupported OS: $os${RESET}"; exit 1 ;;
  esac

  case "$arch" in
    x86_64|amd64)  PLATFORM_ARCH="x64" ;;
    aarch64|arm64) PLATFORM_ARCH="arm64" ;;
    *) echo -e "${RED}Unsupported arch: $arch${RESET}"; exit 1 ;;
  esac

  echo -e "${DIM}Target: bun-${PLATFORM_OS}-${PLATFORM_ARCH}${RESET}"
}

smoke_test_binary() {
  local entrypoint="$1"
  local success_message="$2"
  local failure_message="$3"

  if "$entrypoint" --help &>/dev/null; then
    echo -e "${GREEN}${success_message}${RESET}"
  else
    echo -e "${YELLOW}${failure_message}${RESET}"
  fi
}

cleanup() {
  # Cleanup temporary build markers or stubs on exit
  :
}

trap cleanup EXIT

# ─── Main build ───────────────────────────────────────────────────────────────
main() {
  if [[ "${1:-}" == "--clean" ]]; then
    echo -e "${DIM}Cleaning build and dist directories...${RESET}"
    rm -rf "$SCRIPT_DIR/dist" "$CLI_DIR/dist"
  fi

  echo -e "${BOLD}${CYAN}Building opencode + opencode-vim binaries${RESET}"
  echo ""

  load_bun
  detect_platform

  echo -e "${DIM}Installing dependencies from root...${RESET}"
  cd "$ROOT_DIR"
  bun install --ignore-scripts --frozen-lockfile || bun install --ignore-scripts

  local version
  version="$(cd "$ROOT_DIR" && git describe --tags --always 2>/dev/null || echo "0.0.0-dev")"
  version="${version#v}"
  echo -e "${DIM}Version: $version${RESET}"

  echo -e "${DIM}Building opencode-vim TUI plugin bundle...${RESET}"
  (
    cd "$VIM_DIR"
    bun run script/build.ts
  )

  echo -e "${DIM}Verifying plugin load and seam integration...${RESET}"
  bun run "$SCRIPT_DIR/check-plugin-load.mjs"

  echo -e "${DIM}Compiling OpenCode CLI binary for current platform...${RESET}"
  (
    cd "$CLI_DIR"
    bun run script/build.ts --single --skip-install --skip-web-ui
  )

  local package_dir="opencode-${PLATFORM_OS}-${PLATFORM_ARCH}"
  local out_dir="$SCRIPT_DIR/dist/$package_dir"
  local out_original_bin="$out_dir/bin/opencode"
  local out_vim_bin="$out_dir/bin/opencode-vim"
  rm -rf "$out_dir"
  mkdir -p "$out_dir/bin"

  local cli_bin=""
  for cli_dir in "$CLI_DIR"/dist/cli-*; do
    [ -d "$cli_dir/bin" ] || continue
    if [ -f "$cli_dir/bin/opencode" ]; then
      cli_bin="$cli_dir/bin/opencode"
      cp -f "$cli_bin" "$out_original_bin"
      cp -f "$cli_bin" "$out_vim_bin"
      chmod 755 "$out_original_bin" "$out_vim_bin"
      break
    elif [ -f "$cli_dir/bin/opencode.exe" ]; then
      cli_bin="$cli_dir/bin/opencode.exe"
      out_original_bin="$out_dir/bin/opencode.exe"
      out_vim_bin="$out_dir/bin/opencode-vim.exe"
      cp -f "$cli_bin" "$out_original_bin"
      cp -f "$cli_bin" "$out_vim_bin"
      break
    fi
  done

  if [ -z "$cli_bin" ]; then
    echo -e "${RED}Error: Built CLI binary not found under $CLI_DIR/dist/cli-*/bin/${RESET}"
    exit 1
  fi

  cat > "$out_dir/package.json" <<EOF
{
  "name": "$package_dir",
  "version": "$version",
  "private": true
}
EOF

  echo -e "${DIM}Running smoke test...${RESET}"
  smoke_test_binary "$out_original_bin" "Original smoke test passed" "Warning: original smoke test failed"
  smoke_test_binary "$out_vim_bin" "Vim TUI smoke test passed" "Warning: Vim TUI smoke test failed"

  echo ""
  echo -e "${GREEN}${BOLD}Build complete!${RESET}"
  echo ""
  echo -e "  Original: ${CYAN}$out_original_bin${RESET}"
  echo -e "  Vim TUI:  ${CYAN}$out_vim_bin${RESET}"
  echo -e "  Plugin:   ${CYAN}$SCRIPT_DIR/dist/plugin/tui.js${RESET}"
}

main "$@"

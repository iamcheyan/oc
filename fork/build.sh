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

  echo -e "${BOLD}${CYAN}Building oc-vim binaries${RESET}"
  echo ""

  load_bun
  detect_platform

  echo -e "${DIM}Installing dependencies from root...${RESET}"
  cd "$ROOT_DIR"
  bun install --ignore-scripts --frozen-lockfile || bun install --ignore-scripts

  local cli_pkg_version
  cli_pkg_version="$(bun -e "console.log(require('./packages/cli/package.json').version)" 2>/dev/null || echo "2.1.4")"
  export OPENCODE_VERSION="${OPENCODE_VERSION:-$cli_pkg_version}"
  local version
  version="$OPENCODE_VERSION"
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

  local package_dir="oc-vim-${PLATFORM_OS}-${PLATFORM_ARCH}"
  local out_dir="$SCRIPT_DIR/dist/$package_dir"
  local legacy_dir="$SCRIPT_DIR/dist/opencode-${PLATFORM_OS}-${PLATFORM_ARCH}"
  local out_main_bin="$out_dir/bin/oc-vim"
  rm -rf "$out_dir" "$legacy_dir"
  mkdir -p "$out_dir/bin" "$legacy_dir/bin"

  local cli_bin=""
  for cli_dir in "$CLI_DIR"/dist/cli-*; do
    [ -d "$cli_dir/bin" ] || continue
    if [ -f "$cli_dir/bin/opencode" ]; then
      cli_bin="$cli_dir/bin/opencode"
      cp -f "$cli_bin" "$out_main_bin"
      chmod 755 "$out_main_bin"
      cp -f "$cli_bin" "$out_dir/bin/oc"
      cp -f "$cli_bin" "$out_dir/bin/opencode-vim"
      cp -f "$cli_bin" "$out_dir/bin/opencode"
      cp -f "$cli_bin" "$legacy_dir/bin/opencode"
      cp -f "$cli_bin" "$legacy_dir/bin/opencode-vim"
      chmod 755 "$out_dir/bin/"* "$legacy_dir/bin/"*
      break
    elif [ -f "$cli_dir/bin/opencode.exe" ]; then
      cli_bin="$cli_dir/bin/opencode.exe"
      out_main_bin="$out_dir/bin/oc-vim.exe"
      cp -f "$cli_bin" "$out_main_bin"
      cp -f "$cli_bin" "$out_dir/bin/oc.exe"
      cp -f "$cli_bin" "$out_dir/bin/opencode-vim.exe"
      cp -f "$cli_bin" "$out_dir/bin/opencode.exe"
      cp -f "$cli_bin" "$legacy_dir/bin/opencode.exe"
      cp -f "$cli_bin" "$legacy_dir/bin/opencode-vim.exe"
      chmod 755 "$out_dir/bin/"* "$legacy_dir/bin/"*
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
  cp -f "$out_dir/package.json" "$legacy_dir/package.json"

  echo -e "${DIM}Running smoke test...${RESET}"
  smoke_test_binary "$out_main_bin" "oc-vim smoke test passed" "Warning: oc-vim smoke test failed"

  echo ""
  echo -e "${GREEN}${BOLD}Build complete!${RESET}"
  echo ""
  echo -e "  oc-vim:   ${CYAN}$out_main_bin${RESET}"
  echo -e "  Aliases:  ${CYAN}$out_dir/bin/oc${RESET}, ${CYAN}$out_dir/bin/opencode-vim${RESET}"
  echo -e "  Plugin:   ${CYAN}$SCRIPT_DIR/dist/plugin/tui.js${RESET}"
}

main "$@"

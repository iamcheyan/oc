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
PKG_DIR="$ROOT_DIR/packages/opencode"
VIM_DIR="$ROOT_DIR/packages/opencode-vim"
VIM_ENTRY="$VIM_DIR/src/index.ts"
WEB_UI_STUB="$PKG_DIR/opencode-web-ui.gen.ts"

if [ ! -f "$VIM_ENTRY" ]; then
  echo -e "${RED}Error: Entry point not found: $VIM_ENTRY${RESET}"
  exit 1
fi

# ─── Load nvm and use latest Node.js ────────────────────────────────────────
load_nvm() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    echo -e "${DIM}Loading nvm...${RESET}"
    
    # nvm.sh is often incompatible with set -u and set -e
    set +eu
    source "$NVM_DIR/nvm.sh"
    set -eu
    
    local latest_node
    # nvm ls can also be problematic with set -u
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

# ─── nvm: load Bun ───────────────────────────────────────────────────────────
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

# ─── Platform detection ──────────────────────────────────────────────────────
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

cleanup() {
  rm -f "$WEB_UI_STUB"
}

# ─── Collect migrations ─────────────────────────────────────────────────────
collect_migrations() {
  python3 -c "
import json, os, re, datetime

migration_dir = os.path.join('$PKG_DIR', 'migration')
migrations = []

if os.path.isdir(migration_dir):
    for name in sorted(os.listdir(migration_dir)):
        sql_file = os.path.join(migration_dir, name, 'migration.sql')
        if not os.path.isfile(sql_file):
            continue
        with open(sql_file, 'r') as f:
            sql = f.read()
        ts = 0
        m = re.match(r'^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})', name)
        if m:
            try:
                dt = datetime.datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)),
                                       int(m.group(4)), int(m.group(5)), int(m.group(6)))
                ts = int(dt.timestamp() * 1000)
            except:
                pass
        migrations.append({'sql': sql, 'timestamp': ts, 'name': name})

print(json.dumps(migrations))
"
}

build_entrypoint() {
  local package_dir="$1"
  local entrypoint="$2"
  local outfile="$3"
  local version="$4"
  local channel="$5"
  local libc="$6"
  local migrations_json="$7"
  local extra_entrypoints="${8:-}"
  local tree_sitter_worker_path="${9:-}"
  local opencode_worker_path="${10:-}"
  local minify="${11:-true}"
  local tsconfig="$package_dir/tsconfig.json"
  local absolute_entrypoint="$package_dir/${entrypoint#./}"

  (
    cd "$PKG_DIR"
    BUILD_TARGET="bun-${PLATFORM_OS}-${PLATFORM_ARCH}" \
    BUILD_OUTFILE="$outfile" \
    BUILD_VERSION="$version" \
    BUILD_CHANNEL="$channel" \
    BUILD_LIBC="$libc" \
    BUILD_MIGRATIONS="$migrations_json" \
    BUILD_ENTRYPOINT="$absolute_entrypoint" \
    BUILD_TSCONFIG="$tsconfig" \
    BUILD_EXTRA_ENTRYPOINTS="$extra_entrypoints" \
    BUILD_TREE_SITTER_WORKER_PATH="$tree_sitter_worker_path" \
    BUILD_OPENCODE_WORKER_PATH="$opencode_worker_path" \
    BUILD_MINIFY="$minify" \
    bun --eval '
const { createSolidTransformPlugin } = await import("@opentui/solid/bun-plugin")
const plugin = createSolidTransformPlugin()
const extraEntrypoints = (process.env.BUILD_EXTRA_ENTRYPOINTS || "")
  .split("\n")
  .map((item) => item.trim())
  .filter(Boolean)
await Bun.build({
  entrypoints: [process.env.BUILD_ENTRYPOINT, ...extraEntrypoints],
  conditions: ["browser"],
  tsconfig: process.env.BUILD_TSCONFIG,
  plugins: [plugin],
  external: ["node-gyp"],
  format: "esm",
  minify: process.env.BUILD_MINIFY !== "false",
  compile: {
    autoloadBunfig: false,
    autoloadDotenv: false,
    autoloadTsconfig: true,
    autoloadPackageJson: true,
    target: process.env.BUILD_TARGET,
    outfile: process.env.BUILD_OUTFILE,
    execArgv: [`--user-agent=opencode/${process.env.BUILD_VERSION}`, "--use-system-ca", "--"],
    windows: {},
  },
  define: {
    OPENCODE_VERSION: JSON.stringify(process.env.BUILD_VERSION),
    OPENCODE_CHANNEL: JSON.stringify(process.env.BUILD_CHANNEL),
    OPENCODE_LIBC: JSON.stringify(process.env.BUILD_LIBC),
    OPENCODE_MIGRATIONS: process.env.BUILD_MIGRATIONS,
    ...(process.env.BUILD_TREE_SITTER_WORKER_PATH
      ? { OTUI_TREE_SITTER_WORKER_PATH: JSON.stringify(process.env.BUILD_TREE_SITTER_WORKER_PATH) }
      : {}),
    ...(process.env.BUILD_OPENCODE_WORKER_PATH
      ? { OPENCODE_WORKER_PATH: JSON.stringify(process.env.BUILD_OPENCODE_WORKER_PATH) }
      : {}),
  },
}).then((result) => {
  if (result.success) return
  for (const log of result.logs) console.error(log)
  process.exit(1)
})
'
  )
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

# ─── Main build ──────────────────────────────────────────────────────────────
main() {
  echo -e "${BOLD}${CYAN}Building opencode binaries${RESET}"
  echo ""

  trap cleanup EXIT

  load_bun
  detect_platform

  echo -e "${DIM}Checking upstream seam allowlist...${RESET}"
  bash "$SCRIPT_DIR/check-upstream-seams.sh"

  # Install dependencies (skip prepare scripts - husky not needed for build)
  echo -e "${DIM}Installing dependencies from root...${RESET}"
  cd "$ROOT_DIR"
  bun install --ignore-scripts --frozen-lockfile || bun install --ignore-scripts

  # Collect migrations
  echo -e "${DIM}Collecting migrations...${RESET}"
  local migrations_json
  migrations_json="$(collect_migrations)"
  local migration_count
  migration_count="$(echo "$migrations_json" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")"
  echo -e "${DIM}Loaded $migration_count migrations${RESET}"

  # Version
  local version
  version="$(cd "$ROOT_DIR" && git describe --tags --always 2>/dev/null || echo "0.0.0-dev")"
  version="${version#v}"
  echo -e "${DIM}Version: $version${RESET}"

  local channel
  channel="$(cd "$ROOT_DIR" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "local")"

  # Build
  local package_dir="opencode-${PLATFORM_OS}-${PLATFORM_ARCH}"
  local out_dir="$ROOT_DIR/fork/dist/$package_dir"
  local out_original_bin="$out_dir/bin/opencode"
  local out_vim_bin="$out_dir/bin/opencode-vim"
  rm -rf "$out_dir"
  mkdir -p "$out_dir/bin"

  echo -e "${DIM}Compiling binaries for current platform...${RESET}"

  # Detect libc on linux
  local libc="glibc"
  if [ "$PLATFORM_OS" = "linux" ]; then
    if ldd --version 2>&1 | grep -qi musl; then
      libc="musl"
    fi
  fi

  local local_parser_worker="$PKG_DIR/node_modules/@opentui/core/parser.worker.js"
  local root_parser_worker="$ROOT_DIR/node_modules/@opentui/core/parser.worker.js"
  local parser_worker=""
  if [ -f "$local_parser_worker" ]; then
    parser_worker="$(realpath "$local_parser_worker")"
  elif [ -f "$root_parser_worker" ]; then
    parser_worker="$(realpath "$root_parser_worker")"
  else
    echo -e "${RED}Error: parser.worker.js not found${RESET}"
    exit 1
  fi

  local worker_path="./src/cli/tui/worker.ts"
  local worker_relative_path
  worker_relative_path="$(python3 -c 'import os, sys; print(os.path.relpath(sys.argv[1], sys.argv[2]).replace(chr(92), "/"))' "$parser_worker" "$PKG_DIR")"
  local bunfs_root="/\$bunfs/root/"
  if [ "$PLATFORM_OS" = "windows" ]; then
    bunfs_root="B:/~BUN/root/"
  fi
  local vim_extra_entrypoints
  vim_extra_entrypoints="$(printf '%s\n%s' "$parser_worker" "$worker_path")"
  local vim_tree_sitter_worker_path="${bunfs_root}${worker_relative_path}"

  cat > "$WEB_UI_STUB" <<'EOF'
export default null
EOF

  build_entrypoint "$PKG_DIR" "./src/index.ts" "$out_original_bin" "$version" "$channel" "$libc" "$migrations_json" "$vim_extra_entrypoints" "$vim_tree_sitter_worker_path" "$worker_path"
  build_entrypoint "$VIM_DIR" "./src/index.ts" "$out_vim_bin" "$version" "$channel" "$libc" "$migrations_json" "$vim_extra_entrypoints" "$vim_tree_sitter_worker_path" "$worker_path" "false"

  cat > "$out_dir/package.json" <<EOF
{
  "name": "$package_dir",
  "version": "$version",
  "private": true
}
EOF

  # Smoke test
  echo -e "${DIM}Running smoke test...${RESET}"
  smoke_test_binary "$out_original_bin" "Original smoke test passed" "Warning: original smoke test failed"
  smoke_test_binary "$out_vim_bin" "Vim TUI smoke test passed" "Warning: Vim TUI smoke test failed"

  # Done
  echo ""
  echo -e "${GREEN}${BOLD}Build complete!${RESET}"
  echo ""
  echo -e "  Original: ${CYAN}$out_original_bin${RESET}"
  echo -e "  Vim TUI:  ${CYAN}$out_vim_bin${RESET}"
}

main "$@"

#!/bin/sh
set -eu

fail() {
  printf '%s\n' "loom install: $*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

detect_os() {
  case "$(uname -s)" in
    Linux) printf 'linux' ;;
    Darwin) printf 'darwin' ;;
    *) fail "unsupported operating system: $(uname -s)" ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) printf 'x64' ;;
    arm64|aarch64) printf 'arm64' ;;
    *) fail "unsupported CPU architecture: $(uname -m)" ;;
  esac
}

download() {
  url="$1"
  output="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$output"
    return
  fi
  if command -v wget >/dev/null 2>&1; then
    wget -q "$url" -O "$output"
    return
  fi
  fail "required command not found: curl or wget"
}

install_dir() {
  if [ -n "${LOOM_INSTALL_DIR:-}" ]; then
    printf '%s' "$LOOM_INSTALL_DIR"
    return
  fi
  if [ -d "$HOME/.local/bin" ] || mkdir -p "$HOME/.local/bin" 2>/dev/null; then
    printf '%s' "$HOME/.local/bin"
    return
  fi
  if [ -w /usr/local/bin ]; then
    printf '%s' /usr/local/bin
    return
  fi
  fail "cannot write to $HOME/.local/bin or /usr/local/bin; set LOOM_INSTALL_DIR"
}

need_cmd uname
need_cmd chmod
need_cmd mkdir
need_cmd mv
need_cmd mktemp

os="$(detect_os)"
arch="$(detect_arch)"
version="${LOOM_INSTALL_VERSION:-latest}"
base_url="${LOOM_INSTALL_BASE_URL:-https://github.com/ganymedia/loom/releases}"
artifact="loom-${os}-${arch}"

if [ "$version" = latest ]; then
  url="$base_url/latest/download/$artifact"
else
  url="$base_url/download/$version/$artifact"
fi

dir="$(install_dir)"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT HUP INT TERM

download "$url" "$tmp"
chmod 0755 "$tmp"
mkdir -p "$dir"
mv "$tmp" "$dir/loom"

printf 'LOOM installed to %s\n' "$dir/loom"
if ! command -v loom >/dev/null 2>&1; then
  printf 'Add %s to PATH if loom is not found in new shells.\n' "$dir"
fi

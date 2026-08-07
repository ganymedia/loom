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
  _download_url="$1"
  _download_output="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$_download_url" -o "$_download_output"
    return
  fi
  if command -v wget >/dev/null 2>&1; then
    wget -q "$_download_url" -O "$_download_output"
    return
  fi
  fail "required command not found: curl or wget"
}

sha256_file() {
  _sha_file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    _sha_result="$(sha256sum "$_sha_file")"
    printf '%s' "${_sha_result%% *}"
    return
  fi
  if command -v shasum >/dev/null 2>&1; then
    _sha_result="$(shasum -a 256 "$_sha_file")"
    printf '%s' "${_sha_result%% *}"
    return
  fi
  fail "required command not found: sha256sum or shasum"
}

verify_checksum() {
  _verify_file="$1"
  _verify_manifest="$2"
  _verify_artifact="$3"
  _verify_expected="$(awk -v artifact="$_verify_artifact" '
    $2 == artifact {
      if (found || NF != 2) exit 2
      print $1
      found = 1
    }
    END { if (!found) exit 1 }
  ' "$_verify_manifest")" || fail "SHA256SUMS must contain exactly one entry for $_verify_artifact"

  case "$_verify_expected" in
    *[!0-9a-f]*|'') fail "invalid SHA-256 checksum for $_verify_artifact" ;;
  esac
  [ "${#_verify_expected}" -eq 64 ] || fail "invalid SHA-256 checksum for $_verify_artifact"

  _verify_actual="$(sha256_file "$_verify_file")"
  [ "$_verify_actual" = "$_verify_expected" ] || fail "checksum verification failed for $_verify_artifact"
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
need_cmd awk
need_cmd rm

os="$(detect_os)"
arch="$(detect_arch)"
version="${LOOM_INSTALL_VERSION:-latest}"
base_url="${LOOM_INSTALL_BASE_URL:-https://github.com/ganymedia/loom/releases}"
artifact="loom-${os}-${arch}"

if [ "$version" = latest ]; then
  url="$base_url/latest/download/$artifact"
  checksum_url="$base_url/latest/download/SHA256SUMS"
else
  url="$base_url/download/$version/$artifact"
  checksum_url="$base_url/download/$version/SHA256SUMS"
fi

dir="$(install_dir)"
tmp_dir="$(mktemp -d)"
tmp="$tmp_dir/$artifact"
checksum_manifest="$tmp_dir/SHA256SUMS"
staged=""
trap 'rm -rf "$tmp_dir"; if [ -n "$staged" ]; then rm -f "$staged"; fi' EXIT HUP INT TERM

download "$checksum_url" "$checksum_manifest"
download "$url" "$tmp"
verify_checksum "$tmp" "$checksum_manifest" "$artifact"
mkdir -p "$dir"
[ ! -d "$dir/loom" ] || fail "install destination is a directory: $dir/loom"
staged="$(mktemp "$dir/.loom.XXXXXX")"
mv "$tmp" "$staged"
chmod 0755 "$staged"
mv "$staged" "$dir/loom"
staged=""

printf 'LOOM installed to %s\n' "$dir/loom"
if ! command -v loom >/dev/null 2>&1; then
  printf 'Add %s to PATH if loom is not found in new shells.\n' "$dir"
fi

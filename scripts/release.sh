#!/bin/sh
# release.sh — Build all platform targets and produce checksummed tarballs
#
# Usage:
#   bun run release                    # builds all targets, creates tarballs
#   LOOM_RELEASE_VERSION=1.2.3 bun run release  # use explicit version
#
# Output:
#   dist/releases/
#     loom-linux-x64
#     loom-linux-arm64
#     loom-darwin-x64
#     loom-darwin-arm64
#     loom-linux-x64.tar.gz
#     loom-linux-arm64.tar.gz
#     loom-darwin-x64.tar.gz
#     loom-darwin-arm64.tar.gz
#     SHA256SUMS

set -eu

fail() {
  printf '%s\n' "loom release: $*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

need_cmd bun
need_cmd tar
need_cmd gzip
need_cmd sha256sum

version="${LOOM_RELEASE_VERSION:-$(bun -e 'const fs = require("fs"); const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version; if (typeof version === "string") console.log(version);')}"
if [ -z "$version" ]; then
  fail "LOOM_RELEASE_VERSION is not set and package.json has no version"
fi

echo "LOOM release v$version"

# Build all platform targets
echo "Building Linux x64..."
bun run build:linux:x64 || fail "Linux x64 build failed"

echo "Building Linux arm64..."
bun run build:linux:arm64 || fail "Linux arm64 build failed"

echo "Building macOS x64..."
bun run build:mac:x64 || fail "macOS x64 build failed"

echo "Building macOS arm64..."
bun run build:mac:arm64 || fail "macOS arm64 build failed"

# Create release directory
release_dir="dist/releases"
mkdir -p "$release_dir"

for artifact in loom-linux-x64 loom-linux-arm64 loom-darwin-x64 loom-darwin-arm64; do
  cp "dist/$artifact" "$release_dir/$artifact" || fail "failed to copy $artifact"
  package_dir="$release_dir/package-$artifact"
  rm -rf "$package_dir"
  mkdir -p "$package_dir"
  cp "dist/$artifact" "$package_dir/loom" || fail "failed to stage $artifact tarball"
  tar -czf "$release_dir/$artifact.tar.gz" -C "$package_dir" loom || fail "failed to create $artifact tarball"
  rm -rf "$package_dir"
done

(cd "$release_dir" && sha256sum loom-* > SHA256SUMS)

echo "Release artifacts ready in $release_dir/"
echo "Version: $version"

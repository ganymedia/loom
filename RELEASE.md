# LOOM release procedure

Manual procedure for the initial installer-style GitHub Release. Do not put API keys, backend URLs, or CUI in release notes, artifacts, logs, or screenshots.

## Versioning policy

LOOM uses [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`). The first public installer-style release is `0.1.0`: it is early but usable, and its CLI, config, and interactive interfaces may still change before `1.0.0`.

- Before `1.0.0`, increment `MINOR` for new capabilities or incompatible interface changes and `PATCH` for backward-compatible fixes.
- Starting with `1.0.0`, increment `MAJOR` for incompatible public-interface changes, `MINOR` for backward-compatible capabilities, and `PATCH` for backward-compatible fixes.
- Published versions and tags are immutable. If a release is wrong, publish a new version rather than moving or replacing its tag.

`1.0.0` means LOOM's documented CLI, config, installer, and interactive interfaces are stable enough for production use. It also requires the intended richer full-screen TUI to be implemented and human-tested, plus completion of the pre-release security review, live-release verification, and independent external-user feedback gates. Passing the current minimized interactive-session guide is sufficient for `0.1.0`, not for `1.0.0`.

## Prerequisites

- Clean working tree on the release branch.
- Bun installed on the release machine.
- GitHub CLI authenticated with permission to create releases for `ganymedia/loom`.
- Bun cross-compile runtimes available locally before releasing from an air-gapped environment.

## 1. Verify the source tree

```bash
git status --short
bun run typecheck
bun run lint
bun test
```

Stop if the working tree is dirty or verification fails.

## 2. Build release artifacts

Set the release version explicitly. Use the Git tag name without a leading `v` for `LOOM_RELEASE_VERSION`.

```bash
LOOM_RELEASE_VERSION=0.1.0 bun run release
```

The release script writes these assets under `dist/releases/`:

- `loom-linux-x64`
- `loom-linux-arm64`
- `loom-darwin-x64`
- `loom-darwin-arm64`
- `loom-linux-x64.tar.gz`
- `loom-linux-arm64.tar.gz`
- `loom-darwin-x64.tar.gz`
- `loom-darwin-arm64.tar.gz`
- `SHA256SUMS`

The bare `loom-<os>-<arch>` binaries are required by `install.sh`. The tarballs are for users who prefer archive downloads.

## 3. Verify artifact checksums

```bash
(cd dist/releases && sha256sum -c SHA256SUMS)
```

Every line must report `OK`.

## 4. Smoke-test the installer against local artifacts

Use a temporary install directory so the test does not modify the operator's normal PATH.

```bash
tmp_install_dir="$(mktemp -d)"
tmp_release_host="$(mktemp -d)"
mkdir -p "$tmp_release_host/latest/download"
cp dist/releases/loom-* "$tmp_release_host/latest/download/"
LOOM_INSTALL_BASE_URL="file://$tmp_release_host" \
LOOM_INSTALL_DIR="$tmp_install_dir" \
sh install.sh
"$tmp_install_dir/loom" --version
rm -rf "$tmp_install_dir" "$tmp_release_host"
```

The installed binary must print the LOOM version and exit 0.

## 5. Create and push the tag

```bash
git tag v0.1.0
git push origin v0.1.0
```

Do not reuse or move a published tag. Create a new patch version if a release artifact is wrong.

## 6. Publish the GitHub Release

```bash
gh release create v0.1.0 \
  install.sh \
  dist/releases/loom-linux-x64 \
  dist/releases/loom-linux-arm64 \
  dist/releases/loom-darwin-x64 \
  dist/releases/loom-darwin-arm64 \
  dist/releases/loom-linux-x64.tar.gz \
  dist/releases/loom-linux-arm64.tar.gz \
  dist/releases/loom-darwin-x64.tar.gz \
  dist/releases/loom-darwin-arm64.tar.gz \
  dist/releases/SHA256SUMS \
  --repo ganymedia/loom \
  --title "LOOM v0.1.0" \
  --notes "Initial installer-style LOOM release."
```

For a prerelease, add `--prerelease`.

## 7. Verify the published installer path

From a directory that is not this repository, install the published release into a temporary directory:

```bash
tmp_install_dir="$(mktemp -d)"
tmp_installer="$(mktemp)"
curl -fsSL https://github.com/ganymedia/loom/releases/latest/download/install.sh -o "$tmp_installer"
LOOM_INSTALL_VERSION=v0.1.0 \
LOOM_INSTALL_DIR="$tmp_install_dir" \
sh "$tmp_installer"
"$tmp_install_dir/loom" --version
rm -rf "$tmp_install_dir" "$tmp_installer"
```

If testing a mirror or staging host, set `LOOM_INSTALL_BASE_URL` to that release base URL. The URL must expose either `latest/download/<asset>` or `download/<version>/<asset>` with the same asset names listed above.

## 8. Post-release checks

- Confirm the GitHub Release assets include `install.sh` plus all nine files listed in step 2.
- Confirm `SHA256SUMS` matches the uploaded assets.
- Confirm the install command documented in `README.md` points at the intended installer host.
- Record the completed release in `.loom/narrative.md` if the release was part of planned work.

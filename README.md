# LOOM

LOOM is a terminal coding agent and AI workflow pipeline manager for developers who want repeatable, inspectable workflows around their own model infrastructure.

Connect LOOM to an existing OpenAI-compatible backend, work interactively with built-in agents, run declarative pipelines, track project plans, and recall project-local prompt history. LOOM does not operate or expose a hosted inference service.

## What you can do

- **Work with terminal agents** in an interactive readline session, with agent switching and visible session status.
- **Run one-turn tasks** from scripts or the command line with `loom --prompt`.
- **Build repeatable workflows** with project-relative `.loom` pipelines, variables, branching, prompts, and parallel stages.
- **Track project work** through a structured `.loom/plan.yaml` plan.
- **Log and recall prompt history** from a project-local SQLite Prompt Store.
- **Choose a terminal theme** from the built-in theme collection.
- **Keep tool access narrow** with project-root path boundaries and allowlisted, read-only shell and Git operations.

## Install

LOOM 0.1.0 provides standalone binaries for Linux and macOS on x64 and arm64. Bun is not required to run the installed binary.

### Requirements

- A supported Linux or macOS system
- A POSIX-compatible `sh`
- `curl` for the command below
- `sha256sum` on Linux or `shasum` on macOS for binary verification

### Install the latest release

```bash
curl -fsSL https://github.com/ganymedia/loom/releases/latest/download/install.sh | sh
```

The installer selects the matching binary, verifies it against the release's published `SHA256SUMS`, and installs it as `$HOME/.local/bin/loom` by default. It prints the exact destination when it finishes.

Verify the installation:

```bash
loom --version
```

If `loom` is not found, add the default install directory to `PATH` and persist the same setting in your shell profile:

```bash
export PATH="$HOME/.local/bin:$PATH"
loom --version
```

### Pin a version or choose a directory

Download the installer first when you want to inspect it, install a specific release, or choose the destination:

```bash
installer="$(mktemp)"
curl -fsSL https://github.com/ganymedia/loom/releases/latest/download/install.sh -o "$installer"
LOOM_INSTALL_VERSION=v0.1.0 LOOM_INSTALL_DIR="$HOME/bin" sh "$installer"
rm -f "$installer"
```

Add a custom install directory to `PATH` if needed. Rerun the installer to upgrade or replace the installed binary. To uninstall, remove the `loom` binary from the destination printed during installation; LOOM leaves global configuration and project `.loom` data in place.

For mirrors, air-gapped release hosts, and manual release assets, see [RELEASE.md](RELEASE.md).

## Five-minute start

### 1. Connect your backend

Start LOOM in a project directory:

```bash
loom
```

On first run, LOOM asks for the URL of an already-running OpenAI-compatible backend and writes `$HOME/.loom/config.yaml`. If the backend requires an API key, reference its environment-variable name in config rather than writing the secret itself.

### 2. Run a one-turn task

```bash
loom --prompt "Summarize this project in three bullets"
```

LOOM discovers an available model from the selected backend, sends the request, prints the response, and exits.

### 3. Run a pipeline

This transform-only example does not call a model:

```bash
mkdir -p .loom
cat > .loom/hello.loom <<'EOF'
name: hello
version: "1"
stages:
  - id: message
    type: transform
    expression: runtime.message
EOF

loom pipeline run .loom/hello.loom --var runtime.message="hello from loom"
```

The command returns JSON with `"success": true` and `"finalOutput": "hello from loom"`.

## Everyday commands

```bash
loom --help
loom config
loom plan status
loom pipeline run <file.loom> --var key=value
loom recall --query "search terms" --top-k 5
loom log show --session <session-id>
loom theme list
```

`loom plan` commands require a project with an existing `.loom/plan.yaml`. Run `loom <command> --help` for command-specific options.

## Configuration and data

LOOM loads global configuration from `$HOME/.loom/config.yaml` and supported XDG compatibility paths, then applies project configuration from `.loom/config.yaml` and explicit runtime overrides.

- Global and project config files are created or repaired with owner-only `0600` permissions.
- Use `apiKeyEnv` to reference an API key in the process environment instead of placing the key in YAML.
- `loom config` does not print API keys, backend URLs, or header values; configured endpoints appear as `"endpoint": "[configured]"`.
- Project plans and the SQLite Prompt Store remain under the project root.
- LOOM ships no telemetry or crash reporting in 0.1.0.

See [loom-config.yaml](loom-config.yaml) for the complete configuration reference.

## Safety boundaries

Model-controlled file and command tools are restricted to the resolved project root. Shell and Git access uses narrow command and option allowlists; arbitrary shell execution, Git mutation, path traversal, and known config or credential-file reads are rejected. Symlink checks and output redaction provide additional boundaries, but users should still review commands, configuration, and issue attachments before sharing them.

## Current 0.1 limitations

- Interactive TTY sessions use Ink Static for completed scrollback while retaining a live streaming assistant region and status/input regions; persistent Ink, instant Tab cycling, and token streaming are supported, and now include resize reflow and clean Ctrl+C/Escape exits. Interactive prompts show an animated agent-specific Thinking indicator immediately after submission and remove it when the first streamed token arrives or the turn ends/errors. Typing `/` as the first input character shows an inline list of available built-in agent commands and existing session commands that filters live, case-insensitively, by executable command prefix as characters are typed. When the popup is visible, use Up/Down to move a marked selection (with wraparound) and Enter to submit the exact command; Escape closes an open slash-command popup without submitting or clearing typed input, while Escape when no popup is open still exits the interactive session. Subsequent typing reopens live discovery for preserved slash input. Bare Tab still cycles agents globally.
- Public pipeline `inject` stages fail loudly because Prompt Store recall is not yet connected to that CLI path.
- `loom --prompt` is stateless across process runs and does not stream output.
- The public Foundry marketplace, package managers beyond `install.sh`, automated release CI, and telemetry are not included.

## Help and project information

- [Report a bug or request a feature](https://github.com/ganymedia/loom/issues/new/choose)
- [User testing guide](USER_TESTING.md)
- [Changelog](CHANGELOG.md)
- [Release procedure](RELEASE.md)
- [Technical specification](SPEC.md)
- [Apache-2.0 license](LICENSE)

## Development

For maintainers and local development:

```bash
bun install
bun run typecheck
bun run lint
bun test
bun run build
```

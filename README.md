# LOOM

LOOM is a terminal coding agent and AI workflow pipeline manager for developers who want repeatable, inspectable workflows around their own model infrastructure.

Connect LOOM to an existing OpenAI-compatible backend, work interactively with built-in agents, run declarative pipelines, track project plans, and recall project-local prompt history. LOOM does not operate or expose a hosted inference service.

## What you can do

- **Work with terminal agents** in a persistent interactive Ink session, with agent switching and visible session status.
- **Run one-turn tasks** from scripts or the command line with `loom --prompt`.
- **Build repeatable workflows** with project-relative `.loom` pipelines, variables, branching, prompts, and parallel stages.
- **Track project work** through a structured `.loom/plan.yaml` plan.
- **Log and recall prompt history** from a project-local SQLite Prompt Store; interactive `/recall <query>` injects bounded, untrusted prior-session context without printing recalled content.
- **Choose a terminal theme** from the built-in theme collection.
- **Keep tool access narrow** with project-root path boundaries and allowlisted, read-only shell and Git operations.
- **Opt into post-write SAST** per project, with typed findings kept separate from agent conversation history.

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
- SAST is off by default and global config cannot enable it for a project. To opt in, add `subAgents.sast.enabled: true` to that project's `.loom/config.yaml`.
- Opted-in Developer `file-writer` changes to supported source files are scanned sequentially after successful writes. Findings are atomically retained as at most 500 newest owner-only JSONL records, bounded to 1 MiB, in `.loom/findings.jsonl`; source text, summaries, prompts, and backend details are not stored there.
- Opt-in sends changed source to the configured inference backend. Do not enable SAST for projects containing secrets or CUI; use it only where the backend and local findings storage are approved for the project's data.
- LOOM ships no telemetry or crash reporting in 0.1.0.

See [loom-config.yaml](loom-config.yaml) for the complete configuration reference.

## Safety boundaries

Model-controlled file and command tools are restricted to the resolved project root. Shell and Git access uses narrow command and option allowlists; arbitrary shell execution, Git mutation, path traversal, and known config or credential-file reads are rejected. Symlink checks and output redaction provide additional boundaries, but users should still review commands, configuration, and issue attachments before sharing them.

## Current 0.1 limitations

- Interactive TTY sessions use a terminal-height-aware persistent Ink conversation viewport with fixed agent tabs, status, and input regions; older output clips before current activity, and completed output is theme-muted and dimmed so the live exchange remains the clear focus. Assistant Markdown renders as styled headings, emphasis, lists, inline code, tables, quotes, and recognized syntax-highlighted fenced code; raw HTML remains inert text and terminal control characters are neutralized. Successful file-writer calls render bounded, red/green before-and-after line diffs in the interactive view; oversized changes show an explicit omission notice, while non-TTY output retains its concise tool-result format. Persistent Ink, instant Tab cycling, and token streaming are supported, and now include resize reflow and clean Ctrl+C/Escape exits. Interactive prompts show an animated agent-specific Thinking indicator immediately after submission and remove it when the first streamed token arrives or the turn ends/errors. Existing tool execution has a distinct animated active-agent Running N tool(s) indicator, visually separate from Thinking; it clears when execution finishes or fails and reports only tool count, not arguments/results, adding no tool/backend capability. Typing `/` as the first input character shows an inline list of available built-in agent commands and existing session commands that filters live, case-insensitively, by executable command prefix as characters are typed. When the popup is visible, use Up/Down to move a marked selection (with wraparound) and Enter to submit the exact command; Escape closes an open slash-command popup without submitting or clearing typed input, while Escape when no popup is open still exits the interactive session. Subsequent typing reopens live discovery for preserved slash input. Bare Tab still cycles agents globally.
- Interactive non-diff tool results use a green `✓` success row or red `✕` failure row in addition to outcome text; non-TTY tool-result text is unchanged.
- Wide, tall interactive TTY sessions add a rendering-only right panel with a hashed session label, directory basename, explicit runtime state, up to five pending plan tasks, and the package version. The panel hides completely on smaller terminals and is never loaded for piped input or `--prompt`.
- Interactive input uses a bordered `Message` composer with a one-cell blinking cursor; submitted prompts remain in bordered, labeled `You` blocks that are structurally distinct from assistant output. Plain Enter submits and Ctrl+J inserts a newline; Shift+Enter also inserts a newline when the terminal reports the modifier. Pasted multi-line text remains one prompt, and the input area displays these key hints. Outside the slash popup, Up/Down traverse up to 100 process-local submitted entries and restore the current unsent draft after the newest entry.
- When automatic handoff generation succeeds, interactive sessions show an amber `handoff saved` notice in the pinned status bar. Successful `/recall <query>` commands show `prior context`; non-TTY output retains its existing handoff message. If no indexed history exists, it shows `Recall unavailable: no indexed prior-session history exists.`; if history exists but `store.embeddingBackend` is absent, it shows `Recall unavailable: configure store.embeddingBackend.`; other failures show a generic sanitized message.
- Public pipeline `inject` stages fail loudly because Prompt Store recall is not yet connected to that CLI path.
- `loom --prompt` is stateless across process runs and does not stream output.
- The public Foundry marketplace, package managers beyond `install.sh`, automated release CI, and telemetry are not included.

## Help and project information

- [Report a bug or request a feature](https://github.com/ganymedia/loom/issues/new/choose)
- [User testing guide](USER_TESTING.md)
- [Changelog](CHANGELOG.md)
- [Release procedure](RELEASE.md)
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

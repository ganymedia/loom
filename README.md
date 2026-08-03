# LOOM

LOOM is a TypeScript/Bun CLI for an interactive terminal coding agent. The project is preparing its first public `0.1.0` release; that version remains unreleased while Phase 7 release-readiness work is in progress. `SPEC.md` remains the source of truth for architecture and build order.

## Development commands

```bash
bun install
bun run typecheck
bun run lint
bun test
```

## Production binary

Build the standalone local binary with Bun compile:

```bash
bun build --compile ./src/index.ts --outfile ./dist/loom
```

`dist/` is treated as generated build output and is ignored by Git. Verify the artifact directly, for example with `./dist/loom plan status`, before using it for standalone smoke tests.

## Installer-style release

Build release assets for all supported platforms with:

```bash
LOOM_RELEASE_VERSION=0.1.0 bun run release
```

The release output under `dist/releases/` includes installer-compatible `loom-<os>-<arch>` binaries, matching per-platform tarballs, and `SHA256SUMS`. The manual GitHub Releases publish procedure is documented in `RELEASE.md`.

After `0.1.0` is published, users can install the matching binary with the installer script:

```bash
curl -fsSL https://github.com/ganymedia/loom/releases/latest/download/install.sh | sh
```

For mirrors, staging, or air-gapped release hosts, set `LOOM_INSTALL_BASE_URL` before running `install.sh`.

The user-facing examples below use the installed `loom` command. Before a published release is available, maintainers can substitute the locally compiled `./dist/loom` binary.

## Configuration and backend routing

Configuration is loaded in layers:

1. Global config: compatibility paths `$XDG_CONFIG_HOME/loom/config.yaml` and `$HOME/.config/loom/config.yaml` are read first, then canonical `$HOME/.loom/config.yaml` overrides them.
2. Project config: `.loom/config.yaml` under the current project root.
3. Runtime overrides: `LOOM_PROFILE`, `--profile`, and `--backend`.

Minimal project config:

```yaml
activeProfile: default
profiles:
  default:
    defaultBackend: local
backends:
  local:
    type: openai-compatible
    baseUrl: http://127.0.0.1:8000
```

If the backend requires an API key, store only the environment-variable name in config and provide the secret through the process environment:

```yaml
backends:
  local:
    type: openai-compatible
    baseUrl: http://127.0.0.1:8000
    apiKeyEnv: VLLM_API_KEY
```

LOOM does not start or expose an inference service. `baseUrl` must point at an already-running OpenAI-compatible endpoint such as vLLM.

The backend router resolves the active profile's `defaultBackend` unless `--backend <key>` is provided. Model names are never hardcoded in code; each request resolves the currently available model list through `/v1/models` and uses a preferred model only when that model is actually present.

If no config exists and LOOM starts an interactive session, the first-run wizard prompts for an OpenAI-compatible backend endpoint and writes `$HOME/.loom/config.yaml`. Non-interactive runs keep the in-memory `default` profile with no default backend and report a clear missing-default-backend status instead of hanging for input.

Inspect the effective configuration with:

```bash
loom config
```

The command does not resolve or print API key values, but its JSON output can include configured backend URLs and environment-variable names. Treat that output as environment-sensitive and review it before sharing.

## One-turn Developer prompt

Phase 1 includes a minimal non-interactive Developer-agent prompt path:

```bash
loom --prompt "Summarize this project"
```

`--prompt` takes a literal string, not a file path. When no subcommand is provided, LOOM starts the session path, runs the startup smoke checks, sends one Developer-agent request, prints the response, and exits. `--backend <key>` overrides the active profile's default backend for this invocation.

This path resolves the active backend, discovers the current model through `/v1/models`, and sends one OpenAI-compatible `/v1/chat/completions` request. The prompt gateway currently supports `openai-compatible` backends only; unsupported backend types fail with a clear message instead of falling back silently.

The one-turn Developer agent is stateless across process runs. It does not yet provide follow-up turns or streaming output. It proves the Phase 1 backend request path without hardcoding model names.

## Session handoff

During a live session, LOOM writes `.loom/handoff.md` automatically when recorded token usage reaches 80% of the configured context limit. A later session reads that handoff and injects it as system context before the first agent turn, preserving continuity without committing local handoff state to Git.

## Project planner commands

LOOM reads `.loom/plan.yaml` through the Project Planner schema and parser:

```bash
loom plan status
loom plan done <task-id>
```

`plan status` prints a non-secret JSON summary of the current phase, milestone, task, and task counts. `plan done <task-id>` marks that task completed, advances to the next pending task, and writes the updated plan back to `.loom/plan.yaml`. `plan decompose <task-id>` is reserved for future decomposition logic and currently fails loudly instead of guessing.

## Pipeline commands

Run a project-relative `.loom` pipeline file through the public CLI:

```bash
loom pipeline run .loom/example.loom --var runtime.message="hello"
loom pipeline run .loom/example.loom --input pipeline-input.yaml
```

`--var key=value` seeds a dotted Context Bus key with a YAML-parsed value. `--input <file>` seeds keys from a project-relative YAML or JSON object. Duplicate keys and paths outside the project root fail loudly. Transform, branch, prompt, and parallel stages run through the public command; `inject` stages currently fail with a clear error because Prompt Store recall is not yet wired into the public pipeline command.

## Theme management

Theme commands manage the project TUI theme through `.loom/config.yaml`:

```bash
loom theme list
loom theme preview [theme-id]
loom theme use <theme-id>
```

`theme list` prints built-in themes and marks the active one. `theme preview` prints a theme description and color tokens without changing config. `theme use` writes `defaults.theme`; unknown IDs fall back to `loom-dark` through the theme resolver.

The current minimized interactive session uses a readline prompt and renders static Ink agent-tab and status-bar fragments, using `defaults.theme` (`loom-dark` by default). The status output shows the session id, token progress computed from `SessionManager` turn usage, and the active agent. `/agents`, `/tab`, and case-insensitive `/agent <name>` commands control agent visibility and switching. The intended richer full-screen TUI is pre-1.0 work and is not part of the current interface.

## Prompt Store commands

Prompt Store CLI commands emit JSON and use the project-local `.loom/prompt-store.sqlite` database:

```bash
loom recall --query "natural language search" --top-k 5
loom recall --vector 1,0 --top-k 5
loom log session --id <session-id> --agent <agent>
loom log add --session <session-id> --turn <index> --role <system|user|assistant|tool> --agent <agent> --content <text>
loom log show --session <session-id>
```

`recall` performs cosine-similarity recall from stored embeddings. `--query` embeds natural-language text through the configured embedding backend; `--vector` remains available for explicit numeric vectors. `log session` creates a Prompt Store session, `log add` records a prompt event, and `log show` prints ordered events for a session. The Log command validates roles and non-negative numeric fields before writing.

Embedding generation is wired into Prompt Store writes when `store.embeddingBackend` is configured. Runtime config also supports optional `store.embeddingModel`; LOOM performs fresh `GET /v1/models` discovery for that backend, treats `embeddingModel` only as a preferred hint, and posts text to OpenAI-compatible `POST /v1/embeddings` with the resolved model before storing the event and embedding together.

The pipeline engine's `inject` stages support templated recall queries when an embedding-backed recall callback is supplied programmatically. The public `loom pipeline run` command does not yet supply that callback and therefore rejects `inject` stages instead of pretending recall succeeded.

### Developer tool-call envelope

For Phase 1, the Developer agent can execute a constrained JSON response envelope from the model:

```json
{
  "content": "Short human-readable response",
  "toolCalls": [
    { "tool": "file-reader", "args": { "path": "README.md" } },
    { "tool": "file-writer", "args": { "path": "notes.txt", "content": "hello" } },
    { "tool": "shell", "args": { "command": "ls", "args": ["src"] } },
    { "tool": "git-ops", "args": { "command": "status", "args": ["--short"] } }
  ]
}
```

The Developer agent currently registers `file-reader`, `file-writer`, `shell`, and `git-ops`. LOOM injects the current `projectRoot`; model-provided `projectRoot` values are ignored. Unknown or denied tools are returned as failed tool results and are not executed.

Verification against a configured local vLLM endpoint:

```bash
bun run typecheck
bun run lint
bun test
./dist/loom --prompt "Say hello"
```

## Tool constraints

The Phase 1 tools are intentionally narrow:

- `file-reader` reads UTF-8 files inside the resolved project root.
- `file-writer` writes UTF-8 files inside the resolved project root.
- Both tools reject path traversal outside the project root.
- `file-writer` requires the target parent directory to already exist and rejects a symbolic link as the final destination component; it does not create directory trees implicitly.
- `shell` executes argv-based read-only inspection commands only: `pwd`, `ls`, `cat`, `grep`, and `wc`. It rejects native command options and canonicalizes every file operand inside the project root.
- `git-ops` executes `status`, `diff`, `log`, `show`, listing-only `branch`, `rev-parse`, and `ls-files` through command-specific read-only option allowlists; branch mutation, diff output files, external diff helpers, and no-index reads are denied.
- `shell` and `git-ops` reject absolute-path arguments, parent-directory traversal, NUL bytes, excessive output, and timeouts.
- Runtime smoke state is written to `.loom/session-smoke.txt`, which is ignored by Git.

These constraints are deliberate least-privilege behavior. Add an explicit tool and policy before allowing agents to create directories, mutate Git state, run network commands, or execute arbitrary shell commands.

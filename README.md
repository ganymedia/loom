# LOOM

LOOM is a TypeScript/Bun CLI for an interactive terminal coding agent. The project is in Phase 5 production-readiness work; `SPEC.md` remains the source of truth for architecture and build order.

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

After a release is published, users install the matching binary with the installer script:

```bash
curl -fsSL https://github.com/ganymedia/loom/releases/latest/download/install.sh | sh
```

For mirrors, staging, or air-gapped release hosts, set `LOOM_INSTALL_BASE_URL` before running `install.sh`.

## Configuration and backend routing

Configuration is loaded in layers:

1. Global config: `$XDG_CONFIG_HOME/loom/config.yaml`, or `$HOME/.config/loom/config.yaml`.
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

If no config exists, LOOM creates an in-memory `default` profile with no default backend. Startup should therefore report a clear missing-default-backend status instead of crashing.

## One-turn Developer prompt

Phase 1 includes a minimal non-interactive Developer-agent prompt path:

```bash
bun src/index.ts --prompt "Summarize this project"
```

`--prompt` takes a literal string, not a file path. When no subcommand is provided, LOOM starts the session path, runs the startup smoke checks, sends one Developer-agent request, prints the response, and exits. `--backend <key>` overrides the active profile's default backend for this invocation.

This path resolves the active backend, discovers the current model through `/v1/models`, and sends one OpenAI-compatible `/v1/chat/completions` request. The prompt gateway currently supports `openai-compatible` backends only; unsupported backend types fail with a clear message instead of falling back silently.

The one-turn Developer agent is stateless across process runs. It does not yet provide follow-up turns or streaming output. It proves the Phase 1 backend request path without hardcoding model names.

## Session handoff

During a live session, LOOM writes `.loom/handoff.md` automatically when recorded token usage reaches 80% of the configured context limit. A later session reads that handoff and injects it as system context before the first agent turn, preserving continuity without committing local handoff state to Git.

## Project planner commands

LOOM reads `.loom/plan.yaml` through the Project Planner schema and parser:

```bash
bun src/index.ts plan status
bun src/index.ts plan done <task-id>
```

`plan status` prints a non-secret JSON summary of the current phase, milestone, task, and task counts. `plan done <task-id>` marks that task completed, advances to the next pending task, and writes the updated plan back to `.loom/plan.yaml`. `plan decompose <task-id>` is reserved for future decomposition logic and currently fails loudly instead of guessing.

## Theme management

Theme commands manage the project TUI theme through `.loom/config.yaml`:

```bash
bun src/index.ts theme list
bun src/index.ts theme preview [theme-id]
bun src/index.ts theme use <theme-id>
```

`theme list` prints built-in themes and marks the active one. `theme preview` prints a theme description and color tokens without changing config. `theme use` writes `defaults.theme`; unknown IDs fall back to `loom-dark` through the theme resolver.

The live session renders its agent tab strip with Ink's `AgentTabStrip` inside `ThemeProvider`, using `defaults.theme` (`loom-dark` by default). It also renders an Ink `StatusBar` showing the session id, token progress computed from `SessionManager` turn usage, and the active agent. `/agents`, `/tab`, and `/agent <name>` still control agent visibility and switching; conversation history and tool-call output behavior are unchanged.

## Prompt Store commands

Prompt Store CLI commands emit JSON and use the project-local `.loom/prompt-store.sqlite` database:

```bash
bun src/index.ts recall --query "natural language search" --top-k 5
bun src/index.ts recall --vector 1,0 --top-k 5
bun src/index.ts log session --id <session-id> --agent <agent>
bun src/index.ts log add --session <session-id> --turn <index> --role <system|user|assistant|tool> --agent <agent> --content <text>
bun src/index.ts log show --session <session-id>
```

`recall` performs cosine-similarity recall from stored embeddings. `--query` embeds natural-language text through the configured embedding backend; `--vector` remains available for explicit numeric vectors. `log session` creates a Prompt Store session, `log add` records a prompt event, and `log show` prints ordered events for a session. The Log command validates roles and non-negative numeric fields before writing.

Embedding generation is wired into Prompt Store writes when `store.embeddingBackend` is configured. Runtime config also supports optional `store.embeddingModel`; LOOM performs fresh `GET /v1/models` discovery for that backend, treats `embeddingModel` only as a preferred hint, and posts text to OpenAI-compatible `POST /v1/embeddings` with the resolved model before storing the event and embedding together.

Pipeline `inject` stages use their `query` field as a Context Bus template before invoking recall, so stage outputs can drive retrieval (for example `query: "{{ stages.summary.output }}"`). Missing template references fail loudly instead of producing an empty recall query.

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
bun src/index.ts --prompt "Say hello"
```

## Tool constraints

The Phase 1 tools are intentionally narrow:

- `file-reader` reads UTF-8 files inside the resolved project root.
- `file-writer` writes UTF-8 files inside the resolved project root.
- Both tools reject path traversal outside the project root.
- `file-writer` requires the target parent directory to already exist; it does not create directory trees implicitly.
- `shell` executes argv-based read-only inspection commands only: `pwd`, `ls`, `cat`, `grep`, `find`, and `wc`.
- `git-ops` executes argv-based read-only Git commands only: `status`, `diff`, `log`, `show`, `branch`, `rev-parse`, and `ls-files`.
- `shell` and `git-ops` reject absolute-path arguments, parent-directory traversal, NUL bytes, excessive output, and timeouts.
- Runtime smoke state is written to `.loom/session-smoke.txt`, which is ignored by Git.

These constraints are deliberate least-privilege behavior. Add an explicit tool and policy before allowing agents to create directories, mutate Git state, run network commands, or execute arbitrary shell commands.

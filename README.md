# LOOM

LOOM is a TypeScript/Bun CLI for an interactive terminal coding agent. The project is in Phase 1 foundation work; `SPEC.md` remains the source of truth for architecture and build order.

## Development commands

```bash
bun install
bun run typecheck
bun run lint
bun test
```

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

The backend router resolves the active profile's `defaultBackend` unless `--backend <key>` is provided. Model names are never hardcoded in code; each request resolves the currently available model list through `/v1/models` and uses a preferred model only when that model is actually present.

If no config exists, LOOM creates an in-memory `default` profile with no default backend. Startup should therefore report a clear missing-default-backend status instead of crashing.

## File tool constraints

The Phase 1 file tools are intentionally narrow:

- `file-reader` reads UTF-8 files inside the resolved project root.
- `file-writer` writes UTF-8 files inside the resolved project root.
- Both tools reject path traversal outside the project root.
- `file-writer` requires the target parent directory to already exist; it does not create directory trees implicitly.
- Runtime smoke state is written to `.loom/session-smoke.txt`, which is ignored by Git.

These constraints are deliberate least-privilege behavior. Add an explicit directory-creation tool and policy before allowing agents to create directories.

# LOOM Narrative

## 2026-07-07 — Canonical layout decision

Session one found no `.loom/handoff.md`, no `BUILDING.md`, no `.loom/plan.yaml`, no `src/` tree, and no Git repository. The only implementation files were flattened starter references named `src_*.ts`. Decision: keep those flattened files as references, as requested by the operator, and create the canonical `src/...` tree alongside them so future work matches `SPEC.md` paths without losing provenance.

## 2026-07-07 — Verification and GitHub sync constraints

Implemented the initial canonical Bun/TypeScript layout, config schema/loader, backend discovery, thin CLI skeleton, TUI placeholder, and starter tests. Initial verification could not run until the operator clarified that Bun is installed and should be available. GitHub synchronization was prepared after the operator provided `https://github.com/ganymedia/loom.git`; `gh` is installed and authenticated as `ganymedia`, the local repository was initialized on `main`, and `origin` was attached.

## 2026-07-07 — Initial push policy

Decision: document that an initial push is expected only after explicit operator approval, remote safety checks, intended-file review, and verification or documented verification blockers. This prevents accidental synchronization while still allowing bootstrap work to reach the private GitHub repository once the operator authorizes it.

## 2026-07-07 — Backend router seam

Decision: add `src/backends/router.ts` as the seam between loaded configuration and per-request model discovery. The router resolves the active profile's default backend or an explicit backend override, fails loudly on missing profiles/backends, and delegates model selection to `resolveModel()` so model discovery remains fresh for every request as required by `SPEC.md`.

## 2026-07-07 — Safe file tools

Decision: add separate `file-reader` and `file-writer` tools with shared project-root path safety checks. Both tools reject traversal outside the resolved project root. The writer requires the target parent directory to already exist instead of creating directories implicitly, preserving least privilege until directory creation has an explicit tool and policy.

## 2026-07-07 — TUI startup smoke path

Decision: keep the TUI implementation minimal for Phase 1 but make startup exercise real seams: backend routing/model discovery and project-root-safe file write/read. The smoke file is `.loom/session-smoke.txt` and is ignored by Git so runtime state does not enter source history. Backend failures are reported as status instead of crashing the session, preserving graceful degradation.

## 2026-07-07 — Default profile loader fix

CLI smoke testing exposed that the config merge logic always emitted an empty `profiles` object, preventing the schema default profile from applying. Decision: make `loadConfig()` ensure the active profile exists even when no config file is present or a profile override names a new profile. This lets backend routing fail with the precise missing default-backend message instead of a misleading missing-profile error.

## 2026-07-07 — Minimal Developer prompt path

Decision: add a Phase 1 prompt gateway for OpenAI-compatible `/v1/chat/completions` and a concrete `DeveloperAgent` that uses backend routing for every turn. The CLI exposes this as `--prompt` for a one-turn request. Anthropic is intentionally not implemented in this slice; unsupported backend types fail loudly to avoid inventing an adapter without the reference design. The path proves real backend communication without hardcoding model names, but it is not yet a full interactive TUI loop or tool-calling agent runtime.

## 2026-07-07 — Constrained Developer file tool calls

Decision: allow the one-turn Developer agent to execute only `file-reader` and `file-writer` calls from a strict JSON response envelope. LOOM injects `projectRoot` from `AgentContext` into tool args, so the model cannot redirect tools outside the current project by supplying its own root. Unknown or denied tools are returned as failed tool results and are not executed. This advances Phase 1 file-tool integration while avoiding arbitrary shell or network execution.

## 2026-07-07 — Session handoff summary

Phase 1 foundation is synced to GitHub through `bab26e6`. Completed this session: backend router, safe file tools, TUI startup smoke, config default-profile fix, one-turn Developer prompt path, and constrained Developer file tool-call execution. Verification was green (`bun run typecheck`, `bun run lint`, `bun test` with 42 passing tests, plus CLI smoke). Next work is the interactive TUI loop with follow-up turns and visible tool-call results.

## 2026-07-08 — Shell and git tool boundaries

Decision: replace the draft shell/git tools' string-shell execution and broad command allowlists with argv-based `spawn` execution and least-privilege read-only allowlists. The Developer agent can now call `shell` and `git-ops`, but shell is limited to read-only inspection commands and git is limited to read-only repository inspection. Absolute-path and parent-directory arguments are rejected before execution. Verification is green with `bun run typecheck`, `bun run lint`, and `bun test` (48 passing tests). Next work remains the interactive TUI loop with follow-up turns and visible tool-call results.

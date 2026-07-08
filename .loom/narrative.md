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

## 2026-07-08 — Interactive session loop

Decision: implement follow-up turns inside `src/tui/session.ts` rather than adding logic to `index.ts`, preserving the thin CLI boundary from `SPEC.md`. The session now keeps Developer conversation history across prompts, can read deterministic injected input for tests, auto-enters stdin mode only in an interactive TTY, and prints each tool-call result after the assistant response. Static verification passed with repo-local `tsc --noEmit` and `biome check`; `bun run typecheck`, `bun run lint`, and `bun test` were blocked because `bun` is not installed on PATH in this shell. Phase 1 remains active pending exit verification with Bun and a real configured vLLM endpoint.

## 2026-07-08 — Phase 1 exit verification

Phase 1 exit verification passed after sourcing the updated Bash environment for Bun. `bun run typecheck`, `bun run lint`, and `bun test` all passed, with 49 tests green. The live CLI smoke used the project-local OpenAI-compatible backend at the operator-provided endpoint, discovered model `gemma4` via `/v1/models`, wrote and read `.loom/session-smoke.txt`, and completed `bun src/index.ts --prompt "Say hello in one short sentence."` with a Developer response. Decision: advance LOOM to Phase 2, starting with the Prompt Store schema, because the Phase 1 SPEC gate is now satisfied.

## 2026-07-08 — Prompt Store schema

Decision: define the Prompt Store schema as Bun SQLite tables for sessions, prompt events, embeddings, and schema metadata. Embedding vectors are stored as `BLOB` values with a checked dimension count so the later cosine-recall implementation can choose a compact numeric encoding without changing table shape. The schema enforces role, token-count, embedding-dimension, and session-time constraints and cascades prompt events/embeddings when a session is deleted. Verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (52 passing tests). Next work is `task-2-1-2`, the Prompt Store implementation over this schema.

## 2026-07-08 — Prompt Store implementation

Decision: implement Prompt Store operations as a synchronous Bun SQLite wrapper because `bun:sqlite` is local and synchronous; async wrappers would hide immediate database failures without adding useful concurrency. The store can create/end sessions, record ordered prompt events, store caller-provided embeddings, list session events, and perform local cosine recall over stored vectors. It does not call embedding models or hardcode model names; embedding generation remains a caller/backend concern. Verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (56 passing tests). Next work is `task-2-2-1`, the Session Manager.

## 2026-07-08 — Session Manager

Decision: implement Session Manager as pure token accounting and handoff-decision logic, leaving handoff/narrative file I/O for `task-2-2-2`. The manager tracks prompt and completion tokens across turns, marks handoff required at the default 80% context threshold, keeps that requirement sticky once crossed, supports custom thresholds for tests/future configuration, and fails loudly on invalid internal accounting values. Verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (61 passing tests). Next work is handoff document management.

## 2026-07-08 — Handoff document management

Decision: implement handoff/narrative file management as strict Markdown serialization and parsing helpers in `src/session/handoff.ts`. Missing `.loom/handoff.md` returns `undefined` because it is the normal first-session state; malformed handoff content throws because kickoff treats that file as ground truth and resuming from corrupted state is unsafe. The module writes the exact five-field handoff format from `KICKOFF.md` and appends narrative entries without replacing history. Verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (67 passing tests). Next work is the Architect agent.

## 2026-07-08 — Architect agent

Decision: implement `ArchitectAgent` as a concrete `BaseAgent` following the existing Developer-agent seam instead of introducing YAML manifest loading ahead of the planned agent loader work. The agent performs fresh backend/model discovery per turn, preserves conversation history, parses the same strict JSON tool-call envelope, permits only file read/write and read-only git operations, and explicitly denies shell/web/network-write calls per `agents/architect.yaml`. Verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (72 passing tests). Next work is the Tester agent.

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

## 2026-07-08 — Tester agent

Decision: implement `TesterAgent` as a concrete `BaseAgent` following the Developer/Architect seam while preserving the Tester YAML scope. The agent performs fresh backend/model discovery per turn, preserves conversation history, parses the same strict JSON tool-call envelope, permits file read/write, read-only shell inspection, and read-only git operations, and denies web/network-write calls per `agents/tester.yaml`. Verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (78 passing tests). Next work is the Security agent.

## 2026-07-08 — Security agent

Decision: implement `SecurityAgent` as a concrete `BaseAgent` following the existing built-in agent seam while preserving the Security YAML's read-only scope. The agent performs fresh backend/model discovery per turn, preserves conversation history, parses the same strict JSON tool-call envelope, permits only file reading and read-only git operations, and denies file writing, shell, web, and network-write calls per `agents/security.yaml`. Verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (84 passing tests). Next work is Agent tab switching.

## 2026-07-08 — Agent tab switching

Decision: implement Phase 2 agent switching as a session-level text tab strip and slash commands instead of an Ink `.tsx` component because the repo does not yet include Ink/React dependencies or TSX typecheck coverage. The session now starts with a visible built-in agent strip, supports `/tab`, `/agent <name>`, and `/agents`, and can switch turns across Developer, Architect, Tester, and Security while preserving the single session conversation history defined by `AgentContext`. The root-level theme/UI reference files were added to the plan for the later UI formatting/theme slice, and Biome now ignores flattened TSX references consistently with existing flattened TS references. Verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (89 passing tests). Phase 2 is complete; next work is Prompt assembly in Phase 3.

## 2026-07-08 — Prompt assembly

Decision: implement Prompt Intelligence assembly as a deterministic module before wiring it into `runPrompt()`, because the remaining optimization, validation, and retry stages are not built yet. `assemblePrompt()` preserves the spec order of system prompt, plan state, recall injection, session history, and current message; reserves response headroom; drops eligible old turns first; trims recall down to the configured minimum; compresses plan state only to a deterministic one-liner; and fails loudly if protected system/current/recent context cannot fit. Verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (94 passing tests). Next work is Prompt optimization.

## 2026-07-08 — Prompt optimization

Decision: implement Prompt Intelligence optimization as a pure deterministic transformation over assembled chat messages, not as backend-driven summarization, because model-generated compression and validation retries belong to later pipeline stages. `optimizePrompt()` normalizes whitespace, removes exact duplicated instruction lines already present in system context, keeps the current message last while grouping system context before history, and injects JSON-only schema enforcement when an output schema is supplied. Verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (99 passing tests). Next work is the retry loop.

## 2026-07-08 — Retry loop

Decision: implement the Prompt Intelligence retry loop as an injected-executor orchestrator instead of modifying `runPrompt()` directly, because backend fallback and temperature controls need the full transparent pipeline wiring before they can safely alter live requests. `runPromptWithRetry()` now retries failed validation with a deterministic repair prompt, includes the invalid assistant response for context, aggregates token usage, reports each attempt, exposes fallback model hints from the third retry attempt, and fails loudly with attempt reports on exhaustion. Verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (104 passing tests). The Prompt Intelligence pipeline milestone is complete; next work is the Project Planner plan.yaml schema.

## 2026-07-08 — Plan.yaml schema

Decision: implement the Project Planner schema as Zod types that mirror `plan-yaml-schema.yaml` and add cross-reference validation now, before building the parser. The schema applies documented defaults for statuses and task arrays, enforces token-estimate/status enums, rejects duplicate phase/milestone/task IDs, and fails loudly when current phase/milestone/task pointers do not match declared IDs. Verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (109 passing tests). Next work is the Plan parser.

## 2026-07-08 — Plan parser and commands

Decision: implement the Project Planner parser as a project-root-safe `.loom/plan.yaml` reader and keep mutations in separate planner operations/writer helpers so command code stays thin. The CLI now registers `loom plan status` and `loom plan done <task-id>`; `status` emits a non-secret JSON summary, and `done` marks a task complete and advances to the next pending task. `loom plan decompose` intentionally fails loudly because xlarge task decomposition logic is not specified or implemented yet. Verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (120 passing tests). Phase 3 is complete; next work is Phase 4 Pipeline parser.

## 2026-07-09 — Pipeline parser

Decision: implement the `.loom` pipeline parser as a project-root-safe YAML reader in `src/pipeline/parser.ts`, deriving validation from the fixed `PipelineDefinition` and `PipelineStage` interfaces rather than adding an unplanned separate schema file. The parser validates all five stage types, normalizes Zod optional fields to satisfy exact optional TypeScript types, rejects duplicate stage IDs before they can collide with immutable `ContextBus` stage output keys, and rejects branch targets that do not match declared stage IDs. Plan advancement initially failed because `.loom/plan.yaml` was missing required `exit_criterion` fields for phases 2-4, so those metadata fields were repaired before running `loom plan done task-4-1-1`. Verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (127 passing tests). Next work is `task-4-1-2`, stage executors.

## 2026-07-09 — Stage executors

Decision: implement the five pipeline stage executors as independently testable `StageExecutor` classes rather than building DAG orchestration early. Prompt stages resolve configured backends and model hints per execution, render strict `{{ dotted.path }}` context templates, and delegate backend calls through `runPrompt`. Transform and branch stages use deterministic dotted-path lookup instead of `eval`, avoiding an arbitrary code-execution surface. Inject stages receive a recall function by dependency injection instead of opening storage or generating embeddings directly. Parallel stages execute nested child stages through an injected executor registry and only merge child outputs, leaving graph ordering to the later DAG walker. Verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (134 passing tests). Next work is `task-4-1-3`, the DAG walker.

## 2026-07-09 — DAG walker

Decision: implement `runPipeline()` as a top-level pipeline walker over the existing parser and executor seams instead of expanding the stage contract with explicit dependency fields. The walker executes top-level stages in declaration order, uses branch executor output to skip the unselected top-level branch target, delegates nested parallel execution to `ParallelStageExecutor`, aggregates prompt token usage from stage outputs, and returns a failed `PipelineRunResult` for stage execution errors while still failing loudly for invalid runtime wiring such as missing executors or branch targets outside top-level stages. This keeps the reusable macro engine deterministic without inventing a graph-addressing syntax not present in `PipelineStage`. Verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (140 passing tests). The Pipeline Engine milestone is complete; next work is `task-4-2-1`, Sub-agent runner.

## 2026-07-09 — Sub-agent runner

Decision: implement the sub-agent runner as deterministic in-process orchestration over existing `BaseAgent` instances rather than process spawning, Foundry lookup, or a new agent abstraction. `runSubAgents()` matches a parent agent's declarative `SubAgentSpawnRule` values against session-start, file-write, and milestone events; resolves sub-agents from an injected registry; forwards only required `AgentContext` fields plus explicitly named optional context keys; aggregates token usage; and fails loudly for missing sub-agent refs or unsupported context keys. `sessionId` and `projectRoot` are always forwarded because they are required by the fixed `AgentContext` contract; optional fields remain least-privilege. Verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (145 passing tests). Next work is `task-4-3-1`, Foundry HTTP client.

## 2026-07-09 — Session wrap-up and support docs source of truth

Pipeline engine work was committed and pushed in `229d58c`. Sub-agent runner work is implemented and verified locally but not committed. Foundry client work was paused after confirming `support_docs/foundry-api.md` and `support_docs/foundry-server.toml` are now the authoritative Foundry references. Decision: treat `support_docs/` as the source of truth for reference documents; root duplicates that were byte-identical to `support_docs` were removed, while differing root files (`SPEC.md`, `BUILDING.md`, `package.json`, `biome.json`, `tsconfig.json`) were left untouched pending an explicit reconciliation decision. Next session must review and commit the uncommitted sub-agent runner, `.loom` state, `support_docs/`, and root duplicate deletions before implementing the Foundry HTTP client.

## 2026-07-09 — Foundry HTTP client

Decision: implement the Foundry client as a typed, injectable-fetch HTTP wrapper rather than CLI command wiring or credential-file handling. The client covers the package search/detail/version/download, publish/poll/yank, auth key/session, health, and readiness endpoints from `support_docs/foundry-api.md`; callers pass an API key explicitly so this layer does not read or persist secrets. Errors parse the standard Foundry error envelope and never include Authorization headers or API-key values. Verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (150 passing tests). Next work is `task-4-4-1`, Recall command.

## 2026-07-09 — Recall command

Decision: implement `loom recall` as a JSON-emitting CLI over the existing Prompt Store cosine-similarity API with an explicit `--vector` input, not text-query embedding generation. The project has stored embeddings and local cosine recall, but no built embedding-generation module yet; accepting a raw vector avoids hardcoding an embedding model or inventing backend behavior outside the current spec slice. The command fails loudly without `--vector`, validates finite numeric vectors and positive `--top-k`, opens the project-local `.loom/prompt-store.sqlite`, and closes the store after recall. Verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (153 passing tests). Next work is `task-4-4-2`, Log command.

## 2026-07-09 — Session handoff summary

Sub-agent/support-doc cleanup was committed as `95fc427`. Foundry HTTP client and Recall command are implemented and verified but not committed; `.loom/plan.yaml` now points to `task-4-4-2`, Log command. Next session should inspect/stage/commit the uncommitted Foundry/Recall work before starting the Log command.

## 2026-07-09 — Log command

Decision: implement `loom log` as a small JSON-emitting command group over the existing Prompt Store public API, with `session` to create a session, `add` to record a prompt event, and `show` to retrieve ordered session history. This avoids adding storage APIs or embedding behavior beyond the current Prompt Store contract while still covering prompt history logging and retrieval. The command validates roles and non-negative numeric fields, uses discovered model names only as caller-provided event metadata, opens the project-local `.loom/prompt-store.sqlite`, and closes the store after each operation. Verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (155 passing tests). `task-4-4-2` is marked completed; there is no next pending task in the current `.loom/plan.yaml`.

## 2026-07-09 — Phase 5 plan activation and repository-state audit

Decision: activate Phase 5 from `support_docs/PHASE-5-ADDENDUM.yaml` because the original `.loom/plan.yaml` had 34/34 tasks complete while the updated spec identifies unverified claims and unbuilt production-readiness work. The raw addendum was copied to root as `PHASE-5-ADDENDUM.yaml`; `.loom/plan.yaml` received a schema-compatible Phase 5 translation using existing status and dependency fields. `git status` at task `t5-1-1` showed only operator-provided planning/spec inputs as uncommitted (`support_docs/KICKOFF.md`, `support_docs/SPEC.md`, and `support_docs/PHASE-5-ADDENDUM.yaml`) plus the new root addendum and plan/narrative edits from this session. No implementation work was dirty before Phase 5 began. These uncommitted planning docs are intentionally carried forward as active task inputs rather than treated as failed or incomplete code.

## 2026-07-09 — Foundry API timing audit

Finding: root `foundry-api.md` did not exist when `src/foundry/client.ts` first entered Git, but `support_docs/foundry-api.md` existed in commit `95fc427` before the Foundry client was committed in `639dc4e`. The narrative entry for the Foundry HTTP client explicitly says it was implemented against `support_docs/foundry-api.md`, so the client was not built with the API reference absent from the working tree. Because the updated Phase 5 spec now treats root `foundry-api.md` as authoritative, `t5-2-5` still must re-verify `src/foundry/` against the root file and fix any drift.

## 2026-07-09 — SPEC section 7 reconciliation

Finding: the updated Section 7 initially disagreed with the filesystem: root `prompt-intelligence.config.toml` and `KICKOFF.md` were missing, while root `foundry-api.md`, `foundry-server.toml`, `loom-config.toml`, and `loom-tests.yaml` were present but still described as missing. The missing root files were copied byte-for-byte from `support_docs/`, `support_docs/SPEC.md` was corrected to list all current root reference paths, and root `SPEC.md` was replaced with the corrected support spec so session-start agents read the same Phase 5 guidance. A final glob confirmed every Section 7 exact root path exists.

## 2026-07-09 — Phase 1-4 deliverable audit

Finding: every Phase 1-4 task marked completed in `.loom/plan.yaml` has corresponding implementation and/or test files in the repository, including the Foundry, Recall, and Log work committed in `639dc4e`. The main scope gap is TUI terminology: the completed tab-switching work is a text renderer (`src/tui/tab-strip.ts:23`) called from a readline/stdout session loop (`src/tui/session.ts:210`, `src/tui/session.ts:240`, `src/tui/session.ts:243`), not an Ink component tree. That was a deliberate interim implementation, but it is narrower than the original Ink TUI requirement. Phase 5 `m5-3` is therefore required rather than optional. The flattened design references currently exist under `support_docs/src_tui_theme.ts`, `support_docs/src_tui_components.tsx`, and `support_docs/src_cli_commands_theme.ts`; they have not yet been promoted into live `src/` modules.

## 2026-07-09 — Foundry client root-spec re-verification

Decision: re-verify `src/foundry/client.ts` against root `foundry-api.md` now that the root reference exists. Drift found: the client covered package, auth, health, and readiness endpoints but did not expose namespace endpoints or public test-run detail. Added typed methods for `GET /namespaces/:name`, `POST /namespaces`, `POST /namespaces/:name/members`, and `GET /test-runs/:publish_id`, with tests asserting encoded paths and request bodies. Verification passed with `bun test tests/foundry/client.test.ts`, `bun run typecheck`, `bun run lint`, `bun test` (157 passing tests), and a final `bun run typecheck`.

## 2026-07-09 — Ink dependency installation

Decision: satisfy `t5-3-1` by adding `ink` and `react` as runtime dependencies and `@types/react` as a development dependency through `bun add`, so `package.json` and `bun.lock` remain synchronized. Verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (157 passing tests). Next work is `t5-3-2`, promoting the flattened TUI theme reference into `src/tui/theme.ts`.

## 2026-07-09 — TUI theme module promotion

Decision: promote `support_docs/src_tui_theme.ts` into live code as `src/tui/theme.ts`, preserving the built-in theme definitions and semantic color helpers while formatting it to repository style. Added `tests/tui/theme.test.ts` to verify default theme resolution, fallback behavior, status/token color mapping, and deterministic agent tab colors. Verification passed with `bun test tests/tui/theme.test.ts`, `bun run typecheck`, `bun run lint`, and `bun test` (161 passing tests). Next work is `t5-3-3`, promoting the flattened Ink component reference into `src/tui/components.tsx`.

## 2026-07-09 — TUI component module promotion and TSX coverage

Decision: promote `support_docs/src_tui_components.tsx` into live code as `src/tui/components.tsx`, preserving the ThemeProvider, semantic badges, progress bar, AgentTabStrip, StatusBar, Divider, and SectionLabel components while formatting to repository style. Pull `t5-3-8` forward with this task because adding live TSX without TypeScript coverage would create an unverified module; `tsconfig.json` now enables `jsx: react-jsx` and includes `src/**/*.tsx` plus `tests/**/*.tsx`. Biome already covered live TSX because it only ignores flattened `src_*.tsx` references. Added `tests/tui/components.test.tsx` to verify component element construction under `ThemeProvider`. Verification passed with `bun run typecheck`, `bun test tests/tui/components.test.tsx`, `bun run lint`, and `bun test` (162 passing tests). Next work is `t5-3-4`, promoting the theme CLI command reference.

## 2026-07-09 — Theme CLI and config default

Decision: promote the theme command reference into `src/cli/commands/theme.ts` and pull `t5-3-7` forward because `theme use` needs a real config field. Added `defaults.theme` to the config schema with default `loom-dark`, registered `loom theme list/use/preview`, and implemented `theme use` as a project-local `.loom/config.yaml` update that preserves existing mappings and writes only `defaults.theme`. The command does not read or persist secrets. README now documents the theme commands. Verification passed with `bun run typecheck`, targeted config/theme command tests, `bun run lint`, and `bun test` (165 passing tests). Next work is `t5-3-5`, rebuilding the live session renderer as an Ink component tree.

## 2026-07-09 — Ink AgentTabStrip session renderer

Decision: replace the live session's interim text tab-strip formatting with an Ink-rendered `AgentTabStrip` wrapped in `ThemeProvider`, while keeping the existing deterministic input loop and agent command handling in `src/tui/session.ts`. The session now emits a bordered Ink tab component for startup, `/agents`, `/tab`, and `/agent <name>` output; conversation history, tool-call display, and active-agent switching remain verified by session tests. `ThemeProvider.children` is optional so non-JSX `createElement` callers can pass canonical React children without violating lint. Verification passed with `bun test tests/tui/session.test.ts`, `bun run typecheck`, `bun run lint`, and `bun test` (165 passing tests). Next work is `t5-3-6`, wiring `StatusBar` into the live session loop.

## 2026-07-09 — Live StatusBar session wiring

Decision: wire the existing `StatusBar` component into the live session renderer by reusing `SessionManager` for token accounting instead of duplicating counters in `src/tui/session.ts`. Each running session now creates one token manager, renders session id, token percentage, and active agent at startup, after agent visibility/switch commands, and after each prompt turn using the turn's reported prompt/completion tokens. Added an injectable `contextLimit` session option so tests can assert deterministic percentages without hardcoding a model-specific context window. Verification passed with `bun test tests/tui/session.test.ts`, `bun run typecheck`, `bun run lint`, and `bun test` (165 passing tests). `m5-3` is complete; next work is `t5-4-1`, implementing the embeddings client.

## 2026-07-09 — Embeddings backend client

Decision: implement `generateEmbedding()` as an OpenAI-compatible backend client that resolves `store.embeddingBackend` through the existing backend router and performs fresh `/v1/models` discovery for every request. `store.embeddingModel` is only a preferred hint; if absent or undiscovered, the first discovered model is used. The runtime config schema now includes a minimal `store` block for embedding backend/model and default recall depth, while reference TOML parsing remains out of scope because the current loader reads YAML. The client validates non-empty inputs and numeric embedding vectors, supports configured backend headers/API-key env vars without logging secret values, and fails loudly for unsupported backend types or malformed responses. Verification passed with targeted embeddings/config tests, `bun run typecheck`, `bun run lint`, and `bun test` (171 passing tests). Next work is `t5-4-2`, wiring embedding generation into Prompt Store writes.

## 2026-07-09 — Automatic Prompt Store embeddings

Decision: make `PromptStore.recordEvent()` asynchronous so embedding generation can complete before the event write is committed, rather than running a fire-and-forget background task that could fail silently. `PromptStore` now accepts an optional embedding generator; when configured, it generates the vector first and then stores the prompt event plus embedding in one SQLite transaction. If embedding generation fails, the event is not inserted, preserving the Phase 5 requirement that stored session turns are embedded automatically rather than partially recorded. `loom log add` receives the loaded runtime config from `index.ts` and configures this generator when `store.embeddingBackend` is set; unconfigured stores keep the old no-embedding behavior for tests and manual vector workflows. Verification passed with targeted store/log/recall tests, `bun run typecheck`, `bun run lint`, and `bun test` (173 passing tests). Next work is `t5-4-3`, adding natural-language `loom recall --query`.

## 2026-07-09 — Natural-language recall query

Decision: add `loom recall --query` as the primary semantic recall path while preserving explicit `--vector` for manual/testing workflows. The command now receives loaded runtime config from `index.ts`, embeds query text through `generateEmbedding()` with fresh model discovery, and rejects ambiguous input when both `--query` and `--vector` are supplied. This keeps model names out of code and preserves the existing cosine recall implementation over stored vectors. Verification passed with targeted recall tests, `bun run typecheck`, `bun run lint`, and `bun test` (174 passing tests). Next work is `t5-4-4`, wiring pipeline inject stages to use Context Bus state as recall queries.

## 2026-07-09 — Context Bus recall injection

Decision: update `InjectStageExecutor` so inject-stage `query` values are rendered through the existing Context Bus template renderer before recall is invoked. This lets pipeline stages use prior outputs such as `{{ stages.summary.output }}` as semantic recall queries while preserving the injected recall callback seam and avoiding direct storage/backend access inside the executor. Missing template references fail loudly through the shared `renderTemplate()` behavior. Verification passed with targeted pipeline executor tests, `bun run typecheck`, `bun run lint`, and `bun test` (175 passing tests). Phase 5 milestone `m5-4` is complete; next work is `t5-5-1`, integration testing automatic handoff past the 80 percent token threshold.

## 2026-07-09 — Session wrap-up before handoff

Phase 5 progressed from Ink StatusBar wiring through the end of embedding generation milestone `m5-4`. Completed and pushed commits: `a38f66e` (StatusBar), `5d16f34` (embeddings backend client), `92742e0` (Prompt Store automatic embeddings), `3ea32db` (natural-language recall), and `181af85` (Context Bus recall injection). Latest full verification was green with `bun run typecheck`, `bun run lint`, and `bun test` (175 passing tests). `.loom/plan.yaml` is advanced to `t5-5-1`; Phase 5 still has pending Session Continuity and production packaging tasks.

## 2026-07-10 — Automatic handoff live-loop verification

Decision: wire automatic handoff generation in `src/tui/session.ts` immediately after live-session token accounting, rather than moving file I/O into `SessionManager`. `SessionManager` remains pure accounting and decision logic; the TUI session loop owns user-visible side effects and writes `.loom/handoff.md` once when `currentDecision().required` becomes true. Branch detection reuses the existing read-only `git-ops` tool and falls back to an explicit unknown marker if Git metadata is unavailable, so handoff creation is not lost in temporary or non-Git test projects. Verification passed with `bun test tests/tui/session.test.ts`, `bun run typecheck`, `bun run lint`, and `bun test` (176 passing tests). `t5-5-1` is complete; next work is `t5-5-2`, confirming handoff ingestion reaches the first agent turn context.

## 2026-07-10 — Handoff ingestion into first agent turn

Decision: inject an existing `.loom/handoff.md` as a system conversation-history message before the first user prompt in `startSession()`. This uses the same message path every built-in agent already sends to the backend, so the handoff affects the actual first model request instead of remaining a parsed file on disk. Malformed handoff files continue to fail loudly through `readHandoff()`. Verification passed with `bun test tests/tui/session.test.ts`, `bun run typecheck`, `bun run lint`, and `bun test` (177 passing tests). `m5-5` is complete; `.loom/plan.yaml` now advances to `t5-6-1`, production binary compilation.

## 2026-07-10 — Production binary compile

Decision: add `react-devtools-core` as an explicit runtime dependency because Bun compile resolves Ink's dynamic devtools import from `ink/build/devtools.js` even though Ink marks that peer optional at runtime. `bun build --compile ./src/index.ts --outfile ./dist/loom` now produces a local standalone binary, and `./dist/loom plan status` executes successfully. The artifact is about 96.9 MB and remains ignored under the existing `dist/` build-output policy; do not force-add it without operator approval. Adjacent CLI issue found: `./dist/loom --version` falls through to session startup and `./dist/loom --help` prints help plus a fatal wrapper message. `t5-6-1` is complete; next work is `t5-6-2`, smoke testing the compiled binary standalone against a real configured backend.

## 2026-07-10 — Compiled binary real-backend smoke

Decision: satisfy `t5-6-2` with the compiled artifact directly (`./dist/loom --prompt "Say hello in one short sentence."`) rather than through `bun run`, because the task specifically requires standalone binary execution against a real configured backend. The binary discovered backend `jcdx-local`, selected model `gemma4`, verified session file read/write, and received a Developer response. The response reflected the local ignored `.loom/handoff.md`, which is expected after handoff ingestion but means future smoke prompts should clear or control local handoff state when deterministic output matters. `t5-6-2` is complete; `.loom/plan.yaml` now advances to `t5-6-3`, build target verification.

## 2026-07-10 — Push and handoff preparation

Session work through `t5-6-2` was pushed to `main` at `8cbe1ad`, then README production-binary documentation was added, verified with `bun run typecheck`, `bun run lint`, and `bun test` (177 passing tests), committed as `a74b2a1`, and pushed. The tracked working tree was clean before handoff preparation. Phase 5 remains active with pending task `t5-6-3`, build target verification for Linux/macOS.

## 2026-07-10 — Linux and macOS build target verification

Decision: add explicit Bun compile scripts for Linux and macOS across x64 and arm64 rather than a single architecture per OS, because `t5-6-3` requires platform target coverage and macOS/Linux deployments may differ by CPU architecture. Verified `bun run build:linux` and `bun run build:mac`, producing ignored `dist/loom-linux-x64`, `dist/loom-linux-arm64`, `dist/loom-darwin-x64`, and `dist/loom-darwin-arm64` artifacts. Static and regression verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (177 passing tests). Adjacent risk: cross-target compilation downloaded missing Bun runtime artifacts during verification, so air-gapped deployments need those compiler runtimes pre-seeded. `t5-6-3` is complete; `.loom/plan.yaml` now advances to `t5-6-4`, full regression and live end-to-end verification.

## 2026-07-10 — Phase 5 full regression and completion

Decision: satisfy `t5-6-4` as a verification task rather than adding new features. Full regression passed with `bun run typecheck`, `bun run lint`, and `bun test` (177 passing tests). Live verification covered `loom plan status`, a real `runPipeline()` DAG-walker execution with branch skipping, and a controlled `startSession()` run that switched agents with `/tab`, received an agent response, and wrote automatic `.loom/handoff.md` in an isolated `/tmp/opencode` project root after crossing the token threshold. `.loom/plan.yaml` now has 61/61 tasks completed, zero pending or in-progress statuses, and Phase 5 is marked complete. Adjacent gaps remain: there is no registered public `loom pipeline` CLI command, so the pipeline run was verified through the module entrypoint; cross-target Bun compilation may require pre-seeded compiler runtimes in an air-gapped enclave.

## 2026-07-10 — Phase 6 plan activation

Decision: trust the chronological narrative over stale `.loom/handoff.md` because the handoff still named `t5-6-3` while later narrative entries record `t5-6-3`, `t5-6-4`, and Phase 5 completion. `.loom/plan.yaml` did not contain `phase-6`, so `support_docs/PHASE-6-ADDENDUM.yaml` was merged before new implementation work. The addendum was translated into the existing planner schema rather than pasted verbatim because the live schema accepts `pending/in_progress/completed/blocked`, `description`, and `dependencies`, while the addendum uses `active/planned`, `notes`, and `depends_on`. Phase 6 is now active at `m6-1` / `t6-1-1`.

## 2026-07-10 — CLI help and version fallthrough fix

Decision: remove Commander's `exitOverride()` from the production entrypoint and explicitly exclude `--version` / `-V` from session startup. The previous entrypoint treated Commander's intentional help/version exits as fatal wrapper errors and did not recognize version flags as terminal CLI actions, causing `--version` to enter session startup. A real entrypoint smoke test now executes `bun src/index.ts --version` and `bun src/index.ts --help`, asserting exit code 0 and no fatal wrapper output. Verification passed with `bun test tests/cli/index.test.ts`; `m6-1` is complete and `.loom/plan.yaml` now advances to `t6-2-1`.

## 2026-07-10 — Pipeline command wrapper

Decision: add `src/cli/commands/pipeline.ts` as a thin CLI wrapper over the existing parser, executor registry, and DAG walker instead of reimplementing pipeline execution in command code. The wrapper emits the existing `PipelineRunResult` as JSON and marks failed pipeline runs with exit code 1. The default inject-stage callback fails loudly unless recall behavior is injected, because returning fake recall data would make inject pipelines appear to work while skipping Prompt Store semantics. Verification passed with `bun test tests/cli/commands/pipeline.test.ts`, `bun run typecheck`, and `bun run lint`; `.loom/plan.yaml` now advances to `t6-2-2`.

## 2026-07-10 — Public pipeline command registration

Decision: register the pipeline command group in `src/index.ts` by importing the existing wrapper and passing loaded runtime config, preserving `index.ts` as composition-only command wiring. The entrypoint help smoke now asserts `pipeline` appears in public help output, proving the command is visible to users. Verification passed with targeted CLI tests; `.loom/plan.yaml` now advances to `t6-2-3`.

## 2026-07-10 — Pipeline Context Bus variable injection

Decision: implement `loom pipeline run --input <file>` as a project-root-safe YAML/JSON object loader and `--var key=value` as a dotted Context Bus key with a YAML-parsed value. Duplicate keys fail loudly instead of letting later inputs silently override earlier context, because pipeline runs must be auditable and deterministic. Verification covers input-file values, CLI variables, branch skipping, and duplicate-key failure; `.loom/plan.yaml` now advances to `t6-2-4`.

## 2026-07-10 — Pipeline command end-to-end entrypoint smoke

Decision: satisfy `t6-2-4` with a subprocess test that runs the real `src/index.ts` entrypoint from a temporary project root, not just a Commander instance in memory. The smoke writes a project-local `.loom/entry.loom`, invokes `loom pipeline run` with `--var`, and verifies the JSON `PipelineRunResult` succeeds with the expected final output. Full verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (182 passing tests). `m6-2` is complete; `.loom/plan.yaml` now advances to `t6-3-1`.

## 2026-07-10 — Config reference file replacement

Decision: replace root `loom-config.toml` with root `loom-config.yaml` copied from the operator-provided `support_docs/loom-config.yaml`, because Phase 6 requires the canonical user-facing config reference to match the runtime loader's YAML format. The support-doc copy still contains schema drift to be cleaned in later config reconciliation tasks, but the root path replacement itself is complete: root `loom-config.yaml` exists and root `loom-config.toml` is deleted. Verification passed with `bun run typecheck` and `bun run lint`; `.loom/plan.yaml` now advances to `t6-3-2`.

## 2026-07-10 — SPEC section 7 config path update

Decision: update root `SPEC.md` section 7 to list `loom-config.yaml` and `~/.loom/config.yaml` instead of the deleted TOML reference, then re-check every exact path listed in the section 7 table exists at the repository root. This closes the session-start blocker that initially reported `loom-config.yaml` missing from root. Verification passed with the path check plus `bun run typecheck` and `bun run lint`; `.loom/plan.yaml` now advances to `t6-3-3`.

## 2026-07-10 — User-facing config doc path update

Decision: update the root `SPEC.md` deployment-tier text from the old TOML runtime config path to `~/.loom/config.yaml`. Root `README.md` and `BUILDING.md` do not contain the stale user-facing TOML config example, and support-doc files already have separate uncommitted operator changes, so broader support-doc cleanup is deferred to the explicit full-repo search/justify task `t6-3-4`. Verification passed with `bun run typecheck` and `bun run lint`; `.loom/plan.yaml` now advances to `t6-3-4`.

## 2026-07-10 — Full config TOML reference cleanup

Decision: remove remaining user-facing runtime-config TOML examples across root and support docs, delete obsolete `support_docs/loom-config.toml`, and validate both `loom-config.yaml` references against `src/config/schema.ts`. `prompt-intelligence.config.toml` and `foundry-server.toml` remain justified because they are actually TOML files; remaining `loom-config.toml` mentions are migration/history notes in Phase 6 planning, KICKOFF, SPEC changelog text, and narrative history rather than active config examples. The grep search no longer reports `~/.loom/config.toml` or `.loom/config.toml` outside historical notes, and `m6-3` is complete. `.loom/plan.yaml` now advances to `t6-4-1`.

## 2026-07-10 — Session handoff summary

Phase 6 is merged into `.loom/plan.yaml` and active. This session completed and committed Phase 6 activation, CLI help/version fixes (`m6-1`), public pipeline command exposure (`m6-2`), and YAML config reference reconciliation (`m6-3`). Latest full verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (183 passing tests). Phase 6 has 7 tasks remaining: `t6-4-1` through `t6-4-4` and `t6-5-1` through `t6-5-3`. Next action is `t6-4-1`, the installer script; do not start new work after this handoff entry.

## 2026-07-10 — Installer script

Decision: implement `install.sh` as a POSIX shell installer that detects Linux/macOS and x64/arm64, downloads the matching `loom-<os>-<arch>` binary from GitHub Releases by default, and installs it as `loom` under `~/.local/bin` or an explicit `LOOM_INSTALL_DIR`. `LOOM_INSTALL_BASE_URL` and `LOOM_INSTALL_VERSION` make the release host/version configurable for tests, mirrors, and air-gapped staging without editing the script. Verification covers a local `file://` release host and executable installed binary; `.loom/plan.yaml` now advances to `t6-4-2`.

## 2026-07-13 — Release artifact remediation

Decision: remediate the local model's attempted `t6-4-2` release work instead of building on it, because it left typecheck/lint/tests red and tested throwaway scripts rather than `scripts/release.sh`. The release script now resolves package versions with `bun -e`, reuses the existing four platform build scripts, publishes installer-compatible bare binaries plus per-platform tarballs, and writes one checksum manifest covering all release assets. Tests execute the real script with a fake Bun build shim, verify checksum validation, and confirm tarball contents. Verification passed with `bun test tests/release.test.ts`, `bun run typecheck`, `bun run lint`, `bun test` (188 passing tests), real `LOOM_RELEASE_VERSION=0.1.0-test bun run release`, and `sha256sum -c dist/releases/SHA256SUMS`. `t6-4-2` is complete; `.loom/plan.yaml` now advances to `t6-4-3`.

## 2026-07-13 — GitHub Releases publish procedure

Decision: document the initial manual GitHub Releases procedure in `RELEASE.md` rather than adding CI/CD, because `t6-4-3` explicitly requires a manual publish path. The runbook covers pre-release verification, `bun run release`, checksum validation, local installer smoke testing, immutable tag creation, uploading `install.sh` plus all release assets, and post-release installer verification. `README.md` now points maintainers to `RELEASE.md` and shows the published installer command. Verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (188 passing tests). `t6-4-3` is complete; `.loom/plan.yaml` now advances to `t6-4-4`.

## 2026-07-13 — First-run config wizard

Decision: implement the first-run wizard as a CLI startup concern instead of putting prompts in `loadConfig()`, because config loading must remain scriptable and non-interactive subcommands must not hang. `ensureFirstRunConfig()` writes canonical `$HOME/.loom/config.yaml` for interactive session startup when no global config exists, validates an `http://` or `https://` OpenAI-compatible backend URL, and skips any existing supported global config path instead of creating an override. The loader now reads compatibility paths first and `$HOME/.loom/config.yaml` last so the canonical path has final precedence; README documents the new path/behavior. The docs agent reviewed the wording as acceptable. Verification passed with targeted config/CLI tests, `bun run typecheck`, `bun run lint`, and `bun test` (194 passing tests). `m6-4` is complete; `.loom/plan.yaml` now advances to `m6-5` / `t6-5-1`.

## 2026-07-13 — User testing guide corrected against installed binary

Decision: create root `USER_TESTING.md` and revise it from the support draft based on the operator's external installed-binary transcript in `LOOM_test.txt`. The guide now matches observed behavior: it supports using a full `LOOM_BIN` path when the install directory is not on PATH, runs pipeline commands from the scratch project root, documents lowercase agent IDs, and includes a manual config fallback when the first-run prompt cannot accept input. Installed-binary verification passed for version/help/theme/pipeline/config/log/recall guide commands using the local m6-4 release artifacts. Static verification passed with `bun run typecheck`, `bun run lint`, and targeted release/config/CLI tests (34 passing). `t6-5-1` is complete; `.loom/plan.yaml` now advances to `t6-5-2`. The full no-repository dry run remains pending and is not claimed complete.

## 2026-07-13 — Phase 6 remediation merge and first-run stdin fix

Decision: trust the real installed-binary transcript over the stale handoff and completed `m6-4` status. `.loom/plan.yaml` lacked `m6-6`, so the Phase 6 remediation addendum was merged before continuing `m6-5`; the only available addendum copy was `support_docs/PHASE-6-REMEDIATION.yaml`, and a root `PHASE-6-REMEDIATION.yaml` was added to match the spec's authoritative path. Root cause for the first-run prompt failure was twofold: `src/index.ts` called `main()` without top-level awaiting it, and Bun-compiled `readline/promises` still failed to consume delayed pty input after that boundary was fixed. The first-run prompt now uses explicit stdin data handling. Verification passed with `bun run typecheck`, `bun run build`, and a pty-backed run of the compiled `dist/loom` from a clean non-repo directory with temporary HOME; the binary accepted a backend URL, wrote `~/.loom/config.yaml`, and the subsequent session used that backend URL. `t6-6-1` is complete; `.loom/plan.yaml` now advances to `t6-6-2`.

## 2026-07-13 — Compiled first-run pty regression

Decision: cover the first-run bug with a compiled-binary regression instead of another direct `ensureFirstRunConfig()` unit test, because the previous unit-level coverage missed the real terminal failure. `tests/cli/index.test.ts` now builds a temporary compiled `loom` binary, runs it under a Python-managed pty from a clean non-repository project directory with temporary HOME, waits for the prompt, sends a backend URL, exits the session, and asserts that the written `~/.loom/config.yaml` is used by the subsequent startup path. This is automated pty coverage only; it does not satisfy the later human real-terminal dry-run gate. Targeted verification passed with `bun test tests/cli/index.test.ts`. `t6-6-2` is complete; `.loom/plan.yaml` now advances to `t6-6-3`.

## 2026-07-13 — Strict top-level CLI input rejection

Decision: classify valid session-only arguments before first-run prompting and let Commander parse every other top-level input, because the transcript showed mistyped flags and stray URL positionals silently starting a session. `src/index.ts` now runs first-run config before `loadConfig()` only for valid session invocations, preserving same-startup use of newly written `~/.loom/config.yaml`, while `--VERSION` and unexpected positionals fail loudly before session startup. Tests cover both rejected inputs and retain the compiled first-run pty regression. Verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (197 passing tests). `t6-6-3` is complete; `.loom/plan.yaml` now advances to `t6-6-4`.

## 2026-07-13 — Startup banner cleanup

Decision: rename the startup banner rather than remove all startup status, because the surrounding output still gives useful backend/file-tool smoke status and the Ink tab/status renderer is active immediately afterward. The traced source was the live `startSession()` banner, not documentation; `LOOM TUI placeholder started.` is now `LOOM session started.` and tests assert the product wording. Verification passed with targeted TUI and CLI tests. `t6-6-4` is complete; `.loom/plan.yaml` now advances to `t6-6-5`.

## 2026-07-13 — Case-insensitive agent command matching

Decision: resolve `/agent <name>` through canonical built-in agent IDs after lowercasing user input, rather than changing the stored agent IDs or display labels. This preserves lowercase internal names while accepting operator input such as `/agent Security` and `/agent Tester`. Targeted TUI tests cover the resolver and a mixed-case session command. `t6-6-5` is complete; `.loom/plan.yaml` now advances to `t6-6-6`, the full clean real-terminal dry run gate.

## 2026-07-13 — Remediation session handoff summary

Phase 6 remediation `m6-6` is merged into `.loom/plan.yaml`; 5 of 6 remediation tasks are complete and 1 remains (`t6-6-6`, the real human terminal dry run). Phase 7 is not merged. This session committed `d3d8a21` (compiled first-run prompt fix), `abbe59e` (compiled pty regression), `6e2899e` (strict top-level CLI input rejection), `347600e` (startup banner rename), and `847a540` (mixed-case agent commands). Latest full verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (198 passing tests). Phase 6 overall still has 3 pending tasks: `t6-5-2`, `t6-5-3`, and `t6-6-6`; do not mark any dry-run task complete without a real human terminal session using an installed binary via `install.sh`. Working tree is not clean because pre-existing/operator files remain unstaged outside this session's commits.

## 2026-08-03 — Real-terminal guide preflight correction

Decision: update the `USER_TESTING.md` agent-switch smoke to use `/agent Tester` and `/agent Security` and expect both to succeed, because the guide still described the pre-remediation case-sensitive behavior after `t6-6-5` made matching case-insensitive. A human dry run against that stale expectation would not verify the remediation accurately. Documentation review, `bun run typecheck`, and `bun run lint` passed. This correction does not complete `t6-6-6`; the required human-operated real-terminal run using a binary installed through `install.sh` remains pending.

## 2026-08-03 — Phase 6 human dry run completed

Decision: mark `t6-6-6` and `t6-5-2` complete from the operator's explicit confirmation that the full corrected `USER_TESTING.md` passed in a real terminal, outside the repository, using a binary installed through `install.sh`, including first-run URL entry, config persistence, and subsequent use. Mark `t6-5-3` complete with no further correction because the operator confirmed every guide section matched; the preference to test a richer full-screen TUI is retained as release feedback rather than treated as an unreported guide failure. `m6-5`, `m6-6`, and Phase 6 are complete. Phase 6 remediation `m6-6` is merged with 0 tasks remaining; Phase 7 is not yet merged.

## 2026-08-03 — Phase 7 addendum merged

Decision: add the operator-provided Phase 7 addendum at the root path required by SPEC section 13 and merge its four milestones into `.loom/plan.yaml` only after Phase 6, `m6-6`, and the clean human dry run completed. The root addendum is byte-identical to `support_docs/PHASE-7-ADDENDUM.yaml`; the merged plan normalizes `planned` to the plan schema's status vocabulary and maps addendum notes into required descriptions and dependencies. Phase 7 is active at `m7-1` / `t7-1-1` with 15 tasks remaining. The operator's preference for testing a richer full-screen TUI remains explicit release feedback to consider when deciding what version 1.0.0 promises.

## 2026-08-03 — Release version policy

Decision: make `0.1.0` LOOM's first public installer-style release, signaling early but usable, and reserve `1.0.0` for stable documented interfaces after the intended richer full-screen TUI is implemented and human-tested. `RELEASE.md` now documents pre-1.0 and post-1.0 SemVer bump rules, immutable published tags, and the security, live-release, and independent-feedback gates for 1.0. Documentation review confirmed the policy is SemVer-correct and aligned with the operator's decision; `t7-1-1` is complete and Phase 7 advances to `t7-1-2` with 14 tasks remaining.

## 2026-08-03 — Initial user-facing changelog

Decision: add `CHANGELOG.md` with an `Unreleased` 0.1.0 entry describing completed user-facing capabilities from Phases 1-6 without copying internal phase history or claiming pending Phase 7 gates are done. The changelog explicitly distinguishes the current minimized interactive UI from the richer full-screen TUI required before 1.0.0 and identifies public Foundry, additional package managers, CI/CD, and telemetry as out of scope for 0.1.0. Typecheck and lint passed. A documentation review incorrectly treated build/publish instructions as evidence of publication, but identified a valid stale Phase 5 statement in `README.md`; that remains scoped to `t7-1-4`. `t7-1-2` is complete and Phase 7 advances to `t7-1-3` with 13 tasks remaining.

## 2026-08-03 — Apache-2.0 license

Decision: adopt the operator-selected Apache License 2.0 for LOOM, add the canonical unmodified text as root `LICENSE`, and declare the `Apache-2.0` SPDX identifier in `package.json`. No copyright owner was invented because no approved legal entity name was provided; the standard appendix placeholder remains part of the canonical license text. Read-only review confirmed the license text is canonical and contains no sensitive content, and typecheck, lint, and package metadata verification passed. `t7-1-3` is complete and Phase 7 advances to `t7-1-4` with 12 tasks remaining.

## 2026-08-03 — README verified against compiled CLI

Decision: correct `README.md` against the current compiled product rather than preserving stale release prose. The README now marks 0.1.0 unreleased and Phase 7 active, documents canonical config precedence and environment-sensitive `loom config` output, uses installed-command examples, adds public pipeline `--var`/`--input` usage, states that public `inject` stages fail until recall is wired, and accurately describes the minimized readline interface with static Ink fragments instead of a full-screen TUI. A freshly compiled 0.1.0 binary passed version/help/config-help/pipeline-help, theme list/preview, plan status, and real transform-pipeline runs using both `--var` and `--input`; documentation review found no remaining inaccurate wording. Full verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (198 passing tests). `t7-1-4` and `m7-1` are complete; Phase 7 advances to `m7-2` / `t7-2-1` with 11 tasks remaining. The fact that `loom config` prints backend URLs is explicitly deferred to the required output/secrets audit in `t7-2-2`, not treated as safe by default.

## 2026-08-03 — Path and command boundary security remediation

Decision: block `t7-2-1` until three high-severity audit findings were fixed instead of trusting the prior passing suite. The shell tool no longer exposes `find`, rejects native options and absolute operands, and canonicalizes file operands to stop execution, mutation, and symlink reads outside the project. Git operations now use per-subcommand option allowlists, with listing-only branch behavior and explicit rejection of mutating branch flags, diff output files, no-index reads, and external helpers. File and planner writes reject final-component symlinks and open with `O_NOFOLLOW`, with tests proving external targets remain unchanged. Follow-up review closed all three high findings and found no new high issue; full verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (207 passing tests). Medium hardening debt remains for process-group termination/output buffering, parser input-size limits, Foundry request/response limits, and intermediate-parent replacement races. `t7-2-1` is complete and Phase 7 advances to `t7-2-2` with 10 tasks remaining.

## 2026-08-03 — Phase 7 security handoff summary

Phase 6 remediation `m6-6` is merged and complete with 0 tasks remaining. Phase 7 is merged with 10 tasks remaining and is active at `m7-2` / `t7-2-2`. This session completed and committed the operator's full human Phase 6 dry run, Phase 7 activation, the 0.1.0 SemVer policy, initial changelog, Apache-2.0 license, compiled-binary README verification, and path/shell/Git/write-boundary security remediation. Latest full verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (207 passing tests). The next action is the output/secrets audit, beginning with the known environment-sensitive backend-URL output from `loom config`. The working tree is not clean only because pre-existing/operator support docs, transcript, and release-helper files remain unstaged; do not overwrite or commit them without operator direction.

## 2026-08-07 — Secret output and record boundary remediation

Decision: fail `t7-2-2` until runtime values were protected at both source and sink boundaries rather than merely removing the known `loom config` URL output. `loom config` now reports only a configured-endpoint marker; a centralized exact-value redactor removes configured backend URLs, header values, URL credentials/query values, and resolved API keys from session, pipeline, log, and recall output, with prompt events redacted before storage. Model-controlled file and shell tools cannot read project config/environment/credential files or write handoff/narrative records, backend and Foundry errors no longer trust or reproduce endpoint/server text, and YAML/URL parse errors use fixed messages. Independent security review passed, README output guidance was corrected, and full verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (218 passing tests). `t7-2-2` is complete; Phase 7 advances to `t7-2-3` with 9 tasks remaining. Phase 6 remediation `m6-6` remains merged and complete with 0 tasks remaining.

## 2026-08-07 — Secret audit handoff summary

Phase 6 remediation `m6-6` is merged and complete with 0 tasks remaining. Phase 7 is merged with 9 tasks remaining and is active at `m7-2` / `t7-2-3`. This session completed and committed `t7-2-2` as `fe48345`; full verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (218 passing tests). The next action is to trace `install.sh` downloads through checksum verification and first execution for the supply-chain review. No session changes remain uncommitted; only pre-existing operator support documents, transcript, and release-helper files remain unstaged. Root `SPEC.md` still lacks sections 12 and 13 while the operator-owned `support_docs/SPEC.md` contains them; do not overwrite the support copy when reconciling that documentation defect.

## 2026-08-07 — Mandatory installer checksum gate

Decision: fail `t7-2-3` because `install.sh` downloaded and installed a release binary without consulting the existing `SHA256SUMS` asset, despite passing installer tests. The installer now downloads the manifest, requires exactly one well-formed entry for the detected artifact, computes SHA-256 with Linux `sha256sum` or macOS `shasum`, and aborts before staging on missing, duplicate, malformed, or mismatched data. After verification it stages under a random path inside the install directory and performs a same-directory final rename so a failed download or verification cannot replace an existing install. The release runbook and README now document the mandatory manifest. Independent security re-review passed; full verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (221 passing tests). Checksums provide integrity against corruption and inconsistent assets but do not authenticate a compromised release host or mutable `latest` pointer; signatures remain separate future hardening debt. `t7-2-3` is complete; Phase 7 advances to `t7-2-4` with 8 tasks remaining, while Phase 6 remediation `m6-6` remains merged and complete with 0 tasks remaining.

## 2026-08-07 — Installer checksum handoff summary

Phase 6 remediation `m6-6` is merged and complete with 0 tasks remaining. Phase 7 is merged with 8 tasks remaining and is active at `m7-2` / `t7-2-4`. This session completed and committed `t7-2-3` as `7178793`; full verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (221 passing tests). The next action is to trace every `~/.loom/config.yaml` write path and verify restrictive resulting permissions. Same-origin checksums and the mutable `latest` pointer provide integrity but not release-host authenticity and remain future signing/version-pinning debt. No session changes remain uncommitted; only pre-existing operator support documents, transcript, and release-helper files remain unstaged. Root `SPEC.md` still lacks sections 12 and 13 while the operator-owned `support_docs/SPEC.md` contains them; do not overwrite the support copy when reconciling that documentation defect.

## 2026-08-07 — Restrictive config permissions

Decision: fail `t7-2-4` because first-run and theme config writes inherited the process umask, normally leaving new files at `0644`, and older permissive configs were never repaired. A shared private config boundary now opens final paths with `O_NOFOLLOW`, creates at `0600`, fchmods existing files before truncation or reading, and performs I/O through the same descriptor. First-run hardens every discovered global compatibility config when called standalone, while the loader hardens every global and project config consumed by every command; theme uses the same private reader/writer. Tests prove `0600` creation under umask `000`, correction of existing `0644` files across all merged config paths, and read/write rejection of final-component symlinks without target modification. Independent audit passed, README documents the owner-only mode contract, and full verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (224 passing tests). `t7-2-4` and `m7-2` are complete; Phase 7 advances to the real release workflow at `m7-3` / `t7-3-1` with 7 tasks remaining. Phase 6 remediation `m6-6` remains merged and complete with 0 tasks remaining.

## 2026-08-07 — Config permission handoff summary

Phase 6 remediation `m6-6` is merged and complete with 0 tasks remaining. Phase 7 is merged with 7 tasks remaining and is active at the real publication milestone `m7-3` / `t7-3-1`; pre-release security milestone `m7-2` is complete. This session completed and committed `t7-2-4` as `b99c418`; full verification passed with `bun run typecheck`, `bun run lint`, and `bun test` (224 passing tests). The next action is a non-mutating preflight of `RELEASE.md` steps 1-6, branch/remote state, chosen version, and GitHub authentication before any tag or public release is created. No session changes remain uncommitted; only pre-existing operator support documents, transcript, and release-helper files remain unstaged. Root `SPEC.md` still lacks sections 12 and 13 while the operator-owned `support_docs/SPEC.md` contains them; do not overwrite the support copy when reconciling that documentation defect.

## 2026-08-07 — Official v0.1.0 release published

Decision: do not tag from the dirty operator worktree or publish a commit absent from the remote release branch. Preflight found local `main` 40 commits ahead of `origin/main`; with explicit operator approval, those commits were pushed and release steps 1-6 were run from a clean detached worktree at commit `7329a46`. Clean-source typecheck, lint, and 224 tests passed; all four platform binaries and four tarballs built, all eight `SHA256SUMS` entries verified, and the local checksum-enforcing installer smoke printed version `0.1.0`. Immutable tag `v0.1.0` was created and pushed, then a public non-draft, non-prerelease GitHub Release was published with `install.sh`, `SHA256SUMS`, and all eight platform assets. GitHub confirmed all ten assets uploaded at https://github.com/ganymedia/loom/releases/tag/v0.1.0. `t7-3-1` is complete; Phase 7 advances to the live no-repository installer verification `t7-3-2` with 6 tasks remaining. Phase 6 remediation `m6-6` remains merged and complete with 0 tasks remaining.

## 2026-08-07 — Release publication handoff summary

Phase 6 remediation `m6-6` is merged and complete with 0 tasks remaining. Phase 7 is merged with 6 tasks remaining and is active at `m7-3` / `t7-3-2`. This session completed the real `v0.1.0` publication and committed `t7-3-1` state as `d3ec573`; the public release is https://github.com/ganymedia/loom/releases/tag/v0.1.0 with all ten required assets. The next action is `RELEASE.md` step 7 from outside the repository against the live URL; local/staging installer evidence is not a substitute. No session changes remain uncommitted after the handoff commit; only pre-existing operator support documents, transcript, and release-helper files remain unstaged. Root `SPEC.md` still lacks sections 12 and 13 while the operator-owned `support_docs/SPEC.md` contains them; do not overwrite the support copy when reconciling that documentation defect.

## 2026-08-07 — Live public installer verification

Decision: fail the first `t7-3-2` attempt when the documented unauthenticated `releases/latest/download/install.sh` URL returned HTTP 404, despite the release status and assets appearing valid through authenticated GitHub CLI output. The root cause was that `ganymedia/loom` was still private, so the release was not publicly installable; local or authenticated evidence was not accepted as a substitute. After the operator changed the repository to public, `RELEASE.md` step 7 passed from `/tmp/opencode`, outside the repository, using fresh temporary installer and install paths: the live installer downloaded, enforced checksum verification, installed successfully, and the installed binary printed `0.1.0`. `t7-3-2` is complete; Phase 7 remains active at `m7-3` / `t7-3-3` with 5 tasks remaining. Phase 6 remediation `m6-6` remains merged and complete with 0 tasks remaining.

## 2026-08-07 — Live installer handoff summary

Phase 6 remediation `m6-6` is merged and complete with 0 tasks remaining. Phase 7 is merged with 5 tasks remaining and is active at `m7-3` / `t7-3-3`. This session completed and committed `t7-3-2` as `e424fa6`; unauthenticated `RELEASE.md` step 7 verification passed only after the operator made the repository public. The next action is to complete every `RELEASE.md` step 8 post-release check against `v0.1.0`. No session changes remain uncommitted before this handoff update; only pre-existing operator support documents, transcript, and release-helper files remain unstaged.

## 2026-08-07 — v0.1.0 post-release checks completed

Decision: verify the published release from fresh unauthenticated downloads rather than relying only on authenticated GitHub metadata or local build artifacts. GitHub listed exactly `install.sh` plus the nine files required by `RELEASE.md` step 2. All ten versioned public assets downloaded outside the repository, and `sha256sum -c SHA256SUMS` reported `OK` for all four platform binaries and four tarballs. The README installer command points to the same public GitHub `latest/download/install.sh` host proven by `t7-3-2`, and the completed release is recorded here. `t7-3-3` and `m7-3` are complete; Phase 7 advances to `m7-4` / `t7-4-1` with 4 tasks remaining. Phase 6 remediation `m6-6` remains merged and complete with 0 tasks remaining.

## 2026-08-07 — Post-release-check handoff summary

Phase 6 remediation `m6-6` is merged and complete with 0 tasks remaining. Phase 7 is merged with 4 tasks remaining and is active at `m7-4` / `t7-4-1`; release milestone `m7-3` is complete. This session completed and committed `t7-3-3` as `617ebb5` after exact asset inventory, fresh unauthenticated downloads, eight successful published checksum validations, README host confirmation, and narrative recording. The next action is to inspect the existing `.github/ISSUE_TEMPLATE` state before creating separate bug-report and feature-request templates. No session changes remain uncommitted before this handoff update; only pre-existing operator support documents, transcript, and release-helper files remain unstaged.

## 2026-08-07 — Structured public issue intake

Decision: use separate GitHub Issue Forms for bugs and feature requests instead of free-form Markdown templates, because required fields improve triage and permit prominent public-data warnings. The bug form requests version, installation method, environment, reproduction, expected behavior, and actual behavior; the feature form requests the user need, proposal, product area, and alternatives. Both prohibit secrets, backend URLs, configuration files, raw logs, prompts, model output, CUI, and other sensitive details, and require reporters to confirm sanitization. Blank issues are disabled so the warning cannot be bypassed. No labels or assignees are assumed because repository labels and maintainers were not specified. YAML structure checks, `bun run typecheck`, and `bun run lint` passed; focused documentation reviews passed with no findings. `t7-4-1` is complete; Phase 7 advances to `t7-4-2` with 3 tasks remaining. Phase 6 remediation `m6-6` remains merged and complete with 0 tasks remaining.

## 2026-08-07 — Issue-template handoff summary

Phase 6 remediation `m6-6` is merged and complete with 0 tasks remaining. Phase 7 is merged with 3 tasks remaining and is active at `m7-4` / `t7-4-2`. This session completed and committed `t7-4-1` as `fe33fda`; separate structured bug and feature forms passed YAML validation, typecheck, lint, and focused documentation review, and blank issues are disabled. The next action is to ask the operator whether external contributions are currently accepted before documenting the policy. No session changes remain uncommitted before this handoff update; only pre-existing operator support documents, transcript, and release-helper files remain unstaged.

## 2026-08-07 — Product-facing README

Decision: refactor `README.md` around prospective-user needs instead of internal phase history and release-maintainer mechanics. The page now leads with the product purpose and supported capabilities, then provides the public installer, a runnable five-minute start, everyday commands, configuration and data handling, safety boundaries, explicit 0.1 limitations, support links, and a compact maintainer-only development section. Stale unreleased wording, phase narration, the raw model tool-call envelope, unsupported performance/audit claims, and the misleading suggestion that `plan status` initializes a plan were removed. The transform-only quick-start pipeline passed from a clean directory using the compiled 0.1.0 binary; `bun run typecheck`, `bun run lint`, and focused documentation review passed. This operator-requested documentation correction does not complete or advance `t7-4-2`; Phase 7 remains active with 3 tasks remaining, and Phase 6 remediation `m6-6` remains merged and complete with 0 tasks remaining.

## 2026-08-07 — Product README handoff summary

Phase 6 remediation `m6-6` is merged and complete with 0 tasks remaining. Phase 7 is merged with 3 tasks remaining and remains active at `m7-4` / `t7-4-2`; the README refactor was an operator-requested correction and did not advance the plan. This session committed the product-facing README as `b938d4d` after a real clean-directory pipeline run, typecheck, lint, and focused documentation review. The next action is to ask the operator whether external contributions are accepted before writing the `t7-4-2` policy. Separate stale-doc follow-up remains for `CHANGELOG.md`'s unreleased 0.1.0 heading and `USER_TESTING.md`'s pre-redaction config-output expectation. No session changes remain uncommitted before this handoff update; only pre-existing operator support documents, transcript, and release-helper files remain unstaged.

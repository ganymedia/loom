# LOOM — Project Specification
Version 0.1 — consolidated reference for AI-assisted development

READ THIS FILE FIRST, EVERY SESSION. It is the ground truth for what LOOM is,
how it is architected, and how it must be built. If anything in a generated
file contradicts this document, this document wins.

---

## 1. What LOOM is

LOOM is OpenCode's interaction model — an interactive terminal coding agent —
with five capability layers OpenCode does not have:

1. **Session Continuity** — automatic handoff generation when context runs out,
   so a new session resumes work instead of restarting it.
2. **Project Planner** — token-aware decomposition of large initiatives into
   phases, milestones, and tasks that fit within a model's context window.
3. **Agent System** — four specialized built-in agents (Architect, Developer,
   Tester, Security) switchable via tab, each spawning typed sub-agents
   automatically for scoped work.
4. **Agent Foundry** — a Nexus-style package registry for publishing and
   installing community or private agents.
5. **Prompt Intelligence** — a transparent layer that assembles context,
   manages token budget, optimizes prompts, and enforces structured output —
   sitting between every agent and the backend.

The core interaction is unchanged from OpenCode: open a terminal, talk to an
agent, it reads and writes files and runs shell commands against your codebase.
Everything above is additive, not a replacement for that loop.

### What LOOM is NOT
- Not an inference server. LOOM never spins up, manages, or owns a model
  process. The user already runs vLLM/Ollama/etc. LOOM only sends HTTP requests
  to endpoints the user configures.
- Not a pipeline-only batch tool. The `.loom` pipeline format exists for
  reusable macros invoked from within a live session — it is not the primary
  interface.
- Not a replacement for git, CI, or issue trackers. It orchestrates AI work;
  it does not replace existing dev tooling.

---

## 2. Non-negotiable design constraints

These constraints override convenience in every implementation decision:

- **Per-user install, zero daemons.** LOOM is a single binary. No background
  processes, no ports opened, no services required to run. Matches OpenCode's
  installation simplicity exactly.
- **Backends are configured endpoints, never managed processes.** LOOM
  connects to whatever the user already has running. It never starts, stops,
  or health-checks an inference server's lifecycle beyond a simple HTTP probe.
- **Models are discovered, never hardcoded.** Every backend call resolves the
  actual model to use via `GET /v1/models` at request time (see
  `src/backends/discovery.ts`, already implemented). Agent YAML files specify
  a `preferred` model as a hint only. If it isn't present at the endpoint,
  LOOM falls back to the first available model. This must never be cached
  across requests — deployed models can change between calls.
- **Scope boundaries in agents are enforced, not advisory.** Each built-in
  agent's `tools.denied` list in its YAML is a hard constraint checked by the
  tool registry before execution, not just a system prompt suggestion.
- **Stage outputs in the Context Bus are immutable once written.** No stage
  may overwrite another stage's output. This is enforced in code
  (`ContextBus.set()` throws on duplicate keys), not just convention.
- **The Prompt Intelligence layer is transparent to callers.** Agents and
  pipeline stages call a single `runPrompt()`-style function and get a
  response. They must never see or manage compression, retries, or budget
  logic directly.
- **Graceful degradation everywhere.** An unreachable backend, a missing
  Foundry connection, a corrupt plan.yaml — none of these should crash LOOM.
  Fail the specific operation with a clear message; never take down the
  whole process.

---

## 3. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Runtime | Bun | Native SQLite, single-binary compile, fast startup |
| Language | TypeScript (strict) | Matches OpenCode ecosystem, Zod validation throughout |
| CLI framework | Commander.js | Standard, well-documented subcommand routing |
| TUI | Ink (React for CLI) | Component model fits agent tabs + streaming output |
| LLM client | Vercel AI SDK | Production-grade OpenAI-compatible + Anthropic adapters |
| Validation | Zod | Every config, every manifest, every stage schema |
| Storage | Bun's built-in SQLite (`bun:sqlite`) | No external dependency, ships in the runtime |
| YAML | `yaml` package | For `.loom` pipelines, `plan.yaml`, `loom-agent.yaml` |
| Lint/format | Biome | Single fast tool, replaces ESLint+Prettier |

No other runtime dependencies should be introduced without a strong reason —
keep the dependency tree small since this compiles to a distributed binary.

---

## 4. Module map and responsibilities

Full directory layout is in `BUILDING.md`. Summary of what each module owns:

- **`config/`** — Zod schema (done, see `schema.ts`) + layered loader
  (global → project → env). Every other module imports config types from here.
- **`backends/`** — Async model discovery (done, see `discovery.ts`) +
  Vercel AI SDK adapters for OpenAI-compatible and Anthropic endpoints.
- **`agents/`** — `BaseAgent` abstract class (done, see `base.ts`), the four
  built-in agents, sub-agent runner, and the Foundry-installed agent loader.
- **`prompt/`** — The Prompt Intelligence pipeline: assembly → budget →
  optimization → backend request → validation → retry loop.
- **`session/`** — Token tracking, the 80%-threshold handoff trigger, and
  handoff.md / narrative.md read-write.
- **`store/`** — SQLite-backed Prompt Store: session logging, embeddings,
  cosine-similarity recall.
- **`planner/`** — `plan.yaml` schema and parser, `loom plan *` commands.
- **`pipeline/`** — `.loom` YAML parser, the five stage executors
  (done: types in `pipeline/types.ts`), Context Bus (done), DAG walker.
- **`foundry/`** — Foundry HTTP client for publish/install/search.
- **`tui/`** — Ink components: session view, agent tab strip, status bar.
- **`cli/commands/`** — One file per subcommand, each registering itself
  against the Commander `program` passed in from `index.ts`.
- **`tools/`** — `Tool` interface (done, see `tools/base.ts`) + concrete
  tools: file-reader, file-writer, shell, git-ops.

---

## 5. Build order

Full detail in `BUILDING.md`. Summary of phase gates:

1. **Phase 1 (foundation):** config loader → backend router → CLI skeleton →
   basic TUI with the Developer agent only. **Exit criterion: `loom` opens,
   talks to a real vLLM endpoint, reads/writes real files.**
2. **Phase 2 (core features):** Prompt Store → Session Manager/Continuity →
   remaining three built-in agents + tab switching.
3. **Phase 3 (intelligence):** full Prompt Intelligence pipeline → Project
   Planner.
4. **Phase 4 (platform):** pipeline engine → sub-agent runtime → Foundry
   client → `recall`/`log` commands.

Do not start Phase 2 work until Phase 1's exit criterion is met and tested.
Each phase should be independently demoable.

---

## 6. Interface contracts (already specified — do not redesign)

These three files define the seams between modules. Treat them as fixed
unless a genuine flaw is found during implementation — if one needs to
change, update this spec and note the change at the bottom of this document.

- **`agents/base.ts`** — `BaseAgent`, `AgentContext`, `AgentTurnResult`,
  `HandoffSummary`, `SubAgentSpawnRule`.
- **`tools/base.ts`** — `ToolDefinition`, `ToolResult`, `Capability`,
  `ToolAccessPolicy`, `isToolPermitted()`.
- **`pipeline/types.ts`** — `PipelineStage` (discriminated union of the 5
  stage types), `ContextBus`, `StageExecutor`, `PipelineRunResult`.

Any new module that needs to cross one of these seams imports the type from
here — it does not redefine an equivalent shape locally.

---

## 7. Reference specs (full detail, produced earlier in design)

These are the EXACT filenames that must exist in the project root. If any
file listed here is missing, stop and tell the human operator which exact
filename is absent — do not invent a replacement, do not guess at its
contents, and do not proceed with implementation of that subsystem until
the file is provided or its absence is explicitly acknowledged as
intentional.

| Filename (exact) | Subsystem | Contents |
|---|---|---|
| `loom-agent.primary.yaml` | Agent package schema | Primary agent manifest format — `package`, `agent`, `model`, `tools`, `sub_agents`, `handoff` blocks |
| `loom-agent.sub.yaml` | Agent package schema | Sub-agent manifest format — typed `interface` (input/output schema), `execution` constraints |
| `loom-tests.yaml` | Agent testing | Test suite format — behavioral, safety, unit, integration, regression test types; mock/live/snapshot inference modes |
| `plan.yaml` | Project planner | Reference instance of the plan schema — phases → milestones → tasks, token_estimate labels (small/medium/large/xlarge) |
| `foundry-api.md` | Foundry server | Full REST API — endpoints, auth model, package tarball structure |
| `foundry-server.toml` | Foundry server | Self-hosting config — database, storage, auth, rate limits, upstream proxy |
| `prompt-intelligence.config.toml` | Prompt Intelligence | Three-level override schema (global → agent → stage) — budget, compression, retry, validation config |
| `agent-architect.yaml` | Built-in agents | Architect agent — full system prompt, scope boundaries, sub-agent rules |
| `agent-developer.yaml` | Built-in agents | Developer agent — full system prompt, scope boundaries, sub-agent rules |
| `agent-tester.yaml` | Built-in agents | Tester agent — full system prompt, scope boundaries, sub-agent rules |
| `agent-security.yaml` | Built-in agents | Security agent — full system prompt, scope boundaries, sub-agent rules |
| `loom-config.toml` | Config reference | Example `~/.loom/config.toml` — backend endpoint registration, profiles |

Deployment tiers (solo / small team / enterprise) are documented in this
file, section 9 below — no separate file for that topic.

**If you rename any of these files, update this table in the same commit.**
A mismatch between this table and the actual project root is what causes a
local agent to report a file as "missing" when it has simply been renamed —
treat a table/filesystem mismatch as a bug in this spec, not in the codebase.

---

## 8. Guidance for local agents working on this codebase

- **This project is its own best test case.** LOOM's Session Continuity and
  Project Planner concepts exist specifically to solve the problem you are
  about to encounter: running out of context mid-implementation. Use
  `plan.yaml` for this project from day one. When you approach your own
  context limit, write a real handoff document before stopping, in the exact
  format specified in section 7's session handoff reference — goal, completed
  work, failed attempts, branch name, next action.
- **Do not modify the three interface files casually.** They are the contract
  every other module relies on. A change there ripples everywhere. If a
  design flaw is found, document it in section 6 above with a dated note
  before changing the file.
- **Write the test alongside the implementation, not after.** Every module
  under `src/` should have a corresponding file under `tests/`. Follow the
  `discoverModels` test pattern already given in `BUILDING.md` — test the
  failure path (unreachable backend, malformed input) as rigorously as the
  happy path.
- **Never hardcode a model name outside of a `preferred` hint field.** If you
  catch yourself writing `model: "gemma-4-31b"` anywhere outside a YAML
  agent definition's `model.preferred` list, stop — that value must flow
  through `resolveModel()`.
- **Keep `index.ts` thin.** All logic belongs in the module it concerns.
  `index.ts` only wires config loading, subcommand registration, and the
  TUI fallback.
- **Run `bun run typecheck` and `bun run lint` before considering any file
  complete.** Strict TypeScript is enabled deliberately — do not add `any`
  or loosen `tsconfig.json` to make an error disappear.
- **When uncertain between two implementation approaches, prefer the one
  that fails loudly over the one that fails silently.** LOOM handles
  infrastructure failures (unreachable backends, missing config) gracefully,
  but it should never mask a genuine bug in its own logic.

---

## 9. Deployment tiers

LOOM installs per-user exactly like OpenCode — single binary, no daemons.
Complexity is strictly additive across three tiers:

- **Solo developer:** LOOM CLI binary only. `~/.loom/config.toml` points at
  the user's existing backend endpoints. No server of any kind required.
- **Small team:** same per-user install for each developer, plus one
  optional self-hosted Foundry server (single container) if the team wants
  to publish private/custom agents. Public agents still resolve from
  `foundry.loom.dev` with no setup.
- **Enterprise / air-gapped:** adds a private Foundry server with upstream
  proxying to the public registry, an optional shared Prompt Store API for
  cross-developer recall, and SSO/LDAP auth on the Foundry server.

Nothing in LOOM's core CLI behavior changes across tiers — only whether a
Foundry server exists and whether it's self-hosted or public.

---

## Changelog
- v0.1 — Initial consolidated spec.
- v0.2 — Section 7 rewritten from a descriptive list to an exact filename
  manifest table, in response to a local agent reporting
  `prompt-intelligence.config.toml` as missing when it was present but
  unindexed by exact name. Added section 9 (deployment tiers) since it
  was previously folded into the section 7 bullet list without its own
  filename.

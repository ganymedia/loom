# LOOM — Build Order

Stack: TypeScript · Bun · Ink (TUI) · Vercel AI SDK · Bun SQLite
Lint: Biome · Type check: tsc --noEmit

---

## Phase 1 — Foundation
**Target: `loom` opens a working terminal session in ~2 weeks**

### 1. Config system
Files: `src/config/schema.ts` (done) · `src/config/loader.ts` · `src/config/profiles.ts`

`loader.ts` merges three layers in order:
  1. Global: `~/.loom/config.yaml`
  2. Project: `.loom/config.yaml` (if cwd or any parent has one)
  3. Env: `LOOM_*` variables override any file value

`profiles.ts` reads/writes the `defaults.activeProfile` key.

### 2. Backend router + model discovery
Files: `src/backends/discovery.ts` (done) · `src/backends/adapters/openai-compatible.ts`
       `src/backends/adapters/anthropic.ts` · `src/backends/registry.ts`

Both adapters wrap the Vercel AI SDK. The registry calls `resolveModel()` at
request time — never at startup — so LOOM always uses whatever is deployed.

Validate: `loom config status` prints each backend with discovered models and
latency. This is the first useful command to ship.

### 3. CLI skeleton + config commands
Files: `src/index.ts` · `src/cli/commands/config.ts`

`src/index.ts` is the Commander entry point. Register all subcommands here.

Config commands to ship first:
  `loom config set <key> <value>`
  `loom config get <key>`
  `loom config profile use <name>`
  `loom config status`

### 4. Basic TUI + Developer agent
Files: `src/tui/session.tsx` · `src/tui/status.tsx` · `src/agents/builtin/developer.ts`
       `src/tools/file-reader.ts` · `src/tools/file-writer.ts` · `src/tools/shell.ts`

`session.tsx` is the Ink component: text input at the bottom, scrolling message
list above, status bar pinned to the bottom of the viewport.

The Developer agent needs only its system prompt and tool access to be usable.
No session continuity, no recall — just a working interactive agent.

**LOOM is usable at this point.** Open a terminal, talk to the Developer agent,
get real code written against your actual codebase via your vLLM endpoint.

---

## Phase 2 — Core features (~2-3 weeks)

### 5. Prompt Store
Files: `src/store/database.ts` · `src/store/store.ts`
       `src/store/embeddings.ts` · `src/store/recall.ts`

Use `Bun.Database` (built-in SQLite, no dependency needed).

`database.ts` creates the schema on first open:
```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at INTEGER,
  agent TEXT,
  backend TEXT,
  model TEXT,
  pipeline TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  duration_ms INTEGER
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id),
  role TEXT,      -- user | assistant | system
  content TEXT,
  embedding BLOB, -- Float32Array serialized to buffer
  created_at INTEGER
);
```

`embeddings.ts` calls `POST /v1/embeddings` on the configured embedding backend
(your vLLM endpoint supports this natively). Store as `Buffer.from(new Float32Array(vec).buffer)`.

`recall.ts` loads candidate rows, deserializes embeddings, computes cosine
similarity in TypeScript, returns top-k. For personal use (thousands of
sessions) this is fast enough without a vector index.

### 6. Session Manager + Continuity
Files: `src/session/manager.ts` · `src/session/continuity.ts` · `src/session/handoff.ts`

`manager.ts` tracks token usage per request. Exposes `getUsagePercent()`.

`continuity.ts` monitors usage; when it crosses `config.session.handoffThreshold`
(default 0.80), it calls the active agent to generate a handoff document. The
handoff call uses a minimal system prompt focused solely on summarizing the
session state into the five required fields.

`handoff.ts` reads/writes `.loom/handoff.md`. On new session start, `session.tsx`
checks for this file and injects it as the opening context block before
the user types anything.

### 7. All 4 built-in agents + tab switching
Files: `src/agents/builtin/architect.ts` · `src/agents/builtin/tester.ts`
       `src/agents/builtin/security.ts` · `src/tui/tabs.tsx`

Each agent file exports a class extending `BaseAgent` with its system prompt
and tool access list. `tabs.tsx` renders the tab strip and switches the active
agent on Tab keypress.

---

## Phase 3 — Intelligence layers (~2 weeks)

### 8. Prompt Intelligence layer
Files: `src/prompt/assembly.ts` · `src/prompt/budget.ts` · `src/prompt/compression.ts`
       `src/prompt/optimization.ts` · `src/prompt/validation.ts` · `src/prompt/pipeline.ts`

Build and test each stage in isolation before wiring them into the pipeline.
`budget.ts` is the most critical: get the token counting right before building
compression on top of it.

Token counting for OpenAI-compatible models: use `tiktoken` or estimate with
`Math.ceil(text.length / 4)` as a conservative approximation for Gemma/Llama
class models. Exact counts aren't needed — a ±15% estimate is fine for budget
decisions.

### 9. Project Planner
Files: `src/planner/schema.ts` · `src/planner/parser.ts`
       `src/cli/commands/plan.ts`

`schema.ts` is the Zod schema for `plan.yaml`. Match the structure from the
plan spec document.

Commands to ship in this phase:
  `loom plan status` · `loom plan done <id>` · `loom plan next`
  `loom plan block <id> --reason <str>` · `loom plan decompose <id>`

---

## Phase 4 — Platform (ongoing)

### 10. Pipeline engine
Files: `src/pipeline/` (parser, executor, context-bus, all stage types)
       `src/cli/commands/run.ts`

### 11. Sub-agent runtime
Files: `src/agents/subagent/runner.ts` · `src/agents/subagent/sandbox.ts`

### 12. Foundry client
Files: `src/foundry/client.ts` · `src/foundry/install.ts`
       `src/cli/commands/foundry.ts`

### 13. loom recall + loom log commands
Files: `src/cli/commands/recall.ts` · `src/cli/commands/log.ts`

---

## Directory layout

```
loom/
├── package.json
├── tsconfig.json
├── biome.json
├── BUILDING.md
│
├── src/
│   ├── index.ts
│   ├── cli/
│   │   └── commands/
│   │       ├── config.ts
│   │       ├── run.ts
│   │       ├── plan.ts
│   │       ├── recall.ts
│   │       └── log.ts
│   ├── tui/
│   │   ├── session.tsx
│   │   ├── tabs.tsx
│   │   └── status.tsx
│   ├── agents/
│   │   ├── base.ts
│   │   ├── registry.ts
│   │   ├── builtin/
│   │   │   ├── architect.ts
│   │   │   ├── developer.ts
│   │   │   ├── tester.ts
│   │   │   └── security.ts
│   │   └── subagent/
│   │       ├── runner.ts
│   │       └── sandbox.ts
│   ├── backends/
│   │   ├── discovery.ts        ← done
│   │   ├── registry.ts
│   │   └── adapters/
│   │       ├── openai-compatible.ts
│   │       └── anthropic.ts
│   ├── prompt/
│   │   ├── pipeline.ts
│   │   ├── assembly.ts
│   │   ├── budget.ts
│   │   ├── compression.ts
│   │   ├── optimization.ts
│   │   └── validation.ts
│   ├── session/
│   │   ├── manager.ts
│   │   ├── continuity.ts
│   │   └── handoff.ts
│   ├── store/
│   │   ├── database.ts
│   │   ├── store.ts
│   │   ├── embeddings.ts
│   │   └── recall.ts
│   ├── planner/
│   │   ├── schema.ts
│   │   ├── parser.ts
│   │   └── commands.ts
│   ├── pipeline/
│   │   ├── parser.ts
│   │   ├── executor.ts
│   │   ├── context-bus.ts
│   │   └── stages/
│   │       ├── prompt.ts
│   │       ├── transform.ts
│   │       ├── branch.ts
│   │       ├── parallel.ts
│   │       └── inject.ts
│   ├── foundry/
│   │   ├── client.ts
│   │   └── install.ts
│   ├── config/
│   │   ├── schema.ts           ← done
│   │   ├── loader.ts
│   │   └── profiles.ts
│   └── tools/
│       ├── base.ts
│       ├── file-reader.ts
│       ├── file-writer.ts
│       ├── shell.ts
│       └── git-ops.ts
│
└── tests/
    ├── backends/
    │   └── discovery.test.ts
    ├── prompt/
    │   └── pipeline.test.ts
    ├── session/
    │   └── continuity.test.ts
    └── store/
        └── recall.test.ts
```

## First command to run after cloning

```bash
bun install
bun run dev
```

## First test to write

```typescript
// tests/backends/discovery.test.ts
import { describe, expect, it } from "bun:test"
import { discoverModels, resolveModel } from "@loom/backends/discovery"

describe("discoverModels", () => {
  it("returns empty array when endpoint is unreachable", async () => {
    const models = await discoverModels("http://localhost:19999/v1")
    expect(models).toEqual([])
  })
})
```

The test for unreachable endpoints validates the core contract: LOOM never
crashes when a backend is down. It degrades gracefully.

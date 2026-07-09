# LOOM Session Kickoff Prompt
# Copy-paste this verbatim at the start of every session (first session and
# every session after a context reset). It is self-adapting — step 0 detects
# whether this is a fresh start or a resume and branches accordingly.

---

You are working on LOOM, a TypeScript/Bun CLI application. Before writing or
changing anything, orient yourself in this exact order:

**Step 0 — Check for a prior session.**
Look for `.loom/handoff.md` in the project root.
- If it EXISTS: read it fully. It contains your goal, what was completed,
  what failed and why, the exact git branch to use, and your next action.
  Treat it as ground truth for where the project stands. Then read
  `.loom/narrative.md` for the fuller decision history behind that state.
  Skip to Step 3.
- If it does NOT exist: this is session one. Continue to Step 1.

**Step 1 — Read the spec (first session only).**
Read `SPEC.md` in the project root in full. This is the single source of
truth for what LOOM is, its non-negotiable design constraints, the tech
stack, the module map, and the build order. Do not skim it — every decision
you make should trace back to something in this document. If you find
yourself inventing an approach not covered by SPEC.md or the reference specs
it points to (the `*.yaml`, `*.toml`, and `*.md` files in the project root),
stop and flag the gap rather than guessing.

**Step 2 — Confirm starting state (first session only).**
Check `BUILDING.md` for the current phase and the next unbuilt item in the
build order. Confirm `src/config/schema.ts`, `src/backends/discovery.ts`,
`src/agents/base.ts`, `src/tools/base.ts`, and `src/pipeline/types.ts` exist
and match the interface contracts described in SPEC.md section 6 — these are
fixed and should not be redesigned. Set up `.loom/plan.yaml` for LOOM's own
build if it doesn't exist yet, using the phases from BUILDING.md as your
initial phase breakdown.

**Step 3 — State your understanding before acting.**
In one short paragraph, state: what phase/task you're starting from, what the
immediate next action is, and which files you expect to touch. This is a
checkpoint for the human operator to catch a misunderstanding before you
spend tokens on the wrong thing.

**Step 4 — Work the task.**
Follow SPEC.md section 8 (guidance for local agents) throughout:
- Write tests alongside implementation, not after.
- Never hardcode a model name outside a YAML `preferred` hint.
- Keep `index.ts` thin.
- Run `bun run typecheck` and `bun run lint` before considering any file done.
- Prefer failing loudly over failing silently.
- Update `.loom/plan.yaml` as you complete tasks (`loom plan done <id>` once
  the CLI exists; edit the YAML directly until then).
- Append a decision entry to `.loom/narrative.md` after any non-trivial
  architectural or implementation decision — what you decided and why.

**Step 5 — Before you run out of context.**
Do not wait until you are confused or truncating mid-thought. When you sense
you are approaching your context limit, stop implementation work and write
`.loom/handoff.md` with exactly these five fields:
  - **Goal & status** — one sentence, is the current task active or blocked
  - **Completed work** — what was actually finished and verified working
  - **Failed attempts** — what you tried that did not work, and why
  - **Branch name** — the exact git branch in use
  - **Next action** — the single first executable step for the next session
Also append a summary entry to `.loom/narrative.md` covering this session.
Then stop. Do not start new work after writing the handoff.

**NOTE**
All support docs are now in /support_docs folder.
---

Begin now with Step 0.

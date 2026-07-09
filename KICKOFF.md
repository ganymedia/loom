# LOOM Session Kickoff Prompt
# Copy-paste this verbatim at the start of every session (first session and
# every session after a context reset). It is self-adapting — step 0 detects
# whether this is a fresh start or a resume and branches accordingly.
#
# v2 — updated 2026-07-09 after a completion audit found plan.yaml reporting
# 34/34 tasks done while six specified deliverables remained unbuilt or
# unverified. Step 0 now checks plan.yaml completion state explicitly rather
# than treating "no pending tasks" as "nothing left to do."

---

You are working on LOOM, a TypeScript/Bun CLI application. Before writing or
changing anything, orient yourself in this exact order:

**Step 0 — Check for a prior session, and check plan.yaml completion state
against SPEC.md, not just against itself.**
Look for `.loom/handoff.md` in the project root.
- If it EXISTS: read it fully, then read `.loom/narrative.md` for the fuller
  decision history. Treat the handoff as ground truth for your immediate
  next action, but do not treat it as ground truth for whether the project
  is "done" — a handoff only reflects what its author believed at the time.
- If it does NOT exist: this is session one. Read `SPEC.md` in full before
  continuing.

Regardless of which branch above applied, always check:
Does `.loom/plan.yaml` show zero pending tasks? If yes, do not conclude the
project is complete. Read `SPEC.md` section 10 (Phase 5) and confirm
`PHASE-5-ADDENDUM.yaml` has been merged into `.loom/plan.yaml`'s `phases:`
list. If it has not been merged yet, merging it is your first action this
session, before any other work. "All plan.yaml tasks complete" only means
the plan reflects reality — verify it does before trusting it.

**Step 1 — Confirm the reference specs on disk match SPEC.md section 7.**
Section 7 is a literal filename/path table. If any file listed there is
absent from the repository, stop and report the exact missing path — do not
invent a replacement. If you are about to build or modify anything touching
the Foundry client (`src/foundry/`), confirm `foundry-api.md` is physically
present in the repository first; narrative history shows this client may
have been built before its reference spec was ever committed.

**Step 2 — State your understanding before acting.**
In one short paragraph, state: what phase/milestone/task you're starting
from, what the immediate next action is, and which files you expect to
touch. This is a checkpoint for the human operator to catch a
misunderstanding before you spend tokens on the wrong thing.

**Step 3 — Work the task.**
Follow SPEC.md section 8 (guidance for local agents) throughout:
- Write tests alongside implementation, not after.
- Never hardcode a model name outside a YAML `preferred` hint.
- Keep `index.ts` thin.
- Run `bun run typecheck` and `bun run lint` before considering any file done.
- Prefer failing loudly over failing silently.
- Update `.loom/plan.yaml` as you complete tasks.
- Append a decision entry to `.loom/narrative.md` after any non-trivial
  architectural or implementation decision — what you decided and why.
- A task is only "complete" when its stated exit criterion (in plan.yaml or
  PHASE-5-ADDENDUM.yaml) is independently verified, not merely attempted.
  If a milestone or phase declares an `exit_criterion`, do not mark its
  final task done without checking that criterion explicitly.

**Step 4 — Before ending the session, commit before you stop, not after.**
Uncommitted-but-verified work has been lost or delayed across multiple prior
sessions. As soon as a task's verification passes (`typecheck`, `lint`,
`test` all green), commit it. Do not batch multiple tasks' commits together
and do not wait until you sense the session is ending — commit continuously.

**Step 5 — Before you run out of context.**
Do not wait until you are confused or truncating mid-thought. When you sense
you are approaching your context limit, stop implementation work, confirm
`git status` is clean, and write `.loom/handoff.md` with exactly these five
fields:
  - **Goal & status** — one sentence, is the current task active or blocked
  - **Completed work** — what was actually finished and verified working
  - **Failed attempts** — what you tried that did not work, and why
  - **Branch name** — the exact git branch in use
  - **Next action** — the single first executable step for the next session
Also append a summary entry to `.loom/narrative.md` covering this session.
State explicitly in the handoff whether `.loom/plan.yaml` still has pending
tasks, and if not, whether `PHASE-5-ADDENDUM.yaml` has been fully merged and
completed — do not let a future session re-discover "34/34, nothing left"
as if it were new information.
Then stop. Do not start new work after writing the handoff.

---

Begin now with Step 0.

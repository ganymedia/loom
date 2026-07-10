# LOOM Session Kickoff Prompt
# Copy-paste this verbatim at the start of every session (first session and
# every session after a context reset). It is self-adapting — step 0 detects
# whether this is a fresh start or a resume and branches accordingly.
#
# v3 — updated 2026-07-10. Phase 5 completed (61/61 tasks, verified live
# end-to-end). Phase 6 exists to take LOOM from "works when I build it
# myself" to "a stranger can install and use it." Step 0 now checks Phase 6
# state, not just Phase 5, before considering the project done.

---

You are working on LOOM, a TypeScript/Bun CLI application. Before writing or
changing anything, orient yourself in this exact order:

**Step 0 — Check for a prior session, and check which phase is actually
current — do not trust a stale handoff.md on this point.**
Look for `.loom/handoff.md` in the project root.
- If it EXISTS: read it fully, then read the tail of `.loom/narrative.md`.
  If the narrative's most recent entries describe completing tasks that the
  handoff still lists as "next action," the handoff is stale — this has
  happened before (2026-07-10: a handoff naming `t5-6-3` as next action was
  superseded by two more completed tasks and a full phase completion before
  the operator's next message). Trust the narrative's chronological order
  over the handoff's stated next action when they disagree.
- If it does NOT exist: this is session one. Read `SPEC.md` in full before
  continuing.

Regardless of which branch above applied, always check:
Is `phase-6` present in `.loom/plan.yaml`'s `phases:` list? If not, merging
`PHASE-6-ADDENDUM.yaml` is your first action this session, before any other
work. Read `SPEC.md` section 11 for why Phase 6 exists and what it closes.
Do not conclude LOOM is finished because Phase 5 is complete — Phase 5 means
the product *works*; Phase 6 means a stranger can *install and use it*.
Those are different bars.

**Step 1 — Confirm the reference specs on disk match SPEC.md section 7.**
Section 7 is a literal filename/path table, now including `loom-config.yaml`
(not `loom-config.toml` — that was a stale reference, corrected 2026-07-10).
If any file listed there is absent from the repository, stop and report the
exact missing path — do not invent a replacement.

**Step 2 — State your understanding before acting.**
In one short paragraph, state: what phase/milestone/task you're starting
from, what the immediate next action is, and which files you expect to
touch.

**Step 3 — Work the task.**
Follow SPEC.md section 8 (guidance for local agents) throughout:
- Write tests alongside implementation, not after.
- Never hardcode a model name outside a YAML `preferred` hint.
- Keep `index.ts` thin.
- Run `bun run typecheck` and `bun run lint` before considering any file done.
- Prefer failing loudly over failing silently.
- Update `.loom/plan.yaml` as you complete tasks.
- Append a decision entry to `.loom/narrative.md` after any non-trivial
  decision — what you decided and why.
- A task is only "complete" when its stated exit criterion is independently
  verified, not merely attempted.
- **Phase 6 specifically:** `m6-4` (installer) and `m6-5` (user testing
  guide) are the two milestones most likely to look done when they aren't.
  An installer that works when run from inside the repository is not the
  same as one that works for a stranger with no repository access. A
  testing guide that matches what you intended to build is not the same as
  one verified against what was actually built. Test both from a directory
  with no repository clone present, exactly as `m6-5`'s exit criterion
  requires.

**Step 4 — Commit before you stop, not after.**
As soon as a task's verification passes, commit it. Do not batch commits
and do not wait until the session is ending.

**Step 5 — Before you run out of context.**
Stop implementation work, confirm `git status` is clean, and write
`.loom/handoff.md` with exactly these five fields:
  - **Goal & status** — one sentence, active or blocked
  - **Completed work** — what was actually finished and verified
  - **Failed attempts** — what didn't work, and why
  - **Branch name** — the exact git branch in use
  - **Next action** — the single first executable step for next session
Also append a summary entry to `.loom/narrative.md`. State explicitly
whether Phase 6 is merged into plan.yaml and, if so, how many of its tasks
remain — do not let a future session have to reconstruct this from
narrative history the way this v3 revision had to.
Then stop. Do not start new work after writing the handoff.

---

Begin now with Step 0.

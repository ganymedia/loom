# LOOM Narrative

## 2026-07-07 — Canonical layout decision

Session one found no `.loom/handoff.md`, no `BUILDING.md`, no `.loom/plan.yaml`, no `src/` tree, and no Git repository. The only implementation files were flattened starter references named `src_*.ts`. Decision: keep those flattened files as references, as requested by the operator, and create the canonical `src/...` tree alongside them so future work matches `SPEC.md` paths without losing provenance.

## 2026-07-07 — Verification and GitHub sync constraints

Implemented the initial canonical Bun/TypeScript layout, config schema/loader, backend discovery, thin CLI skeleton, TUI placeholder, and starter tests. Initial verification could not run until the operator clarified that Bun is installed and should be available. GitHub synchronization was prepared after the operator provided `https://github.com/ganymedia/loom.git`; `gh` is installed and authenticated as `ganymedia`, the local repository was initialized on `main`, and `origin` was attached.

## 2026-07-07 — Initial push policy

Decision: document that an initial push is expected only after explicit operator approval, remote safety checks, intended-file review, and verification or documented verification blockers. This prevents accidental synchronization while still allowing bootstrap work to reach the private GitHub repository once the operator authorizes it.

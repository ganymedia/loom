# LOOM Build Plan

This file tracks the build order from `SPEC.md`. Each phase must be independently demoable; do not start a later phase until the previous phase exit criterion is met and tested.

## Current phase

- Phase: Phase 2 — core features
- Current task: Agent tab switching.
- Next unbuilt item: Agent tab switching.

## GitHub synchronization policy

Pushing is appropriate only when all of the following are true:

1. The human operator explicitly approves the push in the current session.
2. The local branch, remote URL, and remote branch/default-branch state have been inspected.
3. `git status`, `git diff`, and recent commit history have been reviewed so only intended files are staged.
4. Required verification has run, or any blocked verification is documented before commit.

For the initial repository bootstrap, pushing `main` is expected after those checks because `https://github.com/ganymedia/loom.git` was confirmed as the intended private remote and had no default branch yet.

## Phase 1 — foundation

Exit criterion: `loom` opens, talks to a real vLLM endpoint, and reads/writes real files.

1. Config schema and layered loader.
2. Backend discovery and router against configured endpoints.
3. CLI skeleton with thin `index.ts` and subcommand registration.
4. Basic TUI with the Developer agent only.
5. File read/write tools and shell/git tool boundaries.

## Phase 2 — core features

1. Prompt Store.
2. Session Manager and Session Continuity.
3. Architect, Tester, and Security built-in agents.
4. Agent tab switching.

## Phase 3 — intelligence

1. Prompt Intelligence pipeline.
2. Project Planner and `loom plan *` commands.

## Phase 4 — platform

1. Pipeline engine.
2. Sub-agent runtime.
3. Foundry client.
4. `recall` and `log` commands.

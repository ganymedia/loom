# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-09-04

Version 0.1.1 changes LOOM's core interactive-session model: TTY sessions now run as one persistent, live-redrawing full-screen Ink application instead of a readline loop that prints static Ink fragments. This is an interaction-model release, not a silent patch or a general expansion of backend permissions.

### Added

- Live token streaming, instant agent switching, thinking and typed tool-activity indicators, submitted-prompt history, multi-line editing, a blinking in-text cursor, and command-history navigation.
- A live-filtered slash-command popup with visible arrow-key navigation and Enter selection, while retaining Tab as a secondary shortcut.
- Measured PageUp/PageDown and mouse-wheel conversation history with oldest/latest jumps, pinned status and composer regions, resize reflow, and clean terminal restoration.
- Styled Markdown and syntax-highlighted code rendering, semantic tool outcomes, neutral bordered tool-result bodies, red/green file-write diffs, explicit write completion, and a distinct Developer summary.
- Visible automatic-handoff, prior-session recall, responsive project status, and project-opted-in SAST sub-agent lifecycle signals without exposing prompts, tool data, backend details, secrets, or CUI.

### Changed

- Explicit Developer read-then-write requests may use at most three existing permitted model/tool rounds, fresh model discovery per request, up to two bounded response repairs, a 60-second request timeout, and at most 64 KiB of untrusted tool-result feedback sent only to the configured backend.
- Light and dark themes now paint the complete interactive canvas consistently. Non-TTY, piped-input, CI, and `--prompt` behavior remains non-full-screen and compatible with v0.1.0.

### Fixed

- Long output remains clipped within the conversation viewport instead of overlapping completed turns, status regions, or the composer.
- Empty, malformed, fenced, or intent-only Developer responses are handled without rendering raw tool envelopes as successful work.
- Streaming response reads actively honor cancellation after response headers arrive, preventing stalled follow-up requests from leaving the session permanently active.
- Terminal control input and batched mouse events no longer leak into composer text, and mouse tracking is disabled on exit.

### Security

- Tool permissions remain project-scoped and least-privilege. Bounded tool feedback is labeled as untrusted project data, is not logged, and must not be used for CUI unless the configured backend and data boundary are approved.
- SAST remains off by default and can be enabled only by project-local configuration; persisted findings remain bounded, owner-only, and exclude source snippets, prompts, raw model output, secrets, and CUI.

## [0.1.0] - 2026-08-07

### Added

#### Core CLI & Installation
- Standalone Bun-compiled CLI artifacts for multiple platforms.
- Installer-style release assets including tarballs and SHA256 checksums.
- First-run configuration wizard for setting up OpenAI-compatible backends.
- Automated backend discovery via `/v1/models` to resolve available models without hardcoding.

#### Interactive Session & UI
- Interactive terminal session with agent switching, theme management, and status monitoring.
- Real-time token usage tracking and session status bar.
- Support for multiple agent types and sub-agents.
- Session continuity via automatic `.loom/handoff.md` generation and context injection.

#### Agent Capabilities & Tools
- Constrained, least-privilege project tools:
  - `file-reader` and symlink-safe `file-writer` operations scoped to the project root.
  - Read-only `shell` commands (`pwd`, `ls`, `cat`, `grep`, `wc`) with no native option passthrough.
  - Read-only `git-ops` commands (`status`, `diff`, `log`, `show`, listing-only `branch`, `rev-parse`, `ls-files`) with command-specific option allowlists.
- Project Planner for tracking milestones, phases, and tasks via `.loom/plan.yaml`.
- Pipeline execution engine supporting variables, inputs, branching, and context recall injection.

#### Prompt Store & Memory
- Local SQLite-based Prompt Store for logging and semantic recall.
- Semantic search via cosine-similarity and vector-based retrieval.
- Integrated embedding support for automated context enrichment.
- Foundry client support for interacting with external agent ecosystems where available.

### Fixed

- Strict CLI error handling and predictable behavior for unsupported backend types or missing configurations.

### Limitations

- **User Interface**: The current interactive UI is a minimized interface; the intended richer full-screen TUI must be implemented and human-tested before 1.0.0.
- **Release validation**: The security review and live GitHub publication are complete; independent external testing remains pending before 1.0.0.
- **Ecosystem**: Public Foundry marketplace, package-manager distribution beyond `install.sh`, CI/CD release automation, and telemetry are out of scope for 0.1.0.
- **Stability**: This is an early release; 1.0.0 stability guarantees are not yet in effect.

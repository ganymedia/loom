# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

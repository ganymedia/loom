# LOOM — Capabilities Statement

## Overview

LOOM is a command-line AI workflow pipeline manager designed for engineers who need repeatable, parameterizable, multi-stage AI workflows with persistent memory. It extends raw LLM API access into a full orchestration layer — defining, executing, logging, and semantically recalling AI workflows from a single unified CLI. Where most AI tooling treats each session as a fresh start, LOOM accumulates: every pipeline execution feeds a persistent knowledge base that future runs draw from automatically, compounding output quality over time without additional prompt engineering effort.

LOOM is backend-agnostic from the ground up. It runs against self-hosted vLLM endpoints, Anthropic's API, OpenAI-compatible endpoints, and Ollama simultaneously, with per-stage model routing so different stages within the same pipeline can target entirely different backends and models depending on task complexity, cost requirements, or inference location.

---

## Core Capabilities

### Workflow Pipeline Orchestration

LOOM defines AI workflows as `.loom` YAML files — a declarative pipeline definition language that describes multi-stage execution graphs. Pipelines support sequential, conditional, and parallel execution models, are version-controllable alongside the codebases they serve, and are fully reproducible across environments through profile-based configuration. Each stage's output is made available to all downstream stages through a shared Context Bus, enabling complex data flows without manual state management.

Pipelines execute across five native stage types. A `prompt` stage renders a Jinja2 template against current pipeline state and calls a configured backend, storing the streamed response under a stage-scoped key for downstream reference. A `transform` stage processes prior output using Jinja2 expressions or sandboxed Python code to reshape, extract, or reformat data before it advances — useful for pulling structured fields from an LLM response, normalizing text, or preparing input for a subsequent prompt. A `branch` stage evaluates a Python condition expression against the current pipeline state and redirects the DAG walker to a named stage, enabling conditional routing without external scripting or control logic. A `parallel` stage fans a defined set of sub-stages out for concurrent execution under a configurable concurrency ceiling, then merges results back into the pipeline via a named merge strategy: concatenated text, merged dictionary, or collected list. An `inject` stage queries the Recall Engine with a semantic search string derived from current pipeline context, retrieves the top-k most relevant historical exchanges from the Prompt Store, and writes them into the Context Bus under a standardized namespace ready for any downstream template to reference.

### Multi-Backend Routing

LOOM's Backend Router implements a normalized adapter interface that abstracts all supported providers behind a common completion contract. Individual stages within a single pipeline can target different backends — routing high-complexity reasoning tasks to a capable cloud model while offloading classification, summarization, or formatting stages to a local endpoint. Retry logic with configurable backoff, provider failover, and per-adapter timeout handling are managed entirely within the Backend Router layer, invisible to the pipeline definition itself.

Supported backends at launch: self-hosted vLLM (OpenAI-compatible), Anthropic API, OpenAI API, and Ollama.

### Persistent Prompt/Response Store

Every pipeline execution is logged in full to a local SQLite database — including the fully rendered prompt, raw model response, backend and model identifiers, token counts, stage latency, the active pipeline name, session tags, and the complete Context Bus state at completion. Each entry is embedded using a sentence-transformer model and indexed for semantic similarity search at write time. The store functions as a growing, queryable knowledge base of every AI interaction the user has run through LOOM. It is queryable directly via `loom recall` and is consumed automatically at pipeline execution time by the Recall Engine.

### Semantic Recall Engine

The Recall Engine performs real-time semantic similarity search over the Prompt Store during pipeline execution. When an `inject` stage fires, it constructs a search query from current pipeline context variables, encodes it against the same embedding model used at write time, and retrieves the top-k most semantically similar historical prompt/response pairs from the store. These are formatted and injected into the pipeline's Context Bus under `recall.injected`, available to any downstream Jinja2 template. The result is an automatic, accumulating context loop: the more pipelines a user runs, the richer the injected historical context becomes on subsequent runs — without any manual curation, retrieval scripting, or change to the pipeline definition.

### Session Management

LOOM's Session Manager maintains token budget tracking, context window utilization, and conversation state across all stages of a pipeline execution. It enforces configurable token ceilings per stage and applies a configurable pruning strategy when context approaches backend limits before passing trimmed state forward to downstream stages. Token consumption, input/output ratios, and per-stage latency are captured in full as part of the session record written to the Prompt Store at completion.

### CLI Interface

The full feature set is surfaced through a unified CLI built on Typer with Rich TUI output rendering. `loom run` executes a `.loom` pipeline with input data, variable overrides, and optional backend targeting flags. `loom weave` provides `new`, `edit`, `validate`, and `list` subcommands for authoring and managing pipeline definition files. `loom recall` runs standalone semantic queries against the Prompt Store and returns formatted top-k results. `loom log` opens a session browser with filtering by pipeline name, backend, date range, tags, or free text, with export support to markdown and JSON. `loom config` manages backend registration, named profile creation and switching, and key-value configuration reads and writes.

Pipelines support live streaming output to the terminal as responses arrive from backends, a `--dry-run` mode that validates the full execution graph without calling any backend, and `--var` flags for inline variable injection at invocation time.

### Configuration and Profile System

LOOM uses a three-tier layered configuration model. Global defaults and backend credentials are stored in `~/.loom/config.toml`. Project-level overrides live in `.loom/config.toml` within the working directory. Environment variables provide the final override layer and take precedence over both. Named profiles within the global config allow instant switching between complete backend sets — local-only inference, cloud-backed, or hybrid — without modifying any pipeline file. The active profile is loaded automatically on every LOOM invocation.

---

## Target Use Cases

LOOM is suited for any workflow in which a multi-step AI process needs to be defined once, run repeatedly against varying inputs, and improved automatically over time through accumulated context. Concrete applications include multi-stage code review and documentation generation pipelines, automated triage and classification workflows with conditional routing across severity levels, research and summarization pipelines operating across large document corpora, context-accumulating analysis pipelines that produce progressively better output the more they are used, and developer tooling pipelines that integrate LLM inference with transformation and structured output parsing in the same workflow graph. LOOM is especially well-suited for teams running self-hosted inference stacks — its multi-backend routing and local-first Prompt Store require no external dependencies beyond the inference endpoints themselves.

---

## How LOOM Differs from OpenCode

OpenCode is a terminal-based AI coding assistant — an interactive, agentic REPL that pairs LLM reasoning with direct file system access, shell execution, and real-time code editing in an open project. It is purpose-built for the single-session, conversational coding workflow: a developer opens a repository, issues natural language instructions, and OpenCode takes action against the codebase. Each session begins fresh. There is no pipeline definition language, no persistent memory across sessions, no multi-stage orchestration model, no multi-backend routing, and no mechanism for injecting context from prior work. OpenCode is a well-designed, capable point tool optimized for interactive use.

LOOM occupies a structurally different position in the toolchain. Where OpenCode is interactive and session-scoped, LOOM is declarative and workflow-scoped. Where OpenCode responds to one instruction at a time inside a conversational loop, LOOM executes a defined graph of stages with explicit data flow, conditional branching, parallel execution, and cross-session memory — all driven by a version-controlled pipeline file, not a live chat session. Where OpenCode's session state evaporates on exit, LOOM's accumulates persistently: every execution writes embeddings and full records to a local store, and future runs draw from that history automatically through the Recall Engine.

The practical boundary between the two tools is the nature of the task. OpenCode is the right tool when the goal is to have a live conversation with a codebase — to explore, modify, refactor, or debug interactively in real time. LOOM is the right tool when the goal is to define a process, run it repeatedly against different inputs, distribute inference load across multiple backends, and build up a context base that makes each subsequent run better than the last. LOOM is not a replacement for OpenCode — it is a layer above the interactive model, designed to orchestrate the kinds of multi-step, multi-model AI workflows that outgrow the boundaries of a single conversation.

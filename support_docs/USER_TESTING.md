# Testing LOOM

Thanks for trying LOOM. This guide assumes you have never seen the source
code and are testing a released binary, exactly as a real user would.

If any step below fails or is confusing, that is useful feedback — please
note exactly what you ran and what happened, not just "it didn't work."

---

## What LOOM is

LOOM is a terminal AI coding assistant — think of it as a more capable
version of tools like OpenCode. It talks to an AI model you already have
running (or a cloud API), reads and writes files in your project, and adds
a few things most terminal AI tools don't have: switchable specialized
agents, automatic memory of past sessions, and reusable multi-step
pipelines.

## Prerequisites

- macOS or Linux (Intel or Apple Silicon / x64 or arm64)
- An AI model endpoint you can reach — either:
  - A locally running OpenAI-compatible server (vLLM, Ollama, LM Studio,
    etc.), or
  - An Anthropic API key
- 5–10 minutes

You do **not** need Bun, Node, or any development tools installed. This is
testing the finished product, not building it.

---

## Step 1 — Install

```bash
curl -fsSL https://get.loom.dev/install.sh | sh
```

This detects your OS and CPU architecture, downloads the matching binary,
and installs it to `~/.local/bin/loom` (or `/usr/local/bin/loom` — the
installer will tell you which).

**Verify it worked:**

```bash
loom --version
```

You should see a version number and nothing else. If this hangs, opens an
interactive session, or prints an error after the version, please note that
— it's a known area we're actively checking.

## Step 2 — First run

From any directory, run:

```bash
loom
```

If this is your first time running LOOM, it will notice there's no
configuration yet and walk you through a short setup — asking for your
model endpoint (a URL like `http://localhost:8000` or `https://api.anthropic.com`)
and, if needed, an API key.

If the setup wizard does not appear and LOOM fails instead, tell us exactly
what it printed.

## Step 3 — Talk to it

Once you're in, you should see a prompt. Try something simple:

```
Create a file called hello.txt with a short haiku about terminals.
```

LOOM should read your current directory, write the file, and tell you what
it did. Check that `hello.txt` actually exists afterward:

```bash
cat hello.txt
```

## Step 4 — Try switching agents

LOOM ships with four specialized agents: Architect, Developer, Tester, and
Security. Press **Tab** to cycle between them. The active agent's name
should be visible somewhere in the interface (usually a tab strip or status
line).

Try switching to the Tester agent and asking:

```
Write a test for the hello.txt file we just created — check that it exists
and is not empty.
```

Note whether the conversation felt continuous (did the new agent seem aware
you just created `hello.txt`?) or like a fresh start.

## Step 5 — Try a longer session (optional, ~15+ minutes)

LOOM is designed to notice when a conversation is getting long and
automatically save a summary so a new session can pick up where you left
off. This is hard to trigger in a short test, but if you have time:

Keep working on a small real task for 15–20 minutes of back-and-forth. If
LOOM ever tells you it's saving a handoff or you notice a `.loom/handoff.md`
file appear in your working directory, that's the feature working. Open
that file and see if it reads like a sensible summary of what you were
doing.

## Step 6 — Try recall (optional)

If you completed Step 5 or had any prior LOOM session in the same
directory, try:

```bash
loom recall --query "hello.txt"
```

This should surface the earlier conversation where you created that file.

## Step 7 — Try a pipeline (optional, may not be available in this build)

```bash
loom pipeline run examples/hello.loom
```

If this command doesn't exist yet in the build you're testing, that's a
known gap — no need to report it, just skip this step.

## Step 8 — Themes (optional)

```bash
loom theme list
loom theme use loom-light
```

Restart LOOM and see if the color scheme changed.

---

## What to report back

For each step, tell us:
1. Did it work as described?
2. If not, what actually happened — the exact command and exact output.
3. Anything that felt confusing, slow, or surprising, even if it "worked."

Rough first impressions matter as much as bug reports. If something felt
like it was fighting you, say so — that's exactly what this round of
testing is for.

Thank you for testing LOOM.

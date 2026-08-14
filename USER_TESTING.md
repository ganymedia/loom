# LOOM user testing guide

Use this guide to test LOOM as a first-time user with no source checkout. Record exact commands and exact output for anything that fails or feels confusing. Do not paste API keys, private backend URLs, CUI, or proprietary project content into feedback.

## What you need

- Linux or macOS on x64 or arm64.
- A reachable OpenAI-compatible backend endpoint, such as a vLLM, Ollama, LM Studio, or compatible gateway URL.
- The install command or release host provided by the LOOM operator.
- A scratch directory that does not contain a LOOM repository clone.

You do not need Bun, Node.js, or TypeScript.

## 1. Install LOOM

Set the release base URL. Use the default public value unless the operator gives you a staging or mirror URL:

```bash
export LOOM_RELEASE_BASE_URL="https://github.com/ganymedia/loom/releases"
```

Download and run the installer:

```bash
curl -fsSL "$LOOM_RELEASE_BASE_URL/latest/download/install.sh" -o /tmp/loom-install.sh
LOOM_INSTALL_BASE_URL="$LOOM_RELEASE_BASE_URL" sh /tmp/loom-install.sh
export PATH="$HOME/.local/bin:$PATH"
```

Expected result: the installer prints `LOOM installed to .../loom`. If that directory is not already on `PATH`, it also tells you to add it.

If `loom` is still not found after the `PATH` update, open a new shell or set `LOOM_BIN` to the full path printed by the installer and use `"$LOOM_BIN"` in place of `loom` in every command below:

```bash
export LOOM_BIN="/tmp/example/loom"
```

## 2. Verify the installed binary

```bash
${LOOM_BIN:-loom} --version
```

Expected result: a version string such as `0.1.0`, then exit code 0. It must not start a session.

```bash
${LOOM_BIN:-loom} --help
```

Expected result: help text that lists public commands including `plan`, `pipeline`, `recall`, `log`, `theme`, and `config`, then exit code 0. It must not print a fatal wrapper error.

## 3. Create a scratch project

```bash
mkdir -p "$HOME/loom-user-test"
cd "$HOME/loom-user-test"
```

All remaining commands should run from this scratch directory unless stated otherwise.

## 4. Check non-backend commands

```bash
${LOOM_BIN:-loom} theme list
```

Expected result: a list of built-in themes, with `loom-dark` available.

Create a small pipeline file:

```bash
mkdir -p .loom
cat > .loom/smoke.loom <<'EOF'
name: user-smoke
version: "1"
stages:
  - id: message
    type: transform
    expression: runtime.message
EOF
```

Run it through the public pipeline command from the scratch project root, not from inside `.loom/`:

```bash
${LOOM_BIN:-loom} pipeline run .loom/smoke.loom --var runtime.message="hello from loom"
```

Expected result: JSON with `"success": true` and `"finalOutput": "hello from loom"`.

## 5. First-run configuration

If you already have a LOOM config and want to test the first-run path, move it aside first:

```bash
[ ! -f "$HOME/.loom/config.yaml" ] || mv "$HOME/.loom/config.yaml" "$HOME/.loom/config.yaml.backup"
```

Start LOOM interactively:

```bash
${LOOM_BIN:-loom}
```

Expected result when no supported global config exists: LOOM asks for an `OpenAI-compatible backend URL`. Enter the endpoint URL supplied by the operator or your local backend, for example `http://127.0.0.1:8000/v1`.

After the prompt, LOOM should create `$HOME/.loom/config.yaml` and continue into the session startup path. If the backend is reachable, it should discover a model and report session startup status. If the backend is not reachable, it should fail that operation with a clear backend/config message rather than crashing.

If your terminal does not let you type into the first-run prompt, record that as a bug, then create the same config manually so you can continue the rest of the guide:

```bash
mkdir -p "$HOME/.loom"
cat > "$HOME/.loom/config.yaml" <<'EOF'
activeProfile: default
profiles:
  default:
    defaultBackend: local
backends:
  local:
    type: openai-compatible
    baseUrl: http://127.0.0.1:8000/v1
EOF
```

Replace the `baseUrl` value with your actual OpenAI-compatible endpoint.

In another shell, inspect only the non-secret config shape:

```bash
${LOOM_BIN:-loom} config
```

Expected result: JSON showing `activeProfile: "default"`, a `defaultBackend` named `local`, and an `endpoint: "[configured]"` marker for the backend. It must not print the backend URL, header values, or a resolved API key. The configured `apiKeyEnv` variable name may appear; review all output before sharing it.

## 6. One-turn backend smoke

With a reachable backend configured, run:

```bash
${LOOM_BIN:-loom} --prompt "Reply with one short sentence confirming LOOM is connected."
```

Expected result: LOOM runs startup checks, sends one Developer-agent prompt, prints a model response, and exits. Report whether the response appeared, whether the model name was discovered dynamically, and whether any error message was clear.

## 7. Agent switching smoke

Start an interactive session again:

```bash
${LOOM_BIN:-loom}
```

At the prompt, try these commands:

```text
/agents
[press Tab without Enter]
/tab
/agent Tester
/agent Security
[resize the terminal narrower, then wider]
/exit
```

Start two fresh interactive sessions after the command sequence. Press Escape to exit the first and Ctrl+C to exit the second.

Expected result: LOOM shows the built-in agents; pressing Tab immediately changes the active agent without Enter; `/tab` and `/agent <name>` also change the active agent; the live frame reflows after each resize; and `/exit`, Escape, and Ctrl+C each exit cleanly and restore the normal terminal screen.

Agent IDs are displayed in lowercase, but `/agent <name>` matching is case-insensitive. Both mixed-case commands above should work.

## 8. Recall and log commands

Create a local prompt-store session and event:

```bash
${LOOM_BIN:-loom} log session --id user-test --agent Developer
${LOOM_BIN:-loom} log add --session user-test --turn 1 --role user --agent Developer --content "hello recall" --prompt-tokens 1 --completion-tokens 0
${LOOM_BIN:-loom} log show --session user-test
```

Expected result: `log show` returns JSON containing the `hello recall` event.

Manual vector recall should work without an embedding backend:

```bash
${LOOM_BIN:-loom} recall --vector 1,0 --top-k 3
```

Expected result: JSON recall output. It may be empty if no events have embeddings; it should not crash.

## 9. What to report

For each section, report:

1. Your OS and CPU architecture.
2. The install command or release host used.
3. Whether each expected result matched what happened.
4. Exact command output for failures.
5. Anything confusing, slow, surprising, or undocumented.

Do not include secrets, private model prompts, CUI, or proprietary code in the report.

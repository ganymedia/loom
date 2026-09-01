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

Switch between `loom-light` and `loom-dark` and start an interactive session after each change. Expected result: the entire TUI canvas, including the optional right panel, uses the selected light or dark background consistently; message blocks remain separated by borders rather than isolated background rectangles.

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
[type a short first line, press Ctrl+J, type a second line, and verify both lines remain in the input]
[press Enter once and verify the two-line prompt submits as one prompt]
[where supported, repeat with Shift+Enter instead of Ctrl+J; if the terminal does not report the Shift modifier, record the path as unsupported rather than failed]
[paste a two-line non-sensitive prompt and verify it remains one prompt until Enter]
[verify the visible hint distinguishes Enter submit from newline actions]
[verify the composer is a separately bordered Message region]
[submit a safe prompt and verify it remains in scrollback as a labeled, bordered You block distinct from the assistant response]
[type / as the first input character and inspect the popup]
[verify /recall appears with its prior-session context description]
[continue typing agent t and verify only /agent tester remains]
[press Escape and verify the popup closes while > /agent t remains]
[type e and verify the popup reopens with > /agent te and /agent tester]
[press Backspace nine times to clear /agent te]
/agents
[press Tab without Enter]
/tab
[type / to reopen the popup]
[press Down, then Up, and verify the marked selection moves within the popup]
[press Enter and verify the selected command runs]
[outside the slash popup, press Up and verify the most recent submitted multi-line prompt is recalled intact]
[press Up again to recall the prior submitted entry, then Down to move forward]
[return to an empty input, type an unsent two-line draft with Ctrl+J, press Up to recall history, then press Down and verify the unsent draft is restored intact]
[verify Up/Down navigation does not interfere with the slash popup selection when the popup is active]
/agent Tester
/agent Security
[switch to Architect, Tester, and Security in turn; ask each to use file-reader on .loom/smoke.loom and verify the permitted tool executes instead of remaining at Thinking]
Summarize the current task in one sentence.
[verify Security: Thinking dots animate before response text]
[verify the Thinking indicator disappears on first streamed text or turn failure]
Summarize the current task again in different words.
[while the second response is live, verify the completed first response is visually recessed but remains readable]
Reply with Markdown containing a heading, bold text, a two-item list, inline code, and a fenced TypeScript code block.
[verify the structure is styled, recognized code syntax is color-highlighted, and raw Markdown markers or fences are not shown]
Use the file-reader tool to read package.json and report only the package name.
[verify Security: Running 1 tool dots appear during execution, distinct from Thinking]
[verify amber tool activity says Reading file, Writing file, Running command, or Checking repository; mixed tools may use a count fallback]
[verify the tool-action indicator clears on finish/failure and shows no names, arguments, paths, or file content]
[verify completed tool results use green `✓` success or red `✕` failure rows with explicit outcome text]
[verify completed Developer output becomes a bordered `Developer summary` block while live streaming and other agents remain unchanged]
[verify the composer cursor blinks, paints the current character without shifting surrounding text, and uses its own cell only at the end of empty, single-line, and multi-line input]
[type a non-sensitive multi-word line, verify Left/Right move by character, edit in the middle, then verify Ctrl+Left/Ctrl+Right or the terminal-equivalent Meta shortcuts move by word]
[resize the terminal narrower, then wider]
[at 100 columns by 20 rows or larger, verify the right panel appears with session, repository, runtime, plan, and version labels]
[verify the panel title changes from New session after the first submitted prompt and does not change after later prompts]
[shrink below 100 columns or 20 rows and verify the panel disappears without leaving blank space]
/exit
```

Start two fresh interactive sessions after the command sequence. Press Escape to exit the first and Ctrl+C to exit the second.

Expected result: the composer is a separately bordered `Message` region showing `Enter submit · Ctrl+J newline · Shift+Enter where supported`; Ctrl+J inserts a visible continuation line without submitting, Shift+Enter does the same when the terminal reports the modifier, pasted multi-line text remains one prompt, and plain Enter submits the complete input once. Submitted prompts remain as labeled, bordered `You` blocks distinct from assistant responses by structure and text, not color alone, and narrow/wide resize preserves those boundaries. Typing `/` shows an inline popup with `/agent developer`, `/agent architect`, `/agent tester`, `/agent security`, `/tab`, `/agents`, `/exit`, and `/quit`; continuing with `agent t` filters the list live to `/agent tester` using case-insensitive executable-prefix matching; Escape closes the open popup without submitting or clearing `/agent t`, and typing `e` reopens discovery for the preserved input; Up and Down move the visible selection with wraparound within the popup, and Enter runs the selected command; outside the popup, Up moves backward through current-session submitted entries, Down moves forward, multi-line entries remain intact, and Down past the newest entry restores the unsent draft; popup selection retains precedence while open. LOOM shows the built-in agents; pressing Tab immediately changes the active agent without Enter; `/tab` and `/agent <name>` also change the active agent; an animated active-agent Thinking indicator appears immediately after a normal prompt and disappears on the first streamed text or turn failure; assistant Markdown renders as styled headings, emphasis, lists, inline code, and recognized syntax-highlighted fenced code without showing raw formatting markers; completed scrollback is visually recessed but readable while the live exchange remains prominent; existing tool execution replaces Thinking with a visually distinct animated Running N tool(s) indicator that clears on finish/failure and never displays arguments or results; the live frame reflows after each resize; and `/exit`, Escape outside a popup, and Ctrl+C each exit cleanly and restore the normal terminal screen.

Automatic handoff is triggered only after reported token usage reaches 80% of the active context limit. A short ordinary session may never reach it. If the operator provides a controlled small-context test backend, cross the threshold and verify the pinned status bar shows an amber `handoff saved` notice. Otherwise record this item as not exercised, not failed. Non-TTY output should retain its existing handoff message when the threshold is crossed.

Agent IDs are displayed in lowercase, but `/agent <name>` matching is case-insensitive. Both mixed-case commands above should work.

Confirm the right panel shows only a directory basename, uses explicit `idle`, `active`, or `failed` text with a status dot, shows at most five non-completed tasks or a fixed unavailable/empty message, and never displays prompt text or an absolute path.

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

### Interactive recall

If an embedding backend is configured and the Prompt Store contains embedded events, start `${LOOM_BIN:-loom}` and enter:

```text
/recall hello recall
Use the prior context to summarize the earlier topic.
```

Expected result: `/recall` does not print recalled content, reports only the number of prior-session results used, and shows `prior context` in the pinned status bar. If no indexed history exists, it shows `Recall unavailable: no indexed prior-session history exists.`; if history exists but `store.embeddingBackend` is absent, it shows `Recall unavailable: configure store.embeddingBackend.`; other failures show a generic sanitized message.

## 9. File-writer and Ink diffing

Verify the built-in file-writer and persistent Ink diffing:

```bash
# 1. Create a disposable file
printf 'line 1\nline 2\nline 3\n' > test_file.txt

# 2. Start the persistent interactive session
${LOOM_BIN:-loom}
```

At the `>` prompt, enter:

```text
Use the file-writer tool to overwrite test_file.txt with exactly four lines: line 1, line 2.5, line 3, and line 4.
```

Resize the terminal while the diff remains visible, then exit LOOM and run:

```bash
# 3. Confirm non-TTY output still works without invoking the Ink view
${LOOM_BIN:-loom} --prompt "Reply with one short sentence and do not use tools."

# 4. Verify the file content
cat test_file.txt

# 5. Cleanup
rm test_file.txt
```

Expected result:
- `test_file.txt` is overwritten with the exact new content.
- In the terminal output (Ink), the diff shows `line 2` as red (removed) and `line 2.5` as green (added).
- Surrounding context (`line 1` and `line 3`) remains visible and unchanged.
- The terminal resize remains stable during the output.
- No secrets or CUI are leaked in the file or terminal.

## 10. Opt-in SAST acceptance

Run this only in a disposable project with non-sensitive source. Add the following project-local setting to `.loom/config.yaml`; do not add it to global config:

```yaml
subAgents:
  sast:
    enabled: true
```

In a real terminal, start `${LOOM_BIN:-loom}` with enough height and width, ask the Developer agent to write a small supported source file, and observe the activity tray. Acceptance is not presumed complete: verify the tray shows no more than three rows with explicit `running`, `succeeded`, or `failed` labels; hides when the terminal is short or narrow; and does not expose source, paths, findings, model/backend details, or prompts. Verify ordinary parent output and streaming remain unchanged, and verify piped/non-TTY use adds no sub-agent activity text.

If the tray ends at `failed`, the parent turn must still succeed and no `.loom/findings.jsonl` file is expected; record the fixed failure state without copying backend output. A findings file is expected only after a successful scan that returned validated findings.

After a successful scan with findings, inspect only the record keys and file metadata, not sensitive values. `.loom/findings.jsonl` should be owner mode `0600`, valid JSONL, at most 500 records and 1 MiB, and contain only the documented timestamp, opaque scan ID, rule, severity, relative file, optional line/CWE, message, and fix-hint fields. With the setting absent, verify no scan request, tray, or findings file is created.

## 11. What to report

For each section, report:

1. Your OS and CPU architecture.
2. The install command or release host used.
3. Whether each expected result matched what happened.
4. Exact command output for failures.
5. Anything confusing, slow, surprising, or undocumented.

Do not include secrets, private model prompts, CUI, or proprietary code in the report.

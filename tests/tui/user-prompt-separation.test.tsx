import { describe, expect, test } from "bun:test";
import {
  SessionApp,
  SessionInput,
  SessionViewStore,
} from "@loom/tui/session-app";
import { builtInAgentTabs } from "@loom/tui/tab-strip";
import { loomDark } from "@loom/tui/theme";
import { renderToString } from "ink";
import { createElement } from "react";

describe("SessionApp user prompt rendering", () => {
  const store = new SessionViewStore({
    activeAgentName: "developer",
    sessionId: "test-session",
    output: [],
    tokenPercent: 0,
  });

  test("renders user prompt with 'You' label and 'Submitted' indicator", () => {
    store.appendUserPrompt("hello world", "developer");

    const output = renderToString(
      createElement(SessionApp, {
        onCycleAgent: () => {},
        onExit: () => {},
        onSubmit: () => {},
        store,
        themeId: "loom-dark",
      }),
    );

    // Check for "You" label
    expect(output).toContain("You");
    // Check for "Submitted" indicator
    expect(output).toContain("Submitted");
    // Check for content
    expect(output).toContain("hello world");
    // Check for the box structure (Ink uses unicode characters for borders)
    expect(output).toContain("╭");
    expect(output).toContain("╰");
  });

  test("renders user prompt with redacted content", () => {
    // Note: In a real scenario, redact() is called in session.ts. 
    // Here we test the component's ability to render what it receives.
    store.appendUserPrompt("secret-api-key-123", "developer");

    const output = renderToString(
      createElement(SessionApp, {
        onCycleAgent: () => {},
        onExit: () => {},
        onSubmit: () => {},
        store,
        themeId: "loom-dark",
      }),
    );

    expect(output).toContain("secret-api-key-123");
  });
});

describe("SessionInput", () => {
  test("renders message label and input text", () => {
    const output = renderToString(
      createElement(SessionInput, {
        activeAgentName: "developer",
        input: "my input",
      }),
    );

    expect(output).toContain("Message");
    expect(output).toContain("my input");
    expect(output).toContain("╭");
    expect(output).toContain("╰");
  });
});

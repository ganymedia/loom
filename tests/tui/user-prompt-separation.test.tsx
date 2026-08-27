import { describe, expect, test } from "bun:test";
import {
  SessionApp,
  SessionInput,
  SessionViewStore,
  inputCursorGlyph,
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
    panel: {
      directory: "loom",
      plan: { availability: "available", tasks: [] },
      runtime: "idle",
      title: "New session",
      version: "0.1.0",
    },
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

  test("renders subsequent submitted prompt content", () => {
    store.appendUserPrompt("second prompt", "developer");

    const output = renderToString(
      createElement(SessionApp, {
        onCycleAgent: () => {},
        onExit: () => {},
        onSubmit: () => {},
        store,
        themeId: "loom-dark",
      }),
    );

    expect(output).toContain("second prompt");
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
    expect(output).toContain("▌");
    expect(output).toContain("╭");
    expect(output).toContain("╰");
  });

  test("keeps one cursor cell for visible and hidden frames", () => {
    expect(inputCursorGlyph(true)).toBe("▌");
    expect(inputCursorGlyph(false)).toBe(" ");
    expect(Bun.stringWidth(inputCursorGlyph(true))).toBe(1);
    expect(Bun.stringWidth(inputCursorGlyph(false))).toBe(1);

    const output = renderToString(
      createElement(SessionInput, {
        activeAgentName: "developer",
        input: "first\nsecond",
      }),
    );
    expect(output).toContain("  second▌");
  });
});

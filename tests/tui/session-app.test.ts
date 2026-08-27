import { describe, expect, test } from "bun:test";
import { FileWriteDiff, createFileDiffLines } from "@loom/tui/file-diff";
import {
  SessionApp,
  SessionInput,
  SessionViewStore,
  SlashCommandPopup,
  ThinkingIndicator,
  ToolRunningIndicator,
  appendSessionInput,
  completedOutputTextStyle,
  formatSessionInput,
  isDismissedSlashPopupMetaText,
  isSessionExitInput,
  isSlashCommandPopupOpen,
  moveSessionHistoryIndex,
  moveSlashCommandSelection,
  resolveTerminalRows,
  shouldInsertInputNewline,
  splitTerminalInputChunk,
  thinkingIndicatorText,
  toolRunningIndicatorText,
  visibleSlashCommandWindow,
} from "@loom/tui/session-app";
import type { SessionPanelState } from "@loom/tui/session-panel-state";
import { sessionSlashCommandEntries } from "@loom/tui/slash-commands";
import { loomDark } from "@loom/tui/theme";
import { renderToString } from "ink";
import { createElement } from "react";

function testPanelState(): SessionPanelState {
  return {
    directory: "loom",
    plan: { availability: "available", tasks: [] },
    runtime: "idle",
    title: "New session",
    version: "0.1.0",
  };
}

describe("multi-line session input", () => {
  test("normalizes pasted newlines and distinguishes newline from submit", () => {
    expect(appendSessionInput("first", "\r\nsecond\rthird")).toBe(
      "first\nsecond\nthird",
    );
    expect(splitTerminalInputChunk("hello\r")).toEqual({
      text: "hello",
      submit: true,
    });
    expect(splitTerminalInputChunk("hello\r\nworld")).toEqual({
      text: "hello\r\nworld",
      submit: false,
    });
    expect(
      shouldInsertInputNewline("\n", { return: false, shift: false }),
    ).toBe(true);
    expect(shouldInsertInputNewline("\r", { return: true, shift: true })).toBe(
      true,
    );
    expect(shouldInsertInputNewline("", { return: true, shift: false })).toBe(
      false,
    );
  });

  test("renders continuation indentation and visible key hints", () => {
    expect(formatSessionInput("first\nsecond")).toBe("> first\n  second");
    expect(resolveTerminalRows(undefined)).toBe(24);
    expect(resolveTerminalRows(0)).toBe(24);
    expect(resolveTerminalRows(8)).toBe(12);
    expect(resolveTerminalRows(40)).toBe(40);
    const input = renderToString(
      createElement(SessionInput, {
        activeAgentName: "developer",
        input: "first\nsecond",
      }),
    );
    expect(input).toContain("> first");
    expect(input).toContain("second");
    expect(input).toContain("Message");
    expect(input).toContain("╭");
    expect(input).toContain("Enter submit");
    expect(input).toContain("Ctrl+J newline");
  });
});

describe("isSessionExitInput", () => {
  test("recognizes Escape and Ctrl+C without treating other control keys as exits", () => {
    expect(isSessionExitInput("", { ctrl: false, escape: true })).toBe(true);
    expect(isSessionExitInput("c", { ctrl: true, escape: false })).toBe(true);
    expect(isSessionExitInput("C", { ctrl: true, escape: false })).toBe(true);
    expect(isSessionExitInput("x", { ctrl: true, escape: false })).toBe(false);
    expect(isSessionExitInput("c", { ctrl: false, escape: false })).toBe(false);
  });
});

describe("moveSlashCommandSelection", () => {
  test("moves in both directions and wraps at popup boundaries", () => {
    expect(moveSlashCommandSelection(0, 4, 1)).toBe(1);
    expect(moveSlashCommandSelection(1, 4, -1)).toBe(0);
    expect(moveSlashCommandSelection(3, 4, 1)).toBe(0);
    expect(moveSlashCommandSelection(0, 4, -1)).toBe(3);
  });

  test("handles empty and stale filtered selections", () => {
    expect(moveSlashCommandSelection(0, 0, 1)).toBe(-1);
    expect(moveSlashCommandSelection(5, 2, 1)).toBe(1);
  });
});

describe("visibleSlashCommandWindow", () => {
  test("bounds narrow-terminal entries and follows the selection", () => {
    const first = visibleSlashCommandWindow(sessionSlashCommandEntries, 0, 3);
    expect(first.entries).toEqual(sessionSlashCommandEntries.slice(0, 3));
    expect(first.selectedIndex).toBe(0);

    const last = visibleSlashCommandWindow(
      sessionSlashCommandEntries,
      sessionSlashCommandEntries.length - 1,
      3,
    );
    expect(last.entries).toEqual(sessionSlashCommandEntries.slice(-3));
    expect(last.selectedIndex).toBe(2);
  });
});

describe("moveSessionHistoryIndex", () => {
  test("moves through history boundaries and returns to the draft slot", () => {
    expect(moveSessionHistoryIndex(3, 3, -1)).toBe(2);
    expect(moveSessionHistoryIndex(2, 3, -1)).toBe(1);
    expect(moveSessionHistoryIndex(0, 3, -1)).toBe(0);
    expect(moveSessionHistoryIndex(1, 3, 1)).toBe(2);
    expect(moveSessionHistoryIndex(2, 3, 1)).toBe(3);
    expect(moveSessionHistoryIndex(3, 3, 1)).toBe(3);
    expect(moveSessionHistoryIndex(0, 0, -1)).toBe(0);
  });
});

describe("isSlashCommandPopupOpen", () => {
  test("requires slash input and remains closed after dismissal", () => {
    expect(isSlashCommandPopupOpen("/agent s", false)).toBe(true);
    expect(isSlashCommandPopupOpen("/agent s", true)).toBe(false);
    expect(isSlashCommandPopupOpen("plain text", false)).toBe(false);
  });

  test("recovers a printable Meta continuation after popup dismissal", () => {
    expect(isDismissedSlashPopupMetaText("/agent s", true, "e", true)).toBe(
      true,
    );
    expect(isDismissedSlashPopupMetaText("/agent s", false, "e", true)).toBe(
      false,
    );
    expect(isDismissedSlashPopupMetaText("plain", true, "e", true)).toBe(false);
    expect(isDismissedSlashPopupMetaText("/agent s", true, "e", false)).toBe(
      false,
    );
  });
});

describe("SessionViewStore", () => {
  test("notifies the persistent app when output and status change", () => {
    const store = new SessionViewStore({
      activeAgentName: "developer",
      output: [],
      panel: testPanelState(),
      sessionId: "session-1",
      tokenPercent: 0,
    });
    const snapshots: string[] = [];
    const unsubscribe = store.subscribe(() => {
      const state = store.getSnapshot();
      snapshots.push(
        `${state.activeAgentName}:${state.tokenPercent}:${state.output
          .map((output) =>
            output.kind === "plain"
              ? output.text
              : output.kind === "assistant"
                ? `${output.displayName}: ${output.content}\n`
                : output.kind === "file-diff"
                  ? `diff:${output.path}\n`
                  : output.kind === "tool-result"
                    ? `tool:${output.success}:${output.text}\n`
                    : `user:${output.content}\n`,
          )
          .join("")}`,
      );
    });

    store.appendAssistantOutput("Developer", "first answer");
    store.updateStatus("security", 0.25);
    unsubscribe();
    store.appendOutput("ignored after unsubscribe");

    expect(snapshots).toEqual([
      "developer:0:Developer: first answer\n",
      "security:0.25:Developer: first answer\n",
    ]);
    expect(store.getSnapshot()).toEqual({
      activeAgentName: "security",
      output: [
        {
          id: "output-0",
          kind: "assistant",
          displayName: "Developer",
          content: "first answer",
        },
        {
          id: "output-1",
          kind: "plain",
          text: "ignored after unsubscribe",
        },
      ],
      panel: testPanelState(),
      sessionId: "session-1",
      tokenPercent: 0.25,
    });
  });

  test("updates and clears the live assistant region", () => {
    const store = new SessionViewStore({
      activeAgentName: "developer",
      output: [],
      panel: testPanelState(),
      sessionId: "session-1",
      tokenPercent: 0,
    });

    store.beginThinking("Developer");
    expect(store.getSnapshot().thinkingAgentDisplayName).toBe("Developer");

    store.appendAssistantDelta("Developer", "Hel");
    store.appendAssistantDelta("Developer", "lo");
    expect(store.getSnapshot().thinkingAgentDisplayName).toBeUndefined();
    expect(store.getSnapshot().liveAssistant).toEqual({
      displayName: "Developer",
      text: "Hello",
    });

    store.clearAssistantDelta();
    expect(store.getSnapshot().liveAssistant).toBeUndefined();

    store.beginThinking("Developer");
    store.clearThinking();
    expect(store.getSnapshot().thinkingAgentDisplayName).toBeUndefined();
  });

  test("records handoff and prior-context status signals", () => {
    const store = new SessionViewStore({
      activeAgentName: "developer",
      output: [],
      panel: testPanelState(),
      sessionId: "session-1",
      tokenPercent: 0.8,
    });

    store.markHandoffWritten();
    store.markPriorContextUsed();

    expect(store.getSnapshot().handoffWritten).toBe(true);
    expect(store.getSnapshot().priorContextUsed).toBe(true);
  });

  test("distinguishes tool execution from thinking and validates its count", () => {
    const store = new SessionViewStore({
      activeAgentName: "developer",
      output: [],
      panel: testPanelState(),
      sessionId: "session-1",
      tokenPercent: 0,
    });

    store.beginThinking("Developer");
    store.beginToolRunning("Developer", 2);
    expect(store.getSnapshot().thinkingAgentDisplayName).toBeUndefined();
    expect(store.getSnapshot().toolRunning).toEqual({
      displayName: "Developer",
      toolCount: 2,
    });

    store.clearToolRunning();
    expect(store.getSnapshot().toolRunning).toBeUndefined();
    expect(() => store.beginToolRunning("Developer", 0)).toThrow(
      "toolCount must be a positive integer",
    );
  });

  test("stores file diffs as typed output", () => {
    const store = new SessionViewStore({
      activeAgentName: "developer",
      output: [],
      panel: testPanelState(),
      sessionId: "session-1",
      tokenPercent: 0,
    });

    store.appendFileDiff("src/example.ts", "const old = 1;", "const next = 2;");

    expect(store.getSnapshot().output[0]).toEqual({
      id: "output-0",
      kind: "file-diff",
      path: "src/example.ts",
      beforeContent: "const old = 1;",
      afterContent: "const next = 2;",
    });
  });

  test("stores submitted prompts as typed user output", () => {
    const store = new SessionViewStore({
      activeAgentName: "developer",
      output: [],
      panel: testPanelState(),
      sessionId: "session-1",
      tokenPercent: 0,
    });

    store.appendUserPrompt("first line\nsecond line", "tester");

    expect(store.getSnapshot().output[0]).toEqual({
      id: "output-0",
      kind: "user",
      content: "first line\nsecond line",
      agentName: "tester",
    });
  });
});

describe("SessionApp", () => {
  test("shows handoff and prior-context notices in the pinned status bar", () => {
    const store = new SessionViewStore({
      activeAgentName: "developer",
      output: [],
      panel: testPanelState(),
      sessionId: "session-1",
      tokenPercent: 0.8,
    });
    store.markHandoffWritten();
    store.markPriorContextUsed();

    const frame = renderToString(
      createElement(SessionApp, {
        onCycleAgent: () => {},
        onExit: () => {},
        onSubmit: () => {},
        store,
        themeId: undefined,
      }),
    );

    expect(frame).toContain("handoff saved");
    expect(frame).toContain("prior context");
    expect(frame).not.toContain("session-1");
  });

  test("renders animated thinking text before assistant output", () => {
    expect(thinkingIndicatorText("Developer", 0)).toBe("Developer: Thinking.");
    expect(thinkingIndicatorText("Developer", 1)).toBe("Developer: Thinking..");
    expect(thinkingIndicatorText("Developer", 2)).toBe(
      "Developer: Thinking...",
    );
    expect(thinkingIndicatorText("Developer", 3)).toBe("Developer: Thinking.");

    const indicator = renderToString(
      createElement(ThinkingIndicator, { displayName: "Developer" }),
    );
    expect(indicator).toContain("Developer: Thinking.");
  });

  test("renders tool execution with distinct text and count", () => {
    expect(toolRunningIndicatorText("Developer", 1, 0)).toBe(
      "Developer: Running 1 tool.",
    );
    expect(toolRunningIndicatorText("Developer", 2, 2)).toBe(
      "Developer: Running 2 tools...",
    );

    const indicator = renderToString(
      createElement(ToolRunningIndicator, {
        displayName: "Developer",
        toolCount: 2,
      }),
    );
    expect(indicator).toContain("Developer: Running 2 tools.");
    expect(indicator).not.toContain("Thinking");
  });

  test("renders unchanged, removed, and added file lines", () => {
    expect(createFileDiffLines("same\nold\n", "same\nnew\n")).toEqual([
      { kind: "context", text: "same" },
      { kind: "removed", text: "old" },
      { kind: "added", text: "new" },
    ]);

    const diff = renderToString(
      createElement(FileWriteDiff, {
        path: "src/example.ts",
        beforeContent: "same\nold\n",
        afterContent: "same\nnew\n",
      }),
    );
    expect(diff).toContain("File src/example.ts");
    expect(diff).toContain("  same");
    expect(diff).toContain("- old");
    expect(diff).toContain("+ new");

    const omitted = renderToString(
      createElement(FileWriteDiff, {
        path: "large.txt",
        beforeContent: null,
        afterContent: null,
      }),
    );
    expect(omitted).toContain("Diff omitted: change is too large");
  });

  test("renders every available slash command in the inline popup", () => {
    const popup = renderToString(
      createElement(SlashCommandPopup, {
        entries: sessionSlashCommandEntries,
        selectedIndex: 1,
      }),
    );

    for (const entry of sessionSlashCommandEntries) {
      expect(popup).toContain(entry.command);
      expect(popup).toContain(entry.description);
    }
    expect(popup).toContain(`› ${sessionSlashCommandEntries[1]?.command}`);
  });

  test("keeps the popup visible when no commands match", () => {
    const popup = renderToString(
      createElement(SlashCommandPopup, { entries: [], selectedIndex: -1 }),
    );

    expect(popup).toContain("Commands");
    expect(popup).toContain("No matching commands");
  });

  test("renders completed output above the live frame", () => {
    expect(completedOutputTextStyle(loomDark)).toEqual({
      color: loomDark.textTertiary,
      dimColor: true,
    });

    const store = new SessionViewStore({
      activeAgentName: "developer",
      liveAssistant: { displayName: "Developer", text: "working" },
      output: [
        {
          id: "first",
          kind: "plain",
          text: "first completed line\n",
        },
        {
          id: "second",
          kind: "user",
          content: "submitted prompt",
          agentName: "security",
        },
        {
          id: "third",
          kind: "assistant",
          displayName: "Security",
          content: "**second completed line**",
        },
      ],
      panel: testPanelState(),
      sessionId: "session-1",
      tokenPercent: 0.25,
    });

    const frame = renderToString(
      createElement(SessionApp, {
        onCycleAgent: () => {},
        onExit: () => {},
        onSubmit: () => {},
        store,
        themeId: undefined,
      }),
    );

    const firstOutput = frame.indexOf("first completed line");
    const userOutput = frame.indexOf("submitted prompt");
    const userLabel = frame.indexOf("You");
    const secondOutput = frame.indexOf("second completed line");
    const tabs = frame.indexOf("Developer");
    const liveAssistant = frame.indexOf("working");
    const status = frame.indexOf("session-1");
    const input = frame.lastIndexOf(">");

    expect(tabs).toBeGreaterThanOrEqual(0);
    expect(firstOutput).toBeGreaterThan(tabs);
    expect(userLabel).toBeGreaterThan(firstOutput);
    expect(userOutput).toBeGreaterThan(firstOutput);
    expect(secondOutput).toBeGreaterThan(userOutput);
    expect(liveAssistant).toBeGreaterThan(secondOutput);
    expect(status).toBeGreaterThan(liveAssistant);
    expect(input).toBeGreaterThan(status);
  });

  test("renders tool outcomes with semantic text labels", () => {
    const store = new SessionViewStore({
      activeAgentName: "developer",
      output: [],
      panel: testPanelState(),
      sessionId: "session-1",
      tokenPercent: 0,
    });
    store.appendToolResult("Tool 1: ok", true);
    store.appendToolResult("Tool 2: failed", false);

    expect(store.getSnapshot().output).toEqual([
      {
        id: "output-0",
        kind: "tool-result",
        success: true,
        text: "Tool 1: ok",
      },
      {
        id: "output-1",
        kind: "tool-result",
        success: false,
        text: "Tool 2: failed",
      },
    ]);
    const frame = renderToString(
      createElement(SessionApp, {
        onCycleAgent: () => {},
        onExit: () => {},
        onSubmit: () => {},
        store,
        themeId: undefined,
      }),
    );
    expect(frame).toContain("✓ Tool 1: ok");
    expect(frame).toContain("✕ Tool 2: failed");
  });
});

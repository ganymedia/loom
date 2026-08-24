import { describe, expect, test } from "bun:test";
import {
  SessionApp,
  SessionViewStore,
  SlashCommandPopup,
  ThinkingIndicator,
  ToolRunningIndicator,
  completedOutputTextStyle,
  consumeSessionInputChunk,
  isSessionExitInput,
  isSlashCommandPopupOpen,
  moveSlashCommandSelection,
  thinkingIndicatorText,
  toolRunningIndicatorText,
} from "@loom/tui/session-app";
import { sessionSlashCommandEntries } from "@loom/tui/slash-commands";
import { loomDark } from "@loom/tui/theme";
import { renderToString } from "ink";
import { createElement } from "react";

describe("consumeSessionInputChunk", () => {
  test("submits complete PTY lines while retaining incomplete input", () => {
    expect(consumeSessionInputChunk("", "/exit\n")).toEqual({
      lines: ["/exit"],
      remainder: "",
    });
    expect(consumeSessionInputChunk("partial", " input")).toEqual({
      lines: [],
      remainder: "partial input",
    });
    expect(consumeSessionInputChunk("first", "\r\nsecond\rthird")).toEqual({
      lines: ["first", "second"],
      remainder: "third",
    });
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

describe("isSlashCommandPopupOpen", () => {
  test("requires slash input and remains closed after dismissal", () => {
    expect(isSlashCommandPopupOpen("/agent s", false)).toBe(true);
    expect(isSlashCommandPopupOpen("/agent s", true)).toBe(false);
    expect(isSlashCommandPopupOpen("plain text", false)).toBe(false);
  });
});

describe("SessionViewStore", () => {
  test("notifies the persistent app when output and status change", () => {
    const store = new SessionViewStore({
      activeAgentName: "developer",
      output: [],
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
              : `${output.displayName}: ${output.content}\n`,
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
      sessionId: "session-1",
      tokenPercent: 0.25,
    });
  });

  test("updates and clears the live assistant region", () => {
    const store = new SessionViewStore({
      activeAgentName: "developer",
      output: [],
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

  test("distinguishes tool execution from thinking and validates its count", () => {
    const store = new SessionViewStore({
      activeAgentName: "developer",
      output: [],
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
});

describe("SessionApp", () => {
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
          kind: "assistant",
          displayName: "Security",
          content: "**second completed line**",
        },
      ],
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
    const secondOutput = frame.indexOf("second completed line");
    const tabs = frame.indexOf("Developer");
    const liveAssistant = frame.indexOf("working");
    const status = frame.indexOf("session-1");
    const input = frame.lastIndexOf(">");

    expect(firstOutput).toBeGreaterThanOrEqual(0);
    expect(secondOutput).toBeGreaterThan(firstOutput);
    expect(tabs).toBeGreaterThan(secondOutput);
    expect(liveAssistant).toBeGreaterThan(tabs);
    expect(status).toBeGreaterThan(liveAssistant);
    expect(input).toBeGreaterThan(status);
  });
});

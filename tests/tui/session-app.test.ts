import { describe, expect, test } from "bun:test";
import {
  SessionApp,
  SessionViewStore,
  SlashCommandPopup,
  consumeSessionInputChunk,
  isSessionExitInput,
  moveSlashCommandSelection,
} from "@loom/tui/session-app";
import { sessionSlashCommandEntries } from "@loom/tui/slash-commands";
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
        `${state.activeAgentName}:${state.tokenPercent}:${state.output.join("")}`,
      );
    });

    store.appendOutput("Developer: first answer\n");
    store.updateStatus("security", 0.25);
    unsubscribe();
    store.appendOutput("ignored after unsubscribe");

    expect(snapshots).toEqual([
      "developer:0:Developer: first answer\n",
      "security:0.25:Developer: first answer\n",
    ]);
    expect(store.getSnapshot()).toEqual({
      activeAgentName: "security",
      output: ["Developer: first answer\n", "ignored after unsubscribe"],
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

    store.appendAssistantDelta("Developer", "Hel");
    store.appendAssistantDelta("Developer", "lo");
    expect(store.getSnapshot().liveAssistant).toEqual({
      displayName: "Developer",
      text: "Hello",
    });

    store.clearAssistantDelta();
    expect(store.getSnapshot().liveAssistant).toBeUndefined();
  });
});

describe("SessionApp", () => {
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
    const store = new SessionViewStore({
      activeAgentName: "developer",
      liveAssistant: { displayName: "Developer", text: "working" },
      output: ["first completed line\n", "second completed line\n"],
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
    const liveAssistant = frame.indexOf("Developer: working");
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

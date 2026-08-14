import { describe, expect, test } from "bun:test";
import {
  SessionApp,
  SessionViewStore,
  consumeSessionInputChunk,
} from "@loom/tui/session-app";
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

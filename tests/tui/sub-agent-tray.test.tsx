import { describe, expect, test } from "bun:test";
import {
  SessionViewStore,
  SubAgentTray,
  shouldShowSubAgentTray,
  visibleSubAgentActivity,
} from "@loom/tui/session-app";
import { renderToString } from "ink";
import { createElement } from "react";

describe("sub-agent tray", () => {
  test("upserts lifecycle rows outside static output and bounds completion", () => {
    const store = new SessionViewStore({
      activeAgentName: "developer",
      output: [],
      sessionId: "session",
      tokenPercent: 0,
    });
    for (let index = 0; index < 25; index += 1) {
      const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
      store.recordSubAgentLifecycle({
        id,
        displayName: "Scanner",
        status: "started",
      });
      store.recordSubAgentLifecycle({
        id,
        displayName: "Scanner",
        status: "succeeded",
      });
    }
    expect(store.getSnapshot().output).toEqual([]);
    expect(store.getSnapshot().subAgentActivity).toHaveLength(20);
  });

  test("renders at most three semantic status labels without leaked fields", () => {
    const activity = [
      { id: "1", displayName: "Scanner", status: "started" as const },
      { id: "2", displayName: "Scanner", status: "succeeded" as const },
      { id: "3", displayName: "Scanner", status: "failed" as const },
      { id: "4", displayName: "Scanner", status: "succeeded" as const },
    ];
    expect(visibleSubAgentActivity(activity)).toHaveLength(3);
    const frame = renderToString(
      createElement(SubAgentTray, { activity, terminalColumns: 80 }),
    );
    expect(frame).toContain("running");
    expect(frame).toContain("failed");
    expect(frame).toContain("succeeded");
    expect(frame).not.toContain("src/");
  });

  test("truncates display names to the available terminal width", () => {
    const frame = renderToString(
      createElement(SubAgentTray, {
        activity: [
          {
            id: "1",
            displayName: "A scanner name that is intentionally too long",
            status: "succeeded" as const,
          },
        ],
        terminalColumns: 48,
      }),
    );
    expect(frame.split("\n").every((line) => line.length <= 48)).toBe(true);
  });

  test("hides on short or narrow terminals", () => {
    expect(shouldShowSubAgentTray(24, 80)).toBe(true);
    expect(shouldShowSubAgentTray(19, 80)).toBe(false);
    expect(shouldShowSubAgentTray(24, 47)).toBe(false);
  });
});

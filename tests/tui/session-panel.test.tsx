import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PlanYaml } from "@loom/planner/schema";
import { ThemeProvider } from "@loom/tui/components";
import { SessionLayout, SessionViewStore } from "@loom/tui/session-app";
import {
  SESSION_PANEL_MIN_COLUMNS,
  SESSION_PANEL_MIN_ROWS,
  SessionPanel,
  shouldShowSessionPanel,
  truncatePanelLine,
} from "@loom/tui/session-panel";
import {
  type SessionPanelState,
  deriveSessionTitle,
  flattenPendingPlanTasks,
  loadSessionPanelPlan,
  sanitizePanelValue,
  sessionDirectoryName,
} from "@loom/tui/session-panel-state";
import { LOOM_VERSION } from "@loom/version";
import { Box, Text, renderToString } from "ink";
import { createElement } from "react";

function panelState(
  overrides: Partial<SessionPanelState> = {},
): SessionPanelState {
  return {
    directory: "loom",
    plan: {
      availability: "available",
      tasks: [
        {
          id: "t8-6-4",
          name: "Responsive session panel",
          status: "in_progress",
        },
        { id: "t9-1-1", name: "Blocked follow-up", status: "blocked" },
      ],
    },
    runtime: "active",
    title: "Session 01234567",
    version: LOOM_VERSION,
    ...overrides,
  };
}

function planWithStatuses(
  statuses: PlanYaml["phases"][number]["milestones"][number]["tasks"][number]["status"][],
): PlanYaml {
  return {
    name: "Test plan",
    version: "1",
    phases: [
      {
        id: "phase",
        name: "Phase",
        description: "Description",
        exit_criterion: "Complete",
        status: "in_progress",
        milestones: [
          {
            id: "milestone",
            name: "Milestone",
            description: "Description",
            status: "in_progress",
            tasks: statuses.map((status, index) => ({
              id: `task-${index}`,
              name: `Task ${index}`,
              description: "Description",
              status,
              files: [],
              dependencies: [],
            })),
          },
        ],
      },
    ],
  };
}

describe("session panel state", () => {
  test("derives one deterministic title without retaining or replacing prompt text", () => {
    const firstPrompt = "hello";
    expect(deriveSessionTitle(firstPrompt)).toBe("Session 2cf24dba");
    const store = new SessionViewStore({
      activeAgentName: "developer",
      output: [],
      panel: panelState({ title: "New session" }),
      sessionId: "session",
      tokenPercent: 0,
    });

    store.setPanelTitleFromFirstPrompt(firstPrompt);
    const title = store.getSnapshot().panel.title;
    store.setPanelTitleFromFirstPrompt("world");

    expect(store.getSnapshot().panel.title).toBe(title);
    expect(JSON.stringify(store.getSnapshot().panel)).not.toContain(
      firstPrompt,
    );
    expect(title).toMatch(/^Session [0-9a-f]{8}$/);
  });

  test("supports explicit failure and recovery transitions", () => {
    const store = new SessionViewStore({
      activeAgentName: "developer",
      output: [],
      panel: panelState({ runtime: "idle" }),
      sessionId: "session",
      tokenPercent: 0.99,
    });
    for (const runtime of ["active", "failed", "active", "idle"] as const) {
      store.updatePanelRuntime(runtime);
      expect(store.getSnapshot().panel.runtime).toBe(runtime);
    }
  });

  test("flattens declared order, excludes completed tasks, and keeps five", () => {
    const tasks = flattenPendingPlanTasks(
      planWithStatuses([
        "completed",
        "pending",
        "in_progress",
        "blocked",
        "pending",
        "pending",
        "pending",
      ]),
    );
    expect(tasks.map((task) => task.id)).toEqual([
      "task-1",
      "task-2",
      "task-3",
      "task-4",
      "task-5",
    ]);
  });

  test("bounds and sanitizes retained task fields", () => {
    const plan = planWithStatuses(["pending"]);
    const task = plan.phases[0]?.milestones[0]?.tasks[0];
    if (task === undefined) throw new Error("test plan task is missing");
    task.id = `id\u001b${"x".repeat(100)}`;
    task.name = `name\n${"y".repeat(200)}`;

    const retained = flattenPendingPlanTasks(plan)[0];
    expect(retained?.id.length).toBeLessThanOrEqual(32);
    expect(retained?.name.length).toBeLessThanOrEqual(120);
    expect(retained?.id).not.toContain("\u001b");
    expect(retained?.name).not.toContain("\n");
  });

  test("uses a fixed unavailable state for unreadable plans", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "loom-panel-"));
    expect(await loadSessionPanelPlan(projectRoot)).toEqual({
      availability: "unavailable",
    });
  });

  test("uses the same fixed unavailable state for malformed plans", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "loom-panel-"));
    await mkdir(join(projectRoot, ".loom"));
    await writeFile(join(projectRoot, ".loom", "plan.yaml"), "not: a plan\n");
    expect(await loadSessionPanelPlan(projectRoot)).toEqual({
      availability: "unavailable",
    });
  });

  test("neutralizes controls, bounds values, and stores only a basename", () => {
    expect(sanitizePanelValue("safe\u001b[31m\nname", 10)).toBe("safe�[31m ");
    const directory = sessionDirectoryName("/private/work/repository");
    expect(directory).toBe("repository");
    expect(directory).not.toContain("/private/work");
    expect(sessionDirectoryName("/")).toBe("[filesystem root]");

    const frame = renderToString(
      createElement(SessionPanel, {
        state: panelState({ directory }),
      }),
    );
    expect(frame).toContain("repository");
    expect(frame).not.toContain("/private/work");
  });
});

describe("session panel rendering", () => {
  test("renders semantic runtime, task labels, and package version", () => {
    const frame = renderToString(
      createElement(
        ThemeProvider,
        { themeId: undefined },
        createElement(SessionPanel, { state: panelState() }),
      ),
    );
    expect(frame).toContain("● active");
    expect(frame).toContain("● in progress");
    expect(frame).toContain("✕ blocked");
    expect(frame).toContain("t8-6-4");
    expect(frame).toContain(`LOOM ${LOOM_VERSION}`);
    expect(frame.split("\n").every((line) => line.length <= 32)).toBe(true);
  });

  test("renders fixed unavailable and no-pending messages", () => {
    const unavailable = renderToString(
      createElement(SessionPanel, {
        state: panelState({ plan: { availability: "unavailable" } }),
      }),
    );
    const empty = renderToString(
      createElement(SessionPanel, {
        state: panelState({ plan: { availability: "available", tasks: [] } }),
      }),
    );
    expect(unavailable).toContain("plan unavailable");
    expect(empty).toContain("No pending tasks");
    expect(truncatePanelLine("x".repeat(100))).toHaveLength(28);
    expect(Bun.stringWidth(truncatePanelLine("界".repeat(100)))).toBe(28);
  });

  test("shows only at wide and tall dimensions without changing narrow geometry", () => {
    expect(
      shouldShowSessionPanel(SESSION_PANEL_MIN_ROWS, SESSION_PANEL_MIN_COLUMNS),
    ).toBe(true);
    expect(shouldShowSessionPanel(19, 120)).toBe(false);
    expect(shouldShowSessionPanel(30, 99)).toBe(false);

    const application = createElement(
      Box,
      { flexDirection: "column", height: 4 },
      createElement(Text, null, "tabs"),
      createElement(Box, { flexGrow: 1 }),
      createElement(Text, null, "status"),
      createElement(Text, null, "composer"),
    );
    const narrow = renderToString(
      createElement(SessionLayout, {
        application,
        columns: 99,
        panel: panelState(),
        rows: 20,
      }),
    );
    const original = renderToString(application);
    const wide = renderToString(
      createElement(SessionLayout, {
        application,
        columns: 100,
        panel: panelState(),
        rows: 20,
      }),
    );
    expect(narrow).toBe(original);
    expect(narrow).not.toContain("Repository");
    expect(wide).toContain("Repository");
    expect(wide).toContain("tabs");
    expect(wide).toContain("status");
    expect(wide).toContain("composer");
  });
});

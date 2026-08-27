import { useTheme } from "@loom/tui/components";
import type {
  PendingPlanStatus,
  SessionPanelState,
  SessionRuntimeState,
} from "@loom/tui/session-panel-state";
import type { Theme } from "@loom/tui/theme";
import { Box, Text } from "ink";
import type React from "react";

export const SESSION_PANEL_WIDTH = 32;
export const SESSION_PANEL_MIN_COLUMNS = 100;
export const SESSION_PANEL_MIN_ROWS = 20;
const PANEL_LINE_WIDTH = SESSION_PANEL_WIDTH - 4;

export function shouldShowSessionPanel(rows: number, columns: number): boolean {
  return rows >= SESSION_PANEL_MIN_ROWS && columns >= SESSION_PANEL_MIN_COLUMNS;
}

export function truncatePanelLine(value: string): string {
  let truncated = "";
  for (const character of value) {
    if (Bun.stringWidth(truncated + character) > PANEL_LINE_WIDTH) break;
    truncated += character;
  }
  return truncated;
}

function runtimePresentation(
  runtime: SessionRuntimeState,
  theme: Theme,
): { color: string; text: string } {
  switch (runtime) {
    case "idle":
      return { color: theme.success, text: "● idle" };
    case "active":
      return { color: theme.warning, text: "● active" };
    case "failed":
      return { color: theme.danger, text: "● failed" };
    default:
      throw new Error("Unable to render unknown panel runtime state");
  }
}

function taskPresentation(
  status: PendingPlanStatus,
  theme: Theme,
): { color: string; text: string } {
  switch (status) {
    case "pending":
      return { color: theme.textTertiary, text: "○ pending" };
    case "in_progress":
      return { color: theme.info, text: "● in progress" };
    case "blocked":
      return { color: theme.danger, text: "✕ blocked" };
    default:
      throw new Error("Unable to render unknown panel task status");
  }
}

export function SessionPanel({ state }: { state: SessionPanelState }) {
  const theme = useTheme();
  const runtime = runtimePresentation(state.runtime, theme);
  let planRows: React.ReactNode;
  switch (state.plan.availability) {
    case "unavailable":
      planRows = <Text color={theme.textTertiary}>plan unavailable</Text>;
      break;
    case "available":
      planRows =
        state.plan.tasks.length === 0 ? (
          <Text color={theme.textTertiary}>No pending tasks</Text>
        ) : (
          state.plan.tasks.map((task) => {
            const status = taskPresentation(task.status, theme);
            const line = truncatePanelLine(
              `${status.text} ${task.id} ${task.name}`,
            );
            return (
              <Text key={`${task.id}:${task.name}`} color={status.color}>
                {line}
              </Text>
            );
          })
        );
      break;
    default:
      throw new Error("Unable to render unknown panel plan state");
  }

  return (
    <Box
      backgroundColor={theme.panelSurface}
      borderColor={theme.border}
      borderStyle="single"
      flexDirection="column"
      flexShrink={0}
      height="100%"
      paddingX={1}
      width={SESSION_PANEL_WIDTH}
    >
      <Text color={theme.textPrimary} bold>
        {truncatePanelLine(state.title)}
      </Text>
      <Text color={theme.textTertiary}>Repository</Text>
      <Text color={theme.textSecondary}>
        {truncatePanelLine(state.directory)}
      </Text>
      <Text color={theme.textTertiary}>Runtime</Text>
      <Text color={runtime.color} bold>
        {runtime.text}
      </Text>
      <Text color={theme.textTertiary}>Project plan</Text>
      {planRows}
      <Box flexGrow={1} />
      <Text color={theme.textTertiary}>
        {truncatePanelLine(`LOOM ${state.version}`)}
      </Text>
    </Box>
  );
}

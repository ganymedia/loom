import {
  type Status,
  type Theme,
  type TokenEstimate,
  agentTabColor,
  estimateColor,
  resolveTheme,
  statusColor,
} from "@loom/tui/theme";
import { Box, Text } from "ink";
import type React from "react";
import { createContext, useContext } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// ThemeProvider — wraps the root Ink app. Every component below the root
// reads the active theme via useTheme(), never by importing a theme object
// directly.
// ─────────────────────────────────────────────────────────────────────────────

const ThemeContext = createContext<Theme>(resolveTheme(undefined));

export function ThemeProvider({
  themeId,
  children,
}: {
  themeId: string | undefined;
  children: React.ReactNode;
}) {
  const theme = resolveTheme(themeId);
  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

// ─────────────────────────────────────────────────────────────────────────────
// StatusDot — ● ✓ ✕ ○ indicator used across plan status, findings, test results
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_SYMBOL: Record<Status, string> = {
  done: "✓",
  active: "●",
  blocked: "✕",
  warning: "▲",
  planned: "○",
};

export function StatusDot({ status }: { status: Status }) {
  const theme = useTheme();
  return (
    <Text color={statusColor(theme, status)}>{STATUS_SYMBOL[status]}</Text>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Badge — bordered inline label, used for token estimates, tags, agent names
// ─────────────────────────────────────────────────────────────────────────────

export function Badge({
  children,
  variant = "muted",
}: {
  children: string;
  variant?: "success" | "warning" | "danger" | "info" | "muted";
}) {
  const theme = useTheme();
  const color =
    variant === "muted"
      ? theme.textTertiary
      : variant === "success"
        ? theme.success
        : variant === "warning"
          ? theme.warning
          : variant === "danger"
            ? theme.danger
            : theme.info;

  return <Text color={color}>[{children}]</Text>;
}

/** Convenience wrapper for the small/medium/large/xlarge token estimate badge. */
export function EstimateBadge({ estimate }: { estimate: TokenEstimate }) {
  const theme = useTheme();
  return <Text color={estimateColor(theme, estimate)}>[{estimate}]</Text>;
}

// ─────────────────────────────────────────────────────────────────────────────
// ProgressBar — the token-usage bar shown in the status line
// ─────────────────────────────────────────────────────────────────────────────

export function ProgressBar({
  percent,
  width = 20,
  warnAt = 0.8,
}: {
  percent: number; // 0–1
  width?: number;
  warnAt?: number;
}) {
  const theme = useTheme();
  const filled = Math.round(Math.max(0, Math.min(1, percent)) * width);
  const empty = width - filled;
  const color =
    percent >= warnAt
      ? theme.danger
      : percent >= 0.6
        ? theme.warning
        : theme.success;

  return (
    <Text>
      <Text color={color}>{"█".repeat(filled)}</Text>
      <Text color={theme.borderMuted}>{"░".repeat(empty)}</Text>
    </Text>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AgentTabStrip — the tab bar for switching between agents
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentTab {
  name: string; // internal id, e.g. "developer"
  displayName: string; // shown in the tab, e.g. "Developer"
  isCustom?: boolean; // Foundry-installed agents render in italic-equivalent (dim+underline)
}

export function AgentTabStrip({
  tabs,
  activeIndex,
}: {
  tabs: AgentTab[];
  activeIndex: number;
}) {
  const theme = useTheme();
  return (
    <Box borderStyle="single" borderColor={theme.border} paddingX={1}>
      {tabs.map((tab, i) => {
        const isActive = i === activeIndex;
        const color = isActive
          ? agentTabColor(theme, tab.name)
          : theme.textTertiary;
        return (
          <Box key={tab.name} marginRight={2}>
            <Text
              color={color}
              bold={isActive}
              underline={tab.isCustom ?? false}
              dimColor={!isActive}
            >
              {tab.displayName}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StatusBar — pinned footer: session id, token usage, active agent
// ─────────────────────────────────────────────────────────────────────────────

export function StatusBar({
  sessionId,
  tokenPercent,
  activeAgentName,
}: {
  sessionId: string;
  tokenPercent: number;
  activeAgentName: string;
}) {
  const theme = useTheme();
  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Text color={theme.textTertiary}>{sessionId}</Text>
      <Box gap={1}>
        <Text color={theme.textTertiary}>tokens</Text>
        <ProgressBar percent={tokenPercent} width={16} />
        <Text color={tokenPercent >= 0.8 ? theme.danger : theme.textSecondary}>
          {Math.round(tokenPercent * 100)}%
        </Text>
      </Box>
      <Text color={agentTabColor(theme, activeAgentName)}>
        {activeAgentName} ▸
      </Text>
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Divider — thin horizontal rule matching theme.borderMuted
// ─────────────────────────────────────────────────────────────────────────────

export function Divider({ width = 60 }: { width?: number }) {
  const theme = useTheme();
  return <Text color={theme.borderMuted}>{"─".repeat(width)}</Text>;
}

// ─────────────────────────────────────────────────────────────────────────────
// SectionLabel — small-caps-style uppercase label used above lists
// (e.g. "PHASES", "MILESTONE: STATIC ANALYSIS")
// ─────────────────────────────────────────────────────────────────────────────

export function SectionLabel({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <Text color={theme.textTertiary} bold>
      {children.toUpperCase()}
    </Text>
  );
}

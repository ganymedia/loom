import { describe, expect, test } from "bun:test";
import {
  AgentTabStrip,
  Badge,
  Divider,
  EstimateBadge,
  ProgressBar,
  SectionLabel,
  StatusBar,
  StatusDot,
  ThemeProvider,
} from "@loom/tui/components";
import React from "react";

describe("TUI components", () => {
  test("constructs themed Ink component elements", () => {
    const tree = (
      <ThemeProvider themeId="loom-dark">
        <StatusDot status="active" />
        <Badge variant="info">Developer</Badge>
        <EstimateBadge estimate="medium" />
        <ProgressBar percent={0.5} />
        <AgentTabStrip
          activeIndex={0}
          tabs={[{ name: "developer", displayName: "Developer" }]}
        />
        <StatusBar
          activeAgentName="developer"
          sessionId="session-1"
          tokenPercent={0.25}
        />
        <Divider width={4} />
        <SectionLabel>phase</SectionLabel>
      </ThemeProvider>
    );

    expect(React.isValidElement(tree)).toBe(true);
    expect(tree.type).toBe(ThemeProvider);
  });
});

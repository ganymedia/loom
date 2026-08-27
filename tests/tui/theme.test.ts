import { describe, expect, test } from "bun:test";
import {
  DEFAULT_THEME_ID,
  agentTabColor,
  estimateColor,
  loomDark,
  resolveTheme,
  statusColor,
} from "@loom/tui/theme";

describe("TUI theme", () => {
  test("resolves the default loom-dark theme", () => {
    expect(DEFAULT_THEME_ID).toBe("loom-dark");
    expect(resolveTheme(undefined)).toBe(loomDark);
    expect(resolveTheme("loom-dark")).toBe(loomDark);
    expect(loomDark.panelSurface).not.toBe(loomDark.backgroundAccent);
  });

  test("falls back for unknown theme ids without throwing", () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message?: unknown) => warnings.push(String(message));
    try {
      expect(resolveTheme("missing-theme")).toBe(loomDark);
    } finally {
      console.warn = originalWarn;
    }

    expect(warnings[0]).toContain("missing-theme");
  });

  test("maps statuses and token estimates to semantic theme colors", () => {
    expect(statusColor(loomDark, "done")).toBe(loomDark.success);
    expect(statusColor(loomDark, "active")).toBe(loomDark.info);
    expect(statusColor(loomDark, "blocked")).toBe(loomDark.danger);
    expect(statusColor(loomDark, "planned")).toBe(loomDark.textTertiary);
    expect(statusColor(loomDark, "warning")).toBe(loomDark.warning);

    expect(estimateColor(loomDark, "small")).toBe(loomDark.success);
    expect(estimateColor(loomDark, "medium")).toBe(loomDark.warning);
    expect(estimateColor(loomDark, "large")).toBe(loomDark.warning);
    expect(estimateColor(loomDark, "xlarge")).toBe(loomDark.danger);
  });

  test("assigns deterministic agent tab colors from the active theme", () => {
    const first = agentTabColor(loomDark, "developer");
    const second = agentTabColor(loomDark, "developer");

    expect(second).toBe(first);
    expect(loomDark.agentColors).toContain(first);
  });
});

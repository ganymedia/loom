// ─────────────────────────────────────────────────────────────────────────────
// LOOM TUI Theme System
//
// Ink renders to a terminal, not a browser — there is no CSS. Colors here are
// truecolor hex values passed directly to Ink's <Text color="#..."> prop,
// which Ink downsamples automatically for terminals that only support
// 256-color or 16-color ANSI. No extra work needed for degradation.
//
// This file is the single source of visual truth. No component under
// src/tui/ should hardcode a color string — everything pulls from the
// active Theme via useTheme().
// ─────────────────────────────────────────────────────────────────────────────

// ── Theme interface ─────────────────────────────────────────────────────────

export interface Theme {
  id: string
  name: string
  description: string

  // Core text
  textPrimary: string // headings, active tab, primary content
  textSecondary: string // body text, agent responses
  textTertiary: string // muted labels, timestamps, hints
  textInverse: string // text on a filled/accent background

  // Semantic status — used consistently for phases, tasks, findings, tests
  success: string // done, passing, clean
  warning: string // medium/large estimate, approaching threshold
  danger: string // blocked, critical finding, failing test
  info: string // active/in-progress, neutral highlight

  // Structural
  border: string // default box/divider border
  borderMuted: string // deemphasized dividers (e.g. inside expanded cards)
  backgroundAccent: string // rarely used — most terminals keep bg transparent

  // Agent tab identity — cycled across built-in + installed agents
  // so each agent has a stable, distinguishable color in the tab strip
  agentColors: string[]

  // Chrome
  accent: string // cursor, active selection, primary interactive element
  cursor: string
}

// ── Semantic token helper ───────────────────────────────────────────────────
// Maps a status string (used throughout plan status, findings, test results)
// to the correct theme color. This is the ONE place that mapping lives.

export type Status = "done" | "active" | "blocked" | "planned" | "warning"

export function statusColor(theme: Theme, status: Status): string {
  switch (status) {
    case "done":
      return theme.success
    case "active":
      return theme.info
    case "blocked":
      return theme.danger
    case "warning":
      return theme.warning
    case "planned":
      return theme.textTertiary
  }
}

export type TokenEstimate = "small" | "medium" | "large" | "xlarge"

export function estimateColor(theme: Theme, estimate: TokenEstimate): string {
  switch (estimate) {
    case "small":
      return theme.success
    case "medium":
    case "large":
      return theme.warning
    case "xlarge":
      return theme.danger
  }
}

// ── Built-in themes ─────────────────────────────────────────────────────────

/**
 * loom-dark — the default theme, matching the design language established
 * during LOOM's own design sessions (muted status colors, restrained accent,
 * high-contrast mono-spaced hierarchy).
 */
export const loomDark: Theme = {
  id: "loom-dark",
  name: "LOOM Dark",
  description: "Default theme. Muted status colors, restrained accent, dense mono hierarchy.",

  textPrimary: "#EDEDED",
  textSecondary: "#B4B4B4",
  textTertiary: "#7A7A7A",
  textInverse: "#141414",

  success: "#4FB477",
  warning: "#C9922A",
  danger: "#D3654A",
  info: "#EDEDED",

  border: "#3A3A3A",
  borderMuted: "#2A2A2A",
  backgroundAccent: "#1E1E1E",

  agentColors: ["#8B7FD6", "#4F9FB4", "#C9922A", "#D3654A", "#4FB477", "#B47FB0"],

  accent: "#8B7FD6",
  cursor: "#7A7A7A",
}

/**
 * loom-light — for light-background terminals. Same semantic mapping,
 * darker/more saturated values for sufficient contrast on white/light bg.
 */
export const loomLight: Theme = {
  id: "loom-light",
  name: "LOOM Light",
  description: "Light-terminal variant with the same semantic color mapping.",

  textPrimary: "#1A1A1A",
  textSecondary: "#4A4A4A",
  textTertiary: "#8A8A8A",
  textInverse: "#FAFAFA",

  success: "#2A8B4F",
  warning: "#9A6A10",
  danger: "#B0402A",
  info: "#1A1A1A",

  border: "#D0D0D0",
  borderMuted: "#E5E5E5",
  backgroundAccent: "#F0F0F0",

  agentColors: ["#6650B0", "#2A7A90", "#9A6A10", "#B0402A", "#2A8B4F", "#8B4F85"],

  accent: "#6650B0",
  cursor: "#8A8A8A",
}

/**
 * high-contrast — accessibility-focused. Larger perceptual gaps between
 * status colors for colorblind users and low-quality terminal rendering.
 */
export const highContrast: Theme = {
  id: "high-contrast",
  name: "High Contrast",
  description: "Maximized contrast and perceptual separation between status colors.",

  textPrimary: "#FFFFFF",
  textSecondary: "#E0E0E0",
  textTertiary: "#909090",
  textInverse: "#000000",

  success: "#00E676",
  warning: "#FFB300",
  danger: "#FF5252",
  info: "#FFFFFF",

  border: "#606060",
  borderMuted: "#404040",
  backgroundAccent: "#101010",

  agentColors: ["#B388FF", "#40C4FF", "#FFD740", "#FF5252", "#00E676", "#FF80AB"],

  accent: "#B388FF",
  cursor: "#FFFFFF",
}

/**
 * monochrome — no color at all beyond the semantic minimum. For terminals
 * with poor color support or users who prefer minimal visual noise.
 * Status is still distinguishable via text symbols (✓ ● ✕ ○), not just color.
 */
export const monochrome: Theme = {
  id: "monochrome",
  name: "Monochrome",
  description: "Minimal color. Status conveyed primarily through symbols, not hue.",

  textPrimary: "#FFFFFF",
  textSecondary: "#C0C0C0",
  textTertiary: "#808080",
  textInverse: "#000000",

  success: "#FFFFFF",
  warning: "#C0C0C0",
  danger: "#FFFFFF", // distinguished by ✕ symbol + bold, not color, in monochrome
  info: "#FFFFFF",

  border: "#505050",
  borderMuted: "#303030",
  backgroundAccent: "#101010",

  agentColors: ["#FFFFFF", "#E0E0E0", "#C0C0C0", "#A0A0A0", "#FFFFFF", "#E0E0E0"],

  accent: "#FFFFFF",
  cursor: "#FFFFFF",
}

export const builtinThemes: Record<string, Theme> = {
  "loom-dark": loomDark,
  "loom-light": loomLight,
  "high-contrast": highContrast,
  monochrome,
}

export const DEFAULT_THEME_ID = "loom-dark"

// ── Theme resolution ────────────────────────────────────────────────────────

/**
 * Resolves a theme by id, falling back to default with a console warning
 * if the id is unknown (e.g. a typo in config, or a theme from a Foundry
 * package that isn't installed). Never throws — a bad theme id should
 * never prevent LOOM from starting.
 */
export function resolveTheme(themeId: string | undefined): Theme {
  if (!themeId) return builtinThemes[DEFAULT_THEME_ID] as Theme
  const theme = builtinThemes[themeId]
  if (!theme) {
    console.warn(`Unknown theme "${themeId}", falling back to ${DEFAULT_THEME_ID}`)
    return builtinThemes[DEFAULT_THEME_ID] as Theme
  }
  return theme
}

// ── Agent tab color assignment ──────────────────────────────────────────────
// Deterministic assignment so the same agent always gets the same tab color
// within a theme, across sessions. Hash the agent name to an index.

export function agentTabColor(theme: Theme, agentName: string): string {
  let hash = 0
  for (let i = 0; i < agentName.length; i++) {
    hash = (hash << 5) - hash + agentName.charCodeAt(i)
    hash |= 0
  }
  const index = Math.abs(hash) % theme.agentColors.length
  return theme.agentColors[index] as string
}

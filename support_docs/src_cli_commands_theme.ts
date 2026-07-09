// ─────────────────────────────────────────────────────────────────────────────
// Addition to src/config/schema.ts
//
// Add this field to LoomConfigSchema's `defaults` object:
//
//   defaults: z.object({
//     activeProfile: z.string().default("default"),
//     theme: z.string().default("loom-dark"),   // ← add this line
//   }).default({}),
//
// Theme resolution happens at TUI startup via resolveTheme() from
// src/tui/theme.ts, which gracefully falls back to loom-dark on an
// unknown id — so this field never needs strict enum validation here.
// It stays a plain string so Foundry-distributed themes (future) can be
// referenced without updating this schema.
// ─────────────────────────────────────────────────────────────────────────────

// src/cli/commands/theme.ts

import type { Command } from "commander"
import type { LoomConfig } from "@loom/config/schema"
import { builtinThemes, resolveTheme } from "@loom/tui/theme"
import { setConfigValue } from "@loom/config/loader"

export function registerThemeCommand(program: Command, config: LoomConfig) {
  const theme = program.command("theme").description("manage LOOM TUI theme")

  theme
    .command("list")
    .description("list available themes")
    .action(() => {
      const activeId = config.defaults.theme ?? "loom-dark"
      for (const t of Object.values(builtinThemes)) {
        const marker = t.id === activeId ? "●" : " "
        console.log(`${marker} ${t.id.padEnd(16)} ${t.description}`)
      }
      console.log("\nSwitch with: loom theme use <id>")
    })

  theme
    .command("use <id>")
    .description("set the active theme")
    .action(async (id: string) => {
      const resolved = resolveTheme(id) // falls back + warns if unknown, never throws
      await setConfigValue("defaults.theme", resolved.id)
      console.log(`Theme set to "${resolved.id}". Takes effect on next \`loom\` launch.`)
    })

  theme
    .command("preview [id]")
    .description("preview a theme's colors without switching to it")
    .action((id?: string) => {
      const t = resolveTheme(id ?? config.defaults.theme)
      console.log(`\n${t.name} — ${t.description}\n`)
      // A real implementation renders a small Ink snippet here using the
      // resolved theme directly (bypassing ThemeProvider/config) so the
      // user can preview without committing. See src/tui/components.tsx
      // for the primitives to reuse (StatusDot, Badge, ProgressBar).
    })
}

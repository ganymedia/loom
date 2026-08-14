import { builtInAgentTabs } from "@loom/tui/tab-strip";

export const sessionSlashCommands = {
  agent: "/agent",
  agents: "/agents",
  exit: "/exit",
  quit: "/quit",
  tab: "/tab",
} as const;

export interface SlashCommandEntry {
  command: string;
  description: string;
}

const builtInAgentEntries: SlashCommandEntry[] = builtInAgentTabs.map(
  (agent) => ({
    command: `${sessionSlashCommands.agent} ${agent.name}`,
    description: `Switch to ${agent.displayName} agent`,
  }),
);

export const sessionSlashCommandEntries: readonly SlashCommandEntry[] = [
  ...builtInAgentEntries,
  {
    command: sessionSlashCommands.tab,
    description: "Cycle to the next agent",
  },
  {
    command: sessionSlashCommands.agents,
    description: "Show available agents",
  },
  {
    command: sessionSlashCommands.exit,
    description: "Exit the session",
  },
  {
    command: sessionSlashCommands.quit,
    description: "Exit the session",
  },
];

export function shouldShowSlashCommandPopup(input: string): boolean {
  return input.startsWith("/");
}

export function filterSlashCommandEntries(
  entries: readonly SlashCommandEntry[],
  input: string,
): readonly SlashCommandEntry[] {
  const normalizedInput = input.toLowerCase();
  return entries.filter((entry) =>
    entry.command.toLowerCase().startsWith(normalizedInput),
  );
}

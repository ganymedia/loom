export type BuiltInAgentName =
  | "developer"
  | "architect"
  | "tester"
  | "security";

export interface AgentTab {
  name: BuiltInAgentName;
  displayName: string;
}

export const builtInAgentTabs: AgentTab[] = [
  { name: "developer", displayName: "Developer" },
  { name: "architect", displayName: "Architect" },
  { name: "tester", displayName: "Tester" },
  { name: "security", displayName: "Security" },
];

export function isBuiltInAgentName(value: string): value is BuiltInAgentName {
  return builtInAgentTabs.some((tab) => tab.name === value);
}

export function resolveBuiltInAgentName(
  value: string,
): BuiltInAgentName | undefined {
  const normalized = value.toLowerCase();
  return builtInAgentTabs.find((tab) => tab.name === normalized)?.name;
}

export function formatAgentTabStrip(activeAgentName: BuiltInAgentName): string {
  return builtInAgentTabs
    .map((tab) =>
      tab.name === activeAgentName ? `[${tab.displayName}]` : tab.displayName,
    )
    .join(" | ");
}

export function nextAgentName(
  activeAgentName: BuiltInAgentName,
): BuiltInAgentName {
  const activeIndex = builtInAgentTabs.findIndex(
    (tab) => tab.name === activeAgentName,
  );
  const nextIndex = (activeIndex + 1) % builtInAgentTabs.length;
  const nextTab = builtInAgentTabs[nextIndex];

  if (nextTab === undefined) {
    throw new Error(`Unable to resolve next agent after "${activeAgentName}"`);
  }

  return nextTab.name;
}

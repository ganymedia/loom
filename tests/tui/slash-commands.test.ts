import { describe, expect, test } from "bun:test";
import {
  sessionSlashCommandEntries,
  sessionSlashCommands,
  shouldShowSlashCommandPopup,
} from "@loom/tui/slash-commands";

describe("session slash commands", () => {
  test("lists every built-in agent and existing session command", () => {
    expect(sessionSlashCommandEntries.map((entry) => entry.command)).toEqual([
      "/agent developer",
      "/agent architect",
      "/agent tester",
      "/agent security",
      "/tab",
      "/agents",
      "/exit",
      "/quit",
    ]);
    expect(sessionSlashCommands).toEqual({
      agent: "/agent",
      agents: "/agents",
      exit: "/exit",
      quit: "/quit",
      tab: "/tab",
    });
  });

  test("shows discovery only when slash is the first input character", () => {
    expect(shouldShowSlashCommandPopup("/")).toBe(true);
    expect(shouldShowSlashCommandPopup("/agent")).toBe(true);
    expect(shouldShowSlashCommandPopup("text /")).toBe(false);
    expect(shouldShowSlashCommandPopup("")).toBe(false);
  });
});

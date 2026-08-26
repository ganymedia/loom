import { describe, expect, test } from "bun:test";
import {
  filterSlashCommandEntries,
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
      "/recall",
      "/exit",
      "/quit",
    ]);
    expect(sessionSlashCommands).toEqual({
      agent: "/agent",
      agents: "/agents",
      exit: "/exit",
      quit: "/quit",
      recall: "/recall",
      tab: "/tab",
    });
  });

  test("shows discovery only when slash is the first input character", () => {
    expect(shouldShowSlashCommandPopup("/")).toBe(true);
    expect(shouldShowSlashCommandPopup("/agent")).toBe(true);
    expect(shouldShowSlashCommandPopup("text /")).toBe(false);
    expect(shouldShowSlashCommandPopup("")).toBe(false);
  });

  test("filters executable command prefixes case-insensitively", () => {
    expect(
      filterSlashCommandEntries(sessionSlashCommandEntries, "/agent ").map(
        (entry) => entry.command,
      ),
    ).toEqual([
      "/agent developer",
      "/agent architect",
      "/agent tester",
      "/agent security",
    ]);
    expect(
      filterSlashCommandEntries(sessionSlashCommandEntries, "/AGENT T").map(
        (entry) => entry.command,
      ),
    ).toEqual(["/agent tester"]);
    expect(
      filterSlashCommandEntries(sessionSlashCommandEntries, "/q").map(
        (entry) => entry.command,
      ),
    ).toEqual(["/quit"]);
    expect(filterSlashCommandEntries(sessionSlashCommandEntries, "/x")).toEqual(
      [],
    );
  });
});

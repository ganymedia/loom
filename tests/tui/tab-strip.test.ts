import { describe, expect, test } from "bun:test";
import {
  formatAgentTabStrip,
  isBuiltInAgentName,
  nextAgentName,
} from "@loom/tui/tab-strip";

describe("tab-strip", () => {
  test("formats the active agent tab", () => {
    expect(formatAgentTabStrip("developer")).toBe(
      "[Developer] | Architect | Tester | Security",
    );
    expect(formatAgentTabStrip("security")).toBe(
      "Developer | Architect | Tester | [Security]",
    );
  });

  test("cycles through built-in agents", () => {
    expect(nextAgentName("developer")).toBe("architect");
    expect(nextAgentName("architect")).toBe("tester");
    expect(nextAgentName("tester")).toBe("security");
    expect(nextAgentName("security")).toBe("developer");
  });

  test("recognizes only built-in agent names", () => {
    expect(isBuiltInAgentName("developer")).toBe(true);
    expect(isBuiltInAgentName("security")).toBe(true);
    expect(isBuiltInAgentName("unknown")).toBe(false);
  });
});

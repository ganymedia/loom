import { describe, expect, test } from "bun:test";
import { isToolPermitted, matchesGlob } from "@loom/tools/base";

describe("isToolPermitted", () => {
  test("denial overrides allowance", () => {
    expect(
      isToolPermitted("shell", {
        capabilities: ["shell-exec"],
        allowed: ["shell"],
        denied: ["shell"],
      }),
    ).toBe(false);
  });

  test("allows explicitly allowed tools", () => {
    expect(
      isToolPermitted("file-reader", {
        capabilities: ["file-read"],
        allowed: ["file-reader"],
        denied: [],
      }),
    ).toBe(true);
  });
});

describe("matchesGlob", () => {
  test("matches star patterns", () => {
    expect(matchesGlob("src/*.ts", "src/index.ts")).toBe(true);
    expect(matchesGlob("src/*.ts", "tests/index.ts")).toBe(false);
  });

  test("matches brace alternatives", () => {
    expect(matchesGlob("*.{ts,tsx}", "agent.ts")).toBe(true);
    expect(matchesGlob("*.{ts,tsx}", "agent.js")).toBe(false);
  });
});

import { describe, expect, test } from "bun:test";
import {
  PromptOptimizationError,
  optimizePrompt,
} from "@loom/prompt/optimization";

describe("optimizePrompt", () => {
  test("normalizes whitespace without changing message roles", () => {
    const optimized = optimizePrompt({
      messages: [
        { role: "system", content: "  Keep   instructions\n\n  tight  " },
        { role: "user", content: "  Do   the   work  " },
      ],
      deduplicateInstructions: false,
      reorderForRecency: false,
    });

    expect(optimized.messages).toEqual([
      { role: "system", content: "Keep instructions\ntight" },
      { role: "user", content: "Do the work" },
    ]);
    expect(optimized.report.strippedWhitespace).toBe(true);
  });

  test("deduplicates exact instructions already present in system context", () => {
    const optimized = optimizePrompt({
      messages: [
        {
          role: "system",
          content: "Never reveal secrets\nPrefer failing loudly",
        },
        {
          role: "user",
          content: "Never reveal secrets\nImplement the next task",
        },
      ],
      reorderForRecency: false,
    });

    expect(optimized.messages[1]).toEqual({
      role: "user",
      content: "Implement the next task",
    });
    expect(optimized.report.deduplicatedInstructionCount).toBe(1);
  });

  test("keeps the final current message last while moving system context before history", () => {
    const optimized = optimizePrompt({
      messages: [
        { role: "user", content: "older turn" },
        { role: "system", content: "late recall" },
        { role: "assistant", content: "older answer" },
        { role: "user", content: "current request" },
      ],
      stripWhitespace: false,
      deduplicateInstructions: false,
    });

    expect(optimized.messages).toEqual([
      { role: "system", content: "late recall" },
      { role: "user", content: "older turn" },
      { role: "assistant", content: "older answer" },
      { role: "user", content: "current request" },
    ]);
    expect(optimized.report.reorderedForRecency).toBe(true);
  });

  test("injects JSON enforcement before the current message when an output schema is set", () => {
    const optimized = optimizePrompt({
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "current" },
      ],
      outputSchema: { type: "object", required: ["summary"] },
      stripWhitespace: false,
      deduplicateInstructions: false,
    });

    expect(optimized.messages.at(-1)).toEqual({
      role: "user",
      content: "current",
    });
    expect(optimized.messages.at(-2)?.role).toBe("system");
    expect(optimized.messages.at(-2)?.content).toContain(
      "Respond ONLY with valid JSON",
    );
    expect(optimized.messages.at(-2)?.content).toContain('"summary"');
    expect(optimized.report.injectedJsonEnforcement).toBe(true);
  });

  test("fails loudly for empty messages and empty schema instructions", () => {
    expect(() => optimizePrompt({ messages: [] })).toThrow(
      PromptOptimizationError,
    );
    expect(() =>
      optimizePrompt({
        messages: [{ role: "user", content: "current" }],
        outputSchema: { type: "object" },
        jsonEnforcementInstruction: " ",
      }),
    ).toThrow("jsonEnforcementInstruction must not be empty");
  });
});

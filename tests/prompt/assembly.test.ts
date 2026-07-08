import { describe, expect, test } from "bun:test";
import { PromptAssemblyError, assemblePrompt } from "@loom/prompt/assembly";

const wordTokens = (content: string): number =>
  content.trim().length === 0 ? 0 : content.trim().split(/\s+/).length;

describe("assemblePrompt", () => {
  test("assembles context in the fixed Prompt Intelligence order", () => {
    const assembled = assemblePrompt({
      systemPrompt: "system prompt",
      planState: "phase 3 task 1",
      recall: [
        { id: "r1", content: "first recall" },
        { id: "r2", content: "second recall" },
      ],
      sessionHistory: [
        { role: "user", content: "old user" },
        { role: "assistant", content: "old assistant" },
      ],
      currentMessage: "current user prompt",
      budget: { contextLimit: 200 },
      estimateTokens: wordTokens,
    });

    expect(assembled.messages.map((message) => message.role)).toEqual([
      "system",
      "system",
      "system",
      "user",
      "assistant",
      "user",
    ]);
    expect(assembled.messages[0]?.content).toBe("system prompt");
    expect(assembled.messages[1]?.content).toBe(
      "Current plan state:\nphase 3 task 1",
    );
    expect(assembled.messages[2]?.content).toContain("Relevant recall:");
    expect(assembled.messages.at(-1)).toEqual({
      role: "user",
      content: "current user prompt",
    });
  });

  test("omits eligible old turns before trimming recall or plan state", () => {
    const history = Array.from({ length: 10 }, (_value, index) => ({
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `turn-${index} filler filler filler filler`,
    }));

    const assembled = assemblePrompt({
      systemPrompt: "system",
      planState: "phase milestone task branch",
      recall: [{ id: "r1", content: "recall context" }],
      sessionHistory: history,
      currentMessage: "current",
      budget: {
        contextLimit: 60,
        oldTurnsThreshold: 6,
        recallTrimMin: 1,
      },
      estimateTokens: wordTokens,
    });

    expect(assembled.reductions.omittedOldTurnCount).toBeGreaterThan(0);
    expect(assembled.reductions.omittedRecallCount).toBe(0);
    expect(assembled.reductions.planStateCompressed).toBe(false);
    expect(
      assembled.messages.some((message) => message.content === "current"),
    ).toBe(true);
    expect(
      assembled.messages.some((message) =>
        message.content.includes("turn-9 filler"),
      ),
    ).toBe(true);
  });

  test("trims lower-ranked recall blocks down to the configured minimum", () => {
    const assembled = assemblePrompt({
      systemPrompt: "system",
      recall: [
        { id: "keep", content: "important recall" },
        { id: "drop", content: "secondary recall with many extra words" },
      ],
      currentMessage: "current",
      budget: { contextLimit: 12, recallTrimMin: 1 },
      estimateTokens: wordTokens,
    });

    expect(assembled.reductions.omittedRecallCount).toBe(1);
    expect(assembled.messages[1]?.content).toContain("[keep]");
    expect(assembled.messages[1]?.content).not.toContain("[drop]");
  });

  test("fails loudly when protected context cannot fit the budget", () => {
    expect(() =>
      assemblePrompt({
        systemPrompt: "system words that cannot be removed",
        sessionHistory: [
          { role: "user", content: "recent one two three four five" },
        ],
        currentMessage: "current words that cannot be removed",
        budget: { contextLimit: 8 },
        estimateTokens: wordTokens,
      }),
    ).toThrow(PromptAssemblyError);
  });

  test("validates budget and required prompt inputs", () => {
    expect(() =>
      assemblePrompt({
        systemPrompt: " ",
        currentMessage: "current",
        budget: { contextLimit: 100 },
      }),
    ).toThrow("systemPrompt must not be empty");
    expect(() =>
      assemblePrompt({
        systemPrompt: "system",
        currentMessage: "current",
        budget: { contextLimit: 0 },
      }),
    ).toThrow("contextLimit must be a positive integer");
  });
});

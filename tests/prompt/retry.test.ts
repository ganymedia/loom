import { describe, expect, test } from "bun:test";
import { PromptRetryError, runPromptWithRetry } from "@loom/prompt/retry";
import type { PromptResponse } from "@loom/prompt/run-prompt";

function response(content: string): PromptResponse {
  return {
    content,
    usage: { promptTokens: 2, completionTokens: 1 },
  };
}

describe("runPromptWithRetry", () => {
  test("returns the first response when validation passes", async () => {
    const attempts: number[] = [];

    const result = await runPromptWithRetry({
      messages: [{ role: "user", content: "Return JSON" }],
      execute: async (attempt) => {
        attempts.push(attempt.attemptIndex);
        return response('{"ok":true}');
      },
      validate: (candidate) => ({ valid: candidate.content.includes("ok") }),
    });

    expect(result.response.content).toBe('{"ok":true}');
    expect(attempts).toEqual([0]);
    expect(result.attempts).toEqual([{ attemptIndex: 0, valid: true }]);
    expect(result.usage).toEqual({ promptTokens: 2, completionTokens: 1 });
  });

  test("builds a deterministic retry prompt after validation failure", async () => {
    const seenMessages: string[][] = [];
    const seenTemperatures: Array<number | undefined> = [];

    const result = await runPromptWithRetry({
      messages: [{ role: "user", content: "Return a valid object" }],
      execute: async (attempt) => {
        seenMessages.push(attempt.messages.map((message) => message.content));
        seenTemperatures.push(attempt.temperature);
        return attempt.attemptIndex === 0
          ? response("not-json")
          : response('{"ok":true}');
      },
      validate: (candidate) =>
        candidate.content.startsWith("{")
          ? { valid: true }
          : { valid: false, error: "Expected object" },
      maxRetries: 1,
      retryTemperature: 0,
      responseFormat: "JSON",
    });

    expect(result.response.content).toBe('{"ok":true}');
    expect(seenTemperatures).toEqual([undefined, 0]);
    expect(seenMessages[1]).toEqual([
      "Return a valid object",
      "not-json",
      "Your previous response was invalid. Error: Expected object\n\nReturn ONLY a valid JSON object. No other text.",
    ]);
    expect(result.attempts).toEqual([
      {
        attemptIndex: 0,
        valid: false,
        validationError: "Expected object",
      },
      { attemptIndex: 1, valid: true },
    ]);
    expect(result.usage).toEqual({ promptTokens: 4, completionTokens: 2 });
  });

  test("fails loudly with attempt reports when retries are exhausted", async () => {
    await expect(
      runPromptWithRetry({
        messages: [{ role: "user", content: "Return JSON" }],
        execute: async () => response("still invalid"),
        validate: () => ({ valid: false, error: "Invalid JSON" }),
        maxRetries: 1,
      }),
    ).rejects.toThrow(PromptRetryError);

    try {
      await runPromptWithRetry({
        messages: [{ role: "user", content: "Return JSON" }],
        execute: async () => response("still invalid"),
        validate: () => ({ valid: false, error: "Invalid JSON" }),
        maxRetries: 1,
      });
      throw new Error("expected retry failure");
    } catch (error) {
      expect(error).toBeInstanceOf(PromptRetryError);
      expect((error as PromptRetryError).attempts).toEqual([
        {
          attemptIndex: 0,
          valid: false,
          validationError: "Invalid JSON",
        },
        {
          attemptIndex: 1,
          valid: false,
          validationError: "Invalid JSON",
        },
      ]);
    }
  });

  test("starts model fallback hints on the third retry attempt", async () => {
    const modelHints: Array<string | undefined> = [];

    await expect(
      runPromptWithRetry({
        messages: [{ role: "user", content: "Return JSON" }],
        execute: async (attempt) => {
          modelHints.push(attempt.modelHint);
          return response("invalid");
        },
        validate: () => ({ valid: false, error: "Invalid JSON" }),
        maxRetries: 3,
        retryModelFallback: true,
        modelFallbacks: ["fallback-a"],
      }),
    ).rejects.toThrow(PromptRetryError);

    expect(modelHints).toEqual([undefined, undefined, undefined, "fallback-a"]);
  });

  test("validates retry configuration and prompt input", async () => {
    await expect(
      runPromptWithRetry({
        messages: [],
        execute: async () => response("never called"),
      }),
    ).rejects.toThrow("messages must not be empty");

    await expect(
      runPromptWithRetry({
        messages: [{ role: "user", content: "current" }],
        execute: async () => response("never called"),
        maxRetries: -1,
      }),
    ).rejects.toThrow("maxRetries must be a non-negative integer");
  });
});

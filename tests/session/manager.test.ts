import { describe, expect, test } from "bun:test";
import {
  DEFAULT_HANDOFF_THRESHOLD,
  SessionManager,
} from "@loom/session/manager";

describe("SessionManager", () => {
  test("tracks cumulative token usage across turns", () => {
    const manager = new SessionManager({
      sessionId: "session-1",
      contextLimit: 100,
    });

    const firstTurn = manager.recordTurn({
      promptTokens: 10,
      completionTokens: 5,
    });
    const secondTurn = manager.recordTurn({
      promptTokens: 20,
      completionTokens: 10,
    });

    expect(firstTurn).toEqual({
      turnIndex: 0,
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      cumulativeTokens: 15,
      contextLimit: 100,
      usageRatio: 0.15,
      handoffRequired: false,
    });
    expect(secondTurn.cumulativeTokens).toBe(45);
    expect(manager.snapshot()).toEqual({
      sessionId: "session-1",
      contextLimit: 100,
      handoffThreshold: DEFAULT_HANDOFF_THRESHOLD,
      cumulativePromptTokens: 30,
      cumulativeCompletionTokens: 15,
      cumulativeTokens: 45,
      turns: [firstTurn, secondTurn],
      handoffRequired: false,
    });
  });

  test("requires handoff at the 80 percent threshold", () => {
    const manager = new SessionManager({
      sessionId: "session-1",
      contextLimit: 100,
    });

    manager.recordTurn({ promptTokens: 40, completionTokens: 39 });
    expect(manager.currentDecision()).toEqual({
      required: false,
      sessionId: "session-1",
      contextLimit: 100,
      cumulativeTokens: 79,
      thresholdTokens: 80,
      usageRatio: 0.79,
    });

    const thresholdTurn = manager.recordTurn({
      promptTokens: 1,
      completionTokens: 0,
    });

    expect(thresholdTurn.handoffRequired).toBe(true);
    expect(manager.currentDecision()).toEqual({
      required: true,
      reason: "Session session-1 reached 80% of the context limit",
      sessionId: "session-1",
      contextLimit: 100,
      cumulativeTokens: 80,
      thresholdTokens: 80,
      usageRatio: 0.8,
    });
  });

  test("keeps handoff required once threshold has been crossed", () => {
    const manager = new SessionManager({
      sessionId: "session-1",
      contextLimit: 10,
      handoffThreshold: 0.5,
    });

    manager.recordTurn({ promptTokens: 5, completionTokens: 0 });
    const nextTurn = manager.recordTurn({
      promptTokens: 0,
      completionTokens: 0,
    });

    expect(nextTurn.handoffRequired).toBe(true);
    expect(manager.snapshot().handoffRequired).toBe(true);
  });

  test("supports a custom handoff threshold", () => {
    const manager = new SessionManager({
      sessionId: "session-1",
      contextLimit: 200,
      handoffThreshold: 0.75,
    });

    manager.recordTurn({ promptTokens: 149, completionTokens: 0 });
    expect(manager.currentDecision().required).toBe(false);

    manager.recordTurn({ promptTokens: 1, completionTokens: 0 });
    expect(manager.currentDecision()).toEqual({
      required: true,
      reason: "Session session-1 reached 75% of the context limit",
      sessionId: "session-1",
      contextLimit: 200,
      cumulativeTokens: 150,
      thresholdTokens: 150,
      usageRatio: 0.75,
    });
  });

  test("fails loudly for invalid accounting inputs", () => {
    expect(
      () => new SessionManager({ sessionId: "session-1", contextLimit: 0 }),
    ).toThrow("contextLimit must be a positive integer");
    expect(
      () =>
        new SessionManager({
          sessionId: "session-1",
          contextLimit: 10,
          handoffThreshold: 1.1,
        }),
    ).toThrow("handoffThreshold must be greater than 0");

    const manager = new SessionManager({
      sessionId: "session-1",
      contextLimit: 100,
    });
    expect(() =>
      manager.recordTurn({ promptTokens: -1, completionTokens: 0 }),
    ).toThrow("promptTokens must be a non-negative integer");
    expect(() =>
      manager.recordTurn({ promptTokens: 0.5, completionTokens: 0 }),
    ).toThrow("promptTokens must be a non-negative integer");
  });
});

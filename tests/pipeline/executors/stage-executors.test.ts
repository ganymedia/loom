import { describe, expect, test } from "bun:test";
import { BranchStageExecutor } from "@loom/pipeline/executors/branch";
import { InjectStageExecutor } from "@loom/pipeline/executors/inject";
import { ParallelStageExecutor } from "@loom/pipeline/executors/parallel";
import {
  PromptStageExecutor,
  renderTemplate,
} from "@loom/pipeline/executors/prompt";
import { TransformStageExecutor } from "@loom/pipeline/executors/transform";
import { ContextBus, type StageExecutor } from "@loom/pipeline/types";
import type { RunPromptOptions } from "@loom/prompt/run-prompt";

describe("pipeline stage executors", () => {
  test("transform resolves dotted context expressions and writes output", async () => {
    const bus = new ContextBus();
    bus.set("input.answer", 42);
    const executor = new TransformStageExecutor();

    const result = await executor.execute(
      { id: "copy", type: "transform", expression: "input.answer" },
      bus,
      undefined,
    );

    expect(result.output).toBe(42);
    expect(bus.get("stages.copy.output")).toBe(42);
  });

  test("branch returns the selected stage id without executing it", async () => {
    const bus = new ContextBus();
    bus.set("input.needsReview", "yes");
    const executor = new BranchStageExecutor();

    const result = await executor.execute(
      {
        id: "route",
        type: "branch",
        condition: "input.needsReview",
        ifTrue: "review",
        ifFalse: "done",
      },
      bus,
      undefined,
    );

    expect(result.output).toEqual({
      condition: "yes",
      selectedStageId: "review",
    });
  });

  test("prompt resolves a backend per execution and renders templates", async () => {
    const bus = new ContextBus();
    bus.set("input.topic", "parser");
    const promptCalls: RunPromptOptions[] = [];
    const executor = new PromptStageExecutor({
      config: {
        activeProfile: "default",
        defaults: { theme: "loom-dark" },
        store: { topK: 3 },
        profiles: { default: { defaultBackend: "local" } },
        backends: {
          local: {
            type: "openai-compatible",
            baseUrl: "http://127.0.0.1:8000",
          },
        },
      },
      fetchImpl: async () =>
        new Response(JSON.stringify({ data: [{ id: "preferred" }] }), {
          status: 200,
        }),
      promptRunner: async (options) => {
        promptCalls.push(options);
        return {
          content: "done",
          usage: { promptTokens: 3, completionTokens: 2 },
        };
      },
    });

    const result = await executor.execute(
      {
        id: "ask",
        type: "prompt",
        model: "preferred",
        prompt: "Summarize {{ input.topic }}",
      },
      bus,
      undefined,
    );

    expect(promptCalls[0]?.backend.model).toBe("preferred");
    expect(promptCalls[0]?.messages[0]?.content).toBe("Summarize parser");
    expect(result.output).toEqual({
      content: "done",
      backend: "local",
      model: "preferred",
      usage: { promptTokens: 3, completionTokens: 2 },
    });
  });

  test("renderTemplate fails loudly for missing context references", () => {
    const bus = new ContextBus();

    expect(() => renderTemplate("{{ input.missing }}", bus)).toThrow(
      "did not resolve",
    );
  });

  test("inject delegates recall without opening storage directly", async () => {
    const bus = new ContextBus();
    const executor = new InjectStageExecutor({
      recall: (query) => [{ query: query.query, topK: query.topK }],
    });

    const result = await executor.execute(
      { id: "recall", type: "inject", query: "recent parser work", topK: 2 },
      bus,
      undefined,
    );

    expect(result.output).toEqual([{ query: "recent parser work", topK: 2 }]);
    expect(bus.get("stages.recall.output")).toEqual([
      { query: "recent parser work", topK: 2 },
    ]);
  });

  test("parallel executes registered child stages and merges a dict", async () => {
    const bus = new ContextBus();
    bus.set("input.first", "one");
    bus.set("input.second", "two");
    const transform = new TransformStageExecutor();
    const executor = new ParallelStageExecutor({ transform });

    const result = await executor.execute(
      {
        id: "both",
        type: "parallel",
        mergeStrategy: "dict",
        concurrencyLimit: 1,
        stages: [
          { id: "first", type: "transform", expression: "input.first" },
          { id: "second", type: "transform", expression: "input.second" },
        ],
      },
      bus,
      undefined,
    );

    expect(result.output).toEqual({ first: "one", second: "two" });
    expect(bus.get("stages.both.output")).toEqual({
      first: "one",
      second: "two",
    });
  });

  test("parallel fails loudly when a child executor is missing", async () => {
    const executor = new ParallelStageExecutor({});

    await expect(
      executor.execute(
        {
          id: "bad",
          type: "parallel",
          mergeStrategy: "list",
          stages: [{ id: "child", type: "transform", expression: "input.x" }],
        },
        new ContextBus(),
        undefined,
      ),
    ).rejects.toThrow("No executor registered");
  });
});

const _registryTypeCheck: StageExecutor = new TransformStageExecutor();

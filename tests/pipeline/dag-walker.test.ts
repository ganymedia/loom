import { describe, expect, test } from "bun:test";
import { runPipeline } from "@loom/pipeline/dag-walker";
import { BranchStageExecutor } from "@loom/pipeline/executors/branch";
import { ParallelStageExecutor } from "@loom/pipeline/executors/parallel";
import { TransformStageExecutor } from "@loom/pipeline/executors/transform";
import { ContextBus, type PipelineDefinition } from "@loom/pipeline/types";

describe("runPipeline", () => {
  test("executes top-level stages in declaration order", async () => {
    const pipeline: PipelineDefinition = {
      name: "Linear",
      version: "0.1.0",
      stages: [
        { id: "first", type: "transform", expression: "input.value" },
        { id: "second", type: "transform", expression: "stages.first.output" },
      ],
    };
    const transform = new TransformStageExecutor();
    const bus = new ContextBus();
    bus.set("input.value", "ok");

    const result = await runPipeline(pipeline, {
      executors: { transform },
      bus,
    });

    expect(result.success).toBe(true);
    expect(result.stageResults.map((stage) => stage.stageId)).toEqual([
      "first",
      "second",
    ]);
    expect(result.finalOutput).toBe("ok");
  });

  test("uses branch output to skip the unselected target", async () => {
    const pipeline: PipelineDefinition = {
      name: "Branching",
      version: "0.1.0",
      stages: [
        {
          id: "route",
          type: "branch",
          condition: "input.useA",
          ifTrue: "a",
          ifFalse: "b",
        },
        { id: "a", type: "transform", expression: "input.a" },
        { id: "b", type: "transform", expression: "input.b" },
      ],
    };
    const bus = new ContextBus();
    bus.set("input.useA", true);
    bus.set("input.a", "selected");
    bus.set("input.b", "skipped");

    const result = await runPipeline(pipeline, {
      executors: {
        branch: new BranchStageExecutor(),
        transform: new TransformStageExecutor(),
      },
      bus,
    });

    expect(result.success).toBe(true);
    expect(result.stageResults[1]?.output).toBe("selected");
    expect(result.stageResults[2]).toMatchObject({
      stageId: "b",
      skipped: true,
    });
    expect(result.finalOutput).toBe("selected");
  });

  test("runs parallel stages through the registered nested executors", async () => {
    const transform = new TransformStageExecutor();
    const parallel = new ParallelStageExecutor({ transform });
    const pipeline: PipelineDefinition = {
      name: "Parallel",
      version: "0.1.0",
      stages: [
        {
          id: "both",
          type: "parallel",
          mergeStrategy: "list",
          stages: [
            { id: "one", type: "transform", expression: "input.one" },
            { id: "two", type: "transform", expression: "input.two" },
          ],
        },
      ],
    };
    const bus = new ContextBus();
    bus.set("input.one", 1);
    bus.set("input.two", 2);

    const result = await runPipeline(pipeline, {
      executors: { parallel },
      bus,
    });

    expect(result.success).toBe(true);
    expect(result.finalOutput).toEqual([1, 2]);
  });

  test("aggregates prompt token usage from stage outputs", async () => {
    const pipeline: PipelineDefinition = {
      name: "Tokens",
      version: "0.1.0",
      stages: [{ id: "prompt", type: "prompt", prompt: "hi" }],
    };

    const result = await runPipeline(pipeline, {
      executors: {
        prompt: {
          type: "prompt",
          execute: async () => ({
            stageId: "prompt",
            output: {
              content: "hello",
              usage: { promptTokens: 4, completionTokens: 5 },
            },
            skipped: false,
            durationMs: 1,
          }),
        },
      },
    });

    expect(result.totalTokens).toEqual({ prompt: 4, completion: 5 });
  });

  test("returns a failed run result when a stage executor throws", async () => {
    const pipeline: PipelineDefinition = {
      name: "Failure",
      version: "0.1.0",
      stages: [{ id: "bad", type: "transform", expression: "input.missing" }],
    };

    const result = await runPipeline(pipeline, {
      executors: { transform: new TransformStageExecutor() },
    });

    expect(result.success).toBe(false);
    expect(result.stageResults[0]?.error).toContain("did not resolve");
  });

  test("fails loudly when an executor is missing", async () => {
    const pipeline: PipelineDefinition = {
      name: "Missing Executor",
      version: "0.1.0",
      stages: [{ id: "first", type: "transform", expression: "input.value" }],
    };

    await expect(runPipeline(pipeline, { executors: {} })).rejects.toThrow(
      "No executor registered",
    );
  });
});

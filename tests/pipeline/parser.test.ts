import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PipelineParserError, parsePipeline } from "@loom/pipeline/parser";

async function projectWithPipeline(content: string): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), "loom-pipeline-parser-"));
  await mkdir(join(projectRoot, ".loom"));
  await writeFile(join(projectRoot, ".loom", "pipeline.yaml"), content, "utf8");
  return projectRoot;
}

const validPipeline = `name: Review Macro
version: "0.1.0"
defaults:
  backend: local
  temperature: 0.2
stages:
  - id: gather
    type: inject
    query: recent review context
    topK: 3
  - id: draft
    type: prompt
    prompt: Draft a review from {{ stages.gather.output }}
    outputSchema: review.schema.json
  - id: route
    type: branch
    condition: stages.draft.output.needs_followup
    ifTrue: followup
    ifFalse: done
  - id: fanout
    type: parallel
    mergeStrategy: list
    concurrencyLimit: 2
    stages:
      - id: followup
        type: transform
        expression: input.followup
      - id: done
        type: transform
        expression: input.done
`;

describe("parsePipeline", () => {
  test("reads and validates the default .loom/pipeline.yaml", async () => {
    const projectRoot = await projectWithPipeline(validPipeline);

    const pipeline = await parsePipeline({ projectRoot });

    expect(pipeline.name).toBe("Review Macro");
    expect(pipeline.defaults?.backend).toBe("local");
    expect(pipeline.stages[0]?.type).toBe("inject");
    expect(pipeline.stages[3]?.type).toBe("parallel");
  });

  test("supports an explicit project-relative pipeline path", async () => {
    const projectRoot = await projectWithPipeline(validPipeline);
    await writeFile(
      join(projectRoot, "custom.loom.yaml"),
      validPipeline,
      "utf8",
    );

    const pipeline = await parsePipeline({
      projectRoot,
      pipelinePath: "custom.loom.yaml",
    });

    expect(pipeline.version).toBe("0.1.0");
  });

  test("fails loudly for malformed YAML", async () => {
    const projectRoot = await projectWithPipeline("name: [unterminated");

    await expect(parsePipeline({ projectRoot })).rejects.toThrow(
      "is not valid YAML",
    );
  });

  test("fails loudly for schema validation errors", async () => {
    const projectRoot = await projectWithPipeline(`name: Broken
version: "0.1.0"
stages:
  - id: draft
    type: prompt
`);

    await expect(parsePipeline({ projectRoot })).rejects.toThrow(
      "failed validation",
    );
  });

  test("rejects duplicate stage ids before they can overwrite context", async () => {
    const projectRoot = await projectWithPipeline(`name: Duplicate
version: "0.1.0"
stages:
  - id: same
    type: transform
    expression: input.one
  - id: group
    type: parallel
    mergeStrategy: concat
    stages:
      - id: same
        type: transform
        expression: input.two
`);

    await expect(parsePipeline({ projectRoot })).rejects.toThrow(
      'duplicate stage id "same"',
    );
  });

  test("rejects branch targets that do not match stage ids", async () => {
    const projectRoot = await projectWithPipeline(`name: Bad Branch
version: "0.1.0"
stages:
  - id: route
    type: branch
    condition: input.ok
    ifTrue: missing
    ifFalse: done
  - id: done
    type: transform
    expression: input.done
`);

    await expect(parsePipeline({ projectRoot })).rejects.toThrow("ifTrue");
  });

  test("rejects paths that escape the project root", async () => {
    const projectRoot = await projectWithPipeline(validPipeline);

    await expect(
      parsePipeline({ projectRoot, pipelinePath: "../pipeline.yaml" }),
    ).rejects.toThrow(PipelineParserError);
  });
});

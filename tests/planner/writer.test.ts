import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PlanYaml } from "@loom/planner/schema";
import { PlanWriterError, writePlanYaml } from "@loom/planner/writer";

const plan: PlanYaml = {
  name: "Example",
  version: "0.1.0",
  phases: [
    {
      id: "phase-1",
      name: "Foundation",
      description: "Build",
      exit_criterion: "Works",
      status: "pending",
      milestones: [
        {
          id: "milestone-1",
          name: "Core",
          description: "Core work",
          status: "pending",
          tasks: [
            {
              id: "task-1",
              name: "First",
              description: "First task",
              status: "pending",
              files: [],
              dependencies: [],
            },
          ],
        },
      ],
    },
  ],
};

describe("writePlanYaml", () => {
  test("rejects a plan destination symlink without changing its target", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "loom-plan-writer-"));
    const outsideRoot = await mkdtemp(join(tmpdir(), "loom-plan-outside-"));
    const outsidePath = join(outsideRoot, "outside.yaml");
    await mkdir(join(projectRoot, ".loom"));
    await writeFile(outsidePath, "unchanged", "utf8");
    await symlink(outsidePath, join(projectRoot, ".loom", "plan.yaml"));

    await expect(writePlanYaml({ projectRoot, plan })).rejects.toThrow(
      PlanWriterError,
    );
    expect(await readFile(outsidePath, "utf8")).toBe("unchanged");
  });
});

import { describe, expect, test } from "bun:test";
import { ContextBus } from "@loom/pipeline/types";

describe("ContextBus", () => {
  test("stores and retrieves values", () => {
    const bus = new ContextBus();
    bus.set("input.goal", "build");

    expect(bus.get("input.goal")).toBe("build");
    expect(bus.has("input.goal")).toBe(true);
  });

  test("makes stage outputs immutable", () => {
    const bus = new ContextBus();
    bus.set("stages.compile.output", "ok");

    expect(() => bus.set("stages.compile.output", "changed")).toThrow(
      "immutable",
    );
  });

  test("creates nested template context", () => {
    const bus = new ContextBus();
    bus.set("input.goal", "build");
    bus.set("stages.compile.output", "ok");

    expect(bus.toTemplateContext()).toEqual({
      input: { goal: "build" },
      stages: { compile: { output: "ok" } },
    });
  });
});

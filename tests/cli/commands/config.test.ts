import { describe, expect, test } from "bun:test";
import { registerConfigCommand } from "@loom/cli/commands/config";
import { loomConfigSchema } from "@loom/config/schema";
import { Command } from "commander";

describe("config command", () => {
  test("reports configured backends without printing URLs or header values", async () => {
    const config = loomConfigSchema.parse({
      backends: {
        local: {
          type: "openai-compatible",
          baseUrl:
            "https://user:url-secret@example.invalid/v1?token=query-secret",
          apiKeyEnv: "LOOM_TEST_API_KEY",
          headers: { Authorization: "header-secret" },
        },
      },
    });
    const output: string[] = [];
    const program = new Command();
    program.exitOverride();
    registerConfigCommand(program, config, (message) => output.push(message));

    await program.parseAsync(["node", "loom", "config"]);

    const rendered = output.join("");
    expect(rendered).toContain('"endpoint": "[configured]"');
    expect(rendered).toContain('"apiKeyEnv": "LOOM_TEST_API_KEY"');
    expect(rendered).not.toContain("example.invalid");
    expect(rendered).not.toContain("url-secret");
    expect(rendered).not.toContain("query-secret");
    expect(rendered).not.toContain("header-secret");
  });
});

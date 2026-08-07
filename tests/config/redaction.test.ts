import { describe, expect, test } from "bun:test";
import {
  REDACTED_VALUE,
  configSensitiveValues,
  createConfigRedactor,
} from "@loom/config/redaction";
import { loomConfigSchema } from "@loom/config/schema";

const config = loomConfigSchema.parse({
  backends: {
    local: {
      type: "openai-compatible",
      baseUrl: "https://user:url-secret@example.invalid/v1?token=query-secret",
      apiKeyEnv: "LOOM_TEST_API_KEY",
      headers: { "X-Custom-Token": "header-secret" },
    },
  },
});

describe("config redaction", () => {
  test("collects endpoint, header, and resolved environment secrets", () => {
    const values = configSensitiveValues(config, {
      LOOM_TEST_API_KEY: "environment-secret",
    });

    expect(values).toContain("environment-secret");
    expect(values).toContain("header-secret");
    expect(values).toContain("https://example.invalid");
    expect(values).toContain("url-secret");
    expect(values).toContain("query-secret");
  });

  test("redacts known secrets from remote or local output", () => {
    const redact = createConfigRedactor(config, {
      LOOM_TEST_API_KEY: "environment-secret",
    });
    const output = redact(
      "https://example.invalid/v1 Authorization: Bearer environment-secret header-secret query-secret",
    );

    expect(output).not.toContain("example.invalid");
    expect(output).not.toContain("environment-secret");
    expect(output).not.toContain("header-secret");
    expect(output).not.toContain("query-secret");
    expect(output).toContain(REDACTED_VALUE);
  });
});

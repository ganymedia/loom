import type { SubAgentSpawnRule } from "@loom/agents/base";
import { matchesGlob } from "@loom/tools/base";
import YAML from "yaml";
import { z } from "zod";
import developerManifestYaml from "../../agents/developer.yaml" with {
  type: "text",
};
import manifestYaml from "../../agents/sub-agents/sast-scanner.yaml" with {
  type: "text",
};

const stringLengthContract = (maxLength: number) =>
  z
    .object({ type: z.literal("string"), maxLength: z.literal(maxLength) })
    .strict();

const manifestSchema = z
  .object({
    package: z
      .object({
        name: z.literal("loom-sast-scanner"),
        version: z.string().regex(/^\d+\.\d+\.\d+$/),
        description: z.string().min(1).max(200),
      })
      .strict(),
    agent: z
      .object({
        name: z.literal("sast-scanner"),
        display_name: z.string().min(1).max(40),
        system_prompt: z.string().min(1).max(2_000),
      })
      .strict(),
    model: z
      .object({
        preferred: z.array(z.string().min(1).max(200)).max(10),
      })
      .strict(),
    tools: z
      .object({
        allowed: z.array(z.string()).length(0),
        denied: z.array(z.string().min(1)),
      })
      .strict(),
    interface: z
      .object({
        input: z
          .object({
            path: z
              .object({
                type: z.literal("string"),
                format: z.literal("relative-path"),
                maxLength: z.literal(512),
              })
              .strict(),
            source: z
              .object({
                type: z.literal("string"),
                maxBytes: z.literal(65_536),
              })
              .strict(),
          })
          .strict(),
        output: z
          .object({
            findings: z
              .object({
                type: z.literal("array"),
                maxItems: z.literal(50),
                items: z
                  .object({
                    additionalProperties: z.literal(false),
                    required: z.tuple([
                      z.literal("ruleId"),
                      z.literal("severity"),
                      z.literal("file"),
                      z.literal("message"),
                      z.literal("fixHint"),
                    ]),
                    properties: z
                      .object({
                        ruleId: stringLengthContract(128),
                        severity: z
                          .object({
                            type: z.literal("string"),
                            enum: z.tuple([
                              z.literal("critical"),
                              z.literal("high"),
                              z.literal("medium"),
                              z.literal("low"),
                              z.literal("info"),
                            ]),
                          })
                          .strict(),
                        file: z
                          .object({
                            type: z.literal("string"),
                            format: z.literal("input-path"),
                          })
                          .strict(),
                        line: z
                          .object({
                            type: z.literal("integer"),
                            minimum: z.literal(1),
                            optional: z.literal(true),
                          })
                          .strict(),
                        cwe: z
                          .object({
                            type: z.literal("string"),
                            pattern: z.literal("^CWE-[1-9][0-9]{0,5}$"),
                            optional: z.literal(true),
                          })
                          .strict(),
                        message: stringLengthContract(500),
                        fixHint: stringLengthContract(500),
                      })
                      .strict(),
                  })
                  .strict(),
              })
              .strict(),
            summary: stringLengthContract(1_000),
            filesScanned: z
              .object({
                type: z.literal("integer"),
                minimum: z.literal(1),
                maximum: z.literal(1),
              })
              .strict(),
          })
          .strict(),
      })
      .strict(),
    execution: z
      .object({
        trigger: z.literal("developer-file-writer-success"),
        supported_extensions: z
          .array(z.string().regex(/^\.[a-z0-9]+$/))
          .min(1)
          .max(50),
        max_source_bytes: z.literal(65_536),
        max_findings: z.literal(50),
        max_tokens: z.literal(4_096),
        timeout_seconds: z.literal(60),
        sequential: z.literal(true),
      })
      .strict(),
  })
  .strict();

const developerSastRuleSchema = z
  .object({
    sub_agents: z
      .array(
        z
          .object({
            ref: z.string().min(1),
            trigger: z
              .object({
                type: z.literal("file-write"),
                file_match: z.string().min(1),
              })
              .strict(),
            pass_context: z.array(z.string()).length(0),
          })
          .strict(),
      )
      .length(1),
  })
  .passthrough();

export type SastManifest = z.infer<typeof manifestSchema>;

export class SastManifestError extends Error {
  constructor() {
    super("Embedded SAST sub-agent manifest is invalid");
    this.name = "SastManifestError";
  }
}

let parsedManifest: SastManifest | undefined;
let parsedDeveloperRule:
  | z.infer<typeof developerSastRuleSchema>["sub_agents"][number]
  | undefined;

export function getSastManifest(): SastManifest {
  if (parsedManifest !== undefined) return parsedManifest;
  try {
    const manifest = manifestSchema.parse(YAML.parse(manifestYaml));
    const developer = developerSastRuleSchema.parse(
      YAML.parse(developerManifestYaml),
    );
    const rule = developer.sub_agents[0];
    if (
      rule === undefined ||
      rule.ref !== manifest.package.name ||
      !manifest.execution.supported_extensions.every((extension) =>
        matchesGlob(rule.trigger.file_match, `src/file${extension}`),
      ) ||
      matchesGlob(rule.trigger.file_match, "README.md")
    ) {
      throw new Error("Invalid Developer SAST rule");
    }
    parsedDeveloperRule = rule;
    parsedManifest = manifest;
    return parsedManifest;
  } catch {
    throw new SastManifestError();
  }
}

export function getDeveloperSastRule(): SubAgentSpawnRule {
  getSastManifest();
  if (parsedDeveloperRule === undefined) throw new SastManifestError();
  return {
    ref: parsedDeveloperRule.ref,
    trigger: {
      type: parsedDeveloperRule.trigger.type,
      fileMatch: parsedDeveloperRule.trigger.file_match,
    },
    passContext: [],
  };
}

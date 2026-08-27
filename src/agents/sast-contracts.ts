import { z } from "zod";

export const MAX_SAST_PATH_LENGTH = 512;
export const MAX_SAST_SUMMARY_LENGTH = 1_000;
export const MAX_SAST_TEXT_LENGTH = 500;

export const sastFindingSchema = z
  .object({
    ruleId: z.string().min(1).max(128),
    severity: z.enum(["critical", "high", "medium", "low", "info"]),
    file: z.string().min(1).max(MAX_SAST_PATH_LENGTH),
    line: z.number().int().positive().optional(),
    cwe: z
      .string()
      .regex(/^CWE-[1-9][0-9]{0,5}$/)
      .optional(),
    message: z.string().min(1).max(MAX_SAST_TEXT_LENGTH),
    fixHint: z.string().min(1).max(MAX_SAST_TEXT_LENGTH),
  })
  .strict();

export const sastOutputSchema = z
  .object({
    findings: z.array(sastFindingSchema).max(50),
    summary: z.string().max(MAX_SAST_SUMMARY_LENGTH),
    filesScanned: z.literal(1),
  })
  .strict();

export type SastFinding = z.infer<typeof sastFindingSchema>;
export type SastOutput = z.infer<typeof sastOutputSchema>;

export function parseSastOutput(
  raw: string,
  inputPath: string,
  maxFindings: number,
): SastOutput {
  if (raw.length > 128_000) throw new Error("SAST output is too large");
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    throw new Error("SAST output is invalid");
  }
  const output = sastOutputSchema.parse(candidate);
  if (output.findings.length > maxFindings) {
    throw new Error("SAST output has too many findings");
  }
  if (output.findings.some((finding) => finding.file !== inputPath)) {
    throw new Error("SAST output references an unexpected file");
  }
  return output;
}

import type { ToolDefinition, ToolResult } from "@loom/tools/base";
import {
  assertModelToolPathAllowed,
  readUtf8FileNoFollowIfPresent,
  resolveWritablePath,
  writeUtf8FileNoFollow,
} from "@loom/tools/path-safety";
import { z } from "zod";

export const fileWriterArgsSchema = z.object({
  projectRoot: z.string().min(1),
  path: z.string().min(1),
  content: z.string(),
});

export type FileWriterArgs = z.infer<typeof fileWriterArgsSchema>;

const MAX_DIFF_CAPTURE_BYTES = 200_000;

export interface FileWriterResultData {
  kind: "file-write";
  path: string;
  bytes: number;
  beforeContent: string | null;
  afterContent: string | null;
}

export function isFileWriterResultData(
  data: unknown,
): data is FileWriterResultData {
  if (typeof data !== "object" || data === null) return false;
  const candidate = data as Record<string, unknown>;
  return (
    candidate.kind === "file-write" &&
    typeof candidate.path === "string" &&
    typeof candidate.bytes === "number" &&
    (typeof candidate.beforeContent === "string" ||
      candidate.beforeContent === null) &&
    (typeof candidate.afterContent === "string" ||
      candidate.afterContent === null)
  );
}

export const fileWriterTool: ToolDefinition<FileWriterArgs> = {
  name: "file-writer",
  description: "Write UTF-8 content to a file within the current project root",
  argsSchema: fileWriterArgsSchema,
  async execute(args: FileWriterArgs): Promise<ToolResult> {
    try {
      const parsed = fileWriterArgsSchema.parse(args);
      const targetPath = await resolveWritablePath(
        parsed.projectRoot,
        parsed.path,
      );
      await assertModelToolPathAllowed(parsed.projectRoot, targetPath);
      const bytes = Buffer.byteLength(parsed.content, "utf8");
      const capturedBefore =
        bytes <= MAX_DIFF_CAPTURE_BYTES
          ? await readUtf8FileNoFollowIfPresent(
              targetPath,
              MAX_DIFF_CAPTURE_BYTES,
            )
          : null;
      const beforeContent =
        capturedBefore === null ? null : (capturedBefore ?? "");
      const afterContent = beforeContent === null ? null : parsed.content;
      await writeUtf8FileNoFollow(targetPath, parsed.content);

      return {
        success: true,
        output: `Wrote ${bytes} bytes to ${parsed.path}`,
        data: {
          kind: "file-write",
          path: parsed.path,
          bytes,
          beforeContent,
          afterContent,
        },
      };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

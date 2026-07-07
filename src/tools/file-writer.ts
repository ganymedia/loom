import { writeFile } from "node:fs/promises";
import type { ToolDefinition, ToolResult } from "@loom/tools/base";
import { resolveWritablePath } from "@loom/tools/path-safety";
import { z } from "zod";

export const fileWriterArgsSchema = z.object({
  projectRoot: z.string().min(1),
  path: z.string().min(1),
  content: z.string(),
});

export type FileWriterArgs = z.infer<typeof fileWriterArgsSchema>;

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
      await writeFile(targetPath, parsed.content, "utf8");

      return {
        success: true,
        output: `Wrote ${Buffer.byteLength(parsed.content, "utf8")} bytes to ${parsed.path}`,
        data: {
          path: parsed.path,
          bytes: Buffer.byteLength(parsed.content, "utf8"),
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

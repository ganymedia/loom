import { readFile, stat } from "node:fs/promises";
import type { ToolDefinition, ToolResult } from "@loom/tools/base";
import {
  assertModelToolPathAllowed,
  resolveReadablePath,
} from "@loom/tools/path-safety";
import { z } from "zod";

export const fileReaderArgsSchema = z.object({
  projectRoot: z.string().min(1),
  path: z.string().min(1),
  maxBytes: z.number().int().positive().max(1_000_000).optional(),
});

export type FileReaderArgs = z.infer<typeof fileReaderArgsSchema>;

export const fileReaderTool: ToolDefinition<FileReaderArgs> = {
  name: "file-reader",
  description: "Read a UTF-8 file within the current project root",
  argsSchema: fileReaderArgsSchema,
  async execute(args: FileReaderArgs): Promise<ToolResult> {
    try {
      const parsed = fileReaderArgsSchema.parse(args);
      const targetPath = await resolveReadablePath(
        parsed.projectRoot,
        parsed.path,
      );
      await assertModelToolPathAllowed(parsed.projectRoot, targetPath);
      const fileStat = await stat(targetPath);

      if (!fileStat.isFile()) {
        return {
          success: false,
          output: "",
          error: `Path "${parsed.path}" is not a file`,
        };
      }

      const maxBytes = parsed.maxBytes ?? 200_000;

      if (fileStat.size > maxBytes) {
        return {
          success: false,
          output: "",
          error: `File "${parsed.path}" exceeds maxBytes (${maxBytes})`,
        };
      }

      const content = await readFile(targetPath, "utf8");
      return {
        success: true,
        output: content,
        data: {
          path: parsed.path,
          bytes: Buffer.byteLength(content, "utf8"),
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

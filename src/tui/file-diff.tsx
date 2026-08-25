import { useTheme } from "@loom/tui/components";
import { sanitizeTerminalText } from "@loom/tui/markdown";
import { Box, Text } from "ink";

export interface FileDiffLine {
  kind: "context" | "added" | "removed";
  text: string;
}

const MAX_DIFF_LINES = 200;
const MAX_DIFF_CELLS = 40_000;

function contentLines(content: string): string[] {
  if (content.length === 0) return [];
  const lines = content.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

export function createFileDiffLines(
  beforeContent: string,
  afterContent: string,
): FileDiffLine[] | undefined {
  const before = contentLines(beforeContent);
  const after = contentLines(afterContent);
  if (
    before.length + after.length > MAX_DIFF_LINES ||
    before.length * after.length > MAX_DIFF_CELLS
  ) {
    return undefined;
  }

  const lengths = Array.from({ length: before.length + 1 }, () =>
    Array<number>(after.length + 1).fill(0),
  );
  for (
    let beforeIndex = before.length - 1;
    beforeIndex >= 0;
    beforeIndex -= 1
  ) {
    const row = lengths[beforeIndex];
    if (row === undefined) throw new Error("Unable to allocate file diff");
    for (let afterIndex = after.length - 1; afterIndex >= 0; afterIndex -= 1) {
      row[afterIndex] =
        before[beforeIndex] === after[afterIndex]
          ? (lengths[beforeIndex + 1]?.[afterIndex + 1] ?? 0) + 1
          : Math.max(
              lengths[beforeIndex + 1]?.[afterIndex] ?? 0,
              lengths[beforeIndex]?.[afterIndex + 1] ?? 0,
            );
    }
  }

  const result: FileDiffLine[] = [];
  let beforeIndex = 0;
  let afterIndex = 0;
  while (beforeIndex < before.length || afterIndex < after.length) {
    if (before[beforeIndex] === after[afterIndex]) {
      result.push({ kind: "context", text: before[beforeIndex] ?? "" });
      beforeIndex += 1;
      afterIndex += 1;
    } else if (
      afterIndex >= after.length ||
      (beforeIndex < before.length &&
        (lengths[beforeIndex + 1]?.[afterIndex] ?? 0) >=
          (lengths[beforeIndex]?.[afterIndex + 1] ?? 0))
    ) {
      result.push({ kind: "removed", text: before[beforeIndex] ?? "" });
      beforeIndex += 1;
    } else {
      result.push({ kind: "added", text: after[afterIndex] ?? "" });
      afterIndex += 1;
    }
  }
  return result;
}

export function FileWriteDiff({
  afterContent,
  beforeContent,
  path,
}: {
  afterContent: string | null;
  beforeContent: string | null;
  path: string;
}) {
  const theme = useTheme();
  const lines =
    beforeContent === null || afterContent === null
      ? undefined
      : createFileDiffLines(beforeContent, afterContent);
  return (
    <Box flexDirection="column">
      <Text color={theme.info} bold>
        File {sanitizeTerminalText(path)}
      </Text>
      {lines === undefined ? (
        <Text color={theme.warning}>Diff omitted: change is too large</Text>
      ) : lines.length === 0 ? (
        <Text color={theme.textTertiary}> No line changes</Text>
      ) : (
        lines.map((line, index) => {
          const prefix =
            line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " ";
          const color =
            line.kind === "added"
              ? theme.success
              : line.kind === "removed"
                ? theme.danger
                : theme.textTertiary;
          return (
            <Text
              key={`${index}-${line.kind}`}
              color={color}
              dimColor={line.kind === "context"}
            >
              {prefix} {sanitizeTerminalText(line.text)}
            </Text>
          );
        })
      )}
    </Box>
  );
}

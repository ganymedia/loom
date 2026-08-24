import { useTheme } from "@loom/tui/components";
import type { Theme } from "@loom/tui/theme";
import { Box, Text } from "ink";
import { common, createLowlight } from "lowlight";
import { type Token, type Tokens, marked } from "marked";
import type { ReactNode } from "react";

const MAX_MARKDOWN_PARSE_CHARACTERS = 1_000_000;
const MAX_HIGHLIGHT_CHARACTERS = 100_000;
const lowlight = createLowlight(common);

type StyledTextProps = {
  backgroundColor?: string;
  bold?: boolean;
  color?: string;
  dimColor?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
};

export function sanitizeTerminalText(value: string): string {
  let sanitized = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    const allowedWhitespace =
      codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d;
    const isControl =
      codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f);
    sanitized += isControl && !allowedWhitespace ? "�" : character;
  }
  return sanitized;
}

function textProps(
  theme: Theme,
  muted: boolean,
  overrides: StyledTextProps = {},
): StyledTextProps {
  return {
    color: muted ? theme.textTertiary : theme.textSecondary,
    dimColor: muted,
    ...overrides,
  };
}

function occurrenceKeys<T>(
  values: readonly T[],
  content: (value: T) => string,
): string[] {
  const occurrences = new Map<string, number>();
  return values.map((value) => {
    const text = content(value);
    const occurrence = occurrences.get(text) ?? 0;
    occurrences.set(text, occurrence + 1);
    return `${text}:${occurrence}`;
  });
}

export function syntaxHighlightTextStyle(
  theme: Theme,
  classes: readonly string[],
): StyledTextProps {
  const names = new Set(classes);
  if (
    names.has("hljs-comment") ||
    names.has("hljs-quote") ||
    names.has("hljs-meta")
  ) {
    return { color: theme.textTertiary, dimColor: true };
  }
  if (
    names.has("hljs-keyword") ||
    names.has("hljs-selector-tag") ||
    names.has("hljs-literal") ||
    names.has("hljs-section")
  ) {
    return { color: theme.accent, bold: true };
  }
  if (
    names.has("hljs-string") ||
    names.has("hljs-title") ||
    names.has("hljs-name") ||
    names.has("hljs-type") ||
    names.has("hljs-addition")
  ) {
    return { color: theme.success };
  }
  if (
    names.has("hljs-number") ||
    names.has("hljs-regexp") ||
    names.has("hljs-variable") ||
    names.has("hljs-template-variable")
  ) {
    return { color: theme.warning };
  }
  if (names.has("hljs-deletion")) return { color: theme.danger };
  if (names.has("hljs-attr") || names.has("hljs-attribute")) {
    return { color: theme.info };
  }
  return {};
}

function classNames(node: Record<string, unknown>): string[] {
  const properties = node.properties;
  if (typeof properties !== "object" || properties === null) return [];
  const value = (properties as Record<string, unknown>).className;
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function renderHighlightNode(
  node: unknown,
  key: string,
  theme: Theme,
  muted: boolean,
): ReactNode {
  if (typeof node !== "object" || node === null) return null;
  const record = node as Record<string, unknown>;
  if (record.type === "text" && typeof record.value === "string") {
    return sanitizeTerminalText(record.value);
  }
  if (record.type !== "element" || !Array.isArray(record.children)) return null;
  return (
    <Text
      key={key}
      {...textProps(
        theme,
        muted,
        syntaxHighlightTextStyle(theme, classNames(record)),
      )}
    >
      {record.children.map((child, index) =>
        renderHighlightNode(child, `${key}-${index}`, theme, muted),
      )}
    </Text>
  );
}

function highlightedCode(
  code: string,
  language: string | undefined,
  theme: Theme,
  muted: boolean,
): ReactNode {
  const safeCode = sanitizeTerminalText(code);
  const normalizedLanguage = language?.split(/\s+/, 1)[0]?.toLowerCase();
  if (
    safeCode.length > MAX_HIGHLIGHT_CHARACTERS ||
    normalizedLanguage === undefined ||
    normalizedLanguage.length === 0 ||
    !lowlight.registered(normalizedLanguage)
  ) {
    return <Text {...textProps(theme, muted)}>{safeCode}</Text>;
  }

  const root = lowlight.highlight(normalizedLanguage, safeCode) as unknown as {
    children: readonly unknown[];
  };
  return (
    <Text {...textProps(theme, muted)}>
      {root.children.map((child, index) =>
        renderHighlightNode(child, `highlight-${index}`, theme, muted),
      )}
    </Text>
  );
}

function InlineTokens({
  tokens,
  theme,
  muted,
}: {
  tokens: readonly Token[];
  theme: Theme;
  muted: boolean;
}) {
  return (
    <>
      {tokens.map((token, index) => {
        const key = `inline-${index}`;
        switch (token.type) {
          case "text": {
            const text = token as Tokens.Text;
            return text.tokens === undefined ? (
              <Text key={key} {...textProps(theme, muted)}>
                {sanitizeTerminalText(text.text)}
              </Text>
            ) : (
              <InlineTokens
                key={key}
                tokens={text.tokens}
                theme={theme}
                muted={muted}
              />
            );
          }
          case "strong":
            return (
              <Text key={key} {...textProps(theme, muted, { bold: true })}>
                <InlineTokens
                  tokens={(token as Tokens.Strong).tokens}
                  theme={theme}
                  muted={muted}
                />
              </Text>
            );
          case "em":
            return (
              <Text key={key} {...textProps(theme, muted, { italic: true })}>
                <InlineTokens
                  tokens={(token as Tokens.Em).tokens}
                  theme={theme}
                  muted={muted}
                />
              </Text>
            );
          case "del":
            return (
              <Text
                key={key}
                {...textProps(theme, muted, { strikethrough: true })}
              >
                <InlineTokens
                  tokens={(token as Tokens.Del).tokens}
                  theme={theme}
                  muted={muted}
                />
              </Text>
            );
          case "codespan":
            return (
              <Text
                key={key}
                {...textProps(theme, muted, {
                  backgroundColor: theme.backgroundAccent,
                  color: theme.warning,
                })}
              >
                {sanitizeTerminalText((token as Tokens.Codespan).text)}
              </Text>
            );
          case "link":
            return (
              <Text
                key={key}
                {...textProps(theme, muted, {
                  color: theme.info,
                  underline: true,
                })}
              >
                <InlineTokens
                  tokens={(token as Tokens.Link).tokens}
                  theme={theme}
                  muted={muted}
                />
              </Text>
            );
          case "image":
            return (
              <Text key={key} {...textProps(theme, muted, { italic: true })}>
                [image: {sanitizeTerminalText((token as Tokens.Image).text)}]
              </Text>
            );
          case "br":
            return "\n";
          case "escape":
          case "html":
            return (
              <Text key={key} {...textProps(theme, muted)}>
                {sanitizeTerminalText(
                  (token as Tokens.Escape | Tokens.Tag).text,
                )}
              </Text>
            );
          default:
            return null;
        }
      })}
    </>
  );
}

function BlockToken({
  token,
  theme,
  muted,
}: {
  token: Token;
  theme: Theme;
  muted: boolean;
}) {
  switch (token.type) {
    case "space":
    case "def":
      return null;
    case "heading": {
      const heading = token as Tokens.Heading;
      return (
        <Box marginTop={heading.depth === 1 ? 1 : 0}>
          <Text
            {...textProps(theme, muted, {
              bold: true,
              color: heading.depth <= 2 ? theme.accent : theme.textPrimary,
              underline: heading.depth === 1,
            })}
          >
            <InlineTokens tokens={heading.tokens} theme={theme} muted={muted} />
          </Text>
        </Box>
      );
    }
    case "paragraph": {
      const paragraph = token as Tokens.Paragraph;
      return (
        <Text {...textProps(theme, muted)}>
          <InlineTokens tokens={paragraph.tokens} theme={theme} muted={muted} />
        </Text>
      );
    }
    case "text": {
      const text = token as Tokens.Text;
      return text.tokens === undefined ? (
        <Text {...textProps(theme, muted)}>
          {sanitizeTerminalText(text.text)}
        </Text>
      ) : (
        <Text {...textProps(theme, muted)}>
          <InlineTokens tokens={text.tokens} theme={theme} muted={muted} />
        </Text>
      );
    }
    case "code": {
      const code = token as Tokens.Code;
      return (
        <Box
          borderStyle="single"
          borderColor={muted ? theme.borderMuted : theme.border}
          flexDirection="column"
          paddingX={1}
        >
          {code.lang === undefined || code.lang.length === 0 ? null : (
            <Text {...textProps(theme, muted, { italic: true })}>
              {sanitizeTerminalText(code.lang)}
            </Text>
          )}
          {highlightedCode(code.text, code.lang, theme, muted)}
        </Box>
      );
    }
    case "blockquote": {
      const quote = token as Tokens.Blockquote;
      return (
        <Box>
          <Text {...textProps(theme, muted, { color: theme.accent })}>│ </Text>
          <Box flexDirection="column">
            <BlockTokens tokens={quote.tokens} theme={theme} muted={muted} />
          </Box>
        </Box>
      );
    }
    case "list": {
      const list = token as Tokens.List;
      const itemKeys = occurrenceKeys(list.items, (item) => item.raw);
      return (
        <Box flexDirection="column">
          {list.items.map((item, index) => (
            <Box key={itemKeys[index]}>
              <Text {...textProps(theme, muted, { color: theme.accent })}>
                {list.ordered
                  ? `${Number(list.start || 1) + index}. `
                  : item.task
                    ? item.checked
                      ? "[x] "
                      : "[ ] "
                    : "• "}
              </Text>
              <Box flexDirection="column">
                <BlockTokens tokens={item.tokens} theme={theme} muted={muted} />
              </Box>
            </Box>
          ))}
        </Box>
      );
    }
    case "hr":
      return <Text color={theme.borderMuted}>────────────────────────</Text>;
    case "table": {
      const table = token as Tokens.Table;
      const rows = [table.header, ...table.rows];
      const rowKeys = occurrenceKeys(rows, (row) =>
        row.map((cell) => cell.text).join("\u0000"),
      );
      return (
        <Box flexDirection="column">
          {rows.map((row, rowIndex) => {
            const cellKeys = occurrenceKeys(row, (cell) => cell.text);
            return (
              <Text
                key={rowKeys[rowIndex]}
                {...textProps(theme, muted, { bold: rowIndex === 0 })}
              >
                {row.map((cell, cellIndex) => (
                  <Text key={cellKeys[cellIndex]}>
                    {cellIndex === 0 ? "" : " │ "}
                    <InlineTokens
                      tokens={cell.tokens}
                      theme={theme}
                      muted={muted}
                    />
                  </Text>
                ))}
              </Text>
            );
          })}
        </Box>
      );
    }
    case "html":
      return (
        <Text {...textProps(theme, muted)}>
          {sanitizeTerminalText((token as Tokens.HTML).text)}
        </Text>
      );
    default:
      return null;
  }
}

function BlockTokens({
  tokens,
  theme,
  muted,
}: {
  tokens: readonly Token[];
  theme: Theme;
  muted: boolean;
}) {
  const keys = occurrenceKeys(tokens, (token) => token.raw);
  return (
    <>
      {tokens.map((token, index) => (
        <BlockToken
          key={keys[index]}
          token={token}
          theme={theme}
          muted={muted}
        />
      ))}
    </>
  );
}

export function MarkdownText({
  source,
  muted = false,
}: {
  source: string;
  muted?: boolean;
}) {
  const theme = useTheme();
  const safeSource = sanitizeTerminalText(source);
  if (safeSource.length > MAX_MARKDOWN_PARSE_CHARACTERS) {
    return <Text {...textProps(theme, muted)}>{safeSource}</Text>;
  }
  const tokens = marked.lexer(safeSource, { gfm: true, breaks: true });
  return (
    <Box flexDirection="column">
      <BlockTokens tokens={tokens} theme={theme} muted={muted} />
    </Box>
  );
}

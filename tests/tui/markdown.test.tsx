import { describe, expect, test } from "bun:test";
import { ThemeProvider } from "@loom/tui/components";
import {
  MarkdownText,
  sanitizeTerminalText,
  syntaxHighlightTextStyle,
} from "@loom/tui/markdown";
import { loomDark } from "@loom/tui/theme";
import { renderToString } from "ink";
import { createElement } from "react";

function renderMarkdown(source: string, muted = false): string {
  return renderToString(
    createElement(
      ThemeProvider,
      { themeId: "loom-dark" },
      createElement(MarkdownText, { source, muted }),
    ),
  );
}

describe("MarkdownText", () => {
  test("renders Markdown structure without raw formatting markers", () => {
    const rendered = renderMarkdown(
      "# Heading\n\nA **bold** and *italic* response.\n\n- first\n- second",
    );

    expect(rendered).toContain("Heading");
    expect(rendered).toContain("A bold and italic response.");
    expect(rendered).toContain("• first");
    expect(rendered).toContain("• second");
    expect(rendered).not.toContain("# Heading");
    expect(rendered).not.toContain("**bold**");
  });

  test("renders fenced code without fences and maps syntax token classes", () => {
    const rendered = renderMarkdown(
      "```typescript\nconst answer: number = 42;\n```",
    );

    expect(rendered).toContain("typescript");
    expect(rendered).toContain("const answer: number = 42;");
    expect(rendered).not.toContain("```");
    expect(syntaxHighlightTextStyle(loomDark, ["hljs-keyword"])).toEqual({
      color: loomDark.accent,
      bold: true,
    });
    expect(syntaxHighlightTextStyle(loomDark, ["hljs-string"])).toEqual({
      color: loomDark.success,
    });
  });

  test("handles incomplete and unknown-language code fences without throwing", () => {
    expect(renderMarkdown("```unknown\nplain code")).toContain("plain code");
    expect(renderMarkdown("A **streaming")).toContain("A **streaming");
  });

  test("neutralizes terminal control characters and does not execute HTML", () => {
    expect(sanitizeTerminalText("safe\u001B[31mtext\u0000")).toBe(
      "safe�[31mtext�",
    );
    expect(renderMarkdown("<b>literal</b>")).toContain("<b>literal</b>");
  });

  test("renders muted completed Markdown without dropping content", () => {
    expect(renderMarkdown("Completed **answer**", true)).toContain(
      "Completed answer",
    );
  });
});

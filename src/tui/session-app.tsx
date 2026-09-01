import type {
  AgentToolAction,
  SubAgentLifecycleEvent,
} from "@loom/agents/base";
import {
  AgentTabStrip,
  StatusBar,
  ThemeProvider,
  useTheme,
} from "@loom/tui/components";
import { FileWriteDiff } from "@loom/tui/file-diff";
import { MarkdownText, sanitizeTerminalText } from "@loom/tui/markdown";
import { SessionPanel, shouldShowSessionPanel } from "@loom/tui/session-panel";
import {
  type SessionPanelState,
  type SessionRuntimeState,
  deriveSessionTitle,
} from "@loom/tui/session-panel-state";
import {
  type SlashCommandEntry,
  filterSlashCommandEntries,
  sessionSlashCommandEntries,
  shouldShowSlashCommandPopup,
} from "@loom/tui/slash-commands";
import { type BuiltInAgentName, builtInAgentTabs } from "@loom/tui/tab-strip";
import { type Theme, agentTabColor, resolveTheme } from "@loom/tui/theme";
import { Box, type Key, Text, useInput, useStdout } from "ink";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

export type SessionOutput =
  | { id: string; kind: "plain"; text: string }
  | { id: string; kind: "tool-result"; success: boolean; text: string }
  | {
      id: string;
      kind: "assistant";
      agentName: BuiltInAgentName;
      displayName: string;
      content: string;
    }
  | {
      id: string;
      kind: "file-diff";
      path: string;
      beforeContent: string | null;
      afterContent: string | null;
    }
  | {
      id: string;
      kind: "user";
      content: string;
      agentName: BuiltInAgentName;
    };

export interface SessionViewState {
  activeAgentName: BuiltInAgentName;
  handoffWritten?: boolean;
  liveAssistant?: { displayName: string; text: string };
  output: readonly SessionOutput[];
  panel: SessionPanelState;
  priorContextUsed?: boolean;
  sessionId: string;
  thinkingAgentDisplayName?: string;
  tokenPercent: number;
  toolRunning?: {
    action: AgentToolAction;
    displayName: string;
    toolCount: number;
  };
  subAgentActivity?: readonly SubAgentActivity[];
}

export interface SubAgentActivity extends SubAgentLifecycleEvent {}

const MAX_COMPLETED_SUB_AGENT_ROWS = 20;

type SessionViewListener = () => void;

export function appendSessionInput(current: string, chunk: string): string {
  return `${current}${chunk.replace(/\r\n|\r/g, "\n")}`;
}

export function splitTerminalInputChunk(chunk: string): {
  text: string;
  submit: boolean;
} {
  const submit = chunk.endsWith("\r");
  return { text: submit ? chunk.slice(0, -1) : chunk, submit };
}

export function shouldInsertInputNewline(
  character: string,
  key: Pick<Key, "return" | "shift">,
): boolean {
  return character === "\n" || (key.return && key.shift);
}

export function formatSessionInput(input: string): string {
  return `> ${input.replaceAll("\n", "\n  ")}`;
}

export function insertSessionInput(
  input: string,
  cursorIndex: number,
  chunk: string,
): { cursorIndex: number; input: string } {
  const index = Math.min(Math.max(cursorIndex, 0), input.length);
  const normalized = chunk.replace(/\r\n|\r/g, "\n");
  return {
    cursorIndex: index + normalized.length,
    input: `${input.slice(0, index)}${normalized}${input.slice(index)}`,
  };
}

export function deleteSessionInput(
  input: string,
  cursorIndex: number,
  direction: "backward" | "forward",
): { cursorIndex: number; input: string } {
  const index = Math.min(Math.max(cursorIndex, 0), input.length);
  if (direction === "backward") {
    if (index === 0) return { cursorIndex: index, input };
    return {
      cursorIndex: index - 1,
      input: `${input.slice(0, index - 1)}${input.slice(index)}`,
    };
  }
  if (index === input.length) return { cursorIndex: index, input };
  return {
    cursorIndex: index,
    input: `${input.slice(0, index)}${input.slice(index + 1)}`,
  };
}

export function moveSessionInputCursor(
  input: string,
  cursorIndex: number,
  direction: -1 | 1,
  byWord = false,
): number {
  let index = Math.min(Math.max(cursorIndex, 0), input.length);
  if (!byWord) return Math.min(Math.max(index + direction, 0), input.length);
  if (direction === -1) {
    while (index > 0 && /\s/.test(input[index - 1] ?? "")) index -= 1;
    while (index > 0 && !/\s/.test(input[index - 1] ?? "")) index -= 1;
    return index;
  }
  while (index < input.length && !/\s/.test(input[index] ?? "")) index += 1;
  while (index < input.length && /\s/.test(input[index] ?? "")) index += 1;
  return index;
}

export function resolveTerminalRows(rows: number | undefined): number {
  return rows === undefined || rows <= 0 ? 24 : Math.max(rows, 12);
}

export function sessionCanvasColor(themeId: string | undefined): string {
  return resolveTheme(themeId).panelSurface;
}

export function moveSessionHistoryIndex(
  currentIndex: number,
  entryCount: number,
  direction: -1 | 1,
): number {
  if (entryCount === 0) return 0;
  const normalizedIndex = Math.min(Math.max(currentIndex, 0), entryCount);
  return Math.min(Math.max(normalizedIndex + direction, 0), entryCount);
}

export function isSessionExitInput(
  character: string,
  key: Pick<Key, "ctrl" | "escape">,
): boolean {
  return key.escape || (key.ctrl && character.toLowerCase() === "c");
}

export function moveSlashCommandSelection(
  currentIndex: number,
  entryCount: number,
  direction: -1 | 1,
): number {
  if (entryCount === 0) return -1;
  const normalizedIndex =
    currentIndex >= 0 && currentIndex < entryCount ? currentIndex : 0;
  return (normalizedIndex + direction + entryCount) % entryCount;
}

export function isSlashCommandPopupOpen(
  input: string,
  dismissed: boolean,
): boolean {
  return !dismissed && shouldShowSlashCommandPopup(input);
}

export function isSlashPopupMetaText(
  input: string,
  character: string,
  meta: boolean,
): boolean {
  const printableText = character.replaceAll("\u001b", "");
  const containsOnlyPrintableText = Array.from(printableText).every(
    (value) => value.charCodeAt(0) >= 32 && value.charCodeAt(0) !== 127,
  );
  return (
    meta &&
    input.startsWith("/") &&
    printableText.length > 0 &&
    containsOnlyPrintableText
  );
}

export function visibleSlashCommandWindow(
  entries: readonly SlashCommandEntry[],
  selectedIndex: number,
  maxVisibleEntries: number,
): { entries: readonly SlashCommandEntry[]; selectedIndex: number } {
  const limit = Math.max(1, Math.floor(maxVisibleEntries));
  if (entries.length <= limit) return { entries, selectedIndex };
  const normalizedIndex = Math.min(
    Math.max(selectedIndex, 0),
    entries.length - 1,
  );
  const start = Math.min(
    Math.max(normalizedIndex - limit + 1, 0),
    entries.length - limit,
  );
  return {
    entries: entries.slice(start, start + limit),
    selectedIndex: normalizedIndex - start,
  };
}

export class SessionViewStore {
  readonly #listeners = new Set<SessionViewListener>();
  #nextOutputId: number;
  #state: SessionViewState;

  constructor(initialState: SessionViewState) {
    this.#state = initialState;
    this.#nextOutputId = initialState.output.length;
  }

  readonly getSnapshot = (): SessionViewState => this.#state;

  readonly subscribe = (listener: SessionViewListener): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  appendOutput(message: string): void {
    this.#setState({
      ...this.#state,
      output: [
        ...this.#state.output,
        { id: this.#outputId(), kind: "plain", text: message },
      ],
    });
  }

  appendAssistantOutput(
    agentName: BuiltInAgentName,
    displayName: string,
    content: string,
  ): void {
    this.#setState({
      ...this.#state,
      output: [
        ...this.#state.output,
        {
          id: this.#outputId(),
          kind: "assistant",
          agentName,
          displayName,
          content,
        },
      ],
    });
  }

  appendToolResult(text: string, success: boolean): void {
    this.#setState({
      ...this.#state,
      output: [
        ...this.#state.output,
        {
          id: this.#outputId(),
          kind: "tool-result",
          success,
          text: sanitizeTerminalText(text),
        },
      ],
    });
  }

  appendFileDiff(
    path: string,
    beforeContent: string | null,
    afterContent: string | null,
  ): void {
    this.#setState({
      ...this.#state,
      output: [
        ...this.#state.output,
        {
          id: this.#outputId(),
          kind: "file-diff",
          path,
          beforeContent,
          afterContent,
        },
      ],
    });
  }

  appendUserPrompt(content: string, agentName: BuiltInAgentName): void {
    this.#setState({
      ...this.#state,
      output: [
        ...this.#state.output,
        { id: this.#outputId(), kind: "user", content, agentName },
      ],
    });
  }

  setPanelTitleFromFirstPrompt(prompt: string): void {
    if (this.#state.panel.title !== "New session") return;
    this.#setState({
      ...this.#state,
      panel: { ...this.#state.panel, title: deriveSessionTitle(prompt) },
    });
  }

  updatePanelRuntime(runtime: SessionRuntimeState): void {
    switch (runtime) {
      case "idle":
      case "active":
      case "failed":
        this.#setState({
          ...this.#state,
          panel: { ...this.#state.panel, runtime },
        });
        return;
      default:
        throw new Error("Unknown panel runtime state");
    }
  }

  beginThinking(displayName: string): void {
    const {
      liveAssistant: _liveAssistant,
      toolRunning: _toolRunning,
      ...state
    } = this.#state;
    this.#setState({ ...state, thinkingAgentDisplayName: displayName });
  }

  clearThinking(): void {
    if (this.#state.thinkingAgentDisplayName === undefined) return;
    const { thinkingAgentDisplayName: _thinking, ...state } = this.#state;
    this.#setState(state);
  }

  beginToolRunning(
    displayName: string,
    toolCount: number,
    action: AgentToolAction,
  ): void {
    if (!Number.isInteger(toolCount) || toolCount <= 0) {
      throw new Error("toolCount must be a positive integer");
    }
    const { thinkingAgentDisplayName: _thinking, ...state } = this.#state;
    this.#setState({
      ...state,
      toolRunning: { action, displayName, toolCount },
    });
  }

  clearToolRunning(): void {
    if (this.#state.toolRunning === undefined) return;
    const { toolRunning: _toolRunning, ...state } = this.#state;
    this.#setState(state);
  }

  appendAssistantDelta(displayName: string, delta: string): void {
    const liveAssistant = this.#state.liveAssistant;
    const { thinkingAgentDisplayName: _thinking, ...state } = this.#state;
    this.#setState({
      ...state,
      liveAssistant: {
        displayName,
        text:
          liveAssistant?.displayName === displayName
            ? liveAssistant.text + delta
            : delta,
      },
    });
  }

  clearAssistantDelta(): void {
    const {
      liveAssistant: _liveAssistant,
      thinkingAgentDisplayName: _thinking,
      toolRunning: _toolRunning,
      ...state
    } = this.#state;
    this.#setState(state);
  }

  updateStatus(activeAgentName: BuiltInAgentName, tokenPercent: number): void {
    this.#setState({ ...this.#state, activeAgentName, tokenPercent });
  }

  markHandoffWritten(): void {
    this.#setState({ ...this.#state, handoffWritten: true });
  }

  markPriorContextUsed(): void {
    this.#setState({ ...this.#state, priorContextUsed: true });
  }

  recordSubAgentLifecycle(event: SubAgentLifecycleEvent): void {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        event.id,
      )
    )
      return;
    const displayName = sanitizeTerminalText(event.displayName)
      .replace(/[\r\n\t]/g, " ")
      .slice(0, 40);
    if (displayName.length === 0) return;
    const activity = [...(this.#state.subAgentActivity ?? [])];
    const index = activity.findIndex((row) => row.id === event.id);
    const row = { ...event, displayName };
    if (index === -1) activity.push(row);
    else activity[index] = row;
    const running = activity.filter((item) => item.status === "started");
    const completed = activity
      .filter((item) => item.status !== "started")
      .slice(-MAX_COMPLETED_SUB_AGENT_ROWS);
    this.#setState({
      ...this.#state,
      subAgentActivity: [...running, ...completed],
    });
  }

  #setState(state: SessionViewState): void {
    this.#state = state;
    for (const listener of this.#listeners) listener();
  }

  #outputId(): string {
    const id = `output-${this.#nextOutputId}`;
    this.#nextOutputId += 1;
    return id;
  }
}

export function thinkingIndicatorText(
  displayName: string,
  frame: number,
): string {
  return `${displayName}: Thinking${".".repeat((frame % 3) + 1)}`;
}

export function ThinkingIndicator({ displayName }: { displayName: string }) {
  const theme = useTheme();
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setFrame((value) => value + 1), 250);
    return () => clearInterval(interval);
  }, []);
  return (
    <Text color={theme.info}>{thinkingIndicatorText(displayName, frame)}</Text>
  );
}

export function toolRunningIndicatorText(
  displayName: string,
  toolCount: number,
  action: AgentToolAction,
  frame: number,
): string {
  let label: string;
  switch (action) {
    case "reading-file":
      label = toolCount === 1 ? "Reading file" : `Reading ${toolCount} files`;
      break;
    case "writing-file":
      label = toolCount === 1 ? "Writing file" : `Writing ${toolCount} files`;
      break;
    case "running-command":
      label =
        toolCount === 1 ? "Running command" : `Running ${toolCount} commands`;
      break;
    case "checking-repository":
      label =
        toolCount === 1
          ? "Checking repository"
          : `Checking repository (${toolCount} operations)`;
      break;
    case "running-tools":
      label = `Running ${toolCount} ${toolCount === 1 ? "tool" : "tools"}`;
      break;
    default:
      throw new Error("Unable to render unknown tool action");
  }
  return `${displayName}: ${label}${".".repeat((frame % 3) + 1)}`;
}

export function ToolRunningIndicator({
  action,
  displayName,
  toolCount,
}: {
  action: AgentToolAction;
  displayName: string;
  toolCount: number;
}) {
  const theme = useTheme();
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setFrame((value) => value + 1), 250);
    return () => clearInterval(interval);
  }, []);
  return (
    <Text color={theme.warning} bold>
      {toolRunningIndicatorText(displayName, toolCount, action, frame)}
    </Text>
  );
}

export function visibleSubAgentActivity(
  activity: readonly SubAgentActivity[],
): readonly SubAgentActivity[] {
  const running = activity.filter((row) => row.status === "started");
  const completed = activity.filter((row) => row.status !== "started");
  if (running.length >= 3) return running.slice(-3);
  return [...running, ...completed.slice(-(3 - running.length))];
}

export function shouldShowSubAgentTray(rows: number, columns: number): boolean {
  return rows >= 20 && columns >= 48;
}

export function SubAgentTray({
  activity,
  terminalColumns,
}: {
  activity: readonly SubAgentActivity[];
  terminalColumns: number;
}) {
  const theme = useTheme();
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={theme.textTertiary} bold>
        Sub-agents
      </Text>
      {visibleSubAgentActivity(activity).map((row) => {
        const label = row.status === "started" ? "running" : row.status;
        const displayName = row.displayName.slice(
          0,
          Math.max(1, terminalColumns - label.length - 4),
        );
        const color =
          row.status === "started"
            ? theme.info
            : row.status === "succeeded"
              ? theme.success
              : theme.danger;
        return (
          <Text key={row.id} color={color}>
            {displayName}: {label}
          </Text>
        );
      })}
    </Box>
  );
}

export function SlashCommandPopup({
  entries,
  maxVisibleEntries = entries.length,
  selectedIndex,
}: {
  entries: readonly SlashCommandEntry[];
  maxVisibleEntries?: number;
  selectedIndex: number;
}) {
  const theme = useTheme();
  const visible = visibleSlashCommandWindow(
    entries,
    selectedIndex,
    maxVisibleEntries,
  );
  return (
    <Box
      borderStyle="round"
      borderColor={theme.border}
      flexDirection="column"
      marginX={1}
      paddingX={1}
    >
      <Text color={theme.textSecondary} bold>
        Commands
      </Text>
      {entries.length === 0 ? (
        <Text color={theme.textTertiary}>No matching commands</Text>
      ) : (
        visible.entries.map((entry, index) => (
          <Box key={entry.command} gap={1}>
            <Text color={theme.accent} bold={index === visible.selectedIndex}>
              {index === visible.selectedIndex ? "›" : " "}
            </Text>
            <Text color={theme.info} bold={index === visible.selectedIndex}>
              {entry.command}
            </Text>
            <Text color={theme.textTertiary}>{entry.description}</Text>
          </Box>
        ))
      )}
    </Box>
  );
}

export function completedOutputTextStyle(theme: Pick<Theme, "textTertiary">): {
  color: string;
  dimColor: true;
} {
  return { color: theme.textTertiary, dimColor: true };
}

function CompletedOutput({ output }: { output: SessionOutput }) {
  const theme = useTheme();
  if (output.kind === "plain") {
    return (
      <Text {...completedOutputTextStyle(theme)}>{output.text.trimEnd()}</Text>
    );
  }
  if (output.kind === "file-diff") {
    return <FileWriteDiff {...output} />;
  }
  if (output.kind === "tool-result") {
    return (
      <Text color={output.success ? theme.success : theme.danger}>
        {output.success ? "✓" : "✕"} {output.text.trimEnd()}
      </Text>
    );
  }
  if (output.kind === "user") {
    const agentColor = agentTabColor(theme, output.agentName);
    return (
      <Box
        borderStyle="round"
        borderColor={agentColor}
        flexDirection="column"
        marginTop={1}
        paddingX={1}
      >
        <Box flexDirection="row" justifyContent="space-between">
          <Text color={agentColor} bold>
            You
          </Text>
          <Text dimColor>Submitted</Text>
        </Box>
        <Text>{sanitizeTerminalText(output.content)}</Text>
      </Box>
    );
  }
  if (output.agentName === "developer") {
    const developerColor = agentTabColor(theme, "developer");
    return (
      <Box
        borderColor={developerColor}
        borderStyle="round"
        flexDirection="column"
        marginTop={1}
        paddingX={1}
      >
        <Box flexDirection="row" justifyContent="space-between">
          <Text color={developerColor} bold>
            Developer summary
          </Text>
          <Text dimColor>Completed</Text>
        </Box>
        <MarkdownText source={output.content} />
      </Box>
    );
  }
  return (
    <Box flexDirection="column">
      <Text {...completedOutputTextStyle(theme)} bold>
        {output.displayName}
      </Text>
      <MarkdownText source={output.content} muted />
    </Box>
  );
}

export function SessionInput({
  activeAgentName,
  cursorIndex,
  input,
}: {
  activeAgentName: BuiltInAgentName;
  cursorIndex: number;
  input: string;
}) {
  const theme = useTheme();
  const agentColor = agentTabColor(theme, activeAgentName);
  const cursorCharacter = input[cursorIndex];
  const cursorOverlaysCharacter =
    cursorCharacter !== undefined && cursorCharacter !== "\n";
  return (
    <Box flexDirection="column" marginX={1}>
      <Box
        borderStyle="round"
        borderColor={agentColor}
        flexDirection="column"
        paddingX={1}
      >
        <Text color={agentColor} bold>
          Message
        </Text>
        <Text>
          {formatSessionInput(input.slice(0, cursorIndex))}
          <BlinkingInputCursor
            color={agentColor}
            {...(cursorOverlaysCharacter ? { character: cursorCharacter } : {})}
          />
          {input
            .slice(cursorIndex + (cursorOverlaysCharacter ? 1 : 0))
            .replaceAll("\n", "\n  ")}
        </Text>
      </Box>
      <Text color={theme.textTertiary} dimColor>
        Enter submit · Ctrl+J newline · Shift+Enter where supported
      </Text>
    </Box>
  );
}

export function inputCursorGlyph(visible: boolean): "▌" | " " {
  return visible ? "▌" : " ";
}

export function BlinkingInputCursor({
  character,
  color,
}: {
  character?: string;
  color: string;
}) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const interval = setInterval(() => setVisible((value) => !value), 500);
    return () => clearInterval(interval);
  }, []);
  if (character !== undefined) {
    return visible ? (
      <Text color={color} inverse>
        {character}
      </Text>
    ) : (
      <Text>{character}</Text>
    );
  }
  return <Text color={color}>{inputCursorGlyph(visible)}</Text>;
}

export function SessionLayout({
  application,
  columns,
  panel,
  rows,
}: {
  application: React.ReactNode;
  columns: number;
  panel: SessionPanelState;
  rows: number;
}) {
  if (!shouldShowSessionPanel(rows, columns)) return application;
  return (
    <Box flexDirection="row" height={rows}>
      <Box flexBasis={0} flexDirection="column" flexGrow={1} flexShrink={1}>
        {application}
      </Box>
      <SessionPanel state={panel} />
    </Box>
  );
}

export function SessionApp({
  onCycleAgent,
  onExit,
  onSubmit,
  store,
  themeId,
}: {
  onCycleAgent: () => void;
  onExit: () => void;
  onSubmit: (line: string) => void;
  store: SessionViewStore;
  themeId: string | undefined;
}) {
  const [input, setInput] = useState("");
  const [cursorIndex, setCursorIndex] = useState(0);
  const [selectedSlashCommandIndex, setSelectedSlashCommandIndex] = useState(0);
  const [slashCommandPopupDismissed, setSlashCommandPopupDismissed] =
    useState(false);
  const inputRef = useRef("");
  const cursorIndexRef = useRef(0);
  const historyRef = useRef<string[]>([]);
  const historyDraftRef = useRef("");
  const historyIndexRef = useRef(0);
  const selectedSlashCommandIndexRef = useRef(0);
  const slashCommandPopupDismissedRef = useRef(false);
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const { stdout } = useStdout();
  const [terminalRows, setTerminalRows] = useState(
    resolveTerminalRows(stdout.rows),
  );
  const [terminalColumns, setTerminalColumns] = useState(stdout.columns ?? 80);
  const canvasColor = sessionCanvasColor(themeId);
  useEffect(() => {
    const updateTerminalRows = (): void => {
      setTerminalRows(resolveTerminalRows(stdout.rows));
      setTerminalColumns(stdout.columns ?? 80);
    };
    stdout.on("resize", updateTerminalRows);
    return () => {
      stdout.off("resize", updateTerminalRows);
    };
  }, [stdout]);
  const submitInput = (): void => {
    const entries = filterSlashCommandEntries(
      sessionSlashCommandEntries,
      inputRef.current,
    );
    const selectedEntry = isSlashCommandPopupOpen(
      inputRef.current,
      slashCommandPopupDismissedRef.current,
    )
      ? (entries[selectedSlashCommandIndexRef.current] ?? entries[0])
      : undefined;
    const submittedInput = selectedEntry?.command ?? inputRef.current;
    if (submittedInput.trim().length > 0) {
      historyRef.current = [...historyRef.current.slice(-99), submittedInput];
    }
    historyIndexRef.current = historyRef.current.length;
    historyDraftRef.current = "";
    onSubmit(submittedInput);
    inputRef.current = "";
    cursorIndexRef.current = 0;
    selectedSlashCommandIndexRef.current = 0;
    slashCommandPopupDismissedRef.current = false;
    setInput("");
    setCursorIndex(0);
    setSelectedSlashCommandIndex(0);
    setSlashCommandPopupDismissed(false);
  };
  useInput((character, key) => {
    const recoversSlashPopupMetaText = isSlashPopupMetaText(
      inputRef.current,
      character,
      key.meta,
    );
    if (recoversSlashPopupMetaText) {
      const edit = insertSessionInput(
        inputRef.current,
        cursorIndexRef.current,
        character.replaceAll("\u001b", ""),
      );
      inputRef.current = edit.input;
      cursorIndexRef.current = edit.cursorIndex;
      historyIndexRef.current = historyRef.current.length;
      historyDraftRef.current = inputRef.current;
      selectedSlashCommandIndexRef.current = 0;
      slashCommandPopupDismissedRef.current = false;
      setInput(inputRef.current);
      setCursorIndex(cursorIndexRef.current);
      setSelectedSlashCommandIndex(0);
      setSlashCommandPopupDismissed(false);
      return;
    }
    if (
      key.escape &&
      isSlashCommandPopupOpen(
        inputRef.current,
        slashCommandPopupDismissedRef.current,
      )
    ) {
      slashCommandPopupDismissedRef.current = true;
      setSlashCommandPopupDismissed(true);
      return;
    }
    if (isSessionExitInput(character, key)) {
      onExit();
      return;
    }
    if (key.tab) {
      onCycleAgent();
      return;
    }
    if (key.upArrow || key.downArrow) {
      if (
        isSlashCommandPopupOpen(
          inputRef.current,
          slashCommandPopupDismissedRef.current,
        )
      ) {
        const entries = filterSlashCommandEntries(
          sessionSlashCommandEntries,
          inputRef.current,
        );
        selectedSlashCommandIndexRef.current = moveSlashCommandSelection(
          selectedSlashCommandIndexRef.current,
          entries.length,
          key.upArrow ? -1 : 1,
        );
        setSelectedSlashCommandIndex(selectedSlashCommandIndexRef.current);
        return;
      }
      if (
        key.upArrow &&
        historyIndexRef.current === historyRef.current.length
      ) {
        historyDraftRef.current = inputRef.current;
      }
      const nextIndex = moveSessionHistoryIndex(
        historyIndexRef.current,
        historyRef.current.length,
        key.upArrow ? -1 : 1,
      );
      historyIndexRef.current = nextIndex;
      inputRef.current =
        nextIndex === historyRef.current.length
          ? historyDraftRef.current
          : (historyRef.current[nextIndex] ?? "");
      cursorIndexRef.current = inputRef.current.length;
      slashCommandPopupDismissedRef.current = true;
      setInput(inputRef.current);
      setCursorIndex(cursorIndexRef.current);
      setSlashCommandPopupDismissed(true);
      return;
    }
    if (key.leftArrow || key.rightArrow) {
      cursorIndexRef.current = moveSessionInputCursor(
        inputRef.current,
        cursorIndexRef.current,
        key.leftArrow ? -1 : 1,
        key.ctrl || key.meta,
      );
      setCursorIndex(cursorIndexRef.current);
      return;
    }
    if (shouldInsertInputNewline(character, key)) {
      const edit = insertSessionInput(
        inputRef.current,
        cursorIndexRef.current,
        "\n",
      );
      inputRef.current = edit.input;
      cursorIndexRef.current = edit.cursorIndex;
      historyIndexRef.current = historyRef.current.length;
      historyDraftRef.current = inputRef.current;
      selectedSlashCommandIndexRef.current = 0;
      slashCommandPopupDismissedRef.current = false;
      setInput(inputRef.current);
      setCursorIndex(cursorIndexRef.current);
      setSelectedSlashCommandIndex(0);
      setSlashCommandPopupDismissed(false);
      return;
    }
    if (key.return) {
      submitInput();
      return;
    }
    if (key.backspace || key.delete) {
      const edit = deleteSessionInput(
        inputRef.current,
        cursorIndexRef.current,
        key.backspace ? "backward" : "forward",
      );
      inputRef.current = edit.input;
      cursorIndexRef.current = edit.cursorIndex;
      historyIndexRef.current = historyRef.current.length;
      historyDraftRef.current = inputRef.current;
      selectedSlashCommandIndexRef.current = 0;
      slashCommandPopupDismissedRef.current = false;
      setInput(inputRef.current);
      setCursorIndex(cursorIndexRef.current);
      setSelectedSlashCommandIndex(0);
      setSlashCommandPopupDismissed(false);
      return;
    }
    if (
      character.length > 0 &&
      !key.ctrl &&
      !key.meta &&
      !key.tab &&
      !key.escape
    ) {
      const chunk = splitTerminalInputChunk(character);
      const edit = insertSessionInput(
        inputRef.current,
        cursorIndexRef.current,
        chunk.text,
      );
      inputRef.current = edit.input;
      cursorIndexRef.current = edit.cursorIndex;
      if (chunk.submit) {
        submitInput();
        return;
      }
      historyIndexRef.current = historyRef.current.length;
      historyDraftRef.current = inputRef.current;
      selectedSlashCommandIndexRef.current = 0;
      slashCommandPopupDismissedRef.current = false;
      setInput(inputRef.current);
      setCursorIndex(cursorIndexRef.current);
      setSelectedSlashCommandIndex(0);
      setSlashCommandPopupDismissed(false);
    }
  });
  const activeIndex = builtInAgentTabs.findIndex(
    (tab) => tab.name === state.activeAgentName,
  );

  if (activeIndex === -1) {
    throw new Error(
      `Unable to render unknown active agent "${state.activeAgentName}"`,
    );
  }

  const application = (
    <Box
      backgroundColor={canvasColor}
      flexDirection="column"
      height={terminalRows}
    >
      <AgentTabStrip tabs={builtInAgentTabs} activeIndex={activeIndex} />
      <Box
        flexDirection="column-reverse"
        flexBasis={0}
        flexGrow={1}
        flexShrink={1}
        overflowY="hidden"
        paddingX={1}
      >
        {state.liveAssistant === undefined ? null : (
          <Box flexDirection="column" flexShrink={0}>
            <Text bold>{state.liveAssistant.displayName}</Text>
            <MarkdownText source={state.liveAssistant.text} />
          </Box>
        )}
        {state.toolRunning === undefined ? null : (
          <Box flexShrink={0}>
            <ToolRunningIndicator
              action={state.toolRunning.action}
              displayName={state.toolRunning.displayName}
              toolCount={state.toolRunning.toolCount}
            />
          </Box>
        )}
        {state.thinkingAgentDisplayName === undefined ? null : (
          <Box flexShrink={0}>
            <ThinkingIndicator displayName={state.thinkingAgentDisplayName} />
          </Box>
        )}
        {[...state.output].reverse().map((output) => (
          <Box flexDirection="column" flexShrink={0} key={output.id}>
            <CompletedOutput output={output} />
          </Box>
        ))}
      </Box>
      {(state.subAgentActivity?.length ?? 0) > 0 &&
      shouldShowSubAgentTray(terminalRows, terminalColumns) ? (
        <SubAgentTray
          activity={state.subAgentActivity ?? []}
          terminalColumns={terminalColumns}
        />
      ) : null}
      <StatusBar
        sessionId={state.sessionId}
        tokenPercent={state.tokenPercent}
        activeAgentName={state.activeAgentName}
        {...(state.handoffWritten === undefined
          ? {}
          : { handoffWritten: state.handoffWritten })}
        {...(state.priorContextUsed === undefined
          ? {}
          : { priorContextUsed: state.priorContextUsed })}
      />
      {isSlashCommandPopupOpen(input, slashCommandPopupDismissed) ? (
        <SlashCommandPopup
          entries={filterSlashCommandEntries(sessionSlashCommandEntries, input)}
          maxVisibleEntries={Math.max(1, terminalRows - 18)}
          selectedIndex={selectedSlashCommandIndex}
        />
      ) : null}
      <SessionInput
        activeAgentName={state.activeAgentName}
        cursorIndex={cursorIndex}
        input={input}
      />
    </Box>
  );
  return (
    <ThemeProvider themeId={themeId}>
      <SessionLayout
        application={application}
        columns={terminalColumns}
        panel={state.panel}
        rows={terminalRows}
      />
    </ThemeProvider>
  );
}

import {
  AgentTabStrip,
  StatusBar,
  ThemeProvider,
  useTheme,
} from "@loom/tui/components";
import { FileWriteDiff } from "@loom/tui/file-diff";
import { MarkdownText, sanitizeTerminalText } from "@loom/tui/markdown";
import {
  type SlashCommandEntry,
  filterSlashCommandEntries,
  sessionSlashCommandEntries,
  shouldShowSlashCommandPopup,
} from "@loom/tui/slash-commands";
import { type BuiltInAgentName, builtInAgentTabs } from "@loom/tui/tab-strip";
import { type Theme, agentTabColor } from "@loom/tui/theme";
import { Box, type Key, Text, useInput, useStdout } from "ink";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

export type SessionOutput =
  | { id: string; kind: "plain"; text: string }
  | {
      id: string;
      kind: "assistant";
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
  priorContextUsed?: boolean;
  sessionId: string;
  thinkingAgentDisplayName?: string;
  tokenPercent: number;
  toolRunning?: { displayName: string; toolCount: number };
}

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

export function resolveTerminalRows(rows: number | undefined): number {
  return rows === undefined || rows <= 0 ? 24 : Math.max(rows, 12);
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

  appendAssistantOutput(displayName: string, content: string): void {
    this.#setState({
      ...this.#state,
      output: [
        ...this.#state.output,
        {
          id: this.#outputId(),
          kind: "assistant",
          displayName,
          content,
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

  beginToolRunning(displayName: string, toolCount: number): void {
    if (!Number.isInteger(toolCount) || toolCount <= 0) {
      throw new Error("toolCount must be a positive integer");
    }
    const { thinkingAgentDisplayName: _thinking, ...state } = this.#state;
    this.#setState({ ...state, toolRunning: { displayName, toolCount } });
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
  frame: number,
): string {
  const toolLabel = toolCount === 1 ? "tool" : "tools";
  return `${displayName}: Running ${toolCount} ${toolLabel}${".".repeat((frame % 3) + 1)}`;
}

export function ToolRunningIndicator({
  displayName,
  toolCount,
}: {
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
      {toolRunningIndicatorText(displayName, toolCount, frame)}
    </Text>
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
  input,
}: {
  activeAgentName: BuiltInAgentName;
  input: string;
}) {
  const theme = useTheme();
  const agentColor = agentTabColor(theme, activeAgentName);
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
        <Text>{formatSessionInput(input)}</Text>
      </Box>
      <Text color={theme.textTertiary} dimColor>
        Enter submit · Ctrl+J newline · Shift+Enter where supported
      </Text>
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
  const [selectedSlashCommandIndex, setSelectedSlashCommandIndex] = useState(0);
  const [slashCommandPopupDismissed, setSlashCommandPopupDismissed] =
    useState(false);
  const inputRef = useRef("");
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
  useEffect(() => {
    const updateTerminalRows = (): void =>
      setTerminalRows(resolveTerminalRows(stdout.rows));
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
    selectedSlashCommandIndexRef.current = 0;
    slashCommandPopupDismissedRef.current = false;
    setInput("");
    setSelectedSlashCommandIndex(0);
    setSlashCommandPopupDismissed(false);
  };
  useInput((character, key) => {
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
      slashCommandPopupDismissedRef.current = true;
      setInput(inputRef.current);
      setSlashCommandPopupDismissed(true);
      return;
    }
    if (shouldInsertInputNewline(character, key)) {
      inputRef.current = appendSessionInput(inputRef.current, "\n");
      historyIndexRef.current = historyRef.current.length;
      historyDraftRef.current = inputRef.current;
      selectedSlashCommandIndexRef.current = 0;
      slashCommandPopupDismissedRef.current = false;
      setInput(inputRef.current);
      setSelectedSlashCommandIndex(0);
      setSlashCommandPopupDismissed(false);
      return;
    }
    if (key.return) {
      submitInput();
      return;
    }
    if (key.backspace || key.delete) {
      inputRef.current = inputRef.current.slice(0, -1);
      historyIndexRef.current = historyRef.current.length;
      historyDraftRef.current = inputRef.current;
      selectedSlashCommandIndexRef.current = 0;
      slashCommandPopupDismissedRef.current = false;
      setInput(inputRef.current);
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
      inputRef.current = appendSessionInput(inputRef.current, chunk.text);
      if (chunk.submit) {
        submitInput();
        return;
      }
      historyIndexRef.current = historyRef.current.length;
      historyDraftRef.current = inputRef.current;
      selectedSlashCommandIndexRef.current = 0;
      slashCommandPopupDismissedRef.current = false;
      setInput(inputRef.current);
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

  return (
    <ThemeProvider themeId={themeId}>
      <Box flexDirection="column" height={terminalRows}>
        <AgentTabStrip tabs={builtInAgentTabs} activeIndex={activeIndex} />
        <Box
          flexDirection="column-reverse"
          flexGrow={1}
          overflowY="hidden"
          paddingX={1}
        >
          {state.liveAssistant === undefined ? null : (
            <Box flexDirection="column">
              <Text bold>{state.liveAssistant.displayName}</Text>
              <MarkdownText source={state.liveAssistant.text} />
            </Box>
          )}
          {state.toolRunning === undefined ? null : (
            <ToolRunningIndicator
              displayName={state.toolRunning.displayName}
              toolCount={state.toolRunning.toolCount}
            />
          )}
          {state.thinkingAgentDisplayName === undefined ? null : (
            <ThinkingIndicator displayName={state.thinkingAgentDisplayName} />
          )}
          {[...state.output].reverse().map((output) => (
            <CompletedOutput key={output.id} output={output} />
          ))}
        </Box>
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
            entries={filterSlashCommandEntries(
              sessionSlashCommandEntries,
              input,
            )}
            maxVisibleEntries={Math.max(1, terminalRows - 18)}
            selectedIndex={selectedSlashCommandIndex}
          />
        ) : null}
        <SessionInput activeAgentName={state.activeAgentName} input={input} />
      </Box>
    </ThemeProvider>
  );
}

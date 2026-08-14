import {
  AgentTabStrip,
  StatusBar,
  ThemeProvider,
  useTheme,
} from "@loom/tui/components";
import {
  type SlashCommandEntry,
  filterSlashCommandEntries,
  sessionSlashCommandEntries,
  shouldShowSlashCommandPopup,
} from "@loom/tui/slash-commands";
import { type BuiltInAgentName, builtInAgentTabs } from "@loom/tui/tab-strip";
import { Box, type Key, Static, Text, useInput } from "ink";
import { useRef, useState, useSyncExternalStore } from "react";

export interface SessionViewState {
  activeAgentName: BuiltInAgentName;
  liveAssistant?: { displayName: string; text: string };
  output: readonly string[];
  sessionId: string;
  tokenPercent: number;
}

type SessionViewListener = () => void;

export function consumeSessionInputChunk(
  current: string,
  chunk: string,
): { lines: string[]; remainder: string } {
  const parts = `${current}${chunk}`.split(/\r\n|\r|\n/);
  return {
    lines: parts.slice(0, -1),
    remainder: parts.at(-1) ?? "",
  };
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

export class SessionViewStore {
  readonly #listeners = new Set<SessionViewListener>();
  #state: SessionViewState;

  constructor(initialState: SessionViewState) {
    this.#state = initialState;
  }

  readonly getSnapshot = (): SessionViewState => this.#state;

  readonly subscribe = (listener: SessionViewListener): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  appendOutput(message: string): void {
    this.#setState({
      ...this.#state,
      output: [...this.#state.output, message],
    });
  }

  appendAssistantDelta(displayName: string, delta: string): void {
    const liveAssistant = this.#state.liveAssistant;
    this.#setState({
      ...this.#state,
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
    const { liveAssistant: _liveAssistant, ...state } = this.#state;
    this.#setState(state);
  }

  updateStatus(activeAgentName: BuiltInAgentName, tokenPercent: number): void {
    this.#setState({ ...this.#state, activeAgentName, tokenPercent });
  }

  #setState(state: SessionViewState): void {
    this.#state = state;
    for (const listener of this.#listeners) listener();
  }
}

export function SlashCommandPopup({
  entries,
  selectedIndex,
}: {
  entries: readonly SlashCommandEntry[];
  selectedIndex: number;
}) {
  const theme = useTheme();
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
        entries.map((entry, index) => (
          <Box key={entry.command} gap={1}>
            <Text color={theme.accent} bold={index === selectedIndex}>
              {index === selectedIndex ? "›" : " "}
            </Text>
            <Text color={theme.info} bold={index === selectedIndex}>
              {entry.command}
            </Text>
            <Text color={theme.textTertiary}>{entry.description}</Text>
          </Box>
        ))
      )}
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
  const selectedSlashCommandIndexRef = useRef(0);
  const slashCommandPopupDismissedRef = useRef(false);
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
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
        !isSlashCommandPopupOpen(
          inputRef.current,
          slashCommandPopupDismissedRef.current,
        )
      )
        return;
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
    if (key.return) {
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
      onSubmit(selectedEntry?.command ?? inputRef.current);
      inputRef.current = "";
      selectedSlashCommandIndexRef.current = 0;
      slashCommandPopupDismissedRef.current = false;
      setInput("");
      setSelectedSlashCommandIndex(0);
      setSlashCommandPopupDismissed(false);
      return;
    }
    if (key.backspace || key.delete) {
      inputRef.current = inputRef.current.slice(0, -1);
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
      const consumed = consumeSessionInputChunk(inputRef.current, character);
      for (const line of consumed.lines) onSubmit(line);
      inputRef.current = consumed.remainder;
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
      <>
        <Static items={[...state.output]} style={{ paddingX: 1 }}>
          {(message, index) => <Text key={index}>{message.trimEnd()}</Text>}
        </Static>
        <Box flexDirection="column">
          <AgentTabStrip tabs={builtInAgentTabs} activeIndex={activeIndex} />
          <Box flexDirection="column" paddingX={1}>
            {state.liveAssistant === undefined ? null : (
              <Text>
                {state.liveAssistant.displayName}: {state.liveAssistant.text}
              </Text>
            )}
          </Box>
          <StatusBar
            sessionId={state.sessionId}
            tokenPercent={state.tokenPercent}
            activeAgentName={state.activeAgentName}
          />
          {isSlashCommandPopupOpen(input, slashCommandPopupDismissed) ? (
            <SlashCommandPopup
              entries={filterSlashCommandEntries(
                sessionSlashCommandEntries,
                input,
              )}
              selectedIndex={selectedSlashCommandIndex}
            />
          ) : null}
          <Box paddingX={1}>
            <Text>&gt; {input}</Text>
          </Box>
        </Box>
      </>
    </ThemeProvider>
  );
}

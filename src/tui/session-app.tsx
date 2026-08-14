import { AgentTabStrip, StatusBar, ThemeProvider } from "@loom/tui/components";
import { type BuiltInAgentName, builtInAgentTabs } from "@loom/tui/tab-strip";
import { Box, Static, Text, useInput } from "ink";
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

export function SessionApp({
  onCycleAgent,
  onSubmit,
  store,
  themeId,
}: {
  onCycleAgent: () => void;
  onSubmit: (line: string) => void;
  store: SessionViewStore;
  themeId: string | undefined;
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef("");
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  useInput((character, key) => {
    if (key.tab) {
      onCycleAgent();
      return;
    }
    if (key.return) {
      onSubmit(inputRef.current);
      inputRef.current = "";
      setInput("");
      return;
    }
    if (key.backspace || key.delete) {
      inputRef.current = inputRef.current.slice(0, -1);
      setInput(inputRef.current);
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
      setInput(inputRef.current);
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
          <Box paddingX={1}>
            <Text>&gt; {input}</Text>
          </Box>
        </Box>
      </>
    </ThemeProvider>
  );
}

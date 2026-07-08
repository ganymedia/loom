import type { PromptMessage } from "@loom/prompt/run-prompt";

export const DEFAULT_RESPONSE_HEADROOM = 0.25;
export const DEFAULT_COMPRESSION_THRESHOLD = 0.75;
export const DEFAULT_OLD_TURNS_THRESHOLD = 8;
export const DEFAULT_RECALL_TRIM_MIN = 1;

export interface RecallContextBlock {
  id: string;
  content: string;
}

export interface PromptAssemblyBudget {
  contextLimit: number;
  responseHeadroom?: number;
  compressionThreshold?: number;
  oldTurnsThreshold?: number;
  recallTrimMin?: number;
}

export interface AssemblePromptOptions {
  systemPrompt: string;
  planState?: string;
  recall?: RecallContextBlock[];
  sessionHistory?: PromptMessage[];
  currentMessage: string | PromptMessage;
  budget: PromptAssemblyBudget;
  estimateTokens?: (content: string) => number;
}

export interface PromptAssemblyBudgetReport {
  contextLimit: number;
  budgetLimitTokens: number;
  compressionThresholdTokens: number;
  responseHeadroomTokens: number;
  estimatedTokens: number;
  compressionTriggered: boolean;
}

export interface PromptAssemblyReductions {
  omittedOldTurnCount: number;
  omittedRecallCount: number;
  planStateCompressed: boolean;
}

export interface AssembledPrompt {
  messages: PromptMessage[];
  budget: PromptAssemblyBudgetReport;
  reductions: PromptAssemblyReductions;
}

export class PromptAssemblyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromptAssemblyError";
  }
}

interface NormalizedBudget {
  contextLimit: number;
  responseHeadroom: number;
  compressionThreshold: number;
  oldTurnsThreshold: number;
  recallTrimMin: number;
  budgetLimitTokens: number;
  compressionThresholdTokens: number;
  responseHeadroomTokens: number;
}

function assertNonEmpty(value: string, name: string): void {
  if (value.trim().length === 0) {
    throw new PromptAssemblyError(`${name} must not be empty`);
  }
}

function assertRatio(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0 || value >= 1) {
    throw new PromptAssemblyError(
      `${name} must be greater than 0 and less than 1`,
    );
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new PromptAssemblyError(`${name} must be a non-negative integer`);
  }
}

function normalizeBudget(budget: PromptAssemblyBudget): NormalizedBudget {
  if (!Number.isInteger(budget.contextLimit) || budget.contextLimit <= 0) {
    throw new PromptAssemblyError("contextLimit must be a positive integer");
  }

  const responseHeadroom = budget.responseHeadroom ?? DEFAULT_RESPONSE_HEADROOM;
  const compressionThreshold =
    budget.compressionThreshold ?? DEFAULT_COMPRESSION_THRESHOLD;
  const oldTurnsThreshold =
    budget.oldTurnsThreshold ?? DEFAULT_OLD_TURNS_THRESHOLD;
  const recallTrimMin = budget.recallTrimMin ?? DEFAULT_RECALL_TRIM_MIN;

  assertRatio(responseHeadroom, "responseHeadroom");
  assertRatio(compressionThreshold, "compressionThreshold");
  assertNonNegativeInteger(oldTurnsThreshold, "oldTurnsThreshold");
  assertNonNegativeInteger(recallTrimMin, "recallTrimMin");

  const responseHeadroomTokens = Math.ceil(
    budget.contextLimit * responseHeadroom,
  );
  const compressionThresholdTokens = Math.floor(
    budget.contextLimit * compressionThreshold,
  );
  const budgetLimitTokens = Math.min(
    budget.contextLimit - responseHeadroomTokens,
    compressionThresholdTokens,
  );

  if (budgetLimitTokens <= 0) {
    throw new PromptAssemblyError("budget leaves no room for prompt context");
  }

  return {
    contextLimit: budget.contextLimit,
    responseHeadroom,
    compressionThreshold,
    oldTurnsThreshold,
    recallTrimMin,
    budgetLimitTokens,
    compressionThresholdTokens,
    responseHeadroomTokens,
  };
}

function defaultEstimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

function estimateMessages(
  messages: PromptMessage[],
  estimateTokens: (content: string) => number,
): number {
  return messages.reduce(
    (total, message) => total + estimateTokens(message.content),
    0,
  );
}

function normalizeCurrentMessage(
  message: string | PromptMessage,
): PromptMessage {
  if (typeof message === "string") {
    assertNonEmpty(message, "currentMessage");
    return { role: "user", content: message };
  }

  assertNonEmpty(message.content, "currentMessage.content");
  return message;
}

function formatPlanState(planState: string): string {
  return `Current plan state:\n${planState}`;
}

function compressPlanState(planState: string): string {
  const oneLine = planState.replace(/\s+/g, " ").trim();
  return `Current plan state: ${oneLine.slice(0, 240)}${
    oneLine.length > 240 ? "…" : ""
  }`;
}

function formatRecall(recall: RecallContextBlock[]): string {
  const lines = recall.map(
    (block, index) => `${index + 1}. [${block.id}] ${block.content}`,
  );
  return `Relevant recall:\n${lines.join("\n")}`;
}

function buildMessages(parts: {
  systemPrompt: string;
  planState: string | undefined;
  recall: RecallContextBlock[];
  sessionHistory: PromptMessage[];
  currentMessage: PromptMessage;
}): PromptMessage[] {
  const messages: PromptMessage[] = [
    { role: "system", content: parts.systemPrompt },
  ];

  if (parts.planState !== undefined && parts.planState.trim().length > 0) {
    messages.push({ role: "system", content: parts.planState });
  }

  if (parts.recall.length > 0) {
    messages.push({ role: "system", content: formatRecall(parts.recall) });
  }

  messages.push(...parts.sessionHistory);
  messages.push(parts.currentMessage);
  return messages;
}

function oldTurnIndexes(
  sessionHistory: PromptMessage[],
  oldTurnsThreshold: number,
): number[] {
  const recentStart = Math.max(0, sessionHistory.length - 4);
  const eligibleEnd = Math.min(recentStart, oldTurnsThreshold);
  return Array.from({ length: eligibleEnd }, (_value, index) => index);
}

export function assemblePrompt(
  options: AssemblePromptOptions,
): AssembledPrompt {
  assertNonEmpty(options.systemPrompt, "systemPrompt");
  const normalizedBudget = normalizeBudget(options.budget);
  const estimateTokens = options.estimateTokens ?? defaultEstimateTokens;
  const currentMessage = normalizeCurrentMessage(options.currentMessage);
  const sessionHistory = [...(options.sessionHistory ?? [])];
  const recall = [...(options.recall ?? [])];
  let planState =
    options.planState !== undefined && options.planState.trim().length > 0
      ? formatPlanState(options.planState)
      : undefined;

  const reductions: PromptAssemblyReductions = {
    omittedOldTurnCount: 0,
    omittedRecallCount: 0,
    planStateCompressed: false,
  };

  const build = (): PromptMessage[] =>
    buildMessages({
      systemPrompt: options.systemPrompt,
      planState,
      recall,
      sessionHistory,
      currentMessage,
    });

  let messages = build();
  const initialEstimate = estimateMessages(messages, estimateTokens);

  if (initialEstimate > normalizedBudget.budgetLimitTokens) {
    for (const index of oldTurnIndexes(
      sessionHistory,
      normalizedBudget.oldTurnsThreshold,
    ).reverse()) {
      sessionHistory.splice(index, 1);
      reductions.omittedOldTurnCount += 1;
      messages = build();
      if (
        estimateMessages(messages, estimateTokens) <=
        normalizedBudget.budgetLimitTokens
      ) {
        break;
      }
    }
  }

  while (
    recall.length > normalizedBudget.recallTrimMin &&
    estimateMessages(messages, estimateTokens) >
      normalizedBudget.budgetLimitTokens
  ) {
    recall.pop();
    reductions.omittedRecallCount += 1;
    messages = build();
  }

  if (
    planState !== undefined &&
    estimateMessages(messages, estimateTokens) >
      normalizedBudget.budgetLimitTokens
  ) {
    planState = compressPlanState(planState);
    reductions.planStateCompressed = true;
    messages = build();
  }

  const estimatedTokens = estimateMessages(messages, estimateTokens);
  if (estimatedTokens > normalizedBudget.budgetLimitTokens) {
    throw new PromptAssemblyError(
      `Assembled prompt requires ${estimatedTokens} tokens but budget allows ${normalizedBudget.budgetLimitTokens}`,
    );
  }

  return {
    messages,
    budget: {
      contextLimit: normalizedBudget.contextLimit,
      budgetLimitTokens: normalizedBudget.budgetLimitTokens,
      compressionThresholdTokens: normalizedBudget.compressionThresholdTokens,
      responseHeadroomTokens: normalizedBudget.responseHeadroomTokens,
      estimatedTokens,
      compressionTriggered:
        initialEstimate > normalizedBudget.compressionThresholdTokens,
    },
    reductions,
  };
}

export const DEFAULT_HANDOFF_THRESHOLD = 0.8;

export interface SessionManagerOptions {
  sessionId: string;
  contextLimit: number;
  handoffThreshold?: number;
}

export interface TokenUsageInput {
  promptTokens: number;
  completionTokens: number;
}

export interface SessionTurnUsage extends TokenUsageInput {
  turnIndex: number;
  totalTokens: number;
  cumulativeTokens: number;
  contextLimit: number;
  usageRatio: number;
  handoffRequired: boolean;
}

export interface HandoffDecision {
  required: boolean;
  reason?: string;
  sessionId: string;
  contextLimit: number;
  cumulativeTokens: number;
  thresholdTokens: number;
  usageRatio: number;
}

export interface SessionTokenState {
  sessionId: string;
  contextLimit: number;
  handoffThreshold: number;
  cumulativePromptTokens: number;
  cumulativeCompletionTokens: number;
  cumulativeTokens: number;
  turns: SessionTurnUsage[];
  handoffRequired: boolean;
}

export class SessionManager {
  private readonly sessionId: string;
  private readonly contextLimit: number;
  private readonly handoffThreshold: number;
  private readonly turns: SessionTurnUsage[] = [];
  private cumulativePromptTokens = 0;
  private cumulativeCompletionTokens = 0;
  private handoffRequired = false;

  constructor(options: SessionManagerOptions) {
    assertPositiveInteger(options.contextLimit, "contextLimit");
    const handoffThreshold =
      options.handoffThreshold ?? DEFAULT_HANDOFF_THRESHOLD;
    if (handoffThreshold <= 0 || handoffThreshold > 1) {
      throw new Error(
        "handoffThreshold must be greater than 0 and less than or equal to 1",
      );
    }

    this.sessionId = options.sessionId;
    this.contextLimit = options.contextLimit;
    this.handoffThreshold = handoffThreshold;
  }

  recordTurn(usage: TokenUsageInput): SessionTurnUsage {
    assertNonNegativeInteger(usage.promptTokens, "promptTokens");
    assertNonNegativeInteger(usage.completionTokens, "completionTokens");

    const totalTokens = usage.promptTokens + usage.completionTokens;
    this.cumulativePromptTokens += usage.promptTokens;
    this.cumulativeCompletionTokens += usage.completionTokens;
    const cumulativeTokens = this.cumulativeTokens();
    const usageRatio = cumulativeTokens / this.contextLimit;
    this.handoffRequired =
      this.handoffRequired || usageRatio >= this.handoffThreshold;

    const turn: SessionTurnUsage = {
      turnIndex: this.turns.length,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens,
      cumulativeTokens,
      contextLimit: this.contextLimit,
      usageRatio,
      handoffRequired: this.handoffRequired,
    };
    this.turns.push(turn);
    return turn;
  }

  currentDecision(): HandoffDecision {
    const thresholdTokens = Math.ceil(
      this.contextLimit * this.handoffThreshold,
    );
    const cumulativeTokens = this.cumulativeTokens();
    const usageRatio = cumulativeTokens / this.contextLimit;
    const required =
      this.handoffRequired || usageRatio >= this.handoffThreshold;
    return {
      required,
      ...(required
        ? {
            reason: `Session ${this.sessionId} reached ${formatPercent(usageRatio)} of the context limit`,
          }
        : {}),
      sessionId: this.sessionId,
      contextLimit: this.contextLimit,
      cumulativeTokens,
      thresholdTokens,
      usageRatio,
    };
  }

  snapshot(): SessionTokenState {
    return {
      sessionId: this.sessionId,
      contextLimit: this.contextLimit,
      handoffThreshold: this.handoffThreshold,
      cumulativePromptTokens: this.cumulativePromptTokens,
      cumulativeCompletionTokens: this.cumulativeCompletionTokens,
      cumulativeTokens: this.cumulativeTokens(),
      turns: [...this.turns],
      handoffRequired: this.currentDecision().required,
    };
  }

  private cumulativeTokens(): number {
    return this.cumulativePromptTokens + this.cumulativeCompletionTokens;
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

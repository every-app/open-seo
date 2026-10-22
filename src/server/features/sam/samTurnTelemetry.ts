import type {
  ChatErrorContext,
  StepContext,
  ToolCallResultContext,
} from "@cloudflare/think";
import type { UIMessage } from "ai";
import { captureServerError, captureServerEvent } from "@/server/lib/posthog";

type SamTurnStatus =
  | "completed"
  | "aborted"
  | "error"
  | "refused"
  | "interrupted";

type SamRefusalReason = "no_session" | "credits" | "no_access";

// Tool failures reach the model as a `{ error }` output rather than a thrown
// error (samChatTools adaptMcpTool / scrapeTools), so Think reports them as
// successful calls; look at the output shape as well as the outcome.
function toolCallFailed(ctx: ToolCallResultContext): boolean {
  if (!ctx.success) return true;
  const output: unknown = ctx.output;
  return (
    typeof output === "object" &&
    output !== null &&
    "error" in output &&
    typeof output.error === "string"
  );
}

/**
 * Everything one SAM turn does, accumulated from Think's hooks and flattened
 * into the `sam:turn` event at the end. One instance per turn; `turnId` is the
 * PostHog LLM-analytics trace id, the `turn_id` on every tool call the turn
 * makes, and the join key between the two.
 */
export class SamTurnStats {
  readonly turnId = crypto.randomUUID();
  readonly startedAt = Date.now();
  private lastStepEndedAt = this.startedAt;
  continuation = false;
  refusal: SamRefusalReason | null = null;
  reported = false;
  model: string | null = null;
  steps = 0;
  inputTokens = 0;
  outputTokens = 0;
  reasoningTokens = 0;
  cachedInputTokens = 0;
  costUsd = 0;
  credits = 0;
  compactions = 0;
  toolCalls = 0;
  toolFailures = 0;
  toolMs = 0;
  private readonly tools = new Set<string>();

  /**
   * Fold one inference step in and return its `$ai_generation` body. Cost is
   * recorded separately (recordSpend) because compaction summaries spend
   * outside the step loop.
   */
  recordStep(ctx: StepContext, costUsd: number): Record<string, unknown> {
    const now = Date.now();
    const latencySeconds = (now - this.lastStepEndedAt) / 1000;
    this.lastStepEndedAt = now;
    const { usage } = ctx;
    const reasoning =
      usage.outputTokenDetails.reasoningTokens ?? usage.reasoningTokens ?? 0;
    const cached =
      usage.inputTokenDetails.cacheReadTokens ?? usage.cachedInputTokens ?? 0;
    this.model = ctx.response.modelId;
    this.steps += 1;
    this.inputTokens += usage.inputTokens ?? 0;
    this.outputTokens += usage.outputTokens ?? 0;
    this.reasoningTokens += reasoning;
    this.cachedInputTokens += cached;
    return {
      $ai_trace_id: this.turnId,
      $ai_parent_id: this.turnId,
      $ai_span_id: crypto.randomUUID(),
      $ai_span_name: `step ${this.steps}`,
      $ai_provider: "openrouter",
      $ai_model: ctx.response.modelId,
      $ai_input_tokens: usage.inputTokens ?? 0,
      $ai_output_tokens: usage.outputTokens ?? 0,
      $ai_reasoning_tokens: reasoning,
      $ai_cache_read_input_tokens: cached,
      $ai_total_cost_usd: costUsd,
      $ai_latency: latencySeconds,
      $ai_is_error: false,
      $ai_tools_called: ctx.toolCalls.map((call) => call.toolName).join(","),
      finish_reason: ctx.finishReason,
    };
  }

  recordToolCall(ctx: ToolCallResultContext): void {
    this.toolCalls += 1;
    this.toolMs += ctx.toolExecutionMs;
    this.tools.add(ctx.toolName);
    if (toolCallFailed(ctx)) this.toolFailures += 1;
  }

  recordSpend(costUsd: number): void {
    this.costUsd += costUsd;
  }

  /** The `sam:turn` event body. */
  properties(status: SamTurnStatus): Record<string, unknown> {
    return {
      turn_id: this.turnId,
      status,
      refusal_reason: this.refusal,
      continuation: this.continuation,
      model: this.model,
      steps: this.steps,
      tool_calls: this.toolCalls,
      tool_failures: this.toolFailures,
      tools: [...this.tools],
      tool_ms: this.toolMs,
      input_tokens: this.inputTokens,
      output_tokens: this.outputTokens,
      reasoning_tokens: this.reasoningTokens,
      cached_input_tokens: this.cachedInputTokens,
      cost_usd: this.costUsd,
      credits: this.credits,
      compactions: this.compactions,
      duration_ms: Date.now() - this.startedAt,
    };
  }

  /** The `$ai_trace` event body: what PostHog's LLM-analytics UI groups by. */
  traceProperties(
    status: SamTurnStatus,
    error?: string,
  ): Record<string, unknown> {
    return {
      $ai_trace_id: this.turnId,
      $ai_span_name: "sam_turn",
      $ai_provider: "openrouter",
      $ai_model: this.model,
      $ai_latency: (Date.now() - this.startedAt) / 1000,
      $ai_is_error: status === "error",
      $ai_error: error,
      status,
    };
  }
}

// The slice of the DO's session context telemetry needs: who to attribute
// events to and which org/project they belong to.
type SamIdentity = {
  row: { userId: string };
  project: { id: string; organizationId: string };
};

function skillName(input: unknown): string | undefined {
  return typeof input === "object" &&
    input !== null &&
    "name" in input &&
    typeof input.name === "string"
    ? input.name
    : undefined;
}

/**
 * The SAM Durable Object's telemetry seam: owns the turn in flight and turns
 * Think's hooks into PostHog events (`sam:turn`, `$ai_generation`/`$ai_trace`
 * for the LLM-analytics UI, `sam:skill_activated`) and error captures. Every
 * event carries `source: "in_app_agent"` plus session/project ids so it
 * filters the same way as the mcp:tool_call events the turn's tools emit.
 *
 * Captures go through `waitUntil`, not a bare void: the PostHog client
 * flushes on shutdown, and a fire-and-forget promise on a turn's last step
 * can be cancelled before that flush happens.
 */
export class SamTelemetry {
  private current: SamTurnStats | null = null;

  constructor(
    private readonly sessionId: () => string,
    // Resolved lazily (and cached by the caller): a memory-limit kill wakes a
    // fresh DO whose session row is not loaded when recovery reports.
    private readonly identity: () => Promise<SamIdentity | null>,
    private readonly waitUntil: (promise: Promise<unknown>) => void,
  ) {}

  get turn(): SamTurnStats | null {
    return this.current;
  }

  beginTurn(continuation: boolean): SamTurnStats {
    const turn = new SamTurnStats();
    turn.continuation = continuation;
    this.current = turn;
    return turn;
  }

  spend(costUsd: number): void {
    this.current?.recordSpend(costUsd);
  }

  compaction(): void {
    if (this.current) this.current.compactions += 1;
  }

  step(ctx: StepContext, costUsd: number): void {
    const turn = this.current;
    // Refusals answer through the canned model: no provider call to trace.
    if (!turn || turn.refusal) return;
    this.waitUntil(
      this.capture("$ai_generation", turn.recordStep(ctx, costUsd)),
    );
  }

  // Skill activations are Think-internal tools (activate_skill), so they never
  // pass through the MCP instrumentation that reports every other SAM tool
  // call; mirror its event shape so both land in the same dashboards.
  toolCall(ctx: ToolCallResultContext): void {
    this.current?.recordToolCall(ctx);
    if (ctx.toolName !== "activate_skill") return;
    this.waitUntil(
      this.capture("sam:skill_activated", {
        skill: skillName(ctx.input),
        success: ctx.success,
        duration_ms: ctx.durationMs,
        turn_id: this.current?.turnId,
      }),
    );
  }

  /**
   * Emit the turn's `sam:turn` event (and its `$ai_trace` when a model ran),
   * once per turn. Think fires onChatError before the response hook for a
   * failed turn, so the error path reports and the response hook then finds
   * the turn already reported. `synthesize` is for turns that end with no
   * armed stats — a parse/persist failure before beforeTurn, or a memory-
   * limit kill that reset the DO — which are reported from an empty stats
   * object so they still count. A gate refusal completes like any other
   * turn (the canned model streams it) and is reported as "refused".
   */
  async report(
    outcome: SamTurnStatus,
    extra: Record<string, unknown>,
    messages: readonly UIMessage[],
    {
      synthesize = false,
      billing,
    }: { synthesize?: boolean; billing?: Promise<void> } = {},
  ): Promise<void> {
    let turn = this.current;
    if (!turn || turn.reported) {
      if (!synthesize) return;
      turn = new SamTurnStats();
    }
    turn.reported = true;
    const status: SamTurnStatus =
      outcome === "completed" && turn.refusal ? "refused" : outcome;
    const userMessages = messages.filter((m) => m.role === "user").length;
    const properties = {
      ...turn.properties(status),
      message_count: messages.length,
      first_turn: userMessages <= 1,
      ...extra,
      credits: turn.credits,
    };
    const error = extra.error_name;
    const trace =
      turn.steps > 0
        ? turn.traceProperties(
            status,
            typeof error === "string" ? error : undefined,
          )
        : null;
    // Reserve this turn and snapshot its timing before billing settles. The
    // next turn can start while the final credit deduction is still pending.
    await billing;
    properties.credits = turn.credits;
    console.log("[sam] turn", { session_id: this.sessionId(), ...properties });
    await this.capture("sam:turn", properties);
    if (trace) {
      await this.capture("$ai_trace", trace);
    }
  }

  error(
    error: unknown,
    ctx: ChatErrorContext | undefined,
    messages: readonly UIMessage[],
    billing?: Promise<void>,
  ): void {
    const errorName = error instanceof Error ? error.name : typeof error;
    this.waitUntil(
      this.report(
        "error",
        {
          request_id: ctx?.requestId,
          error_stage: ctx?.stage,
          error_class: ctx?.classification,
          // No message: model and tool errors can quote the user's content.
          error_name: errorName,
        },
        messages,
        { synthesize: true, billing },
      ),
    );
    // A user-cancelled turn is an abort, not a failure worth an issue.
    if (errorName !== "AbortError") {
      this.captureError(error, {
        stage: ctx?.stage,
        classification: ctx?.classification,
      });
    }
  }

  /** Report a server-side failure to PostHog error tracking. */
  captureError(
    error: unknown,
    properties: Record<string, string | undefined>,
  ): void {
    this.waitUntil(
      this.identity().then((identity) =>
        captureServerError(
          error,
          {
            source: "sam",
            session_id: this.sessionId(),
            turn_id: this.current?.turnId,
            ...properties,
          },
          identity?.row.userId,
        ),
      ),
    );
  }

  private async capture(
    event: string,
    properties: Record<string, unknown>,
  ): Promise<void> {
    const identity = await this.identity();
    if (!identity) return;
    await captureServerEvent({
      distinctId: identity.row.userId,
      event,
      organizationId: identity.project.organizationId,
      properties: {
        source: "in_app_agent",
        session_id: this.sessionId(),
        project_id: identity.project.id,
        ...properties,
      },
    });
  }
}

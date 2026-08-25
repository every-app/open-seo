import { Think } from "@cloudflare/think";
import type {
  ChatErrorContext,
  ChatResponseResult,
  Session,
  StepContext,
  ToolCallResultContext,
  TurnConfig,
  TurnContext,
} from "@cloudflare/think";
import { clearChatTerminal } from "agents/chat";
import type { UIMessage } from "ai";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, withPgClient } from "@/db";
import { user } from "@/db/schema";
import {
  openRouterCostUsd,
  staticAssistantModel,
} from "@/server/lib/chatAgent";
import { SamSessionRepository } from "@/server/features/sam/SamSessionRepository";
import { ProjectContextService } from "@/server/features/project-context/services/ProjectContextService";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { buildSamMcpTools } from "@/server/features/sam/samChatTools";
import { buildSamSkillSource } from "@/server/features/sam/samSkills";
import { buildSamSystemPrompt } from "@/server/features/sam/samSystemPrompt";
import { buildChatAgentModel } from "@/server/lib/openrouter";
import {
  getEnvValueSync,
  isHostedServerAuthMode,
} from "@/server/lib/runtime-env";
import {
  checkUsageCreditsDepleted,
  trackUsageCreditSpend,
} from "@/server/billing/subscription";
import { captureServerEvent } from "@/server/lib/posthog";
import { getPublicOrigin } from "@/server/mcp/public-origin";
import { MCP_SCOPE } from "@/lib/oauth-resource";
import type { ToolAuthContext } from "@/server/mcp/context";

// SAM's read-only view of the project's shared memory. The block has no `set`
// provider, so Think exposes no set_context tool for it; writes go through the
// update_project_context tool, the same one MCP clients and the settings UI use.
const PROJECT_CONTEXT_BLOCK = "project_context";

const PUBLIC_ORIGIN_KEY = "sam-public-origin";

// Derive a short session title from the first user message.
function deriveTitle(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return "New chat";
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
}

function firstUserText(messages: UIMessage[]): string {
  const firstUser = messages.find((message) => message.role === "user");
  const textPart = firstUser?.parts.find((part) => part.type === "text");
  return textPart?.text ?? "";
}

type SamContext = {
  row: NonNullable<
    Awaited<ReturnType<typeof SamSessionRepository.getSessionById>>
  >;
  project: NonNullable<
    Awaited<ReturnType<typeof ProjectRepository.getProjectById>>
  >;
  // The session row is normalized (project/user ids only); the creating
  // user's current email is resolved here for the billing/MCP auth context.
  userEmail: string;
};

/**
 * Durable Object backing the SAM in-app agent, built on Think. One DO per chat
 * session (Think hosts one conversation per instance); the DO instance name IS
 * the session id, set by the client (`useAgent({ name: sessionId })`) and
 * authorized in the Worker (`onBeforeConnect`) before any connection reaches
 * here — so the DO trusts that its caller may act on `this.name` and derives
 * project/user from the sam_sessions row (and the org from the project).
 *
 * Think owns the agentic loop (streaming, persistence, compaction-ready
 * history, context blocks); this subclass contributes the model, the MCP
 * toolset, the billing gate/metering, and project-scoped memory: the
 * "project_context" block renders the project's shared memory, which every
 * session in the project — and the MCP server and settings UI — reads and
 * writes through ProjectContextService.
 */
export class SamChatAgent extends Think {
  // SAM's toolset is the MCP tools from beforeTurn; it has no use for Think's
  // workspace bash tool, whose just-bash dependency is stubbed out of the
  // bundle anyway (see vite.config.ts) to keep ~30 MB of eagerly-evaluated
  // source out of every isolate's baseline heap.
  override workspaceBash = false;

  // Session row + project, resolved once per DO lifetime (the binding is
  // immutable). Null until a turn/provider needs it — and left null when the
  // registry row is gone, which beforeTurn turns into a polite refusal.
  private samContext: SamContext | null = null;

  // Per-turn billing state: beforeTurn arms it (non-null = hosted mode, meter
  // this turn), onStepFinish accumulates the OpenRouter cost, onChatResponse
  // meters the spend.
  private turnCostUsd = 0;
  private turnMonthlyRemaining: number | null = null;

  /** Permanently remove this session's transcript for an account erasure. */
  async destroyForErasure(): Promise<void> {
    for (const socket of this.ctx.getWebSockets()) {
      socket.close(1000, "Account erased");
    }
    this.cancelAllChats();
    await this.waitUntilStable({ timeout: 5000 });
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  // Record the app origin for the deep links tools attach to responses,
  // derived from the requests this DO serves instead of env config. DO storage
  // (not an instance field) because the DO hibernates: a turn can arrive as a
  // WS message on a wake-up where fetch() never ran. Reads are served from
  // workerd's in-process cache and unchanged puts are deduped, so this costs
  // nothing per turn.
  async fetch(request: Request): Promise<Response> {
    await this.ctx.storage.put(PUBLIC_ORIGIN_KEY, getPublicOrigin(request));
    return super.fetch(request);
  }

  getModel() {
    const apiKey = getEnvValueSync(this.env, "OPENROUTER_API_KEY");
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is required for the SAM agent");
    }
    return buildChatAgentModel(
      apiKey,
      getEnvValueSync(this.env, "OPENROUTER_MODEL"),
    );
  }

  override getSkills() {
    return [buildSamSkillSource()];
  }

  // Skill activations are Think-internal tools (activate_skill), so they never
  // pass through the MCP instrumentation that reports every other SAM tool
  // call; mirror its event shape so both land in the same dashboards.
  override afterToolCall(ctx: ToolCallResultContext) {
    if (ctx.toolName !== "activate_skill" || !this.samContext) return;
    const input: unknown = ctx.input;
    const skill =
      typeof input === "object" &&
      input !== null &&
      "name" in input &&
      typeof input.name === "string"
        ? input.name
        : undefined;
    // ctx.waitUntil, not a bare void: the PostHog client flushes on shutdown,
    // and a fire-and-forget promise on a turn's last step can be cancelled
    // before that flush happens.
    this.ctx.waitUntil(
      captureServerEvent({
        distinctId: this.samContext.row.userId,
        event: "sam:skill_activated",
        organizationId: this.samContext.project.organizationId,
        properties: {
          skill,
          success: ctx.success,
          duration_ms: ctx.durationMs,
          project_id: this.samContext.project.id,
          source: "in_app_agent",
        },
      }),
    );
  }

  configureSession(session: Session): Session {
    return session
      .withContext("soul", {
        provider: { get: () => this.buildSoulPrompt() },
      })
      .withContext(PROJECT_CONTEXT_BLOCK, {
        description:
          "This project's shared memory — sections, competitors, key pages and research log, the same records the user sees in the app. Change it with update_project_context.",
        provider: { get: () => this.renderProjectContext() },
      });
  }

  private async loadSamContext(): Promise<SamContext | null> {
    if (this.samContext) return this.samContext;
    const row = await SamSessionRepository.getSessionById(this.name);
    if (!row) return null;
    const project = await ProjectRepository.getProjectById(row.projectId);
    if (!project) return null;
    const [creator] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, row.userId))
      .limit(1);
    if (!creator) return null;
    this.samContext = { row, project, userEmail: creator.email };
    return this.samContext;
  }

  // The identity block. Runs through the context-block pipeline like the
  // project-memory block, so it re-renders (fresh project row, intake mode
  // on/off) whenever the prompt is refreshed.
  private buildSoulPrompt(): Promise<string> {
    return withPgClient(async () => {
      const ctx = await this.loadSamContext();
      if (!ctx) {
        return "You are SAM, the SEO agent inside OpenSEO. This chat session no longer exists; tell the user to start a new chat.";
      }
      const context = await ProjectContextService.getProjectContext(
        ctx.project.id,
      );
      return buildSamSystemPrompt(
        {
          projectId: ctx.project.id,
          projectName: ctx.project.name,
          domain: ctx.project.domain,
          locationCode: ctx.project.locationCode,
          languageCode: ctx.project.languageCode,
        },
        // Nothing recorded about the business yet: SAM runs its intake flow.
        { intakeMode: context.missingSections.includes("business_overview") },
      );
    });
  }

  // The project-memory block. Scopes its own Postgres client: providers are
  // invoked from Think's internals, so no ambient withPgClient scope can be
  // assumed (no-op in D1 mode).
  private renderProjectContext(): Promise<string | null> {
    return withPgClient(async () => {
      const ctx = await this.loadSamContext();
      if (!ctx) return null;
      return ProjectContextService.renderProjectContextMarkdown(
        await ProjectContextService.getProjectContext(ctx.project.id),
      );
    });
  }

  // Gates swap the model for one turn: the canned model streams the refusal
  // back through Think's normal pipeline (rendered and persisted like any
  // assistant message) without calling a provider, so a refusal is free even
  // when users script them. The old version made a real 200-token call, which
  // MiniMax M3 could spend entirely on reasoning tokens — leaving the user a
  // truncated chain-of-thought and no reply (issue #161).
  private refusalTurn(text: string): TurnConfig {
    return { model: staticAssistantModel(text) };
  }

  async beforeTurn(_ctx: TurnContext): Promise<TurnConfig> {
    this.turnCostUsd = 0;
    this.turnMonthlyRemaining = null;
    return withPgClient(async (): Promise<TurnConfig> => {
      const ctx = await this.loadSamContext();
      if (!ctx) {
        return this.refusalTurn(
          "I couldn't find this chat session. Please start a new one.",
        );
      }

      // Gate every turn on credits in hosted mode: SAM is open to every plan
      // (including free), and LLM tokens plus DataForSEO tool calls all draw
      // down the org's credit balance. Self-hosted brings its own provider
      // keys and has no Autumn balance, so it's ungated. Depletion is
      // confirmed against a second Autumn read path before refusing — a
      // stale check reading here once locked a paying customer out of chat.
      const { organizationId } = ctx.project;
      if (await isHostedServerAuthMode()) {
        const { depleted, monthlyRemaining } = await checkUsageCreditsDepleted({
          userId: ctx.row.userId,
          userEmail: ctx.userEmail,
          organizationId,
          projectId: ctx.project.id,
        });
        if (depleted) {
          return this.refusalTurn(
            "You're out of credits. Top up to keep using SAM.",
          );
        }
        this.turnMonthlyRemaining = monthlyRemaining;
      }

      const baseUrl =
        (await this.ctx.storage.get<string>(PUBLIC_ORIGIN_KEY)) ??
        "https://app.openseo.so";
      const authContext: ToolAuthContext = {
        userId: ctx.row.userId,
        userEmail: ctx.userEmail,
        organizationId,
        baseUrl,
        clientId: null,
        scopes: [MCP_SCOPE],
      };

      return {
        tools: buildSamMcpTools(authContext, {
          id: ctx.project.id,
          domain: ctx.project.domain,
        }),
        // SAM is meant to run complex multi-step work in one turn (site-read
        // intake plus a full research chain, multi-competitor sweeps), so give
        // it generous headroom — cost is bounded by per-step metering and the
        // model stopping on its own, not by this cap.
        maxSteps: 48,
        maxOutputTokens: 6000,
      };
    });
  }

  onStepFinish(ctx: StepContext): void {
    this.turnCostUsd += openRouterCostUsd(ctx.providerMetadata);
  }

  async onChatResponse(result: ChatResponseResult): Promise<void> {
    await withPgClient(async () => {
      const ctx = await this.loadSamContext();
      if (!ctx) return;

      if (this.turnMonthlyRemaining !== null) {
        await trackUsageCreditSpend({
          customer: {
            userId: ctx.row.userId,
            userEmail: ctx.userEmail,
            organizationId: ctx.project.organizationId,
            projectId: ctx.project.id,
          },
          customerId: ctx.project.organizationId,
          creditFeature: "agent",
          costUsd: this.turnCostUsd,
          monthlyRemaining: this.turnMonthlyRemaining,
          properties: { provider: "openrouter" },
        });
      }

      // Name the session from its first message so the side-panel is readable.
      if (ctx.row.title === "New chat") {
        const title = deriveTitle(firstUserText(this.messages));
        if (title !== "New chat") {
          await SamSessionRepository.setTitle(ctx.row.id, title);
          ctx.row.title = title;
        }
      } else {
        await SamSessionRepository.touch(ctx.row.id);
      }
    });

    // Re-render the blocks so context written during this turn — or by another
    // session, the settings UI, or an MCP client — is in the prompt by the next
    // turn. One withPgClient scope covers both providers (their own defensive
    // scopes reuse it). Best-effort — never fail the response.
    if (result.status === "completed") {
      await withPgClient(() => this.session.refreshSystemPrompt()).catch(
        (error: unknown) => {
          console.error("[sam] context refresh failed", error);
        },
      );
    }
  }

  // The return value becomes the stored chat-terminal body that reconnecting
  // clients replay — returning nothing would make it the string "undefined".
  onChatError(error: unknown, ctx?: ChatErrorContext): unknown {
    console.error("[sam] chat turn error", ctx?.stage, error);
    return error;
  }

  // POST .../rewind {messageId}: delete that message and everything after it on
  // the active branch. Backs the client's undo (rewind past a user message) and
  // edit (rewind, then resend the edited text). Authorized in the Worker like
  // every other HTTP request to this DO. Think's own onRequest wrapper handles
  // /get-messages before delegating here.
  async onRequest(request: Request): Promise<Response> {
    if (
      request.method === "POST" &&
      new URL(request.url).pathname.endsWith("/rewind")
    ) {
      const body = z
        .object({ messageId: z.string().min(1) })
        .safeParse(await request.json().catch(() => null));
      if (!body.success) {
        return Response.json({ error: "messageId required" }, { status: 400 });
      }
      const { messageId } = body.data;
      // A rewind can race an in-flight turn (the user undoes while the agent
      // is still working, e.g. after the stream stalled client-side). Abort
      // the turn and wait for it to settle BEFORE deleting, or its still-
      // running loop keeps streaming chunks and persists a fresh assistant
      // message right after the delete — an orphaned reply to nothing.
      this.cancelAllChats();
      await this.waitUntilStable({ timeout: 5000 });
      const index = this.messages.findIndex(
        (message) => message.id === messageId,
      );
      if (index === -1) {
        return Response.json({ error: "message not found" }, { status: 404 });
      }
      const ids = this.messages.slice(index).map((message) => message.id);
      await this.session.deleteMessages(ids);
      // Drop the stored how-the-last-turn-ended record too. It exists so a
      // reconnecting client can learn the last turn errored — but that turn
      // was just undone, and leaving it makes every future connection replay
      // a "Something went wrong" for a message that no longer exists.
      await clearChatTerminal(this.ctx.storage);
      return Response.json({ ok: true });
    }
    return super.onRequest(request);
  }
}

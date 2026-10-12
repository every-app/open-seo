import { env } from "cloudflare:workers";
import { z } from "zod";
import { runBatch } from "@/db/runBatch";
import {
  checkUsageCreditsDepleted,
  type BillingCustomerContext,
} from "@/server/billing/subscription";
import { ProjectContextRepository } from "@/server/features/project-context/repositories/ProjectContextRepository";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { researchWebsite } from "@/server/features/projects/services/websiteResearch";
import {
  WEBSITE_UNREADABLE_MESSAGE,
  websiteResearchSchema,
  type WebsiteResearch,
} from "@/types/schemas/projectWebsite";
import { AppError } from "@/server/lib/errors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { AiVisibilityRepository as repo } from "../repositories/AiVisibilityRepository";
import {
  writeConfiguration,
  writeResearchKeywords,
} from "../repositories/aiVisibilityConfigurationRepository";
import {
  prepareWebsiteTracking,
  startWebsiteTrackingRun,
} from "./websiteTrackingSetup";

/**
 * Prompt Research needs saved keywords. Website setup writes them; a
 * project set up before that, or with a website saved another way, gets them
 * here after the user confirms the spend. The paid work runs in the AI
 * visibility workflow under one instance per project, so a page reload reads
 * the same run instead of starting another. Without an overview or
 * competitors, the website research result waits in the instance output for
 * the same competitor review as onboarding; saving that review writes the
 * keywords.
 */
const setupOutputSchema = z.object({
  // Reviews saved before suggested keywords existed still load.
  review: websiteResearchSchema
    .extend({
      suggestedKeywords: websiteResearchSchema.shape.suggestedKeywords.default(
        [],
      ),
    })
    .nullable(),
});
const setupInstanceId = (projectId: string) => `ai-research-setup-${projectId}`;
const RUNNING = ["queued", "running", "waiting", "waitingForPause", "paused"];

/** Setup researches only what is missing; the progress steps follow these. */
function missingContext(sections: { key: string }[], competitors: unknown[]) {
  return {
    missingOverview: !sections.some(
      (section) => section.key === "business_overview",
    ),
    missingCompetitors: !competitors.length,
  };
}

async function readSetupRun(projectId: string) {
  const instance = await env.AI_VISIBILITY_WORKFLOW.get(
    setupInstanceId(projectId),
  ).catch(() => null);
  const status = await instance?.status().catch(() => null);
  if (!instance || !status) return { instance: null, status: "none" as const };
  if (RUNNING.includes(status.status))
    return { instance, status: "running" as const };
  // Only a known cause leaves the server; other workflow errors stay generic.
  if (status.status !== "complete")
    return {
      instance,
      status: "failed" as const,
      failure: status.error?.message.includes(WEBSITE_UNREADABLE_MESSAGE)
        ? ("website_unreadable" as const)
        : null,
    };
  const review = setupOutputSchema.safeParse(status.output).data?.review;
  return review
    ? { instance, status: "review" as const, review }
    : { instance, status: "none" as const };
}

export async function getAiResearchSetup(projectId: string) {
  const [keywords, sections, competitors] = await Promise.all([
    repo.listResearchKeywords(projectId),
    ProjectContextRepository.listSections(projectId),
    ProjectContextRepository.listCompetitors(projectId),
  ]);
  const run = keywords.length
    ? { status: "ready" as const }
    : await readSetupRun(projectId);
  return {
    keywords,
    ...missingContext(sections, competitors),
    status: run.status,
    review: "review" in run ? run.review : null,
    failure: "failure" in run ? run.failure : null,
  };
}

/** Starts the paid setup once; a running or reviewable run is left as is. */
export async function startAiResearchSetup(
  input: { projectId: string },
  customer: BillingCustomerContext,
  // In-app onboarding runs seeded tracking once. MCP setup never spends on
  // answers. A restarted setup keeps the flag it was first started with.
  { runSeededTracking = false } = {},
) {
  const setup = await getAiResearchSetup(input.projectId);
  if (setup.status !== "none" && setup.status !== "failed") return setup;
  // Any user with > 0 shared usage credits can start and complete this task.
  // Once admitted, never recheck or reserve credits during research: finish
  // all model calls and searches, then bill actual spend, allowing a negative balance.
  if (
    (await isHostedServerAuthMode()) &&
    (await checkUsageCreditsDepleted(customer)).depleted
  )
    throw new AppError(
      "INSUFFICIENT_CREDITS",
      "You need usage credits to set up AI visibility.",
    );
  const { instance } = await readSetupRun(input.projectId);
  if (instance) await instance.restart();
  else
    await env.AI_VISIBILITY_WORKFLOW.create({
      id: setupInstanceId(input.projectId),
      // Only the billing fields: the request context is not serializable.
      params: {
        setupProjectId: input.projectId,
        runSeededTracking,
        customer: {
          organizationId: customer.organizationId,
          userId: customer.userId,
          userEmail: customer.userEmail,
          projectId: input.projectId,
        },
      },
    });
  return { ...setup, status: "running" as const, failure: null };
}

/** The paid setup itself. Runs in the AI visibility workflow, once per start. */
export async function runAiResearchSetup(
  input: { projectId: string },
  customer: BillingCustomerContext,
  { runSeededTracking = false } = {},
): Promise<{ review: WebsiteResearch | null }> {
  const project = await ProjectRepository.getProjectForOrganization(
    input.projectId,
    customer.organizationId,
  );
  if (!project) throw new AppError("NOT_FOUND");
  if (!project.domain)
    throw new AppError(
      "VALIDATION_ERROR",
      "Set your project's website before generating keywords.",
    );
  const [keywords, sections, competitors] = await Promise.all([
    repo.listResearchKeywords(input.projectId),
    ProjectContextRepository.listSections(input.projectId),
    ProjectContextRepository.listCompetitors(input.projectId),
  ]);
  // Website setup may have saved keywords since this run started.
  if (keywords.length) return { review: null };
  const review = await researchWebsite(project.domain, project, {
    ...customer,
    projectId: input.projectId,
  });
  // Only newly researched basics/competitors need review. Existing context
  // stays authoritative; a topics-only result can be saved directly.
  const missing = missingContext(sections, competitors);
  if (missing.missingOverview || missing.missingCompetitors) return { review };
  const topics = review.suggestedTopics;
  // Like website setup, the first three topics seed tracking only when the
  // project has none yet.
  const tracking = await prepareWebsiteTracking(
    { projectId: input.projectId, suggestedTopics: topics },
    project,
  );
  await runBatch((tx) => [
    ...(tracking ? writeConfiguration(tx, tracking) : []),
    ...writeResearchKeywords(tx, input.projectId, [
      ...topics.map((topic) => topic.name),
      ...review.suggestedKeywords,
    ]),
  ]);
  if (tracking && runSeededTracking)
    await startWebsiteTrackingRun(input.projectId, customer);
  return { review: null };
}

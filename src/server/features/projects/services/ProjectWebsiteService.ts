import { waitUntil } from "cloudflare:workers";
import {
  checkUsageCreditsDepleted,
  type BillingCustomerContext,
} from "@/server/billing/subscription";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import type { ContextAuthor } from "@/types/schemas/projectContext";
import { ProjectContextRepository } from "@/server/features/project-context/repositories/ProjectContextRepository";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { saveWebsiteSetup } from "@/server/features/projects/repositories/ProjectWebsiteRepository";
import { researchWebsite } from "@/server/features/projects/services/websiteResearch";
import { normalizeBacklinksTarget } from "@/server/lib/dataforseoBacklinksTarget";
import { AppError } from "@/server/lib/errors";
import {
  prepareWebsiteTracking,
  startWebsiteTrackingRun,
} from "@/server/features/ai-visibility/services/websiteTrackingSetup";
import {
  saveProjectWebsiteSetupSchema,
  type SaveProjectWebsiteSetup,
} from "@/types/schemas/projectWebsite";

async function requireProject(
  customer: BillingCustomerContext,
  projectId: string,
) {
  const project = await ProjectRepository.getProjectForOrganization(
    projectId,
    customer.organizationId,
  );
  if (!project) throw new AppError("NOT_FOUND");
  return project;
}
async function research(
  projectId: string,
  website: string,
  customer: BillingCustomerContext,
) {
  const project = await requireProject(customer, projectId);
  // Any positive credit balance admits the whole research task. Its model
  // calls and searches finish before billing, even if the balance goes negative.
  if (
    (await isHostedServerAuthMode()) &&
    (await checkUsageCreditsDepleted(customer)).depleted
  )
    throw new AppError(
      "INSUFFICIENT_CREDITS",
      "You need usage credits to research your website.",
    );
  const work = researchWebsite(website, project, { ...customer, projectId });
  // Keep provider work and final settlement alive within the request's
  // background grace period if the client disconnects, as the shared meter does.
  waitUntil(work.catch(() => undefined));
  return work;
}
async function save(
  input: SaveProjectWebsiteSetup,
  customer: BillingCustomerContext,
  author: ContextAuthor,
  // In-app onboarding runs seeded tracking once. MCP setup never spends;
  // agents get approval before a run.
  { runSeededTracking = false } = {},
) {
  const accepted = saveProjectWebsiteSetupSchema.parse(input);
  const project = await requireProject(customer, accepted.projectId);
  accepted.name = project.name;
  accepted.domain =
    project.domain ??
    normalizeBacklinksTarget(accepted.domain, {
      scope: "domain",
    }).apiTarget;
  const existing = await ProjectContextRepository.listCompetitors(
    accepted.projectId,
  );
  // A saved competitor list is authoritative, even if it was added while
  // research was running or the review was open. Setup never edits that list.
  if (existing.length) accepted.competitors = [];
  for (const competitor of accepted.competitors) {
    competitor.domain = normalizeBacklinksTarget(competitor.domain, {
      scope: "domain",
    }).apiTarget;
    if (competitor.domain === accepted.domain)
      throw new AppError(
        "VALIDATION_ERROR",
        "Your own website cannot be a competitor.",
      );
  }
  // Keep one reviewed entry per normalized domain.
  accepted.competitors = [
    ...new Map(accepted.competitors.map((row) => [row.domain, row])).values(),
  ];
  const tracking = await prepareWebsiteTracking(accepted, project);
  await saveWebsiteSetup(customer.organizationId, accepted, author, tracking);
  if (tracking && runSeededTracking)
    await startWebsiteTrackingRun(accepted.projectId, customer);
  return requireProject(customer, accepted.projectId);
}
export const ProjectWebsiteService = { research, save };

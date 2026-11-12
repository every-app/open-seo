// Opt-in lifecycle for a project's web analytics site.

import { AppError } from "@/server/lib/errors";
import { WebAnalyticsRepository } from "../repositories/WebAnalyticsRepository";
import { clearSiteCache } from "./WebAnalyticsIngestService";

interface WebAnalyticsStatus {
  enabled: boolean;
  siteId: string | null;
}

async function getStatus(projectId: string): Promise<WebAnalyticsStatus> {
  const site = await WebAnalyticsRepository.getByProjectId(projectId);
  return { enabled: site !== null, siteId: site?.id ?? null };
}

async function enable(input: {
  projectId: string;
  organizationId: string;
  domain: string | null;
}): Promise<WebAnalyticsStatus> {
  const existing = await WebAnalyticsRepository.getByProjectId(input.projectId);
  if (existing) return { enabled: true, siteId: existing.id };

  if (!input.domain) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Set your project's site domain before enabling web analytics.",
    );
  }

  // Public site id: unguessable, decoupled from the internal project id.
  const id = crypto.randomUUID().replaceAll("-", "");
  await WebAnalyticsRepository.create({
    id,
    projectId: input.projectId,
    organizationId: input.organizationId,
    createdAt: new Date().toISOString(),
  });
  return { enabled: true, siteId: id };
}

async function disable(projectId: string): Promise<WebAnalyticsStatus> {
  // Deleting the site row cascades to sessions and events; the collected
  // data is gone. The UI states this explicitly before calling.
  await WebAnalyticsRepository.removeByProjectId(projectId);
  clearSiteCache();
  return { enabled: false, siteId: null };
}

export const WebAnalyticsSiteService = {
  getStatus,
  enable,
  disable,
};

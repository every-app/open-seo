import { IndexNowService } from "@/server/features/indexnow/services/IndexNowService";
import { IndexNowConfigRepository } from "@/server/features/indexnow/repositories/IndexNowConfigRepository";
import { IndexingEventRepository } from "@/server/features/indexnow/repositories/IndexingEventRepository";
import { discoverSiteUrls } from "@/server/lib/scrape";
import {
  configuredHost,
  INDEXNOW_WEBHOOK_MAX_PROJECTS,
  INDEXNOW_WEBHOOK_MAX_URLS_PER_PROJECT,
  isAuthorized,
  jsonResponse,
  parseAllowedHosts,
  parsePayload,
  recentUrls,
  type WebhookEvent,
  uniqueUrlsForHost,
} from "@/server/features/indexnow/webhook-utils";

export {
  INDEXNOW_WEBHOOK_DEDUPE_WINDOW_MS,
  INDEXNOW_WEBHOOK_MAX_BODY_BYTES,
  INDEXNOW_WEBHOOK_MAX_PROJECTS,
  INDEXNOW_WEBHOOK_MAX_URLS,
  INDEXNOW_WEBHOOK_MAX_URLS_PER_PROJECT,
} from "@/server/features/indexnow/webhook-utils";

type WebhookConfig = {
  projectId: string;
  host: string;
  enabled: boolean;
};

type DiscoveryResult = {
  urls: string[];
  blocked: boolean;
};

type SubmitResult = {
  submitted: number;
  failed: number;
};

export type IndexNowWebhookDependencies = {
  listEnabledConfigs: () => Promise<WebhookConfig[]>;
  listRecentSuccessfulByProjectId: (
    projectId: string,
  ) => Promise<WebhookEvent[]>;
  discoverUrls: (host: string, limit: number) => Promise<DiscoveryResult>;
  submitUrls: (input: {
    projectId: string;
    urls: string[];
  }) => Promise<SubmitResult>;
  now: () => number;
};

export type IndexNowWebhookOptions = {
  secret: string | undefined;
  allowedHosts: string | readonly string[] | undefined;
  dependencies?: Partial<IndexNowWebhookDependencies>;
};

type WebhookProjectResult = {
  projectId: string;
  candidateUrls: number;
  dedupedUrls: number;
  submitted: number;
  failed: number;
  skipped: number;
  error: boolean;
};

type WebhookResponse = {
  accepted: true;
  projectsProcessed: number;
  projectsSkipped: number;
  submitted: number;
  failed: number;
  deduped: number;
  skipped: number;
  errors: number;
  projects: WebhookProjectResult[];
};

function defaultDependencies(): IndexNowWebhookDependencies {
  return {
    listEnabledConfigs: () => IndexNowConfigRepository.listEnabled(),
    listRecentSuccessfulByProjectId: (projectId) =>
      IndexingEventRepository.listRecentSuccessfulByProjectId(projectId),
    discoverUrls: (host, limit) => discoverSiteUrls(host, limit),
    submitUrls: (input) => IndexNowService.submitUrls(input),
    now: () => Date.now(),
  };
}

export async function handleIndexNowWebhookRequest(
  request: Request,
  options: IndexNowWebhookOptions,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const secret = options.secret?.trim();
  if (!secret) {
    return jsonResponse({ error: "IndexNow webhook is not configured." }, 503);
  }

  const allowed = parseAllowedHosts(options.allowedHosts);
  if (allowed.invalid || allowed.hosts.size === 0) {
    return jsonResponse(
      { error: "IndexNow webhook hosts are not configured." },
      503,
    );
  }

  if (!(await isAuthorized(request, secret))) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  const parsedPayload = await parsePayload(request);
  if (!parsedPayload.ok) return parsedPayload.response;

  const dependencies = {
    ...defaultDependencies(),
    ...options.dependencies,
  };

  let configs: WebhookConfig[];
  try {
    configs = await dependencies.listEnabledConfigs();
  } catch {
    return jsonResponse(
      { error: "Unable to load IndexNow configuration." },
      500,
    );
  }

  const response: WebhookResponse = {
    accepted: true,
    projectsProcessed: 0,
    projectsSkipped: 0,
    submitted: 0,
    failed: 0,
    deduped: 0,
    skipped: 0,
    errors: 0,
    projects: [],
  };

  const configsToProcess = configs.slice(0, INDEXNOW_WEBHOOK_MAX_PROJECTS);
  response.projectsSkipped += Math.max(
    configs.length - configsToProcess.length,
    0,
  );

  for (const config of configsToProcess) {
    const host = configuredHost(config.host);
    if (!config.enabled || !host || !allowed.hosts.has(host)) {
      response.projectsSkipped += 1;
      continue;
    }

    response.projectsProcessed += 1;
    let candidateUrls: string[];
    try {
      const discovered = parsedPayload.payload.hasUrls
        ? { urls: parsedPayload.payload.urls, blocked: false }
        : await dependencies.discoverUrls(
            config.host,
            INDEXNOW_WEBHOOK_MAX_URLS_PER_PROJECT,
          );
      candidateUrls = discovered.blocked
        ? []
        : uniqueUrlsForHost(discovered.urls, host).slice(
            0,
            INDEXNOW_WEBHOOK_MAX_URLS_PER_PROJECT,
          );
    } catch {
      response.errors += 1;
      response.projects.push({
        projectId: config.projectId,
        candidateUrls: 0,
        dedupedUrls: 0,
        submitted: 0,
        failed: 0,
        skipped: 0,
        error: true,
      });
      continue;
    }

    if (candidateUrls.length === 0) {
      response.projects.push({
        projectId: config.projectId,
        candidateUrls: 0,
        dedupedUrls: 0,
        submitted: 0,
        failed: 0,
        skipped: 0,
        error: false,
      });
      continue;
    }

    let recent: Set<string>;
    try {
      const events = await dependencies.listRecentSuccessfulByProjectId(
        config.projectId,
      );
      recent = recentUrls(events, dependencies.now());
    } catch {
      response.errors += 1;
      response.projects.push({
        projectId: config.projectId,
        candidateUrls: candidateUrls.length,
        dedupedUrls: 0,
        submitted: 0,
        failed: 0,
        skipped: 0,
        error: true,
      });
      continue;
    }

    const freshUrls = candidateUrls.filter((url) => !recent.has(url));
    const dedupedCount = candidateUrls.length - freshUrls.length;
    response.deduped += dedupedCount;

    if (freshUrls.length === 0) {
      response.projects.push({
        projectId: config.projectId,
        candidateUrls: candidateUrls.length,
        dedupedUrls: dedupedCount,
        submitted: 0,
        failed: 0,
        skipped: 0,
        error: false,
      });
      continue;
    }

    try {
      const result = await dependencies.submitUrls({
        projectId: config.projectId,
        urls: freshUrls,
      });
      response.submitted += result.submitted;
      response.failed += result.failed;
      response.projects.push({
        projectId: config.projectId,
        candidateUrls: candidateUrls.length,
        dedupedUrls: dedupedCount,
        submitted: result.submitted,
        failed: result.failed,
        skipped: 0,
        error: false,
      });
    } catch {
      response.errors += 1;
      response.projects.push({
        projectId: config.projectId,
        candidateUrls: candidateUrls.length,
        dedupedUrls: dedupedCount,
        submitted: 0,
        failed: 0,
        skipped: freshUrls.length,
        error: true,
      });
    }
  }

  response.skipped = response.projects.reduce(
    (total, project) => total + project.skipped,
    0,
  );
  return jsonResponse(response);
}

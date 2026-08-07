import { AppError } from "@/server/lib/errors";
import {
  createIndexNowClient,
  IndexNowApiError,
} from "@/server/lib/indexnowClient";
import {
  INDEXNOW_MAX_ATTEMPTS,
  INDEXNOW_QUEUE_BATCH_SIZE,
  INDEXNOW_RETRY_DELAYS_MS,
} from "@/shared/indexnow";
import {
  IndexNowConfigRepository,
  type IndexNowConfig,
} from "@/server/features/indexnow/repositories/IndexNowConfigRepository";
import {
  IndexingEventRepository,
  type IndexingEvent,
} from "@/server/features/indexnow/repositories/IndexingEventRepository";

const MAX_RESPONSE_BODY_LENGTH = 1_000;

export class IndexNowNotConfiguredError extends Error {
  constructor(public readonly projectId: string) {
    super("IndexNow is not configured for this project");
    this.name = "IndexNowNotConfiguredError";
  }
}

export class IndexNowDisabledError extends Error {
  constructor(public readonly projectId: string) {
    super("IndexNow is disabled for this project");
    this.name = "IndexNowDisabledError";
  }
}

type SubmitUrlsResult = {
  submitted: number;
  failed: number;
  events: IndexingEvent[];
};

function truncate(value: string | undefined | null): string | null {
  if (!value) return null;
  return value.slice(0, MAX_RESPONSE_BODY_LENGTH);
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requireConfig(projectId: string): Promise<IndexNowConfig> {
  const config = await IndexNowConfigRepository.getByProjectId(projectId);
  if (!config) throw new IndexNowNotConfiguredError(projectId);
  return config;
}

async function submitUrls(input: {
  projectId: string;
  urls: string[];
}): Promise<SubmitUrlsResult> {
  if (input.urls.length === 0) {
    throw new AppError("VALIDATION_ERROR", "Submit at least one URL.");
  }

  const config = await requireConfig(input.projectId);
  if (!config.enabled) throw new IndexNowDisabledError(input.projectId);

  const client = createIndexNowClient();
  const submittedEvents: IndexingEvent[] = [];

  for (const urlBatch of chunks(input.urls, INDEXNOW_QUEUE_BATCH_SIZE)) {
    const pendingEvents = await Promise.all(
      urlBatch.map((url) =>
        IndexingEventRepository.insert({
          projectId: config.projectId,
          organizationId: config.organizationId,
          url,
          eventType: "submitted",
          status: "pending",
        }),
      ),
    );

    let result: {
      httpStatus: number;
      responseBody: string;
    } | null = null;
    let failure: unknown = null;

    for (let attempt = 0; attempt < INDEXNOW_MAX_ATTEMPTS; attempt += 1) {
      await Promise.all(
        pendingEvents.map((event) =>
          IndexingEventRepository.markAttempted(event.id),
        ),
      );

      try {
        const submission = await client.submitUrls({
          host: config.host,
          key: config.key,
          keyLocation: config.keyLocation,
          urlList: urlBatch,
        });
        result = {
          httpStatus: submission.httpStatus,
          responseBody: submission.responseBody,
        };
        break;
      } catch (error) {
        failure = error;
        const retryable =
          (error instanceof IndexNowApiError && error.retryable) ||
          !(error instanceof IndexNowApiError);
        if (!retryable || attempt === INDEXNOW_MAX_ATTEMPTS - 1) break;
        await sleep(INDEXNOW_RETRY_DELAYS_MS[attempt] ?? 1_000);
      }
    }

    if (result) {
      const events = await Promise.all(
        pendingEvents.map((event) =>
          IndexingEventRepository.markResult(event.id, {
            eventType: "submitted",
            status: "success",
            httpStatus: result?.httpStatus,
            responseBody: truncate(result?.responseBody),
          }),
        ),
      );
      submittedEvents.push(
        ...events.filter((event): event is IndexingEvent => event !== null),
      );
      continue;
    }

    const httpStatus =
      failure instanceof IndexNowApiError ? failure.status : null;
    const responseBody =
      failure instanceof IndexNowApiError
        ? truncate(failure.body ?? failure.message)
        : truncate(failure instanceof Error ? failure.message : String(failure));
    const events = await Promise.all(
      pendingEvents.map((event) =>
        IndexingEventRepository.markResult(event.id, {
          eventType: "failed",
          status: "error",
          httpStatus,
          responseBody,
        }),
      ),
    );
    submittedEvents.push(
      ...events.filter((event): event is IndexingEvent => event !== null),
    );
  }

  return {
    submitted: submittedEvents.filter((event) => event.status === "success")
      .length,
    failed: submittedEvents.filter((event) => event.status === "error").length,
    events: submittedEvents,
  };
}

async function getQueue(input: {
  projectId: string;
  limit?: number;
  offset?: number;
}): Promise<IndexingEvent[]> {
  return IndexingEventRepository.listByProjectId(input.projectId, {
    limit: Math.min(Math.max(input.limit ?? 100, 1), 500),
    offset: input.offset,
  });
}

async function verifyKey(input: { projectId: string }): Promise<{
  verified: boolean;
  keyLocation: string;
  event: IndexingEvent | null;
}> {
  const config = await requireConfig(input.projectId);
  const event = await IndexingEventRepository.insert({
    projectId: config.projectId,
    organizationId: config.organizationId,
    url: config.keyLocation,
    eventType: "verified",
    status: "pending",
  });
  await IndexingEventRepository.markAttempted(event.id);

  try {
    const response = await fetch(config.keyLocation, { method: "GET" });
    const body = await response.text().catch(() => "");
    if (!response.ok) {
      const error = new IndexNowApiError(
        response.status,
        `IndexNow key file returned HTTP ${response.status}.`,
        body,
      );
      const result = await IndexingEventRepository.markResult(event.id, {
        eventType: "failed",
        status: "error",
        httpStatus: error.status,
        responseBody: truncate(error.body ?? error.message),
      });
      return { verified: false, keyLocation: config.keyLocation, event: result };
    }
    if (body.trim() !== config.key.trim()) {
      const result = await IndexingEventRepository.markResult(event.id, {
        eventType: "failed",
        status: "error",
        httpStatus: response.status,
        responseBody: "Key file did not contain the configured IndexNow key.",
      });
      return { verified: false, keyLocation: config.keyLocation, event: result };
    }
    const result = await IndexingEventRepository.markResult(event.id, {
      eventType: "verified",
      status: "success",
      httpStatus: response.status,
      responseBody: "IndexNow key verified.",
    });
    return { verified: true, keyLocation: config.keyLocation, event: result };
  } catch (error) {
    const result = await IndexingEventRepository.markResult(event.id, {
      eventType: "failed",
      status: "error",
      responseBody: truncate(error instanceof Error ? error.message : String(error)),
    });
    return { verified: false, keyLocation: config.keyLocation, event: result };
  }
}

async function getConfig(projectId: string): Promise<IndexNowConfig | null> {
  return IndexNowConfigRepository.getByProjectId(projectId);
}

async function setConfig(input: {
  projectId: string;
  organizationId: string;
  host: string;
  key: string;
  keyLocation: string;
  enabled?: boolean;
}): Promise<IndexNowConfig> {
  const host = input.host.trim();
  const key = input.key.trim();
  const keyLocation = input.keyLocation.trim();
  if (!host || !key || !keyLocation) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Host, key, and key location are required.",
    );
  }
  const existing = await IndexNowConfigRepository.getByProjectId(input.projectId);
  return IndexNowConfigRepository.upsert({
    projectId: input.projectId,
    organizationId: input.organizationId,
    host,
    key,
    keyLocation,
    enabled: input.enabled ?? existing?.enabled ?? true,
  });
}

async function disable(projectId: string): Promise<IndexNowConfig | null> {
  const config = await IndexNowConfigRepository.getByProjectId(projectId);
  if (!config) return null;
  return IndexNowConfigRepository.upsert({
    projectId: config.projectId,
    organizationId: config.organizationId,
    host: config.host,
    key: config.key,
    keyLocation: config.keyLocation,
    enabled: false,
  });
}

export const IndexNowService = {
  submitUrls,
  getQueue,
  verifyKey,
  getConfig,
  setConfig,
  disable,
};

import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

import {
  handleIndexNowWebhookRequest,
  INDEXNOW_WEBHOOK_DEDUPE_WINDOW_MS,
  type IndexNowWebhookDependencies,
} from "@/server/features/indexnow/webhook";

const SECRET = "webhook-secret";
const NOW = Date.parse("2026-08-07T12:00:00.000Z");

function request(body?: unknown, secret = SECRET): Request {
  return new Request("https://app.example/api/webhooks/indexnow", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-indexnow-webhook-secret": secret,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function config() {
  return {
    projectId: "project-1",
    host: "example.com",
    enabled: true,
  };
}

function dependencies(
  overrides: Partial<IndexNowWebhookDependencies> = {},
): IndexNowWebhookDependencies {
  return {
    listEnabledConfigs: async () => [config()],
    listRecentSuccessfulByProjectId: async () => [],
    discoverUrls: async () => ({ urls: [], blocked: false }),
    submitUrls: async () => ({ submitted: 0, failed: 0 }),
    now: () => NOW,
    ...overrides,
  };
}

async function responseBody(
  response: Response,
): Promise<Record<string, unknown>> {
  return response.json();
}

describe("handleIndexNowWebhookRequest", () => {
  it("rejects requests without the shared secret before loading projects", async () => {
    const listEnabledConfigs = vi.fn(async () => [config()]);

    const response = await handleIndexNowWebhookRequest(request({}, "wrong"), {
      secret: SECRET,
      allowedHosts: ["example.com"],
      dependencies: { listEnabledConfigs },
    });

    expect(response.status).toBe(401);
    expect(listEnabledConfigs).not.toHaveBeenCalled();
  });

  it("rejects private payload URLs before any submission", async () => {
    const submitUrls = vi.fn(async () => ({ submitted: 1, failed: 0 }));
    const discoverUrls = vi.fn(async () => ({ urls: [], blocked: false }));

    const response = await handleIndexNowWebhookRequest(
      request({ urls: ["http://127.0.0.1/admin"] }),
      {
        secret: SECRET,
        allowedHosts: ["example.com"],
        dependencies: dependencies({ submitUrls, discoverUrls }),
      },
    );

    expect(response.status).toBe(400);
    expect(submitUrls).not.toHaveBeenCalled();
    expect(discoverUrls).not.toHaveBeenCalled();
  });

  it("submits changed URLs once and deduplicates a repeated webhook", async () => {
    const submittedEvents: Array<{
      url: string;
      eventType: "submitted";
      status: "success";
      createdAt: string;
    }> = [];
    const submitUrls = vi.fn(async ({ urls }: { urls: string[] }) => {
      submittedEvents.push(
        ...urls.map((url) => ({
          url,
          eventType: "submitted" as const,
          status: "success" as const,
          createdAt: new Date(NOW).toISOString(),
        })),
      );
      return { submitted: urls.length, failed: 0 };
    });
    const listRecentSuccessfulByProjectId = vi.fn(async () => submittedEvents);

    const options = {
      secret: SECRET,
      allowedHosts: ["example.com"],
      dependencies: dependencies({
        listRecentSuccessfulByProjectId,
        submitUrls,
      }),
    };

    const first = await handleIndexNowWebhookRequest(
      request({ urls: ["https://example.com/page#section"] }),
      options,
    );
    const second = await handleIndexNowWebhookRequest(
      request({ urls: ["https://example.com/page"] }),
      options,
    );

    expect(first.status).toBe(200);
    expect(await responseBody(first)).toMatchObject({
      submitted: 1,
      deduped: 0,
    });
    expect(second.status).toBe(200);
    expect(await responseBody(second)).toMatchObject({
      submitted: 0,
      deduped: 1,
    });
    expect(submitUrls).toHaveBeenCalledTimes(1);
    expect(listRecentSuccessfulByProjectId).toHaveBeenCalledTimes(2);
  });

  it("does not deduplicate ledger events outside the short window", async () => {
    const submitUrls = vi.fn(async () => ({ submitted: 1, failed: 0 }));
    const listRecentSuccessfulByProjectId = vi.fn(async () => [
      {
        url: "https://example.com/page",
        eventType: "submitted" as const,
        status: "success" as const,
        createdAt: new Date(
          NOW - INDEXNOW_WEBHOOK_DEDUPE_WINDOW_MS - 1,
        ).toISOString(),
      },
    ]);

    const response = await handleIndexNowWebhookRequest(
      request({ urls: ["https://example.com/page"] }),
      {
        secret: SECRET,
        allowedHosts: ["example.com"],
        dependencies: dependencies({
          listRecentSuccessfulByProjectId,
          submitUrls,
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(await responseBody(response)).toMatchObject({
      submitted: 1,
      deduped: 0,
    });
    expect(submitUrls).toHaveBeenCalledTimes(1);
  });
});

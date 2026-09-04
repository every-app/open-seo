import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudflareAnalyticsClient } from "./CloudflareAnalyticsClient";
import { CloudflareAnalyticsError } from "./CloudflareAnalyticsError";
import { createCloudflareAnalyticsService } from "./CloudflareAnalyticsService";

const repository = vi.hoisted(() => ({
  getByProjectId: vi.fn(),
  replace: vi.fn(),
  disconnect: vi.fn(),
  capabilitiesFromConnection: vi.fn(),
}));
const vault = vi.hoisted(() => ({
  isConfigured: vi.fn(),
  encrypt: vi.fn(),
  decrypt: vi.fn(),
}));

vi.mock("./CloudflareAnalyticsRepository", () => ({
  CloudflareAnalyticsRepository: repository,
}));
vi.mock("./CloudflareCredentialVault", () => ({
  CloudflareCredentialVault: vault,
}));

const now = new Date("2026-09-04T12:00:00.000Z");
const capabilities = {
  traffic: { available: true, reason: null },
  securityEvents: { available: true, reason: null },
  crawlerAccess: { available: true, reason: null },
};
const connection = {
  id: "connection-1",
  projectId: "project-1",
  organizationId: "org-1",
  encryptedApiToken: "ciphertext",
  tokenHint: "••••oken",
  zoneId: "a".repeat(32),
  zoneLabel: "example.com",
  trafficAvailable: true,
  trafficReason: null,
  securityEventsAvailable: true,
  securityEventsReason: null,
  crawlerAccessAvailable: true,
  crawlerAccessReason: null,
  connectedByUserId: "user-1",
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
};

function client(overrides: Partial<CloudflareAnalyticsClient> = {}) {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test double implements the complete client surface
  return {
    traffic: vi.fn(),
    securityEvents: vi.fn(),
    crawlerAccess: vi.fn(),
    ...overrides,
  } as CloudflareAnalyticsClient;
}

beforeEach(() => {
  vi.clearAllMocks();
  repository.getByProjectId.mockResolvedValue(connection);
  repository.capabilitiesFromConnection.mockReturnValue(capabilities);
  repository.replace.mockResolvedValue("connection-2");
  vault.isConfigured.mockResolvedValue(true);
  vault.encrypt.mockResolvedValue("ciphertext-new");
  vault.decrypt.mockResolvedValue("provider-token");
});

describe("CloudflareAnalyticsService connection", () => {
  it("returns metadata without ciphertext or plaintext tokens", async () => {
    const result =
      await createCloudflareAnalyticsService().getConnection("project-1");

    expect(result).toMatchObject({
      connected: true,
      tokenHint: "••••oken",
      zoneId: "a".repeat(32),
    });
    expect(JSON.stringify(result)).not.toMatch(/ciphertext|provider-token/);
  });

  it("validates and encrypts before save while optional datasets fail independently", async () => {
    const traffic = vi.fn(async () => ({
      data: { viewer: { zones: [{ httpRequestsAdaptiveGroups: [] }] } },
      errors: [],
    }));
    const service = createCloudflareAnalyticsService({
      now: () => now,
      client: client({
        traffic,
        securityEvents: vi.fn(async () => {
          throw new CloudflareAnalyticsError(
            "dataset_unavailable",
            "Unavailable on plan",
          );
        }),
        crawlerAccess: vi.fn(async () => ({
          data: { viewer: { zones: [{ googlebot: [], bingbot: [] }] } },
          errors: [],
        })),
      }),
    });
    const result = await service.connect({
      projectId: "project-1",
      organizationId: "org-1",
      userId: "user-1",
      apiToken: "provider-secret-token",
      zoneId: "a".repeat(32),
      zoneLabel: "example.com",
    });

    expect(vault.encrypt).toHaveBeenCalledWith("provider-secret-token");
    expect(traffic).toHaveBeenCalled();
    expect(repository.replace).toHaveBeenCalledWith({
      projectId: "project-1",
      organizationId: "org-1",
      encryptedApiToken: "ciphertext-new",
      tokenHint: "••••oken",
      zoneId: "a".repeat(32),
      zoneLabel: "example.com",
      capabilities: {
        traffic: { available: true, reason: null },
        securityEvents: {
          available: false,
          reason: "dataset_unavailable",
        },
        crawlerAccess: { available: true, reason: null },
      },
      connectedByUserId: "user-1",
      now: now.toISOString(),
    });
    expect(result.capabilities.traffic.available).toBe(true);
    expect(JSON.stringify(result)).not.toContain("provider-secret-token");
  });

  it("does not persist when the token cannot read exactly one selected zone", async () => {
    const service = createCloudflareAnalyticsService({
      client: client({
        traffic: vi.fn(async () => ({
          data: { viewer: { zones: [] } },
          errors: [],
        })),
      }),
    });

    await expect(
      service.connect({
        projectId: "project-1",
        organizationId: "org-1",
        userId: "user-1",
        apiToken: "provider-secret-token",
        zoneId: "a".repeat(32),
      }),
    ).rejects.toMatchObject({ code: "zone_not_accessible" });
    expect(repository.replace).not.toHaveBeenCalled();
  });
});

describe("CloudflareAnalyticsService reports", () => {
  it("aggregates HTTP health and preserves sampling plus partial errors", async () => {
    const service = createCloudflareAnalyticsService({
      client: client({
        traffic: vi.fn(async () => ({
          errors: ["one aggregate unavailable"],
          data: {
            viewer: {
              zones: [
                {
                  httpRequestsAdaptiveGroups: [
                    {
                      count: 100,
                      dimensions: { edgeResponseStatus: 200 },
                      sum: { edgeResponseBytes: 1_000, visits: 20 },
                      avg: { sampleInterval: 10 },
                    },
                    {
                      count: 7,
                      dimensions: { edgeResponseStatus: 403 },
                      sum: { edgeResponseBytes: 70, visits: 0 },
                    },
                    {
                      count: 3,
                      dimensions: { edgeResponseStatus: 502 },
                      sum: { edgeResponseBytes: 30, visits: 0 },
                    },
                  ],
                },
              ],
            },
          },
        })),
      }),
    });
    const result = await service.trafficHealth({
      projectId: "project-1",
      from: "2026-09-04T11:00:00.000Z",
      to: now.toISOString(),
    });

    expect(result.status).toBe("partial");
    expect(result.coverage.sampled).toBe(true);
    expect(result.data).toMatchObject({
      requests: 110,
      errors4xx: 7,
      errors5xx: 3,
      responseBytes: 1_100,
    });
  });

  it("marks 500-row provider results partial and never complete", async () => {
    const rows = Array.from({ length: 500 }, () => ({
      count: 1,
      dimensions: { edgeResponseStatus: 200 },
      sum: { edgeResponseBytes: 1 },
      avg: { sampleInterval: 1 },
    }));
    const service = createCloudflareAnalyticsService({
      client: client({
        traffic: vi.fn(async () => ({
          errors: [],
          data: { viewer: { zones: [{ httpRequestsAdaptiveGroups: rows }] } },
        })),
      }),
    });
    const result = await service.trafficHealth({
      projectId: "project-1",
      from: "2026-09-04T11:00:00.000Z",
      to: now.toISOString(),
    });

    expect(result.status).toBe("partial");
    expect(result.coverage).toEqual({ sampled: false, truncated: true });
    expect(result.warnings).toContain("provider_row_limit_reached");
  });

  it("treats errors plus empty rows as unavailable, not no_data", async () => {
    const service = createCloudflareAnalyticsService({
      client: client({
        traffic: vi.fn(async () => ({
          errors: ["dataset failed"],
          data: {
            viewer: { zones: [{ httpRequestsAdaptiveGroups: [] }] },
          },
        })),
      }),
    });
    const result = await service.trafficHealth({
      projectId: "project-1",
      from: "2026-09-04T11:00:00.000Z",
      to: now.toISOString(),
    });
    expect(result.status).toBe("unavailable");
    expect(result.data).toBeNull();
  });

  it("normalizes paths without retaining query strings", async () => {
    const service = createCloudflareAnalyticsService({
      client: client({
        securityEvents: vi.fn(async () => ({
          errors: [],
          data: {
            viewer: {
              zones: [
                {
                  firewallEventsAdaptiveGroups: [
                    {
                      count: 4,
                      dimensions: {
                        action: "block",
                        clientRequestHTTPHost: "Example.COM",
                        clientRequestPath: "/login?email=private@example.com",
                      },
                    },
                  ],
                },
              ],
            },
          },
        })),
      }),
    });
    const result = await service.securityEvents({
      projectId: "project-1",
      from: "2026-09-04T11:00:00.000Z",
      to: now.toISOString(),
    });

    expect(result.data?.events[0]).toMatchObject({
      host: "example.com",
      pathname: "/login",
    });
    expect(JSON.stringify(result)).not.toContain("private@example.com");
  });

  it("scopes every credential lookup to the requested project", async () => {
    repository.getByProjectId.mockResolvedValue(null);
    const result = await createCloudflareAnalyticsService().trafficHealth({
      projectId: "project-foreign",
      from: "2026-09-04T11:00:00.000Z",
      to: now.toISOString(),
    });

    expect(repository.getByProjectId).toHaveBeenCalledWith("project-foreign");
    expect(result.status).toBe("not_connected");
  });
});

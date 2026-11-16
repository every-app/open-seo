import type { Client } from "@libsql/client";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type * as ArticleModule from "./ArticleService";
import type * as ChannelModule from "./ChannelService";
import type * as SyndicationModule from "./SyndicationService";
import type * as TopicModule from "./TopicService";
import { createTopicHubDb, resetTopicHubDb } from "./topicHubTestDb";

// Real in-memory SQLite: a syndication is reached through both its article's
// project and its channel's organization, and a send records what the
// platform returned. The platform clients are mocked.

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock("@/server/lib/runtime-env", () => ({
  getWorkersEnv: () => Promise.resolve({}),
  getOptionalEnvValue: (name: string) =>
    Promise.resolve(name === "CHANNEL_TOKEN_SECRET" ? "s".repeat(32) : null),
}));
const devto = vi.hoisted(() => ({
  getDevtoUser: vi.fn(),
  createDevtoDraft: vi.fn(),
  updateDevtoArticle: vi.fn(),
}));
vi.mock("../channels/devto", () => devto);

const passthrough = <T>(fn: () => Promise<T>) => fn();

let client: Client;
let TopicService: typeof TopicModule.TopicService;
let ArticleService: typeof ArticleModule.ArticleService;
let ChannelService: typeof ChannelModule.ChannelService;
let SyndicationService: typeof SyndicationModule.SyndicationService;

beforeAll(async () => {
  const hub = await createTopicHubDb();
  client = hub.client;
  // The test database only exists at runtime, so the services load after
  // these mocks — the sanctioned use of doMock + dynamic import.
  vi.doMock("@/db", () => ({ db: hub.db, withPgClient: passthrough }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: hub.db }));
  vi.doMock("@/db/pg/client", () => ({
    pgDb: null,
    withPgClient: passthrough,
  }));
  ({ TopicService } = await import("./TopicService"));
  ({ ArticleService } = await import("./ArticleService"));
  ({ ChannelService } = await import("./ChannelService"));
  ({ SyndicationService } = await import("./SyndicationService"));
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  devto.getDevtoUser.mockResolvedValue({
    ok: true,
    value: { username: "rob", name: "Rob" },
  });
  devto.createDevtoDraft.mockResolvedValue({
    ok: true,
    value: {
      id: "42",
      url: "https://dev.to/rob/x-temp-slug-1",
      publishedAt: null,
    },
  });
  await resetTopicHubDb(client);
});

describe("SyndicationService", () => {
  const scopeA = { projectId: "p-a", organizationId: "org-a" };

  async function draftedOnDevto() {
    const { topicId } = await TopicService.createTopicFromCluster({
      projectId: "p-a",
      clusterId: "c1",
    });
    await ArticleService.saveArticle({
      projectId: "p-a",
      topicId,
      title: "Parasite SEO",
      body: "Body.",
    });
    await SyndicationService.setCanonicalUrl(
      scopeA,
      topicId,
      "https://acme.com/p",
    );
    const connected = await ChannelService.connectDevto(
      "org-a",
      "devto-key-123",
    );
    if (connected.outcome !== "connected") throw new Error("not connected");
    const { syndicationId } = await SyndicationService.prepare(
      scopeA,
      topicId,
      connected.channelId,
    );
    expect(await SyndicationService.sendDraft(scopeA, syndicationId)).toEqual({
      ok: true,
    });
    return { topicId, channelId: connected.channelId, syndicationId };
  }

  it("sends a draft with the canonical link, publishes it, and moves the topic", async () => {
    const { topicId, syndicationId } = await draftedOnDevto();
    // The key is stored sealed and opened only to send.
    const stored = await client.execute(
      "SELECT token_ciphertext FROM ps_channels",
    );
    expect(stored.rows[0].token_ciphertext).toEqual(
      expect.not.stringContaining("devto-key-123"),
    );
    expect(devto.createDevtoDraft).toHaveBeenCalledWith("devto-key-123", {
      title: "Parasite SEO",
      bodyMarkdown:
        "Body.\n\n---\n\n*Originally published at [acme.com](https://acme.com/p).*",
      description: "Body.",
      // No brief yet, so no target keyword to suggest tags from.
      tags: [],
      canonicalUrl: "https://acme.com/p",
      aiDisclosure: "some_ai",
    });

    devto.updateDevtoArticle.mockResolvedValue({
      ok: true,
      value: {
        id: "42",
        url: "https://dev.to/rob/x-1",
        publishedAt: "2026-11-16T00:00:00Z",
      },
    });
    expect(await SyndicationService.publish(scopeA, syndicationId)).toEqual({
      ok: true,
    });
    expect(devto.updateDevtoArticle).toHaveBeenCalledWith(
      "devto-key-123",
      "42",
      expect.anything(),
      true,
    );
    const page = await SyndicationService.getPublishing(scopeA, topicId);
    expect(page.topic.status).toBe("published");
    expect(page.syndications[0]).toMatchObject({
      status: "published",
      liveUrl: "https://dev.to/rob/x-1",
      error: null,
    });
  });

  it("records a platform's refusal for the user and keeps the copy unsent", async () => {
    const { syndicationId, topicId } = await draftedOnDevto();
    devto.updateDevtoArticle.mockResolvedValue({
      ok: false,
      problem: { kind: "rate_limited", message: "Wait a few minutes." },
    });
    expect(await SyndicationService.publish(scopeA, syndicationId)).toEqual({
      ok: false,
      message: "Wait a few minutes.",
    });
    const page = await SyndicationService.getPublishing(scopeA, topicId);
    expect(page.syndications[0]).toMatchObject({
      status: "drafted",
      error: "Wait a few minutes.",
    });
    expect(page.topic.status).not.toBe("published");
  });

  it("keeps channels and copies inside their organization and project", async () => {
    const { topicId, channelId, syndicationId } = await draftedOnDevto();
    const otherOrg = { projectId: "p-a", organizationId: "org-b" };
    await expect(
      SyndicationService.prepare(otherOrg, topicId, channelId),
    ).rejects.toThrow("NOT_FOUND");
    await expect(
      SyndicationService.sendDraft(otherOrg, syndicationId),
    ).rejects.toThrow("NOT_FOUND");
    await expect(
      SyndicationService.sendDraft(
        { projectId: "p-b", organizationId: "org-a" },
        syndicationId,
      ),
    ).rejects.toThrow("NOT_FOUND");
    await expect(ChannelService.disconnect("org-b", channelId)).rejects.toThrow(
      "NOT_FOUND",
    );
    expect((await ChannelService.listChannels("org-b")).channels).toEqual([]);
    expect(devto.createDevtoDraft).toHaveBeenCalledTimes(1);
  });

  it("keeps a channel with live posts connected", async () => {
    const { channelId, syndicationId } = await draftedOnDevto();
    devto.updateDevtoArticle.mockResolvedValue({
      ok: true,
      value: { id: "42", url: "https://dev.to/rob/x-1", publishedAt: null },
    });
    await SyndicationService.publish(scopeA, syndicationId);
    expect(await ChannelService.disconnect("org-a", channelId)).toEqual({
      outcome: "in_use",
    });
  });

  it("replaces the token when the same account connects again", async () => {
    const { channelId, syndicationId } = await draftedOnDevto();
    const again = await ChannelService.connectDevto("org-a", "new-key-456");
    expect(again).toEqual({ outcome: "connected", channelId, replaced: true });

    devto.updateDevtoArticle.mockResolvedValue({
      ok: true,
      value: { id: "42", url: "https://dev.to/rob/x-1", publishedAt: null },
    });
    await SyndicationService.sendDraft(scopeA, syndicationId);
    expect(devto.updateDevtoArticle).toHaveBeenCalledWith(
      "new-key-456",
      "42",
      expect.anything(),
      false,
    );
  });

  it("puts a copy back to unsent when its platform draft is gone", async () => {
    const { syndicationId, topicId } = await draftedOnDevto();
    devto.updateDevtoArticle.mockResolvedValue({
      ok: false,
      problem: { kind: "not_found", message: "gone" },
    });
    await SyndicationService.publish(scopeA, syndicationId);
    const page = await SyndicationService.getPublishing(scopeA, topicId);
    expect(page.syndications[0]).toMatchObject({
      status: "prepared",
      remoteId: null,
      platformTitle: "Parasite SEO",
    });
  });
});

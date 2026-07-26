import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn<typeof fetch>(),
}));

vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: vi.fn().mockResolvedValue("tok_vercel"),
  getRequiredEnvValue: vi.fn().mockResolvedValue("tok_vercel"),
}));

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status });
}

/** The client always calls fetch with a string URL; narrow accordingly. */
function fetchUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

describe("vercelAnalytics client", () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists projects across the personal scope and every team", async () => {
    mocks.fetch.mockImplementation((url) => {
      const href = fetchUrl(url);
      if (href.includes("/v2/teams")) {
        return Promise.resolve(
          jsonResponse({ teams: [{ id: "team_1", slug: "acme" }] }),
        );
      }
      if (href.includes("teamId=team_1")) {
        return Promise.resolve(
          jsonResponse({
            projects: [{ id: "prj_team", name: "team-site" }],
          }),
        );
      }
      return Promise.resolve(
        jsonResponse({ projects: [{ id: "prj_personal", name: "me-site" }] }),
      );
    });
    const { createVercelAnalyticsClient } = await import("./vercelAnalytics");

    const projects = await createVercelAnalyticsClient().listProjects();

    expect(projects).toEqual([
      { id: "prj_personal", name: "me-site", teamId: null, teamSlug: null },
      { id: "prj_team", name: "team-site", teamId: "team_1", teamSlug: "acme" },
    ]);
    const [, init] = mocks.fetch.mock.calls[0];
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer tok_vercel",
    });
  });

  it("parses visit totals from the count endpoint", async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse({
        version: 1,
        query: {},
        data: { visitors: 4087, pageviews: 8329 },
      }),
    );
    const { createVercelAnalyticsClient } = await import("./vercelAnalytics");

    const totals = await createVercelAnalyticsClient().getVisitTotals({
      vercelProjectId: "prj_1",
      vercelTeamId: "team_1",
      since: "2026-06-26",
      until: "2026-07-26",
    });

    expect(totals).toEqual({ visitors: 4087, pageviews: 8329 });
    const href = fetchUrl(mocks.fetch.mock.calls[0][0]);
    expect(href).toContain("/v1/query/web-analytics/visits/count?");
    expect(href).toContain("projectId=prj_1");
    expect(href).toContain("teamId=team_1");
    expect(href).toContain("since=2026-06-26");
  });

  it("omits teamId for personal-scope projects", async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse({ data: { visitors: 1, pageviews: 1 } }),
    );
    const { createVercelAnalyticsClient } = await import("./vercelAnalytics");

    await createVercelAnalyticsClient().getVisitTotals({
      vercelProjectId: "prj_1",
      vercelTeamId: null,
    });

    expect(fetchUrl(mocks.fetch.mock.calls[0][0])).not.toContain("teamId");
  });

  it("keys aggregate rows by timestamp for by=day and by value otherwise", async () => {
    mocks.fetch.mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            timestamp: "2026-07-12T00:00:00.000Z",
            visitors: 50,
            pageviews: 71,
          },
        ],
      }),
    );
    const { createVercelAnalyticsClient } = await import("./vercelAnalytics");
    const client = createVercelAnalyticsClient();

    const days = await client.getVisitAggregate({
      vercelProjectId: "prj_1",
      vercelTeamId: null,
      since: "2026-07-12",
      until: "2026-07-26",
      by: "day",
    });
    expect(days).toEqual([
      { key: "2026-07-12T00:00:00.000Z", visitors: 50, pageviews: 71 },
    ]);

    mocks.fetch.mockResolvedValueOnce(
      jsonResponse({
        data: [
          { referrerHostname: "", visitors: 1101, pageviews: 1892 },
          { referrerHostname: "Others", visitors: 82, pageviews: 95 },
          { referrerHostname: "claude.ai", visitors: 43, pageviews: 45 },
        ],
      }),
    );
    const referrers = await client.getVisitAggregate({
      vercelProjectId: "prj_1",
      vercelTeamId: null,
      since: "2026-06-26",
      until: "2026-07-26",
      by: "referrerHostname",
      limit: 25,
    });
    // "" (direct) and "Others" (Vercel's literal tail bucket) pass through
    // untouched — labeling is the UI's job.
    expect(referrers.map((row) => row.key)).toEqual([
      "",
      "Others",
      "claude.ai",
    ]);
  });

  it("maps 401 to a VercelApiError that reads as an expected failure", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ error: "nope" }, 401));
    const {
      createVercelAnalyticsClient,
      VercelApiError,
      isExpectedVercelFailure,
    } = await import("./vercelAnalytics");

    const error = await createVercelAnalyticsClient()
      .getVisitTotals({ vercelProjectId: "prj_1", vercelTeamId: null })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(VercelApiError);
    expect(isExpectedVercelFailure(error)).toBe(true);
  });

  it("does not treat a 429 as an expected grant failure", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ error: "slow" }, 429));
    const { createVercelAnalyticsClient, isExpectedVercelFailure } =
      await import("./vercelAnalytics");

    const error = await createVercelAnalyticsClient()
      .getVisitTotals({ vercelProjectId: "prj_1", vercelTeamId: null })
      .catch((caught: unknown) => caught);

    expect(isExpectedVercelFailure(error)).toBe(false);
  });
});

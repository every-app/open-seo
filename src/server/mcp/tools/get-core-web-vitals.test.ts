import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getCoreWebVitalsTool } from "./get-core-web-vitals";
import { makeToolContext, textContent } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getSnapshot: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/crux/services/CruxService", () => ({
  CruxService: { getSnapshot: mocks.getSnapshot },
}));

const projectId = "11111111-1111-4111-8111-111111111111";

const toolContext = makeToolContext();

const snapshot = {
  record: {
    lcpMs: { p75: 1801, good: 0.85, needsImprovement: 0.1, poor: 0.05 },
    inpMs: { p75: 250, good: 0.6, needsImprovement: 0.25, poor: 0.15 },
    cls: { p75: 0.05, good: 0.9, needsImprovement: 0.07, poor: 0.03 },
    ttfbMs: null,
    collectionPeriod: { firstDate: "2026-07-27", lastDate: "2026-08-23" },
  },
  history: [
    { weekEnd: "2026-08-16", lcpMs: 1900, inpMs: 240, cls: 0.06 },
    { weekEnd: "2026-08-23", lcpMs: 1801, inpMs: 250, cls: 0.05 },
  ],
  fetchedAt: "2026-08-24T00:00:00.000Z",
};

describe("get_core_web_vitals MCP tool", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue({
      id: projectId,
      domain: "openseo.so",
      locationCode: 2840,
      languageCode: "en",
    });
  });

  it("defaults to the project's domain on PHONE and reports p75s with ratings", async () => {
    mocks.getSnapshot.mockResolvedValue({ status: "ok", snapshot });

    const parsed = z
      .object(getCoreWebVitalsTool.config.inputSchema)
      .parse({ projectId });
    const result = await getCoreWebVitalsTool.handler(parsed, toolContext);

    expect(mocks.getSnapshot).toHaveBeenCalledWith({
      domain: "openseo.so",
      url: undefined,
      formFactor: "PHONE",
    });
    expect(textContent(result)).toContain("openseo.so");
    expect(textContent(result)).toContain("LCP | 1801 ms | good");
    expect(textContent(result)).toContain("INP | 250 ms | poor");
    expect(textContent(result)).toContain("2026-08-23");
    expect(result.structuredContent).toMatchObject({
      status: "ok",
      record: snapshot.record,
      history: snapshot.history,
    });
    expect(
      getCoreWebVitalsTool.config.outputSchema.safeParse(
        result.structuredContent,
      ).success,
    ).toBe(true);
  });

  it("forwards an explicit url and form factor", async () => {
    mocks.getSnapshot.mockResolvedValue({ status: "ok", snapshot });

    await getCoreWebVitalsTool.handler(
      { projectId, url: "https://openseo.so/pricing", formFactor: "DESKTOP" },
      toolContext,
    );

    expect(mocks.getSnapshot).toHaveBeenCalledWith({
      domain: "openseo.so",
      url: "https://openseo.so/pricing",
      formFactor: "DESKTOP",
    });
  });

  it("returns a no_data status without inventing a record", async () => {
    mocks.getSnapshot.mockResolvedValue({ status: "no_data" });

    const result = await getCoreWebVitalsTool.handler(
      { projectId },
      toolContext,
    );

    expect(textContent(result)).toContain("No CrUX field data");
    expect(result.structuredContent).toMatchObject({ status: "no_data" });
    expect("record" in result.structuredContent).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadSharePage } from "./sharePage";

const mocks = vi.hoisted(() => ({
  env: {
    AUTH_MODE: "hosted" as string | undefined,
  },
  getSharedReportByToken: vi.fn(),
  setResponseStatus: vi.fn(),
  setResponseHeader: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: mocks.env }));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("https://app.example.com/s/token"),
  setResponseStatus: mocks.setResponseStatus,
  setResponseHeader: mocks.setResponseHeader,
}));
vi.mock("@/server/features/reports/repositories/ReportRepository", () => ({
  ReportRepository: { getSharedReportByToken: mocks.getSharedReportByToken },
}));

const TOKEN = "a".repeat(32);

// Only what the page reads off the row.
const SHARED_REPORT = {
  title: "badseo.dev SEO audit",
  summary: "\nFix the titles first.\n\nThen the meta descriptions.",
  updatedAt: "2026-09-01T10:00:00.000Z",
  archived: false,
};

beforeEach(() => {
  mocks.env.AUTH_MODE = "hosted";
  mocks.getSharedReportByToken.mockResolvedValue(SHARED_REPORT);
});

describe("loadSharePage", () => {
  it("returns the report's title, the summary's first line and the canonical url", async () => {
    await expect(loadSharePage(TOKEN)).resolves.toEqual({
      state: "ok",
      title: "badseo.dev SEO audit",
      description: "Fix the titles first.",
      url: `https://app.example.com/s/${TOKEN}`,
      updatedAt: "2026-09-01T10:00:00.000Z",
    });
    expect(mocks.setResponseStatus).not.toHaveBeenCalled();
  });

  // The reader is told the project is archived; the report's own title is
  // content the link no longer grants access to.
  it("names the archived state without naming the report", async () => {
    mocks.getSharedReportByToken.mockResolvedValue({
      ...SHARED_REPORT,
      archived: true,
    });

    await expect(loadSharePage(TOKEN)).resolves.toMatchObject({
      state: "archived",
      title: "Report unavailable",
    });
    expect(mocks.setResponseStatus).toHaveBeenCalledWith(404);
  });

  // A revoked link, a guessed one and a switched-off kill switch are the same
  // answer: a link that stopped working must not confirm it once did.
  it.each([
    [
      "an unknown or revoked token",
      () => mocks.getSharedReportByToken.mockResolvedValue(null),
    ],
    // Sharing is hosted-only: a self-hosted deployment answers as if the
    // link had never existed.
    [
      "a deployment that is not hosted",
      () => {
        mocks.env.AUTH_MODE = "cloudflare_access";
      },
    ],
  ])("reports missing for %s", async (_case, arrange) => {
    arrange();

    await expect(loadSharePage(TOKEN)).resolves.toMatchObject({
      state: "missing",
    });
    expect(mocks.setResponseStatus).toHaveBeenCalledWith(404);
  });

  it("reports missing for a malformed token without querying", async () => {
    await expect(loadSharePage("nope")).resolves.toMatchObject({
      state: "missing",
    });
    expect(mocks.getSharedReportByToken).not.toHaveBeenCalled();
  });
});

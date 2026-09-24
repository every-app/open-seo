import { beforeEach, describe, expect, it, vi } from "vitest";
import { brand } from "@/shared/brand";
import { handleReportSocialImage } from "@/routes/s/$token/og[.]png";

const mocks = vi.hoisted(() => ({
  sharesEnabled: vi.fn(),
  getSharedReportByToken: vi.fn(),
  renderReportSocialImage: vi.fn(),
}));

vi.mock("@/server/features/reports/shareAccess", () => ({
  sharesEnabled: mocks.sharesEnabled,
  SHARE_TOKEN_PATTERN: /^[A-Za-z0-9_-]{32}$/,
}));
vi.mock("@/server/features/reports/repositories/ReportRepository", () => ({
  ReportRepository: { getSharedReportByToken: mocks.getSharedReportByToken },
}));
vi.mock("@/server/features/reports/reportSocialImage", () => ({
  renderReportSocialImage: mocks.renderReportSocialImage,
}));

const TOKEN = "a".repeat(32);

beforeEach(() => {
  mocks.sharesEnabled.mockResolvedValue(true);
  mocks.getSharedReportByToken.mockResolvedValue({
    title: "Acme SEO audit",
    projectDomain: "acme.com",
    archived: false,
  });
  mocks.renderReportSocialImage.mockResolvedValue(new Response("image"));
});

describe("report social image access", () => {
  it("renders the title from the authorized report", async () => {
    const response = await handleReportSocialImage(TOKEN);
    expect(mocks.getSharedReportByToken).toHaveBeenCalledWith(TOKEN);
    expect(mocks.renderReportSocialImage).toHaveBeenCalledWith(
      "Acme SEO audit",
      "acme.com",
    );
    expect(await response.text()).toBe("image");
  });

  it("falls back to the marketing card on rendering failure and retries next time", async () => {
    const error = new Error("Renderer failed");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.renderReportSocialImage.mockRejectedValueOnce(error);
    const response = await handleReportSocialImage(TOKEN);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(brand.socialCardUrl);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(log).toHaveBeenCalledWith(
      "Report social image rendering failed",
      error,
    );
    expect(await (await handleReportSocialImage(TOKEN)).text()).toBe("image");
    mocks.getSharedReportByToken.mockResolvedValue(null);
    const revoked = await handleReportSocialImage(TOKEN);
    expect(revoked.status).toBe(404);
    expect(revoked.headers.get("Location")).toBeNull();
  });

  it("does not hide report lookup failures behind the fallback", async () => {
    mocks.getSharedReportByToken.mockRejectedValue(
      new Error("Database unavailable"),
    );
    await expect(handleReportSocialImage(TOKEN)).rejects.toThrow(
      "Database unavailable",
    );
    expect(mocks.renderReportSocialImage).not.toHaveBeenCalled();
  });

  it.each(["missing", "archived"])(
    "does not reveal a %s report's title",
    async (state) => {
      mocks.getSharedReportByToken.mockResolvedValue(
        state === "missing" ? null : { title: "Private title", archived: true },
      );
      const response = await handleReportSocialImage(TOKEN);
      expect(response.status).toBe(404);
      expect(response.headers.get("Location")).toBeNull();
      expect(response.headers.get("Cache-Control")).toContain("no-store");
      expect(await response.text()).toBe("This report isn't shared.");
      expect(mocks.renderReportSocialImage).not.toHaveBeenCalled();
    },
  );

  it.each(["disabled", "invalid"])(
    "skips both lookup and rendering when sharing is %s",
    async (state) => {
      mocks.sharesEnabled.mockResolvedValue(state !== "disabled");
      expect(
        (await handleReportSocialImage(state === "invalid" ? "bad" : TOKEN))
          .status,
      ).toBe(404);
      expect(mocks.getSharedReportByToken).not.toHaveBeenCalled();
      expect(mocks.renderReportSocialImage).not.toHaveBeenCalled();
    },
  );

  it("checks access again after revocation", async () => {
    await handleReportSocialImage(TOKEN);
    mocks.getSharedReportByToken.mockResolvedValue(null);
    expect((await handleReportSocialImage(TOKEN)).status).toBe(404);
    expect(mocks.renderReportSocialImage).toHaveBeenCalledTimes(1);
  });
});

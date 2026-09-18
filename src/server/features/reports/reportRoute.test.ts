import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleReportRequest, NOT_FOUND_BODY } from "@/routes/r/$reportId";
import { PRINT_SCRIPT, REPORT_CSP, reportCsp } from "@/shared/report-sandbox";

const mocks = vi.hoisted(() => ({
  resolveUserContextFromHeaders: vi.fn(),
  getProjectForOrganization: vi.fn(),
  getArchivedProjectForOrganization: vi.fn(),
  getReportProjectId: vi.fn(),
  getReportHtml: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: { AUTH_MODE: "hosted" } }));
vi.mock("@/middleware/ensure-user/resolve", () => ({
  resolveUserContextFromHeaders: mocks.resolveUserContextFromHeaders,
}));
vi.mock("@/server/features/projects/repositories/ProjectRepository", () => ({
  ProjectRepository: {
    getProjectForOrganization: mocks.getProjectForOrganization,
    getArchivedProjectForOrganization: mocks.getArchivedProjectForOrganization,
  },
}));
vi.mock("@/server/features/reports/repositories/ReportRepository", () => ({
  ReportRepository: {
    getReportProjectId: mocks.getReportProjectId,
    getReportHtml: mocks.getReportHtml,
  },
}));

const HTML = "<!doctype html><html><body>report</body></html>";

const request = () => new Request("https://app.example.com/r/report-1");

beforeEach(() => {
  mocks.resolveUserContextFromHeaders.mockResolvedValue({
    userId: "user-1",
    userEmail: "user@example.com",
    emailVerified: true,
    organizationId: "org-1",
    role: "owner",
  });
  mocks.getReportProjectId.mockResolvedValue("project-1");
  mocks.getProjectForOrganization.mockResolvedValue({ id: "project-1" });
  mocks.getArchivedProjectForOrganization.mockResolvedValue(null);
  mocks.getReportHtml.mockResolvedValue(HTML);
});

describe("handleReportRequest", () => {
  it("serves the stored document with the sandbox headers", async () => {
    const response = await handleReportRequest("report-1", request());

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(HTML);
    expect(Object.fromEntries(response.headers)).toEqual({
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": REPORT_CSP,
      "cross-origin-opener-policy": "same-origin",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    });
    // Authorized against the row's project before the document is read, so an
    // unauthorized request never pulls one onto the worker's heap.
    expect(mocks.getProjectForOrganization).toHaveBeenCalledWith(
      "project-1",
      "org-1",
    );
  });

  // "Export" is one click only because the served document prints itself; the
  // script-src hash is what lets that one script run while the report's own
  // scripts stay blocked.
  it("appends the print script and widens the sandbox in print mode", async () => {
    const response = await handleReportRequest(
      "report-1",
      new Request("https://app.example.com/r/report-1?print=1"),
    );

    expect(await response.text()).toBe(
      `<!doctype html><html><body>report<script>${PRINT_SCRIPT}</script></body></html>`,
    );
    expect(response.headers.get("content-security-policy")).toBe(
      reportCsp(true),
    );
  });

  // See withPrintScript: a dangling `<script src="…" ` absorbs any attribute on
  // the tag we splice in.
  it("gives a dangling script tag in the document no attribute to absorb", async () => {
    mocks.getReportHtml.mockResolvedValue(
      '<!doctype html><html><body><script src="https://evil.example/x.js" </body></html>',
    );

    const response = await handleReportRequest(
      "report-1",
      new Request("https://app.example.com/r/report-1?print=1"),
    );

    const body = await response.text();
    // The spliced tag carries no attributes, so the dangling tag absorbs
    // nothing but a valueless `<script` attribute name.
    expect(body).toBe(
      '<!doctype html><html><body><script src="https://evil.example/x.js" ' +
        `<script>${PRINT_SCRIPT}</script></body></html>`,
    );
    expect(response.headers.get("content-security-policy")).not.toContain(
      "'nonce-",
    );
  });

  it.each([
    [
      "an unknown report",
      () => mocks.getReportProjectId.mockResolvedValue(null),
    ],
    // Another organization's project is indistinguishable from one that does
    // not exist, on purpose.
    [
      "a project the viewer cannot access",
      () => mocks.getProjectForOrganization.mockResolvedValue(null),
    ],
  ])("answers the same 404 for %s", async (_case, arrange) => {
    arrange();

    const response = await handleReportRequest("report-1", request());

    expect(response.status).toBe(404);
    expect(await response.text()).toBe(NOT_FOUND_BODY);
    expect(mocks.getReportHtml).not.toHaveBeenCalled();
  });

  it("names an archived project of the viewer's own organization", async () => {
    mocks.getProjectForOrganization.mockResolvedValue(null);
    mocks.getArchivedProjectForOrganization.mockResolvedValue({
      id: "project-1",
      name: "badseo.dev",
    });

    const response = await handleReportRequest("report-1", request());

    expect(response.status).toBe(404);
    expect(await response.text()).toBe(
      "This project is archived, so its reports are hidden. Restore badseo.dev to read them.",
    );
    expect(mocks.getReportHtml).not.toHaveBeenCalled();
  });

  it("bounces an unauthenticated viewer to sign-in", async () => {
    mocks.resolveUserContextFromHeaders.mockRejectedValue(
      new Error("UNAUTHENTICATED"),
    );

    const response = await handleReportRequest("report-1", request());

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/sign-in?redirect=%2Fr%2Freport-1",
    );
  });

  // A session-store or config failure must not read as "you are logged out" and
  // send the reader round a sign-in loop that cannot fix it.
  it("lets a non-auth failure escape instead of bouncing to sign-in", async () => {
    mocks.resolveUserContextFromHeaders.mockRejectedValue(
      new Error("AUTH_CONFIG_MISSING"),
    );

    await expect(handleReportRequest("report-1", request())).rejects.toThrow(
      "AUTH_CONFIG_MISSING",
    );
  });
});

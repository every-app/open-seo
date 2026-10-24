import { beforeEach, expect, it, vi } from "vitest";
import { handleAiVisibilityDownload } from "./aiVisibilityExport";

const mocks = vi.hoisted(() => ({
  resolveAuth: vi.fn(),
  getProject: vi.fn(),
  getObject: vi.fn(),
}));
vi.mock("cloudflare:workers", () => ({
  env: { R2: { get: mocks.getObject } },
}));
vi.mock("@/middleware/ensure-user/resolve", () => ({
  resolveUserContextFromHeaders: mocks.resolveAuth,
}));
vi.mock("@/server/features/projects/repositories/ProjectRepository", () => ({
  ProjectRepository: { getProjectForOrganization: mocks.getProject },
}));
vi.mock("./aiVisibilityResults", () => ({ loadAiFullAnswers: vi.fn() }));

const projectId = "proj-baeble-app";
const exportId = "00000000-0000-4000-8000-000000000002";
const request = (id = exportId) =>
  new Request(
    `https://open-seo.test/api/ai-visibility/download?projectId=${projectId}&exportId=${id}`,
  );
beforeEach(() => {
  mocks.resolveAuth.mockResolvedValue({ organizationId: "org-owner" });
  mocks.getProject.mockResolvedValue({ id: projectId });
  mocks.getObject.mockResolvedValue({
    body: "[]",
    customMetadata: { expiresAt: "2099-01-01T00:00:00Z", format: "json" },
  });
});

it("downloads a legacy project's export after checking its organization", async () => {
  const response = await handleAiVisibilityDownload(request());
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("[]");
  expect(mocks.getProject).toHaveBeenCalledExactlyOnceWith(
    projectId,
    "org-owner",
  );
  expect(mocks.getObject).toHaveBeenCalledExactlyOnceWith(
    `ai-visibility/${projectId}/exports/${exportId}`,
  );
});

it("does not read a foreign legacy project's export", async () => {
  mocks.getProject.mockResolvedValue(null);
  expect((await handleAiVisibilityDownload(request())).status).toBe(404);
  expect(mocks.getObject).not.toHaveBeenCalled();
});

it("still requires a UUID export ID for an authorized legacy project", async () => {
  expect((await handleAiVisibilityDownload(request("not-a-uuid"))).status).toBe(
    404,
  );
  expect(mocks.getProject).toHaveBeenCalled();
  expect(mocks.getObject).not.toHaveBeenCalled();
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeToolContext } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  submit: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/indexnow/IndexNowService", () => ({
  IndexNowService: { submit: mocks.submit },
}));

import { submitUrlsIndexNowTool } from "./indexnow-tools";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getProjectForOrganization.mockResolvedValue({ id: "project_1" });
  mocks.submit.mockResolvedValue({
    submissionId: "submission_1",
    status: "received",
    requestedUrlCount: 2,
    uniqueUrlCount: 1,
    chunks: [
      { chunkIndex: 0, urlCount: 1, status: "received", httpStatus: 200 },
    ],
    meaning:
      "received means the notification was accepted; it does not mean indexed.",
  });
});

describe("submit_urls_indexnow", () => {
  it("submits as an owner and preserves the receipt semantics", async () => {
    const result = await submitUrlsIndexNowTool.handler(
      {
        projectId: "project_1",
        urls: ["https://example.com/a", "https://example.com/a"],
        confirmed: true,
      },
      makeToolContext(),
    );
    expect(mocks.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project_1",
        userId: "user_123",
        confirmed: true,
      }),
    );
    expect(result.structuredContent).toMatchObject({
      ok: true,
      status: "received",
      uniqueUrlCount: 1,
    });
    expect(
      result.content[0]?.type === "text" && result.content[0].text,
    ).toContain("does not mean indexed");
  });

  it("fails closed for a member without integration:manage", async () => {
    await expect(
      submitUrlsIndexNowTool.handler(
        {
          projectId: "project_1",
          urls: ["https://example.com/a"],
          confirmed: true,
        },
        makeToolContext({ role: "member" }),
      ),
    ).rejects.toThrow("does not allow this action");
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("does not report ok when the endpoint rejects the notification", async () => {
    mocks.submit.mockResolvedValue({
      submissionId: "submission_2",
      status: "rejected",
      requestedUrlCount: 1,
      uniqueUrlCount: 1,
      chunks: [
        { chunkIndex: 0, urlCount: 1, status: "rejected", httpStatus: 403 },
      ],
      meaning: "received does not mean indexed.",
    });
    const result = await submitUrlsIndexNowTool.handler(
      {
        projectId: "project_1",
        urls: ["https://example.com/a"],
        confirmed: true,
      },
      makeToolContext(),
    );
    expect(result.structuredContent).toMatchObject({
      ok: false,
      status: "rejected",
    });
  });
});

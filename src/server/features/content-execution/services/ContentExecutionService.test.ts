import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createExecutionItem: vi.fn(),
  listExecutionItemsByProject: vi.fn(),
  updateExecutionItem: vi.fn(),
}));

vi.mock(
  "@/server/features/content-execution/repositories/ContentExecutionRepository",
  () => ({ ContentExecutionRepository: mocks }),
);

describe("ContentExecutionService", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  it("creates one work item for a deduplicated keyword cluster", async () => {
    mocks.createExecutionItem.mockResolvedValue({ id: "item_1" });
    const { ContentExecutionService } =
      await import("./ContentExecutionService");

    await ContentExecutionService.create({
      projectId: "project_1",
      title: "Meta Conversions API solution page",
      targetUrl: "https://www.customerlabs.com/conversions-api/",
      savedKeywordIds: ["kw_primary", "kw_variant", "kw_primary"],
      primarySavedKeywordId: "kw_primary",
      owner: "Maya",
      dueDate: "2026-09-12",
      jiraIssueKey: "SEO-101",
      jiraIssueUrl: "https://customerlabs.atlassian.net/browse/SEO-101",
    });

    expect(mocks.createExecutionItem).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project_1",
        savedKeywordIds: ["kw_primary", "kw_variant"],
        primarySavedKeywordId: "kw_primary",
        status: "ready_to_assign",
      }),
    );
  });

  it("rejects a primary keyword outside the work item's keyword cluster", async () => {
    const { ContentExecutionService } =
      await import("./ContentExecutionService");

    await expect(
      ContentExecutionService.create({
        projectId: "project_1",
        title: "Meta Conversions API solution page",
        savedKeywordIds: ["kw_variant"],
        primarySavedKeywordId: "kw_primary",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.createExecutionItem).not.toHaveBeenCalled();
  });

  it("keeps updates scoped to the current project", async () => {
    mocks.updateExecutionItem.mockResolvedValue({
      id: "item_1",
      projectId: "project_1",
      status: "writing",
    });
    const { ContentExecutionService } =
      await import("./ContentExecutionService");

    await ContentExecutionService.update({
      projectId: "project_1",
      executionItemId: "item_1",
      status: "writing",
    });

    expect(mocks.updateExecutionItem).toHaveBeenCalledWith({
      projectId: "project_1",
      executionItemId: "item_1",
      status: "writing",
    });
  });
});

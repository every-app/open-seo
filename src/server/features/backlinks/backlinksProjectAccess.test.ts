import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppError } from "@/server/lib/errors";
import { assertBacklinksProjectAccess } from "@/server/features/backlinks/backlinksProjectAccess";
import { KeywordResearchRepository } from "@/server/features/keywords/repositories/KeywordResearchRepository";

vi.mock(
  "@/server/features/keywords/repositories/KeywordResearchRepository",
  () => ({
    KeywordResearchRepository: {
      getProject: vi.fn(),
    },
  }),
);

describe("assertBacklinksProjectAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the project when the user has access", async () => {
    const project = {
      id: "project-1",
      userId: "user-1",
      name: "Project 1",
      domain: null,
      pagespeedApiKey: null,
      createdAt: "2026-03-14T00:00:00.000Z",
    };
    vi.mocked(KeywordResearchRepository.getProject).mockResolvedValue(project);

    await expect(
      assertBacklinksProjectAccess("user-1", "project-1"),
    ).resolves.toBe(project);
  });

  it("throws when the user does not have project access", async () => {
    vi.mocked(KeywordResearchRepository.getProject).mockResolvedValue(
      undefined,
    );

    await expect(
      assertBacklinksProjectAccess("user-1", "project-1"),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    } satisfies Partial<AppError>);
  });
});

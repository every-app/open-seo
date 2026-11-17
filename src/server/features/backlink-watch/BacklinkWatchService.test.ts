import { beforeEach, expect, it, vi } from "vitest";

const rowsMock = vi.fn<(input: { statusType?: string }) => unknown>();
const domainIntersectionMock = vi.fn();
const listCompetitorsMock =
  vi.fn<(projectId: string) => Promise<{ domain: string }[]>>();

vi.mock("@/server/lib/dataforseo", () => ({
  normalizeBacklinksTarget: vi.fn(() => ({
    apiTarget: "example.com",
    includeSubdomains: true,
  })),
  createDataforseoClient: vi.fn(() => ({
    backlinks: { rows: rowsMock, domainIntersection: domainIntersectionMock },
  })),
}));

vi.mock(
  "@/server/features/project-context/repositories/ProjectContextRepository",
  () => ({
    ProjectContextRepository: {
      listCompetitors: (projectId: string) => listCompetitorsMock(projectId),
    },
  }),
);

import { BacklinkWatchService } from "./BacklinkWatchService";

beforeEach(() => {
  rowsMock.mockResolvedValue({ items: [], totalCount: 0 });
  listCompetitorsMock.mockResolvedValue([]);
});

it("keeps the default live status for gained links and asks for lost links separately", async () => {
  await BacklinkWatchService.getChanges({
    billing: { organizationId: "org", userId: "user", userEmail: "a@b.c" },
    projectId: "project_1",
    projectDomain: "example.com",
    sinceDays: 7,
    opportunities: "off",
    maxRows: 25,
    importantMinDomainRank: 20,
  });

  expect(rowsMock).toHaveBeenCalledTimes(2);
  const calls = rowsMock.mock.calls.map(([input]) => input);
  expect(calls.filter((input) => input.statusType === undefined)).toHaveLength(
    1,
  );
  expect(calls.filter((input) => input.statusType === "lost")).toHaveLength(1);
  expect(domainIntersectionMock).not.toHaveBeenCalled();
});

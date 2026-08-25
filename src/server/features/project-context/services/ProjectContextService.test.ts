import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyContextUpdates,
  getProjectContext,
  renderProjectContextMarkdown,
} from "./ProjectContextService";

const mocks = vi.hoisted(() => ({
  listSections: vi.fn(),
  upsertSection: vi.fn(),
  deleteSection: vi.fn(),
  listCompetitors: vi.fn(),
  upsertCompetitors: vi.fn(),
  deleteCompetitors: vi.fn(),
  listKeyPages: vi.fn(),
  upsertKeyPages: vi.fn(),
  deleteKeyPages: vi.fn(),
  listResearchLog: vi.fn(),
  appendResearchLogEntry: vi.fn(),
  pruneResearchLogBefore: vi.fn(),
}));

vi.mock(
  "@/server/features/project-context/repositories/ProjectContextRepository",
  () => ({ ProjectContextRepository: mocks }),
);

// The real runBatch needs a Workers runtime; executing the built statements
// directly preserves what the tests assert on (which repository writes ran).
const runBatch = vi.hoisted(() =>
  vi.fn(async (build: (tx: unknown) => readonly Promise<unknown>[]) => {
    for (const statement of build({})) await statement;
  }),
);

vi.mock("@/db/runBatch", () => ({ runBatch }));

const section = (
  key: string,
  content: string,
  title: string | null = null,
) => ({
  key,
  title,
  content,
  updatedAt: "2026-08-15T10:00:00.000Z",
  updatedBy: "user" as const,
});

describe("project context service", () => {
  beforeEach(() => {
    mocks.listSections.mockResolvedValue([]);
    mocks.listCompetitors.mockResolvedValue([]);
    mocks.listKeyPages.mockResolvedValue([]);
    mocks.listResearchLog.mockResolvedValue([]);
  });

  it("splits typed from custom sections and reports the empty typed ones", async () => {
    mocks.listSections.mockResolvedValue([
      section("business_overview", "We sell paint."),
      section("custom:launch-plan", "Ship in Q4.", "Launch plan"),
    ]);

    const context = await getProjectContext("project_1");

    expect(context.sections).toEqual([
      expect.objectContaining({
        key: "business_overview",
        content: "We sell paint.",
      }),
    ]);
    expect(context.missingSections).toEqual([
      "current_goal",
      "positioning",
      "writing_preferences",
    ]);
    expect(context.customSections).toEqual([
      expect.objectContaining({ slug: "launch-plan", title: "Launch plan" }),
    ]);
  });

  it("clears a typed section when the content is empty", async () => {
    await applyContextUpdates(
      "project_1",
      [{ section: "current_goal", content: "  " }],
      "user",
    );

    expect(mocks.deleteSection).toHaveBeenCalledWith(
      expect.anything(),
      "project_1",
      "current_goal",
    );
    expect(mocks.upsertSection).not.toHaveBeenCalled();
  });

  it("canonicalizes key-page urls and passes an omitted role as null", async () => {
    await applyContextUpdates(
      "project_1",
      [
        {
          addKeyPages: [
            { url: "http://WWW.Acme.com/pricing?plan=pro#faq" },
            { url: "acme.com/blog/", role: "hub" },
          ],
        },
      ],
      "mcp",
    );

    expect(mocks.upsertKeyPages).toHaveBeenCalledWith(
      expect.anything(),
      "project_1",
      [
        // https forced, www + fragment stripped, query kept; omitted role is
        // null so the repository keeps a stored classification.
        {
          url: "https://acme.com/pricing?plan=pro",
          role: null,
          topic: null,
          notes: null,
        },
        {
          url: "https://acme.com/blog/",
          role: "hub",
          topic: null,
          notes: null,
        },
      ],
      "mcp",
    );
  });

  it("normalizes competitor domains and collapses repeats within one batch", async () => {
    await applyContextUpdates(
      "project_1",
      [
        {
          addCompetitors: [
            { domain: "https://WWW.Acme.com/pricing" },
            { domain: "acme.com", notes: "strong on comparison pages" },
            { domain: "beta.io" },
          ],
        },
      ],
      "mcp",
    );

    expect(mocks.upsertCompetitors).toHaveBeenCalledWith(
      expect.anything(),
      "project_1",
      [
        {
          domain: "acme.com",
          name: null,
          notes: "strong on comparison pages",
        },
        { domain: "beta.io", name: null, notes: null },
      ],
      "mcp",
    );
  });

  it("normalizes the domains and urls that remove ops delete", async () => {
    await applyContextUpdates(
      "project_1",
      [
        { removeCompetitors: ["https://www.Example.com/"] },
        { removeKeyPages: ["http://WWW.Example.com/pricing#faq"] },
      ],
      "user",
    );

    expect(mocks.deleteCompetitors).toHaveBeenCalledWith(
      expect.anything(),
      "project_1",
      ["example.com"],
    );
    expect(mocks.deleteKeyPages).toHaveBeenCalledWith(
      expect.anything(),
      "project_1",
      ["https://example.com/pricing"],
    );
  });

  describe("caps", () => {
    const fullCompetitorList = Array.from({ length: 100 }, (_, index) => ({
      domain: `competitor${index}.com`,
    }));

    it("rejects a new competitor once the project is at the cap", async () => {
      mocks.listCompetitors.mockResolvedValue(fullCompetitorList);

      await expect(
        applyContextUpdates(
          "project_1",
          [{ addCompetitors: [{ domain: "newcomer.com" }] }],
          "user",
        ),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      expect(mocks.upsertCompetitors).not.toHaveBeenCalled();
    });

    it("still updates a competitor it already stores at the cap", async () => {
      mocks.listCompetitors.mockResolvedValue(fullCompetitorList);

      await applyContextUpdates(
        "project_1",
        [{ addCompetitors: [{ domain: "competitor7.com", name: "Seven" }] }],
        "user",
      );

      expect(mocks.upsertCompetitors).toHaveBeenCalled();
    });

    // Each op is under the cap on its own, so the cap only holds if the batch
    // is counted against the state as it evolves rather than against storage.
    it("counts earlier ops in the same batch against the cap", async () => {
      mocks.listCompetitors.mockResolvedValue(fullCompetitorList.slice(0, 99));

      await expect(
        applyContextUpdates(
          "project_1",
          [
            { addCompetitors: [{ domain: "newcomer.com" }] },
            { addCompetitors: [{ domain: "latecomer.com" }] },
          ],
          "user",
        ),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      expect(mocks.upsertCompetitors).not.toHaveBeenCalled();
    });

    it("rejects a 21st custom section", async () => {
      mocks.listSections.mockResolvedValue(
        Array.from({ length: 20 }, (_, index) =>
          section(`custom:note-${index}`, "..."),
        ),
      );

      await expect(
        applyContextUpdates(
          "project_1",
          [{ customSection: "one-too-many", content: "..." }],
          "sam",
        ),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      expect(mocks.upsertSection).not.toHaveBeenCalled();
    });

    // A batch is validated before anything is written, so a caller that trips a
    // cap halfway down the list gets a clean rejection rather than a project
    // left in a state neither side asked for.
    it("writes nothing when a later op in the batch is rejected", async () => {
      await expect(
        applyContextUpdates(
          "project_1",
          [
            { section: "current_goal", content: "Grow signups" },
            { addCompetitors: [{ domain: "acme.com" }] },
            { section: "positioning", content: "x".repeat(4001) },
          ],
          "user",
        ),
      ).rejects.toThrow(
        "updates[2] was rejected (nothing in this batch was applied)",
      );
      expect(mocks.upsertSection).not.toHaveBeenCalled();
      expect(mocks.upsertCompetitors).not.toHaveBeenCalled();
    });
  });

  describe("research log", () => {
    beforeEach(() => {
      vi.useFakeTimers({ now: Date.parse("2026-08-15T10:00:00Z") });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("stamps the entry date server-side and prunes past 90 days", async () => {
      await applyContextUpdates(
        "project_1",
        [{ appendResearchLog: { summary: "Keyword research. Verdict: go." } }],
        "sam",
      );

      expect(mocks.appendResearchLogEntry).toHaveBeenCalledWith(
        expect.anything(),
        {
          projectId: "project_1",
          entryDate: "2026-08-15",
          summary: "Keyword research. Verdict: go.",
          createdBy: "sam",
        },
      );
      expect(mocks.pruneResearchLogBefore).toHaveBeenCalledWith(
        expect.anything(),
        "project_1",
        "2026-05-17",
      );
      // Both writes ride in the one atomic batch every apply goes through.
      expect(runBatch).toHaveBeenCalledOnce();
    });
  });

  it("renders empty typed sections as missing in the digest", () => {
    const markdown = renderProjectContextMarkdown({
      sections: [
        {
          key: "business_overview",
          content: "We sell paint.",
          updatedAt: "2026-08-15T10:00:00.000Z",
          updatedBy: "user",
        },
      ],
      missingSections: ["current_goal", "positioning", "writing_preferences"],
      customSections: [],
      competitors: [],
      keyPages: [],
      researchLog: [],
    });

    expect(markdown).toContain("## Business overview\n\nWe sell paint.");
    expect(markdown).toContain("## Current goal\n\n_Empty_");
    expect(markdown).toContain(
      "Missing sections: current_goal, positioning, writing_preferences",
    );
  });

  // A full log is a truncated log, and an agent judging whether research is
  // stale must not read the newest 20 entries as the whole 90-day window.
  it("says so when the research log is rendered at its limit", () => {
    const render = (entryCount: number) =>
      renderProjectContextMarkdown({
        sections: [],
        missingSections: [],
        customSections: [],
        competitors: [],
        keyPages: [],
        researchLog: Array.from({ length: entryCount }, (_, index) => ({
          id: `log_${index}`,
          entryDate: "2026-08-15",
          summary: "Keyword research.",
          createdBy: "sam" as const,
        })),
      });

    const atLimit = render(20);
    expect(atLimit).toContain("## Research log (20 entries)");
    expect(atLimit).toContain(
      "_Older entries within the 90-day window are omitted._",
    );
    expect(render(1)).not.toContain("_Older entries");
  });
});

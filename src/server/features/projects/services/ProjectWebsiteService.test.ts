import { readFileSync } from "node:fs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { runBatch } from "@/db/runBatch";
import type * as ContextRepositoryModule from "@/server/features/project-context/repositories/ProjectContextRepository";

const { getProject, listCompetitors } = vi.hoisted(() => ({
  getProject: vi.fn(),
  listCompetitors: vi.fn(),
}));
vi.mock("cloudflare:workers", () => ({
  env: { DATABASE_PROVIDER: "d1" },
  waitUntil: vi.fn(),
}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/runBatch", () => ({
  runBatch: async (build: Parameters<typeof runBatch>[0]) => {
    if (beforeWrite) await beforeWrite();
    // libsql executes the production Drizzle statements against real SQLite.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- same Drizzle query surface as the D1 batch executor
    const executor = testDb as unknown as Parameters<typeof build>[0];
    for (const statement of build(executor)) await statement;
  },
}));
vi.mock("@/server/features/projects/repositories/ProjectRepository", () => ({
  ProjectRepository: { getProjectForOrganization: getProject },
}));
vi.mock(
  "@/server/features/project-context/repositories/ProjectContextRepository",
  async () => {
    const { ProjectContextRepository } = await vi.importActual<
      typeof ContextRepositoryModule
    >(
      "@/server/features/project-context/repositories/ProjectContextRepository",
    );
    return {
      ProjectContextRepository: {
        ...ProjectContextRepository,
        listCompetitors,
      },
    };
  },
);
vi.mock(
  "@/server/features/ai-visibility/services/websiteTrackingSetup",
  () => ({ prepareWebsiteTracking: async () => null }),
);
vi.mock("@/server/features/projects/services/websiteResearch", () => ({
  researchWebsite: vi.fn(),
}));
vi.mock("@/server/billing/subscription", () => ({
  checkUsageCreditsDepleted: vi.fn(),
}));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: async () => false,
}));

import { ProjectWebsiteService } from "./ProjectWebsiteService";
import { customer } from "@/server/features/ai-visibility/services/aiVisibilityTestFixtures";

const client = createClient({ url: "file::memory:" });
const testDb = drizzle(client);
let beforeWrite: (() => Promise<void>) | null;
const projectId = "4a5b6c7d-0000-4000-8000-000000000000";
const project = {
  id: projectId,
  name: "Saved name",
  domain: null,
  locationCode: 2840,
  languageCode: "en",
};
const accepted = {
  projectId,
  name: "Researched name",
  domain: "researched.com",
  overview: "Researched overview".padEnd(4000, "."),
  competitors: [
    {
      name: "Researched rival",
      domain: "rival.com",
      notes: "Researched notes",
    },
    { name: "New rival", domain: "new-rival.com", notes: "New notes" },
    // Cross the D1 chunk boundary: earlier inserts must not block later ones.
    ...Array.from({ length: 10 }, (_, index) => ({
      name: `Extra rival ${index}`,
      domain: `extra-rival-${index}.com`,
      notes: "",
    })),
  ],
  suggestedTopics: [
    {
      name: "new keyword",
      prompts: [1, 2, 3, 4, 5].map((n) => `New question ${n}?`),
    },
  ],
  suggestedKeywords: ["site audit"],
};

beforeAll(async () => {
  // Use the actual context migration so conflict keys match production.
  await client.executeMultiple(
    [
      `CREATE TABLE projects (id text PRIMARY KEY, organization_id text, name text NOT NULL, domain text, archived_at text, ai_research_keywords text);`,
      ...readFileSync("drizzle/sqlite/0042_project_memory.sql", "utf8")
        .split("--> statement-breakpoint")
        .filter((sql) => !sql.includes("DROP TABLE")),
    ].join("\n"),
  );
});
afterAll(() => client.close());
beforeEach(async () => {
  beforeWrite = null;
  getProject.mockResolvedValue(project);
  listCompetitors.mockResolvedValue([]);
  await client.executeMultiple(
    "DELETE FROM project_competitors; DELETE FROM project_context_sections; DELETE FROM projects;",
  );
  await client.execute({
    sql: "INSERT INTO projects (id, organization_id, name) VALUES (?, ?, ?)",
    args: [projectId, customer.organizationId, project.name],
  });
});

async function saveContext() {
  await client.execute({
    sql: "INSERT INTO project_context_sections (project_id, key, content, updated_by) VALUES (?, 'business_overview', 'User overview', 'user')",
    args: [projectId],
  });
  await client.execute({
    sql: "INSERT INTO project_competitors (id, project_id, domain, name, notes, updated_by) VALUES ('saved', ?, 'rival.com', 'User rival', 'User notes', 'user')",
    args: [projectId],
  });
}

describe("ProjectWebsiteService.save", () => {
  it("fills missing fields without replacing an existing project name", async () => {
    await ProjectWebsiteService.save(accepted, customer, "user");
    expect(
      (
        await client.execute(
          "SELECT name, domain, ai_research_keywords FROM projects",
        )
      ).rows,
    ).toEqual([
      {
        name: project.name,
        domain: accepted.domain,
        ai_research_keywords: "new keyword\nsite audit",
      },
    ]);
    expect(
      new Set(
        (
          await client.execute("SELECT domain FROM project_competitors")
        ).rows.map((row) => row.domain),
      ),
    ).toEqual(new Set(accepted.competitors.map((row) => row.domain)));
    expect(
      (await client.execute("SELECT content FROM project_context_sections"))
        .rows[0]?.content,
    ).toBe(accepted.overview);
  });

  it.each(["before review", "during save"])(
    "preserves context saved %s, including the whole competitor list",
    async (timing) => {
      const edit = async () => {
        await saveContext();
        await client.execute(
          "UPDATE projects SET name = 'User name', domain = 'user.com', ai_research_keywords = 'user keyword'",
        );
      };
      if (timing === "before review") {
        await edit();
        listCompetitors.mockResolvedValue([{ domain: "rival.com" }]);
      } else beforeWrite = edit;

      await ProjectWebsiteService.save(accepted, customer, "user");

      expect(
        (
          await client.execute(
            "SELECT name, domain, ai_research_keywords FROM projects",
          )
        ).rows,
      ).toEqual([
        {
          name: "User name",
          domain: "user.com",
          ai_research_keywords: "user keyword",
        },
      ]);
      expect(
        (
          await client.execute(
            "SELECT content, updated_by FROM project_context_sections",
          )
        ).rows,
      ).toEqual([{ content: "User overview", updated_by: "user" }]);
      expect(
        (
          await client.execute(
            "SELECT domain, name, notes FROM project_competitors",
          )
        ).rows,
      ).toEqual([
        { domain: "rival.com", name: "User rival", notes: "User notes" },
      ]);
    },
  );
});

import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActivationRepository } from "./ActivationRepository";

const state = vi.hoisted(() => ({ database: null as DatabaseSync | null }));
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/db", () => ({
  db: drizzle(async (query, params, method) => {
    if (!state.database) throw new Error("Database not initialized");
    const statement = state.database.prepare(query);
    const values = params.map((value: unknown): SQLInputValue => {
      if (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "bigint"
      )
        return value;
      throw new Error("Unexpected SQL parameter");
    });
    if (method === "run") {
      statement.run(...values);
      return { rows: [] };
    }
    return { rows: statement.all(...values).map((row) => Object.values(row)) };
  }),
}));

beforeEach(() => {
  state.database?.close();
  state.database = new DatabaseSync(":memory:");
  state.database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE user (id text PRIMARY KEY);
    CREATE TABLE projects (id text PRIMARY KEY, organization_id text NOT NULL);
    CREATE TABLE member (id text PRIMARY KEY, organization_id text NOT NULL);
    CREATE TABLE invitation (id text PRIMARY KEY, organization_id text NOT NULL, status text NOT NULL, expires_at integer NOT NULL);
    CREATE TABLE project_activation_state (project_id text PRIMARY KEY, competitor_step_clicked_at text, keyword_step_clicked_at text, mcp_card_dismissed_at text, ga4_card_dismissed_at text, updated_at text);
    INSERT INTO user VALUES ('alice'), ('bob');
    INSERT INTO projects VALUES ('project-a', 'org-a'), ('project-b', 'org-a'), ('project-c', 'org-b');
    INSERT INTO member VALUES ('member-a', 'org-a');
  `);
  state.database.exec(
    readFileSync("drizzle/sqlite/0046_plain_the_watchers.sql", "utf8"),
  );
});

describe("checklist persistence", () => {
  it("applies a person's skip and restore to every project in that workspace only", async () => {
    const skip = (projectId: string, dismissed: boolean) =>
      ActivationRepository.setStepDismissed({
        userId: "alice",
        organizationId: "org-a",
        projectId,
        step: "competitor",
        dismissed,
      });
    await skip("project-a", true);
    await skip("project-b", true);
    expect(
      (
        await ActivationRepository.getDismissals({
          userId: "alice",
          organizationId: "org-a",
          projectId: "project-a",
        })
      ).skippedSteps,
    ).toEqual(["competitor"]);
    expect(
      (
        await ActivationRepository.getDismissals({
          userId: "bob",
          organizationId: "org-a",
          projectId: "project-a",
        })
      ).skippedSteps,
    ).toEqual([]);
    expect(
      (
        await ActivationRepository.getDismissals({
          userId: "alice",
          organizationId: "org-b",
          projectId: "project-c",
        })
      ).skippedSteps,
    ).toEqual([]);
    await skip("project-a", false);
    expect(
      (
        await ActivationRepository.getDismissals({
          userId: "alice",
          organizationId: "org-a",
          projectId: "project-a",
        })
      ).skippedSteps,
    ).toEqual([]);
  });
  it("keeps the agent card and step separate, while older agent dismissals hide both", async () => {
    await ActivationRepository.dismissAgentCard("alice", "project-a");
    expect(
      await ActivationRepository.getDismissals({
        userId: "alice",
        organizationId: "org-a",
        projectId: "project-a",
      }),
    ).toEqual({
      skippedSteps: [],
      agentCardDismissed: true,
    });
    await ActivationRepository.setStepDismissed({
      userId: "bob",
      organizationId: "org-a",
      projectId: "project-a",
      step: "mcp",
      dismissed: true,
    });
    expect(
      await ActivationRepository.getDismissals({
        userId: "bob",
        organizationId: "org-a",
        projectId: "project-a",
      }),
    ).toEqual({
      skippedSteps: ["mcp"],
      agentCardDismissed: false,
    });
    state.database!.exec(
      "INSERT INTO dashboard_step_dismissals VALUES ('alice', 'project-b', 'mcp')",
    );
    expect(
      await ActivationRepository.getDismissals({
        userId: "alice",
        organizationId: "org-a",
        projectId: "project-a",
      }),
    ).toEqual({
      skippedSteps: ["mcp"],
      agentCardDismissed: true,
    });
  });
  it("restores the agent step from dismissals made before the card and step were split", async () => {
    state.database!.exec(`
      INSERT INTO project_activation_state (project_id, mcp_card_dismissed_at) VALUES ('project-a', '2026-09-05');
      INSERT INTO dashboard_step_dismissals VALUES ('alice', 'project-b', 'mcp');
    `);
    expect(
      await ActivationRepository.getDismissals({
        userId: "bob",
        organizationId: "org-a",
        projectId: "project-a",
      }),
    ).toEqual({ skippedSteps: ["mcp"], agentCardDismissed: true });
    await ActivationRepository.setStepDismissed({
      userId: "alice",
      organizationId: "org-a",
      projectId: "project-a",
      step: "mcp",
      dismissed: false,
    });
    expect(
      await ActivationRepository.getDismissals({
        userId: "alice",
        organizationId: "org-a",
        projectId: "project-a",
      }),
    ).toEqual({
      skippedSteps: [],
      agentCardDismissed: false,
    });
    expect(
      state
        .database!.prepare(
          "SELECT mcp_card_dismissed_at FROM project_activation_state",
        )
        .get()?.mcp_card_dismissed_at,
    ).toBeNull();
  });
  it("counts research on any project in the workspace", async () => {
    await ActivationRepository.recordResearch("project-b", "keywords");
    const research = await ActivationRepository.getWorkspaceResearch("org-a");
    expect(research.competitorResearchedAt).toBeNull();
    expect(research.keywordResearchedAt).not.toBeNull();
    expect(await ActivationRepository.getWorkspaceResearch("org-b")).toEqual({
      competitorResearchedAt: null,
      keywordResearchedAt: null,
    });
  });
  it("counts only teammates and unexpired pending invitations in this workspace", async () => {
    expect(await ActivationRepository.hasTeammate("org-a")).toBe(false);
    state.database!.exec("INSERT INTO member VALUES ('member-b', 'org-b')");
    state
      .database!.prepare("INSERT INTO invitation VALUES (?, ?, ?, ?)")
      .run("expired", "org-a", "pending", Date.now() - 1000);
    expect(await ActivationRepository.hasTeammate("org-a")).toBe(false);
    state
      .database!.prepare("INSERT INTO invitation VALUES (?, ?, ?, ?)")
      .run("valid", "org-a", "pending", Date.now() + 100000);
    expect(await ActivationRepository.hasTeammate("org-a")).toBe(true);
    expect(await ActivationRepository.hasTeammate("org-b")).toBe(false);
  });
  it("removes preferences when their project or user is deleted", async () => {
    await ActivationRepository.setStepDismissed({
      userId: "alice",
      organizationId: "org-a",
      projectId: "project-a",
      step: "team",
      dismissed: true,
    });
    await ActivationRepository.dismissAgentCard("bob", "project-b");
    state.database!.exec(
      "DELETE FROM user WHERE id = 'alice'; DELETE FROM projects WHERE id = 'project-b'",
    );
    expect(
      state.database!.prepare("SELECT * FROM dashboard_step_dismissals").all(),
    ).toEqual([]);
  });
});

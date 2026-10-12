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
    CREATE TABLE projects (id text PRIMARY KEY);
    CREATE TABLE member (id text PRIMARY KEY, organization_id text NOT NULL);
    CREATE TABLE invitation (id text PRIMARY KEY, organization_id text NOT NULL, status text NOT NULL, expires_at integer NOT NULL);
    CREATE TABLE project_activation_state (project_id text PRIMARY KEY, mcp_card_dismissed_at text);
    INSERT INTO user VALUES ('alice'), ('bob');
    INSERT INTO projects VALUES ('project-a'), ('project-b');
    INSERT INTO member VALUES ('member-a', 'org-a');
  `);
  state.database.exec(
    readFileSync("drizzle/sqlite/0046_plain_the_watchers.sql", "utf8"),
  );
});

describe("checklist persistence", () => {
  it("isolates preferences by person and project and makes dismissal idempotent", async () => {
    await ActivationRepository.setStepDismissed(
      "alice",
      "project-a",
      "project",
      true,
    );
    await ActivationRepository.setStepDismissed(
      "alice",
      "project-a",
      "project",
      true,
    );
    expect(
      await ActivationRepository.getDismissedSteps("alice", "project-a"),
    ).toEqual([{ step: "project" }]);
    expect(
      await ActivationRepository.getDismissedSteps("bob", "project-a"),
    ).toEqual([]);
    expect(
      await ActivationRepository.getDismissedSteps("alice", "project-b"),
    ).toEqual([]);
    await ActivationRepository.setStepDismissed(
      "alice",
      "project-a",
      "project",
      false,
    );
    expect(
      await ActivationRepository.getDismissedSteps("alice", "project-a"),
    ).toEqual([]);
  });
  it("restores legacy MCP dismissals without changing authorization milestones", async () => {
    state.database!.exec(
      "INSERT INTO project_activation_state VALUES ('project-a', '2026-09-05')",
    );
    await ActivationRepository.setStepDismissed(
      "alice",
      "project-a",
      "mcp",
      false,
    );
    expect(
      state
        .database!.prepare(
          "SELECT mcp_card_dismissed_at FROM project_activation_state",
        )
        .get()?.mcp_card_dismissed_at,
    ).toBeNull();
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
    await ActivationRepository.setStepDismissed(
      "alice",
      "project-a",
      "team",
      true,
    );
    await ActivationRepository.setStepDismissed(
      "bob",
      "project-b",
      "audit",
      true,
    );
    state.database!.exec(
      "DELETE FROM user WHERE id = 'alice'; DELETE FROM projects WHERE id = 'project-b'",
    );
    expect(
      state.database!.prepare("SELECT * FROM dashboard_step_dismissals").all(),
    ).toEqual([]);
  });
});

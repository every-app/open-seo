import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectTool } from "./create-project";
import { makeToolContext } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  markOnboardingCompleted: vi.fn(),
  captureServerEvent: vi.fn(),
}));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    createProject: mocks.createProject,
  },
}));

vi.mock(
  "@/server/features/activation/repositories/ActivationRepository",
  () => ({
    ActivationRepository: {
      markOnboardingCompleted: mocks.markOnboardingCompleted,
    },
  }),
);

vi.mock("cloudflare:workers", () => ({
  waitUntil: (promise: Promise<unknown>) => promise,
}));

vi.mock("@/server/lib/posthog", () => ({
  captureServerEvent: mocks.captureServerEvent,
}));

// makeToolContext's default clientId makes this a hosted (OAuth / API key)
// caller; clientId null is self-host or SAM.
const toolContext = makeToolContext();

describe("create_project MCP tool", () => {
  beforeEach(() => {
    mocks.createProject.mockResolvedValue({
      id: "project_new",
      name: "Acme",
      domain: "acme.com",
      locationCode: 2840,
      languageCode: "en",
    });
    mocks.markOnboardingCompleted.mockResolvedValue(false);
  });

  it("creates a project in the credential's organization and returns it", async () => {
    const result = await createProjectTool.handler(
      { name: "Acme", domain: "acme.com", locationCode: 2840 },
      toolContext,
    );

    // The schema does not derive languageCode; the service resolves it from
    // the locationCode, so the tool forwards exactly what was validated.
    expect(mocks.createProject).toHaveBeenCalledWith("org_123", {
      name: "Acme",
      domain: "acme.com",
      locationCode: 2840,
    });
    expect(result.structuredContent?.project).toMatchObject({
      id: "project_new",
      name: "Acme",
      domain: "acme.com",
      locationCode: 2840,
      languageCode: "en",
      url: "https://open-seo.test/p/project_new",
    });
    // The agent did the wizard's main job, so the app skips onboarding.
    expect(mocks.markOnboardingCompleted).toHaveBeenCalledWith(
      "user_123",
      "org_123",
    );
    const first = result.content?.[0];
    expect(first?.type).toBe("text");
    if (first?.type === "text") {
      expect(first.text).toContain("project_new");
    }
  });

  it("rejects an unsupported location as a readable validation error", async () => {
    const call = () =>
      createProjectTool.handler(
        { name: "Bad location", locationCode: 999999 },
        toolContext,
      );

    await expect(call()).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    // The message must name the offending field so the calling agent can
    // retry with a supported code, not just repeat the bare error code.
    await expect(call()).rejects.toThrow(
      "Unsupported DataForSEO location code",
    );
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it("rejects a member role from creating projects", async () => {
    const memberContext = makeToolContext({ role: "member" });

    await expect(
      createProjectTool.handler({ name: "Acme" }, memberContext),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it("skips onboarding completion for self-host and SAM callers", async () => {
    await createProjectTool.handler(
      { name: "Acme" },
      makeToolContext({ clientId: null }),
    );

    expect(mocks.createProject).toHaveBeenCalledWith("org_123", {
      name: "Acme",
    });
    expect(mocks.markOnboardingCompleted).not.toHaveBeenCalled();
  });

  it("still returns the project when marking onboarding complete fails", async () => {
    mocks.markOnboardingCompleted.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await createProjectTool.handler(
      { name: "Acme" },
      toolContext,
    );

    // A failed tool call would make the agent retry and duplicate the project.
    expect(result.structuredContent?.project).toMatchObject({
      id: "project_new",
    });
  });

  it("reports onboarding completion only from the call that completed it", async () => {
    mocks.markOnboardingCompleted.mockResolvedValueOnce(true);

    await createProjectTool.handler({ name: "Acme" }, toolContext);
    await createProjectTool.handler({ name: "Acme" }, toolContext);

    expect(mocks.captureServerEvent).toHaveBeenCalledTimes(1);
    expect(mocks.captureServerEvent).toHaveBeenCalledWith({
      distinctId: "user_123",
      event: "onboarding:completed",
      organizationId: "org_123",
      properties: { via: "agent_project" },
    });
  });
});

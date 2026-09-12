import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowStep } from "cloudflare:workers";

// The rank-check workflow's scope enforcement: when keywordIds are provided,
// DataForSEO tasks and snapshots must be created for exactly those keywords —
// never the config's full keyword list.

interface KeywordEntry {
  id: string;
  keyword: string;
}

interface CheckContextCall {
  keywords: KeywordEntry[];
}

interface RunUpdateCall {
  keywordsTotal?: number;
  status?: string;
  keywordsChecked?: number;
  errorMessage?: string;
  completedAt?: string;
}

const repoMocks = vi.hoisted(() => ({
  getRunById: vi.fn(),
  updateRun: vi.fn<
    (runId: string, data: RunUpdateCall) => Promise<void>
  >(),
  getKeywordsForConfig: vi.fn<
    (configId: string) => Promise<KeywordEntry[]>
  >(),
  insertSnapshots: vi.fn(),
  getSnapshotsForRun: vi.fn(),
  getConfigById: vi.fn(),
  updateConfig: vi.fn(),
}));

const pathsMocks = vi.hoisted(() => ({
  runLiveCheck: vi.fn<
    (step: unknown, ctx: CheckContextCall) => Promise<void>
  >(),
  runQueuedCheck: vi.fn(),
}));

const guardModule = vi.hoisted(() => ({
  failRunIfActive: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  env: {},
  NonRetryableError: class NonRetryableError extends Error {},
  // The workflow under test extends this base class; a do-nothing body keeps
  // the mock constructible while the ctor arity matches the engine's.
  // oxlint-disable-next-line typescript/no-extraneous-class -- mock base class must be constructible
  WorkflowEntrypoint: class WorkflowEntrypointMock {
    public readonly __mockEngine = true;
  },
}));
vi.mock("cloudflare:workflows", () => ({
  NonRetryableError: class NonRetryableError extends Error {},
}));
vi.mock("@/db", () => ({
  withPgClient: <T>(fn: () => Promise<T>) => fn(),
}));
vi.mock(
  "@/server/features/rank-tracking/repositories/RankTrackingRepository",
  () => ({ RankTrackingRepository: repoMocks }),
);
vi.mock("@/server/features/rank-tracking/services/rankCheckRunGuards", () => ({
  failRunIfActive: guardModule.failRunIfActive,
}));
vi.mock("@/server/workflows/rankCheckPaths", () => ({
  runLiveCheck: pathsMocks.runLiveCheck,
  runQueuedCheck: pathsMocks.runQueuedCheck,
}));
vi.mock("@/server/workflows/pgStep", () => ({
  // Execute the step body immediately; the workflow engine's persistence is
  // irrelevant to what we're asserting (which keywords reach the check path).
  pgStep: (
    _step: unknown,
    _name: string,
    _config: unknown,
    fn: () => unknown,
  ) => fn(),
}));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({}),
}));
vi.mock("@/server/lib/posthog", () => ({
  captureServerEvent: vi.fn(),
}));
vi.mock("@/server/billing/autumn", () => ({
  autumn: { check: vi.fn() },
}));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: vi.fn().mockResolvedValue(false),
}));

const activeRun = { id: "run_1", status: "pending", keywordsTotal: 0 };

const billingCustomer = {
  userId: "user_1",
  userEmail: "user@example.com",
  organizationId: "org_1",
  projectId: "project_1",
};

interface WorkflowEventPayload {
  runId: string;
  configId: string;
  billingCustomer: typeof billingCustomer;
  projectId: string;
  domain: string;
  locationCode: number;
  languageCode: string;
  devices: "both" | "desktop" | "mobile";
  serpDepth: number;
  trigger: "manual" | "scheduled";
  keywordIds?: string[];
}

async function runWorkflow(params: {
  keywordIds?: string[];
  trigger?: "manual" | "scheduled";
}) {
  const { RankCheckWorkflow } = await import("./RankCheckWorkflow");
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- engine ctor args are unused by the workflow body
  const instance = new RankCheckWorkflow({} as never, {} as never);
  const step = {
    do: (name: string, arg2: unknown, arg3?: unknown) => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- step callbacks are always functions at the call sites we exercise
      const fn = (arg3 ?? arg2) as () => unknown;
      return Promise.resolve(fn());
    },
    sleep: () => Promise.resolve(),
    sleepUntil: () => Promise.resolve(),
    // Never invoked by the workflow under test; typed to satisfy the engine's
    // WorkflowStep surface without importing real runtime code.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- unused stub cast to the engine's step signature
    waitForEvent: (() => Promise.resolve({} as never)) as unknown as WorkflowStep["waitForEvent"],
  };
  const payload: WorkflowEventPayload = {
    runId: "run_1",
    configId: "config_1",
    billingCustomer,
    projectId: "project_1",
    domain: "acme.com",
    locationCode: 2840,
    languageCode: "en",
    devices: "both",
    serpDepth: 20,
    trigger: params.trigger ?? "manual",
    keywordIds: params.keywordIds,
  };
  const event = {
    payload,
    timestamp: new Date(),
    instanceId: "run_1",
  };
  return instance.run(event, step);
}

function makeKeywords(count: number): KeywordEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `keyword_${i + 1}`,
    keyword: `tracked query ${i + 1}`,
  }));
}

function liveCheckContext(index = 0): CheckContextCall {
  const calls = pathsMocks.runLiveCheck.mock.calls;
  const call = calls[index];
  if (!call) throw new Error(`No runLiveCheck call at index ${index}`);
  return call[1];
}

function runUpdateTotals(): number[] {
  return repoMocks.updateRun.mock.calls
    .map(([, data]) => data.keywordsTotal)
    .filter((total): total is number => typeof total === "number");
}

describe("RankCheckWorkflow scope enforcement", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(repoMocks)) mock.mockReset();
    for (const mock of Object.values(pathsMocks)) mock.mockReset();
    guardModule.failRunIfActive.mockReset();

    repoMocks.getRunById.mockResolvedValue(activeRun);
    repoMocks.getConfigById.mockResolvedValue({ isActive: true });
    repoMocks.getKeywordsForConfig.mockResolvedValue(makeKeywords(901));
    repoMocks.getSnapshotsForRun.mockResolvedValue([]);
    repoMocks.updateRun.mockResolvedValue(undefined);
    repoMocks.updateConfig.mockResolvedValue(undefined);
    pathsMocks.runLiveCheck.mockResolvedValue(undefined);
    pathsMocks.runQueuedCheck.mockResolvedValue({
      queueTasks: 0,
      queueCollected: 0,
      fallbackTasks: 0,
      fallbackChecked: 0,
    });
  });

  it("REGRESSION: 901 tracked keywords, 4 selected — check path receives exactly 4 keywords", async () => {
    const selected = ["keyword_1", "keyword_2", "keyword_3", "keyword_4"];
    await runWorkflow({ keywordIds: selected });

    expect(pathsMocks.runLiveCheck).toHaveBeenCalledTimes(1);
    const ctx = liveCheckContext();
    expect(ctx.keywords).toHaveLength(4);
    expect(ctx.keywords.map((kw) => kw.id)).toEqual(selected);
  });

  it("without keywordIds the check path receives the full keyword list", async () => {
    await runWorkflow({});

    expect(liveCheckContext().keywords).toHaveLength(901);
  });

  it("sets the run's keywordsTotal to the selected scope", async () => {
    await runWorkflow({
      keywordIds: ["keyword_7", "keyword_9", "keyword_11"],
    });

    expect(runUpdateTotals()).toContain(3);
  });

  it("fails the run when none of the selected ids are tracked", async () => {
    await expect(
      runWorkflow({ keywordIds: ["foreign_a", "foreign_b"] }),
    ).rejects.toThrow("No keywords to track");
    expect(pathsMocks.runLiveCheck).not.toHaveBeenCalled();
    expect(guardModule.failRunIfActive).toHaveBeenCalled();
  });
});

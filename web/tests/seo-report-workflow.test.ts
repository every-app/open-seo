import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => {
  class Bound {
    constructor(
      protected ctx: unknown,
      protected env: unknown,
    ) {}
  }
  return { DurableObject: Bound, WorkflowEntrypoint: Bound };
});
const writeReport = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/seo-report/write", () => ({ writeReport }));
vi.mock("../src/lib/seo-report/removed-sites.json", () => ({
  default: ["example.org"],
}));
import {
  SeoReportWorkflow,
  type ReportParams,
} from "../src/lib/seo-report/workflow";
import { deskWorld, report } from "./seo-report-support";

// The Workflow is where money is spent. Cloudflare can run a step again
// after an engine restart, so each test runs the whole thing as it would.

/** Runs every step at once, with no memory of an earlier run: the worst a restart can do. */
const step = {
  do: (_: string, ...rest: unknown[]) => (rest.at(-1) as () => unknown)(),
} as unknown as WorkflowStep;

function workflow() {
  const world = deskWorld();
  Object.assign(world.env, {
    SEO_REPORT_DESK: { idFromName: () => "desk", get: () => world.desk },
  });
  const instance = new SeoReportWorkflow({} as ExecutionContext, world.env);
  const run = (id: string, payload: ReportParams) =>
    instance.run(
      { instanceId: id, payload } as WorkflowEvent<ReportParams>,
      step,
    );
  return { ...world, run };
}

beforeEach(() => {
  vi.stubEnv("DEV", false);
  vi.spyOn(console, "error").mockImplementation(() => {});
  writeReport.mockImplementation(async (_: unknown, site: string) =>
    report(site),
  );
});

it("writes a report once, however many times the Workflow runs", async () => {
  const { ask, run, started, emails, desk } = workflow();
  await ask("example.com");
  const { id, site } = started[0]!;
  await run(id, { site });
  await run(id, { site });
  expect(writeReport).toHaveBeenCalledTimes(1);
  await desk.alarm();
  expect(emails.map((email) => email.transactionalId)).toEqual([
    "ready-template",
  ]);
});

it("ends a run as failed when the paid step is started a second time without having finished", async () => {
  const { ask, run, started, emails, desk } = workflow();
  await ask("example.com");
  const { id, site } = started[0]!;
  // The first try died mid-write: it began, and never came back.
  await desk.beginWriting(id);
  await run(id, { site });
  expect(writeReport).not.toHaveBeenCalled();
  await desk.alarm();
  expect(emails.map((email) => email.transactionalId)).toEqual([
    "failed-template",
  ]);
});

it("passes on why a report wasn't written", async () => {
  const { ask, run, started, emails, desk } = workflow();
  writeReport.mockResolvedValue("closed");
  await ask("example.com");
  await run(started[0]!.id, { site: "example.com" });
  await desk.alarm();
  expect(emails[0]!.dataVariables.reason).toBe(
    "The site says the company has closed.",
  );
});

it("writes nothing for a site removed while its report waited", async () => {
  const { ask, run, started } = workflow();
  await ask("app.example.org");
  await run(started[0]!.id, { site: "app.example.org" });
  expect(writeReport).not.toHaveBeenCalled();
});

it("empties the line on the team's command", async () => {
  const { ask, run } = workflow();
  for (const index of [0, 1, 2, 3, 4]) await ask(`site-${index}.example`);
  expect(await run("command", { emptyLine: true })).toEqual({ emptied: 2 });
});

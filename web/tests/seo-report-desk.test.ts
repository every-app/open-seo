import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      protected ctx: unknown,
      protected env: unknown,
    ) {}
  },
}));
import {
  SeoReportAccepted as Accepted,
  SeoReportRefusal as Refusal,
} from "../src/lib/seo-report/contract";
import { ReportFailure } from "../src/lib/seo-report/failure";
import type { StoredReport } from "../src/lib/seo-report/desk";
import { REPORT_LIMITS } from "../src/lib/seo-report/limits";
import { reportPdf } from "../src/lib/seo-report/pdf";
import { deskWorld, report } from "./seo-report-support";

// The desk holds every limit, the line and who is waiting. Each test here is
// one way the tool could be made to spend, email or keep more than it should.

const HOUR = 60 * 60_000;
const times = <T>(count: number, make: (index: number) => T) =>
  Array.from({ length: count }, (_, index) => make(index));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-18T12:00:00Z"));
  vi.stubEnv("DEV", false);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.useRealTimers());

describe("limits, counted in the same step that checks them", () => {
  it("lets one mailbox start one report when 40 requests arrive together", async () => {
    const { ask, started } = deskWorld();
    const answers = await Promise.all(
      times(40, (index) =>
        ask(`site-${index}.example`, { mailbox: "one", network: "one" }),
      ),
    );
    expect(
      answers.filter((answer) => answer === Accepted.Writing),
    ).toHaveLength(1);
    expect(started).toHaveLength(1);
  });

  it("tells a mailbox's second request of the day the truth, and counts the attempt against its network", async () => {
    const { ask } = deskWorld();
    const from = { mailbox: "one", network: "one" };
    expect(await ask("first.example", from)).toBe(Accepted.Writing);
    expect(await ask("second.example", from)).toBe(Refusal.EmailLimit);
    expect(await ask("third.example", from)).toBe(Refusal.EmailLimit);
    // Three counted: the report, and two tries at a used address.
    expect(await ask("fourth.example", { network: "one" })).toBe(
      Refusal.NetworkLimit,
    );
  });

  it("stops a network at three reports a day and lets it back the next day", async () => {
    const { ask } = deskWorld();
    const from = { network: "one" };
    for (const site of ["a.example", "b.example", "c.example"])
      expect(await ask(site, from)).toBe(Accepted.Writing);
    expect(await ask("d.example", from)).toBe(Refusal.NetworkLimit);
    vi.setSystemTime(new Date("2026-11-19T00:00:01Z"));
    expect(await ask("d.example", from)).not.toBe(Refusal.NetworkLimit);
  });

  it("promises no more emails in a day than the site-wide cap", async () => {
    const { desk, ask, started } = deskWorld();
    await ask("site.example");
    await desk.finish(started[0]!.id, report("site.example"));
    // A written report is emailed again, so nothing but the cap stops these.
    for (let sent = 1; sent < REPORT_LIMITS.emailsPerDay; sent += 1)
      expect(await ask("site.example")).toBe(Accepted.Sent);
    expect(await ask("site.example")).toBe(Refusal.DayFull);
    expect(started).toHaveLength(1);
  });

  it("takes nothing from a request it refuses", async () => {
    const { desk, ask } = deskWorld();
    const from = { mailbox: "one", network: "one" };
    for (const index of times(
      REPORT_LIMITS.writing + REPORT_LIMITS.line,
      (i) => i,
    ))
      await ask(`site-${index}.example`);
    expect(await ask("late.example", from)).toBe(Refusal.LineFull);
    await desk.empty();
    expect(await ask("late.example", from)).toBe(Accepted.InLine);
  });
});

describe("the line", () => {
  it("writes three at once, starts the next when one ends, and keeps the rest waiting", async () => {
    const { desk, ask, started } = deskWorld();
    const answers = [];
    for (const index of times(5, (i) => i))
      answers.push(await ask(`site-${index}.example`));
    expect(answers).toEqual([
      Accepted.Writing,
      Accepted.Writing,
      Accepted.Writing,
      Accepted.InLine,
      Accepted.InLine,
    ]);
    await desk.finish(started[0]!.id, report("site-0.example"));
    await desk.alarm();
    expect(started.map((run) => run.site)).toEqual([
      "site-0.example",
      "site-1.example",
      "site-2.example",
      "site-3.example",
    ]);
  });

  it("starts nothing the daily budget has no room for, and reserves each report once", async () => {
    const { desk, ask, reserve, started } = deskWorld();
    reserve.mockResolvedValue("daily");
    expect(await ask("site.example")).toBe(Accepted.InLine);
    expect(started).toHaveLength(0);
    reserve.mockResolvedValue("allowed");
    await desk.alarm();
    await desk.alarm();
    expect(started).toHaveLength(1);
    const allowed = reserve.mock.results.length - 1;
    expect(allowed).toBe(1);
    expect(reserve.mock.calls[0]![0]).toMatchObject({
      tool: "seo-report",
      calls: 1,
    });
  });

  it("starts nothing while a secret it needs is missing, which is how it is stopped in a hurry", async () => {
    const { desk, env, ask, started } = deskWorld();
    delete env.OPENROUTER_API_KEY;
    await ask("site.example");
    await desk.alarm();
    expect(started).toHaveLength(0);
  });

  it("puts a second request for the same site on the same run, up to twenty people", async () => {
    const { ask, started } = deskWorld();
    for (let people = 0; people < REPORT_LIMITS.askersPerSite; people += 1)
      expect(await ask("site.example")).toBe(Accepted.Writing);
    expect(await ask("site.example")).toBe(Refusal.SiteBusy);
    expect(started).toHaveLength(1);
  });

  it("gives up a report that waited too long, says so once, and forgets the address", async () => {
    const { desk, ask, reserve, emails, started } = deskWorld();
    // The day's budget is spent, so the report waits.
    reserve.mockResolvedValue("daily");
    await ask("site.example");
    vi.setSystemTime(Date.now() + REPORT_LIMITS.maxWaitHours * HOUR);
    await desk.alarm();
    await desk.alarm();
    expect(emails).toEqual([
      {
        transactionalId: "failed-template",
        email: "person-1@inbox.test",
        addToAudience: false,
        // No site: whoever asked chose its name.
        dataVariables: {
          source: "openseo.so/seo-report",
          reason:
            "We had more requests than we could write. You can ask again.",
        },
      },
    ]);
    // The site isn't stuck behind the run that was given up.
    reserve.mockResolvedValue("allowed");
    expect(await ask("site.example")).toBe(Accepted.Writing);
    expect(started).toHaveLength(1);
  });

  it("keeps a given-up report's askers until their email goes, however often the send fails", async () => {
    const { desk, ask, reserve, emails, loops } = deskWorld();
    reserve.mockResolvedValue("daily");
    await ask("site.example");
    vi.setSystemTime(Date.now() + REPORT_LIMITS.maxWaitHours * HOUR);
    loops.status = 500;
    await desk.alarm();
    await desk.alarm();
    expect(emails).toHaveLength(0);
    loops.status = 200;
    await desk.alarm();
    await desk.alarm();
    expect(emails).toHaveLength(1);
  });

  it("writes a report whose turn comes after a day in line, instead of giving it up", async () => {
    const { desk, ask, reserve, started, emails } = deskWorld();
    reserve.mockResolvedValue("daily");
    await ask("site.example");
    // The day's budget is back, 24 hours and a few minutes on.
    vi.setSystemTime(Date.now() + 24 * HOUR + 10 * 60_000);
    reserve.mockResolvedValue("allowed");
    await desk.alarm();
    expect(started).toHaveLength(1);
    expect(emails).toHaveLength(0);
  });

  it("doesn't spend a reservation on a run that leaves the line while the budget is asked", async () => {
    const { desk, ask, reserve, started } = deskWorld();
    let emptied: number | undefined;
    reserve.mockImplementationOnce(async () => {
      // The line is emptied while the reservation is in flight.
      void desk.empty().then((count) => {
        emptied = count;
      });
      await new Promise((resolve) => setTimeout(resolve));
      return "allowed";
    });
    await ask("site.example");
    await vi.waitFor(() => expect(emptied).toBe(0));
    expect(started).toHaveLength(1);
  });

  it("empties the line in one step: no email, no address kept, reports being written untouched", async () => {
    const { desk, ask, emails, started } = deskWorld();
    for (const index of times(5, (i) => i)) await ask(`site-${index}.example`);
    expect(await desk.empty()).toBe(2);
    await desk.alarm();
    expect(emails).toHaveLength(0);
    expect(started).toHaveLength(3);
    // The emptied sites can be asked for again, as new runs.
    expect(await ask("site-4.example")).toBe(Accepted.InLine);
  });
});

describe("a run", () => {
  it("lets the paid step begin once", async () => {
    const { desk, ask, started } = deskWorld();
    await ask("site.example");
    const run = started[0]!.id;
    expect(await desk.beginWriting(run)).toBe(true);
    expect(await desk.beginWriting(run)).toBe(false);
    expect(await desk.beginWriting("no-such-run")).toBe(false);
  });

  it("emails the report's link, a sign-up link with the site filled in, and where the address was entered", async () => {
    const { desk, ask, emails, started } = deskWorld();
    await ask("site.example");
    await desk.finish(started[0]!.id, report("site.example"));
    await desk.alarm();
    await desk.alarm();
    expect(emails).toHaveLength(1);
    const { reportUrl, ...rest } = emails[0]!.dataVariables;
    expect(emails[0]).toMatchObject({
      transactionalId: "ready-template",
      email: "person-1@inbox.test",
      addToAudience: false,
    });
    expect(rest).toEqual({
      domain: "site.example",
      signupUrl:
        "https://app.openseo.so/sign-up?domain=site.example&utm_source=seo-report&utm_medium=email&utm_content=openseo.so%2Fseo-report",
      source: "openseo.so/seo-report",
    });
    const token = /^https:\/\/openseo\.so\/seo-report\/r\/([a-f0-9]{32})$/.exec(
      reportUrl!,
    )?.[1];
    expect(await desk.report(token!)).toMatchObject({ site: "site.example" });
  });

  it("still opens a report stored before the plan had fields, as one finished page", async () => {
    const { desk, ask, emails, started } = deskWorld();
    await ask("site.example");
    const { standing, customer, moves, ...before } = report("site.example");
    await desk.finish(started[0]!.id, {
      ...before,
      takeaways: ["One finding."],
      stats: [{ label: "Keyword families", value: "3" }],
    } as unknown as StoredReport);
    await desk.alarm();
    await desk.alarm();
    const stored = await desk.report(
      emails[0]!.dataVariables.reportUrl!.split("/").at(-1)!,
    );
    expect(stored).toMatchObject({ standing: null, customer: "", moves: [] });
    const pdf = Buffer.from(await (await reportPdf(stored!)).arrayBuffer());
    expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(1);
  });

  it("says why there is no report with our sentence for the reason", async () => {
    const { desk, ask, emails, started } = deskWorld();
    await ask("site.example");
    await desk.finish(started[0]!.id, ReportFailure.NotUnitedStates);
    await desk.alarm();
    expect(emails[0]).toMatchObject({
      transactionalId: "failed-template",
      dataVariables: {
        reason:
          "Reports use United States search data, and this site doesn't appear to serve the United States.",
      },
    });
  });

  it("ignores a late finish from a run that was given up, so it can't touch the next run", async () => {
    const { desk, ask, emails, started } = deskWorld();
    await ask("site.example");
    const lost = started[0]!.id;
    vi.setSystemTime(Date.now() + HOUR);
    await desk.alarm();
    expect(emails.map((email) => email.transactionalId)).toEqual([
      "failed-template",
    ]);

    expect(await ask("site.example")).toBe(Accepted.Writing);
    await desk.finish(lost, report("site.example"));
    await desk.alarm();
    // Still being written: the new asker has been sent nothing yet.
    expect(emails).toHaveLength(1);
    await desk.finish(started[1]!.id, report("site.example"));
    await desk.alarm();
    expect(emails.map((email) => email.transactionalId)).toEqual([
      "failed-template",
      "ready-template",
    ]);
  });

  it("stops serving a report after 90 days and writes a new one after 30", async () => {
    const { desk, ask, emails, started } = deskWorld();
    await ask("site.example");
    await desk.finish(started[0]!.id, report("site.example"));
    await desk.alarm();
    const token = emails[0]!.dataVariables.reportUrl!.split("/").at(-1)!;
    vi.setSystemTime(Date.now() + 31 * 24 * HOUR);
    expect(await ask("site.example")).toBe(Accepted.Writing);
    expect(await desk.report(token)).not.toBeNull();
    vi.setSystemTime(Date.now() + 60 * 24 * HOUR);
    expect(await desk.report(token)).toBeNull();
  });
});

import { DurableObject } from "cloudflare:workers";
import { z } from "zod";
import { reportsOpen, type SeoReportEnv } from "./config";
import {
  REPORTS_PER_NETWORK_PER_DAY,
  SeoReportAccepted,
  SeoReportRefusal,
  type SeoReportStatus,
} from "./contract";
import { EmailSend, sendReportEmail, type Ending } from "./email";
import { ReportFailure } from "./failure";
import { REPORT_LIMITS } from "./limits";
import { moveSchema } from "./plan";
import { sha256Hex, utcDay } from "./site";

// Everything the SEO report tool remembers, in one object with one SQLite
// database: the day's counts, the line, who is waiting on each report, and
// the reports themselves. One object on purpose. A request is checked against
// every limit and given its place in a single transaction, and a run leaves
// the line by a change to its own row, so no two records of the same thing
// can fall out of step.
//
// The alarm does everything that takes time: it gives up runs that waited too
// long, starts the next ones, sends the emails a finished run owes and
// forgets what is old. Whoever is owed an email is found from the rows
// themselves (an asker of a finished run), so a failed send is simply still
// there on the next pass.

enum RunStatus {
  Waiting = "waiting",
  Writing = "writing",
  Written = "written",
  Failed = "failed",
}

const storedReportSchema = z.object({
  site: z.string(),
  title: z.string().min(1),
  headline: z.string(),
  // A report written before the plan had fields (2026-11-20) has none of
  // these three: its plan is in its Markdown, and it is drawn from that.
  standing: z.string().nullable().default(null),
  customer: z.string().default(""),
  moves: z.array(moveSchema).default([]),
  markdown: z.string().min(1),
  /** Sites the report may link to besides its own: the ones on the results pages it checked. */
  hosts: z.array(z.string()),
  writtenAt: z.string(),
});
export type StoredReport = z.infer<typeof storedReportSchema>;

/** One request, after its cheap checks. Only `email` is an address; the rest are hashes or public names. */
export interface Ask {
  site: string;
  email: string;
  /** Where the form was: openseo.so/seo-report, or a partner's hostname. */
  source: string;
  /** Hashes of the mailbox and the network, which the daily limits count. */
  mailbox: string;
  network: string;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MAX_WAIT_MS = REPORT_LIMITS.maxWaitHours * HOUR;
const REUSE_MS = REPORT_LIMITS.reuseDays * DAY;
const KEEP_MS = REPORT_LIMITS.keepDays * DAY;
// Longer than a run can take. A report still unfinished by then lost its Workflow.
const ABANDONED_MS = (REPORT_LIMITS.runMinutes + 15) * MINUTE;
// An email that still can't be sent after this is dropped, and its address with it.
const EMAIL_GIVE_UP_MS = 6 * HOUR;
const EMAILS_PER_PASS = 50;
const EMAILS_COUNT = "emails";

type Taken = { status: SeoReportStatus; run?: string; created?: boolean };

export class SeoReportDesk extends DurableObject<SeoReportEnv> {
  private last: Promise<unknown> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: SeoReportEnv) {
    super(ctx, env);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS counts (
        key TEXT NOT NULL, day TEXT NOT NULL, used INTEGER NOT NULL,
        PRIMARY KEY (key, day)
      );
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        site TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        admitted_at INTEGER,
        finished_at INTEGER,
        workflow_started INTEGER NOT NULL DEFAULT 0,
        writing_began INTEGER NOT NULL DEFAULT 0,
        token TEXT UNIQUE,
        report TEXT,
        failure TEXT
      );
      CREATE INDEX IF NOT EXISTS runs_by_site ON runs (site, status);
      CREATE TABLE IF NOT EXISTS askers (
        run TEXT NOT NULL, email TEXT NOT NULL, source TEXT NOT NULL,
        asked_at INTEGER NOT NULL,
        PRIMARY KEY (run, email)
      );
    `);
  }

  private rows<T extends Record<string, SqlStorageValue>>(
    query: string,
    ...values: SqlStorageValue[]
  ): T[] {
    return this.ctx.storage.sql.exec<T>(query, ...values).toArray();
  }

  private number(query: string, ...values: SqlStorageValue[]): number {
    return this.rows<{ n: number }>(query, ...values)[0]?.n ?? 0;
  }

  private used(key: string, day: string) {
    return this.number(
      "SELECT used AS n FROM counts WHERE key = ? AND day = ?",
      key,
      day,
    );
  }

  private count(key: string, day: string) {
    this.ctx.storage.sql.exec(
      `INSERT INTO counts (key, day, used) VALUES (?, ?, 1)
       ON CONFLICT (key, day) DO UPDATE SET used = used + 1`,
      key,
      day,
    );
  }

  /** One at a time: starting runs waits on the budget, and two passes must not start the same run. */
  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = this.last.then(work, work);
    this.last = run.catch(() => {});
    return run;
  }

  // ---- A request ----

  /**
   * Someone asks for a site's report. Every limit is checked and counted,
   * and the request given its place, in one transaction: requests that
   * arrive together can't share a count, and a refused request has taken
   * nothing, so there is never anything to give back.
   */
  async ask(input: Ask): Promise<SeoReportStatus> {
    const now = Date.now();
    const taken = this.ctx.storage.transactionSync(() => this.take(input, now));
    if (!taken.run) return taken.status;
    if (taken.created) await this.admit();
    await this.ctx.storage.setAlarm(Date.now());
    if (!taken.created) return taken.status;
    const [run] = this.rows<{ status: string }>(
      "SELECT status FROM runs WHERE id = ?",
      taken.run,
    );
    return run?.status === RunStatus.Writing
      ? SeoReportAccepted.Writing
      : SeoReportAccepted.InLine;
  }

  private take(input: Ask, now: number): Taken {
    const day = utcDay(now);
    const network = `network:${input.network}`;
    const mailbox = `mailbox:${input.mailbox}`;
    if (this.used(network, day) >= REPORTS_PER_NETWORK_PER_DAY)
      return { status: SeoReportRefusal.NetworkLimit };
    if (this.used(mailbox, day) >= REPORT_LIMITS.perMailboxPerDay) {
      // Saying so tells whoever asks that this address was used today. The
      // attempt is counted against their network, which slows anyone trying
      // addresses to find that out.
      this.count(network, day);
      return { status: SeoReportRefusal.EmailLimit };
    }
    if (this.used(EMAILS_COUNT, day) >= REPORT_LIMITS.emailsPerDay)
      return { status: SeoReportRefusal.DayFull };

    const [fresh] = this.rows<{ id: string }>(
      `SELECT id FROM runs WHERE site = ? AND status = ? AND finished_at > ?
       ORDER BY finished_at DESC LIMIT 1`,
      input.site,
      RunStatus.Written,
      now - REUSE_MS,
    );
    const [current] = this.rows<{ id: string; status: string }>(
      "SELECT id, status FROM runs WHERE site = ? AND status IN (?, ?)",
      input.site,
      RunStatus.Waiting,
      RunStatus.Writing,
    );
    let taken: Required<Taken>;
    if (fresh) {
      taken = { status: SeoReportAccepted.Sent, run: fresh.id, created: false };
    } else if (current) {
      const waiting = this.number(
        "SELECT COUNT(*) AS n FROM askers WHERE run = ?",
        current.id,
      );
      if (waiting >= REPORT_LIMITS.askersPerSite)
        return { status: SeoReportRefusal.SiteBusy };
      taken = {
        status:
          current.status === RunStatus.Writing
            ? SeoReportAccepted.Writing
            : SeoReportAccepted.InLine,
        run: current.id,
        created: false,
      };
    } else {
      const inLine = this.number(
        "SELECT COUNT(*) AS n FROM runs WHERE status = ?",
        RunStatus.Waiting,
      );
      if (inLine >= REPORT_LIMITS.line)
        return { status: SeoReportRefusal.LineFull };
      const id = crypto.randomUUID();
      this.ctx.storage.sql.exec(
        "INSERT INTO runs (id, site, status, created_at) VALUES (?, ?, ?, ?)",
        id,
        input.site,
        RunStatus.Waiting,
        now,
      );
      taken = { status: SeoReportAccepted.InLine, run: id, created: true };
    }
    this.ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO askers (run, email, source, asked_at) VALUES (?, ?, ?, ?)",
      taken.run,
      input.email,
      input.source,
      now,
    );
    this.count(network, day);
    this.count(mailbox, day);
    this.count(EMAILS_COUNT, day);
    return taken;
  }

  // ---- The line ----

  /** Starts waiting runs, oldest first, while there is a free slot and budget for one more. */
  private admit() {
    return this.exclusive(async () => {
      while (reportsOpen(this.env)) {
        const next = this.ctx.storage.transactionSync(() => {
          const writing = this.number(
            "SELECT COUNT(*) AS n FROM runs WHERE status = ?",
            RunStatus.Writing,
          );
          if (writing >= REPORT_LIMITS.writing) return null;
          const [oldest] = this.rows<{ id: string }>(
            // rowid: the order they were asked for, whatever the clock says.
            "SELECT id FROM runs WHERE status = ? ORDER BY rowid LIMIT 1",
            RunStatus.Waiting,
          );
          return oldest ?? null;
        });
        if (!next || !(await this.reserve(next.id))) break;
        this.ctx.storage.sql.exec(
          "UPDATE runs SET status = ?, admitted_at = ? WHERE id = ? AND status = ?",
          RunStatus.Writing,
          Date.now(),
          next.id,
          RunStatus.Waiting,
        );
      }
      await this.startWorkflows();
    });
  }

  /**
   * Reserves one report's whole ceiling in the free tools' daily budget, which
   * also holds the number of reports a day. False when the day has no room,
   * or the budget can't be asked: a run never starts unreserved.
   */
  private async reserve(run: string): Promise<boolean> {
    const day = utcDay(Date.now());
    try {
      const decision = await this.env.FREE_TOOL_BUDGET.getByName(day).reserve({
        tool: "seo-report",
        calls: 1,
        // The budget counts per visitor. A report's visitor is its run.
        visitor: await sha256Hex(`seo-report:${run}`),
        day,
      });
      return decision === "allowed";
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "seo_report_budget_unavailable",
          message: error instanceof Error ? error.message : "unknown",
        }),
      );
      return false;
    }
  }

  private async startWorkflows() {
    const due = this.rows<{ id: string; site: string }>(
      "SELECT id, site FROM runs WHERE status = ? AND workflow_started = 0",
      RunStatus.Writing,
    );
    for (const run of due) {
      try {
        await this.env.SEO_REPORT_WORKFLOW.create({
          id: run.id,
          params: { site: run.site },
        });
      } catch {
        // A lost answer to a creation that worked is safe to count as started.
        const instance = await this.env.SEO_REPORT_WORKFLOW.get(run.id).catch(
          () => null,
        );
        const status = await instance?.status().catch(() => null);
        if (!status || status.status === "unknown") {
          console.error(
            JSON.stringify({
              event: "seo_report_workflow_not_started",
              site: run.site,
            }),
          );
          continue;
        }
      }
      this.ctx.storage.sql.exec(
        "UPDATE runs SET workflow_started = 1 WHERE id = ?",
        run.id,
      );
    }
  }

  /**
   * Empties the line by hand, after abuse say: every waiting run and the
   * addresses waiting on it go, in one transaction, with no email. Reports
   * being written finish. Run it with:
   *   wrangler workflows trigger seo-report '{"emptyLine":true}'
   */
  async empty(): Promise<number> {
    // In turn with admissions, so a run can't leave the line while the budget
    // is being asked for it: that reservation would be spent on nothing.
    return this.exclusive(async () =>
      this.ctx.storage.transactionSync(() => {
        const waiting = this.number(
          "SELECT COUNT(*) AS n FROM runs WHERE status = ?",
          RunStatus.Waiting,
        );
        this.ctx.storage.sql.exec(
          "DELETE FROM askers WHERE run IN (SELECT id FROM runs WHERE status = ?)",
          RunStatus.Waiting,
        );
        this.ctx.storage.sql.exec(
          "DELETE FROM runs WHERE status = ?",
          RunStatus.Waiting,
        );
        return waiting;
      }),
    );
  }

  // ---- What the Workflow (workflow.ts) asks and tells, always with its run ----

  /**
   * The paid step is about to write. True once per run: Workflows can run a
   * step again after an engine restart, and a second run would spend again.
   * False as well for a run that is no longer being written.
   */
  async beginWriting(run: string): Promise<boolean> {
    return this.ctx.storage.transactionSync(() => {
      const [row] = this.rows<{ status: string; writing_began: number }>(
        "SELECT status, writing_began FROM runs WHERE id = ?",
        run,
      );
      if (row?.status !== RunStatus.Writing || row.writing_began) return false;
      this.ctx.storage.sql.exec(
        "UPDATE runs SET writing_began = 1 WHERE id = ?",
        run,
      );
      return true;
    });
  }

  /** The run ended, with its report or with the reason there is none. A run that already ended is left as it is. */
  async finish(run: string, outcome: StoredReport | ReportFailure) {
    const report = typeof outcome === "string" ? null : outcome;
    const ended = this.ctx.storage.transactionSync(() => {
      const [row] = this.rows<{ status: string }>(
        "SELECT status FROM runs WHERE id = ?",
        run,
      );
      if (row?.status !== RunStatus.Writing) return false;
      this.ctx.storage.sql.exec(
        `UPDATE runs SET status = ?, finished_at = ?, token = ?, report = ?, failure = ?
         WHERE id = ?`,
        report ? RunStatus.Written : RunStatus.Failed,
        Date.now(),
        // The report's address: 122 random bits, so it can't be found by trying.
        report ? crypto.randomUUID().replaceAll("-", "") : null,
        report ? JSON.stringify(report) : null,
        report ? null : outcome,
        run,
      );
      return true;
    });
    if (ended) await this.ctx.storage.setAlarm(Date.now());
  }

  // ---- Reading a report ----

  async report(token: string): Promise<StoredReport | null> {
    const [row] = this.rows<{ report: string }>(
      "SELECT report FROM runs WHERE token = ? AND status = ? AND finished_at > ?",
      token,
      RunStatus.Written,
      Date.now() - KEEP_MS,
    );
    return row ? storedReportSchema.parse(JSON.parse(row.report)) : null;
  }

  // ---- The alarm ----

  async alarm() {
    const now = Date.now();
    // Admit first: a run whose turn has come is written, not given up for
    // having waited. Giving up takes its turn with admissions (see empty).
    await this.admit();
    await this.exclusive(async () => this.giveUp(now));
    await this.sendEmails(now);
    this.forget(now);
    const active = this.number(
      `SELECT (SELECT COUNT(*) FROM runs WHERE status IN (?, ?))
            + (SELECT COUNT(*) FROM askers) AS n`,
      RunStatus.Waiting,
      RunStatus.Writing,
    );
    await this.ctx.storage.setAlarm(Date.now() + (active ? MINUTE : DAY));
  }

  /**
   * Ends runs that waited too long in line, and runs whose Workflow never
   * came back. The change of status is the whole of it: the run is out of the
   * line and its askers are owed the "couldn't write it" email by the same
   * write.
   */
  private giveUp(now: number) {
    const lost = this.ctx.storage.transactionSync(() => {
      const rows = this.rows<{ id: string; site: string; status: string }>(
        `SELECT id, site, status FROM runs
         WHERE (status = ? AND created_at <= ?) OR (status = ? AND admitted_at <= ?)`,
        RunStatus.Waiting,
        now - MAX_WAIT_MS,
        RunStatus.Writing,
        now - ABANDONED_MS,
      );
      for (const row of rows)
        this.ctx.storage.sql.exec(
          "UPDATE runs SET status = ?, finished_at = ?, failure = ? WHERE id = ?",
          RunStatus.Failed,
          now,
          row.status === RunStatus.Waiting
            ? ReportFailure.Busy
            : ReportFailure.Failed,
          row.id,
        );
      return rows;
    });
    for (const run of lost) {
      const waited = run.status === RunStatus.Waiting;
      console.error(
        JSON.stringify({
          event: "seo_report_failed",
          site: run.site,
          reason: waited
            ? "it waited too long in line"
            : "its workflow never finished",
        }),
      );
      // Its own finish, if it ever comes, finds the run already ended.
      if (!waited)
        this.ctx.waitUntil(
          this.env.SEO_REPORT_WORKFLOW.get(run.id)
            .then((instance) => instance.terminate())
            .catch(() => {}),
        );
    }
  }

  /** Tells everyone waiting on a finished run how it ended, and forgets each address as its email goes. */
  private async sendEmails(now: number) {
    const owed = this.rows<{
      run: string;
      email: string;
      source: string;
      asked_at: number;
      site: string;
      token: string | null;
      failure: ReportFailure | null;
      finished_at: number;
    }>(
      `SELECT a.run, a.email, a.source, a.asked_at, r.site, r.token, r.failure, r.finished_at
       FROM askers a JOIN runs r ON r.id = a.run
       WHERE r.status IN (?, ?) ORDER BY a.asked_at LIMIT ?`,
      RunStatus.Written,
      RunStatus.Failed,
      EMAILS_PER_PASS,
    );
    for (const asker of owed) {
      const since = Math.max(asker.asked_at, asker.finished_at);
      let outcome: EmailSend | "gave up" = "gave up";
      if (now - since <= EMAIL_GIVE_UP_MS) {
        const ending: Ending = asker.token
          ? { token: asker.token }
          : { failure: asker.failure ?? ReportFailure.Failed };
        outcome = await sendReportEmail(this.env, {
          email: asker.email,
          site: asker.site,
          ending,
          source: asker.source,
          // This run, address and day: a repeated send can't email twice,
          // and asking again another day still can.
          sendId: `${asker.run}:${asker.email}:${utcDay(asker.asked_at)}`,
        });
      } else {
        console.error(
          JSON.stringify({
            event: "seo_report_email_dropped",
            site: asker.site,
          }),
        );
      }
      if (outcome !== EmailSend.Retry)
        this.ctx.storage.sql.exec(
          "DELETE FROM askers WHERE run = ? AND email = ?",
          asker.run,
          asker.email,
        );
    }
  }

  private forget(now: number) {
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        `DELETE FROM runs WHERE status = ? AND finished_at <= ?
           AND id NOT IN (SELECT run FROM askers)`,
        RunStatus.Failed,
        now - DAY,
      );
      this.ctx.storage.sql.exec(
        `DELETE FROM askers WHERE run IN
           (SELECT id FROM runs WHERE status = ? AND finished_at <= ?)`,
        RunStatus.Written,
        now - KEEP_MS,
      );
      this.ctx.storage.sql.exec(
        "DELETE FROM runs WHERE status = ? AND finished_at <= ?",
        RunStatus.Written,
        now - KEEP_MS,
      );
      this.ctx.storage.sql.exec(
        "DELETE FROM counts WHERE day < ?",
        utcDay(now - 2 * DAY),
      );
    });
  }
}

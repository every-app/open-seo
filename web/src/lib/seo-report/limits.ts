// The numbers the SEO report tool is held to. What it may spend is in
// free-tools/spend.ts with the other tools' ceilings; each research tool's
// own call count is in tools.ts.

export const REPORT_LIMITS = {
  /** New reports one mailbox can ask for in a day. */
  perMailboxPerDay: 1,
  /** Emails the tool promises in a day, whatever they are about. */
  emailsPerDay: 100,
  /** Reports being written at once. */
  writing: 3,
  /** Reports waiting for a slot. One day's worth. */
  line: 25,
  /**
   * A report still waiting after this long is given up, and whoever asked is
   * told: 24 hours for the day's budget to come back, and two more for a full
   * line ahead of it to be written (25 reports, 3 at a time, 15 minutes each
   * at the most).
   */
  maxWaitHours: 26,
  /** People who can wait on the same site's report. */
  askersPerSite: 20,
  /** A report this recent is emailed again instead of written again. */
  reuseDays: 30,
  /** A report's link stops working after this long. */
  keepDays: 90,
  /** Pages of the site one report may read. */
  pages: 12,
  /** Times the model may be called for one report. */
  modelCalls: 30,
  /**
   * Tokens one report may use, in and out, checked between model calls. The
   * call in flight when it is reached is still paid for, so the true ceiling
   * is this plus one call. The fullest real run used 263,000.
   */
  tokens: 500_000,
  /** One report's time limit. Real runs took 44 to 112 seconds. */
  runMinutes: 15,
} as const;

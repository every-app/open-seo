// Why a request ended without a report. The "couldn't write it" email says
// our sentence for the reason, never the model's own words: the model reads
// pages anyone could have written, and the email goes to an address the
// sender chose.

export enum ReportFailure {
  /** The site says the company has closed. */
  Closed = "closed",
  /** The site has moved to another address. */
  Moved = "moved",
  /** The site doesn't serve the United States, the only market reports cover. */
  NotUnitedStates = "not_united_states",
  /** It waited in line longer than a request may. */
  Busy = "busy",
  /** Anything else: the model's provider, a limit, a hand-in that doesn't fit. */
  Failed = "failed",
}

/** The reasons the model may give for stopping. A stop with any other reason is a failed report. */
export const STOP_REASONS = [
  ReportFailure.Closed,
  ReportFailure.Moved,
  ReportFailure.NotUnitedStates,
  ReportFailure.Failed,
] as const;

export const FAILURE_SENTENCES: Record<ReportFailure, string> = {
  [ReportFailure.Closed]: "The site says the company has closed.",
  [ReportFailure.Moved]:
    "The site has moved to another address. You can ask for a report on the new one.",
  [ReportFailure.NotUnitedStates]:
    "Reports use United States search data, and this site doesn't appear to serve the United States.",
  [ReportFailure.Busy]:
    "We had more requests than we could write. You can ask again.",
  [ReportFailure.Failed]:
    "Something went wrong while it was being written. You can ask again.",
};

// Temporary kill switch for scheduled rank checks on the hosted platform while
// they are unreliable. Self-hosted installs keep running their schedules, so
// every use pairs this with a hosted-mode check. While true the hosted cron
// starts no scheduled runs and no hosted config can switch onto a schedule.
// Existing configs keep their stored schedule, so flipping this back resumes
// them (overdue ones drain through the scheduler's per-tick budget). Manual
// checks are unaffected.
export const SCHEDULED_RANK_CHECKS_PAUSED = true;

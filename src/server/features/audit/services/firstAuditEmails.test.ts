import { beforeEach, expect, it, vi } from "vitest";
import type { sendLoopsEvent } from "@/server/email/loops-client";
import { sendFirstAuditEmails } from "./firstAuditEmails";

const mocks = vi.hoisted(() => ({
  getAuditsCompletedSince: vi.fn(),
  hasCompletedAuditBefore: vi.fn(),
  getIssueTypePageCountsForAudit: vi.fn(),
  countPagesByFetchClass: vi.fn(),
  sendLoopsEvent: vi.fn<typeof sendLoopsEvent>(),
}));

vi.mock("cloudflare:workers", () => ({
  env: {
    LOOPS_API_KEY: "loops-key",
    BETTER_AUTH_URL: "https://app.openseo.so",
  },
  waitUntil: vi.fn(),
}));
vi.mock("@/server/features/audit/repositories/auditSummaryQueries", () => ({
  getAuditsCompletedSince: mocks.getAuditsCompletedSince,
  hasCompletedAuditBefore: mocks.hasCompletedAuditBefore,
  getIssueTypePageCountsForAudit: mocks.getIssueTypePageCountsForAudit,
}));
vi.mock("@/server/features/audit/repositories/AuditRepository", () => ({
  AuditRepository: { countPagesByFetchClass: mocks.countPagesByFetchClass },
}));
vi.mock("@/server/email/loops-client", () => ({
  sendLoopsEvent: mocks.sendLoopsEvent,
}));

beforeEach(() => {
  mocks.getAuditsCompletedSince.mockResolvedValue([
    {
      id: "audit-1",
      projectId: "project-1",
      startUrl: "https://example.com",
      pagesCrawled: 50,
      completedAt: "2026-10-15T12:00:00.000Z",
      userId: "user-1",
      email: "person@example.com",
    },
  ]);
  mocks.hasCompletedAuditBefore.mockResolvedValue(false);
  mocks.countPagesByFetchClass.mockResolvedValue(0);
  mocks.getIssueTypePageCountsForAudit.mockResolvedValue([
    { issueType: "missing-meta-description", severity: "warning", pages: 9 },
    { issueType: "broken-internal-link", severity: "critical", pages: 2 },
    { issueType: "missing-title", severity: "critical", pages: 4 },
  ]);
  mocks.sendLoopsEvent.mockResolvedValue({ duplicate: false });
});

// The event name and properties are the contract with the Loops templates.
it("emails a user the summary of their first completed audit", async () => {
  await sendFirstAuditEmails();

  expect(mocks.sendLoopsEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      idempotencyKey: "first_audit:audit-1",
      payload: {
        email: "person@example.com",
        userId: "user-1",
        eventName: "first_audit_completed",
        eventProperties: {
          domain: "example.com",
          pagesCrawled: 50,
          criticalIssues: 6,
          warningIssues: 9,
          infoIssues: 0,
          topIssue1: "Missing title tag",
          topIssue2: "Broken internal link",
          topIssue3: "Missing meta description",
          auditUrl: "https://app.openseo.so/p/project-1/audit?auditId=audit-1",
        },
      },
    }),
  );
});

it("sends the blocked-crawler email when most pages were blocked", async () => {
  mocks.countPagesByFetchClass.mockResolvedValue(30);

  await sendFirstAuditEmails();

  expect(mocks.sendLoopsEvent.mock.calls[0]?.[0].payload.eventName).toBe(
    "first_audit_blocked",
  );
});

it("does not email users who completed an audit before", async () => {
  mocks.hasCompletedAuditBefore.mockResolvedValue(true);

  await sendFirstAuditEmails();

  expect(mocks.sendLoopsEvent).not.toHaveBeenCalled();
});

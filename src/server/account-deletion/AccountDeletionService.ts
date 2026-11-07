import { env } from "cloudflare:workers";
import { getAuth } from "@/lib/auth";
import { hasOrgPermission } from "@/lib/org-permissions";
import { setOrganizationAutoReload } from "@/server/billing/auto-reload";
import { readAutoReload } from "@/server/billing/auto-reload-status";
import { autumn } from "@/server/billing/autumn";
import { sendAccountDeletionScheduledEmail } from "@/server/email/loops";
import { AppError, describeError } from "@/server/lib/errors";
import { formatDeletionDate } from "@/shared/account-deletion";
import { AUTUMN_PAID_PLAN_FEATURE_ID } from "@/shared/billing";
import { captureServerError, captureServerEvent } from "@/server/lib/posthog";
import { AccountDeletionRepository } from "./AccountDeletionRepository";
import { GuestAccountRepository } from "@/server/auth/repositories/GuestAccountRepository";
import { deleteOauthGrants, eraseAccountStorage } from "./storage";
import {
  deleteAutumnCustomers,
  deleteLoopsContact,
  deletePostHogPerson,
  deleteTrustpilotInvitations,
} from "./vendors";

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long a request waits before the account is erased. GDPR allows one
 *  month to act on an erasure request; this leaves room for failed runs. */
const DELETION_DELAY_MS = 14 * DAY_MS;
/** The request needs a sign-in this recent, so a session left open on a
 *  shared or stolen device can't delete the account on its own. */
const FRESH_SIGN_IN_MS = 15 * 60 * 1000;
/** A request still waiting this long after its date is reported as an error. */
const OVERDUE_AFTER_MS = 3 * DAY_MS;
/** The daily cron runs other jobs too; erasures stop starting after this and
 *  the rest wait for the next day. */
const RUN_TIME_BUDGET_MS = 5 * 60 * 1000;
const RUN_BATCH_LIMIT = 50;

// Analytics events about deletions use one fixed distinct id: the person's
// own PostHog record and events are deleted with the account, which would
// take these counts with them.
const ANALYTICS_DISTINCT_ID = "account-deletion";

/** They own a workspace other people still use. */
type Blocker = {
  kind: "shared_workspace";
  organizationName: string;
  otherMemberCount: number;
};

type Organization = Awaited<
  ReturnType<typeof AccountDeletionRepository.listOrganizations>
>[number];

/** Workspaces the account is the only member of: they are deleted with it.
 *  Workspaces with other members stay; the account just leaves them. */
const isSolo = (organization: Organization) => organization.memberCount === 1;

async function getAutumnCustomer(customerId: string) {
  try {
    return await autumn.customers.get({ customerId });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("404") || message.includes("not found")) return null;
    throw error;
  }
}

function findBlockers(organizations: Organization[]) {
  const blockers: Blocker[] = [];
  for (const organization of organizations) {
    if (
      !isSolo(organization) &&
      hasOrgPermission(organization.role, { billing: ["manage"] })
    ) {
      blockers.push({
        kind: "shared_workspace",
        organizationName: organization.name,
        otherMemberCount: organization.memberCount - 1,
      });
    }
  }
  return blockers;
}

/**
 * Billing on the workspaces that go with the account that would keep
 * charging the card during the waiting period: a paid plan that renews, and
 * auto-reload. The request stops both; the page says so before the click.
 */
async function findBillingToStop(organizations: Organization[]) {
  const charges = [];
  for (const organization of organizations.filter(isSolo)) {
    const customer = await getAutumnCustomer(organization.id);
    if (!customer) continue;
    // Every workspace has a free-plan subscription; only the paid plan
    // renews.
    const paidPlanId = customer.flags[AUTUMN_PAID_PLAN_FEATURE_ID]?.planId;
    const renewingPlan = customer.subscriptions.find(
      (subscription) =>
        subscription.planId === paidPlanId && !subscription.canceledAt,
    );
    const autoReload = readAutoReload(customer)?.enabled ?? false;
    if (renewingPlan || autoReload) {
      charges.push({
        organization,
        renewingPlanId: renewingPlan?.planId ?? null,
        autoReload,
      });
    }
  }
  return charges;
}

/** Cancels the plan at the end of its period, so the credits it paid for
 *  last until then, and turns auto-reload off. */
async function stopBilling(
  userId: string,
  charges: Awaited<ReturnType<typeof findBillingToStop>>,
) {
  for (const { organization, renewingPlanId, autoReload } of charges) {
    if (renewingPlanId) {
      await autumn.billing.update({
        customerId: organization.id,
        planId: renewingPlanId,
        cancelAction: "cancel_end_of_cycle",
      });
    }
    if (autoReload) {
      await setOrganizationAutoReload(
        { userId, organizationId: organization.id, role: organization.role },
        { enabled: false },
      );
    }
  }
}

async function getSignedInAt(headers: Headers) {
  const session = await getAuth().api.getSession({
    headers,
    query: { disableCookieCache: true },
  });
  return session ? new Date(session.session.createdAt).getTime() : null;
}

async function getStatus(input: { userId: string; headers: Headers }) {
  const organizations = await AccountDeletionRepository.listOrganizations(
    input.userId,
  );
  const signedInAt = await getSignedInAt(input.headers);
  return {
    blockers: findBlockers(organizations),
    billingToStop: (await findBillingToStop(organizations)).map(
      ({ organization, renewingPlanId, autoReload }) => ({
        organizationName: organization.name,
        renewingPlan: renewingPlanId !== null,
        autoReload,
      }),
    ),
    signedInRecently:
      signedInAt !== null && Date.now() - signedInAt < FRESH_SIGN_IN_MS,
    deletionDelayDays: DELETION_DELAY_MS / DAY_MS,
  };
}

/**
 * Schedules the account for deletion and signs it out everywhere. Sign-in
 * stays blocked until the cron erases it; support can cancel by deleting the
 * request row.
 */
async function requestDeletion(input: {
  userId: string;
  userEmail: string;
  confirmEmail: string;
  headers: Headers;
}) {
  if (
    input.confirmEmail.trim().toLowerCase() !== input.userEmail.toLowerCase()
  ) {
    throw new AppError("VALIDATION_ERROR", "Confirmation email doesn't match");
  }
  const signedInAt = await getSignedInAt(input.headers);
  if (signedInAt === null || Date.now() - signedInAt >= FRESH_SIGN_IN_MS) {
    throw new AppError("FORBIDDEN", "Account deletion needs a fresh sign-in");
  }
  if (await AccountDeletionRepository.getRequest(input.userId)) {
    throw new AppError("CONFLICT", "Account deletion already requested");
  }
  const organizations = await AccountDeletionRepository.listOrganizations(
    input.userId,
  );
  if (findBlockers(organizations).length > 0) {
    throw new AppError("VALIDATION_ERROR", "Account deletion is blocked");
  }
  const soloOrganizations = organizations.filter(isSolo);
  // Before the request is written: if Autumn refuses, nothing is scheduled.
  await stopBilling(input.userId, await findBillingToStop(organizations));

  const now = Date.now();
  const deleteAfter = new Date(now + DELETION_DELAY_MS).toISOString();
  await AccountDeletionRepository.createRequest({
    userId: input.userId,
    requestedAt: new Date(now).toISOString(),
    deleteAfter,
    soloOrganizationIds: soloOrganizations.map((org) => org.id),
  });
  // MCP OAuth grants live in KV, outside the batch that ended the sessions
  // and API keys. A guest's grant the user claimed acts as the user too.
  const grantOwnerIds = [
    input.userId,
    ...(await GuestAccountRepository.listClaimedGuestUserIds(input.userId)),
  ];
  for (const ownerId of grantOwnerIds) {
    await deleteOauthGrants(env.OAUTH_KV, ownerId);
  }

  // The account is already scheduled; a failed email must not undo that or
  // show the user an error, so it is reported instead.
  await sendAccountDeletionScheduledEmail({
    email: input.userEmail,
    deletionDate: formatDeletionDate(deleteAfter),
  }).catch(async (error: unknown) => {
    console.error("account-deletion: confirmation email failed", error);
    await captureServerError(error, { source: "account_deletion_email" });
  });
  await captureServerEvent({
    distinctId: ANALYTICS_DISTINCT_ID,
    event: "account_deletion:requested",
    organizationId: null,
  });
  return { deleteAfter };
}

/**
 * Erases one account. Each step is safe to repeat, and the database goes
 * last, so a run that fails partway is finished by the next day's run.
 */
async function eraseAccount(userId: string) {
  const user = await AccountDeletionRepository.getUser(userId);
  if (!user) return;
  const organizations =
    await AccountDeletionRepository.listOrganizations(userId);
  // Ownership of a shared workspace can't change while sign-in is blocked,
  // but an invitation can still be accepted into one. Erasing the owner
  // would leave that workspace without one.
  if (
    organizations.some(
      (organization) =>
        !isSolo(organization) &&
        hasOrgPermission(organization.role, { billing: ["manage"] }),
    )
  ) {
    throw new Error("Account owns a workspace with other members");
  }
  const organizationIds = organizations.filter(isSolo).map((org) => org.id);
  const inventory = await AccountDeletionRepository.buildInventory(
    userId,
    organizationIds,
  );

  // Autumn first: its webhooks can sync contacts to Loops, which must
  // already have nothing left to sync when the Loops contact goes.
  await deleteAutumnCustomers(organizationIds);
  await eraseAccountStorage(env, {
    userId,
    organizationIds,
    ...inventory,
  });
  await deletePostHogPerson(userId);
  await deleteLoopsContact(userId, user.email);
  await deleteTrustpilotInvitations(user.email);
  await AccountDeletionRepository.eraseUser({
    userId,
    email: user.email,
    organizationIds,
  });
}

/** Daily cron body: erases every account whose waiting period is over. */
async function runDueDeletions() {
  const startedAt = Date.now();
  const now = new Date(startedAt).toISOString();
  const userIds = await AccountDeletionRepository.listDueUserIds(
    now,
    RUN_BATCH_LIMIT,
  );
  let erased = 0;
  let failed = 0;
  for (const userId of userIds) {
    if (Date.now() - startedAt > RUN_TIME_BUDGET_MS) break;
    try {
      await eraseAccount(userId);
      erased += 1;
      await captureServerEvent({
        distinctId: ANALYTICS_DISTINCT_ID,
        event: "account_deletion:completed",
        organizationId: null,
      });
    } catch (error) {
      failed += 1;
      console.error(
        `account-deletion: erasing ${userId} failed: ${describeError(error)}`,
      );
      // Anonymous: keying it to the user would recreate their PostHog person.
      await captureServerError(error, { source: "account_deletion" });
      // Retried tomorrow, behind everyone else, so a few accounts that keep
      // failing can't hold up the rest of the queue.
      await AccountDeletionRepository.postponeRequest(
        userId,
        new Date(Date.now() + DAY_MS).toISOString(),
      );
    }
  }

  // Counted from the request, as failed erasures move their own date.
  const overdue = await AccountDeletionRepository.countRequestedBefore(
    new Date(startedAt - DELETION_DELAY_MS - OVERDUE_AFTER_MS).toISOString(),
  );
  if (overdue > 0) {
    await captureServerError(new Error("ACCOUNT_DELETION_OVERDUE"), {
      source: "account_deletion",
      overdue: String(overdue),
    });
  }
  return { erased, failed, overdue };
}

export const AccountDeletionService = {
  getStatus,
  requestDeletion,
  runDueDeletions,
};

import { z } from "zod";
import type { EnsuredUserContext } from "@/middleware/ensure-user/types";
import { hasOrgPermission } from "@/lib/org-permissions";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { autumn, AUTUMN_TRACK_RETRY_OPTIONS } from "@/server/billing/autumn";
import {
  AUTO_RELOAD_FAILURE_METADATA_KEY,
  primesAutoReloadOnEnable,
  readAutoReload,
} from "@/server/billing/auto-reload-status";
import { getOrganizationContacts } from "@/server/billing/loops-sync";
import { sendLoopsEvent } from "@/server/email/loops-client";
import { sha256Hex } from "@/server/lib/audit/ids";
import { AppError } from "@/server/lib/errors";
import { captureServerEvent } from "@/server/lib/posthog";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import {
  AUTO_RELOAD_CARD_FAILURE_REASONS,
  AUTO_RELOAD_DEFAULTS,
  AUTO_RELOAD_THRESHOLD_USD,
  AUTUMN_PAID_PLAN_FEATURE_ID,
  AUTUMN_SEO_DATA_CREDITS_PER_USD,
  AUTUMN_SEO_DATA_TOP_UP_PLAN_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
  isAutoReloadBudgetSpent,
  type AutoReloadSettings,
} from "@/shared/billing";

/**
 * Auto-reload: Autumn buys top-up credits with the organization's saved card
 * whenever the top-up balance is at or below the threshold, and the
 * organization's monthly budget caps what it spends on top-up credits per
 * billing cycle. Autumn holds both as customer billing controls on the same
 * balance (an auto top-up and a usage limit) and enforces them itself: it
 * buys after each deduction or refused check on the top-up balance, and
 * refuses the hold that would take the cycle's spend past the budget. This
 * module turns them on and off and records what Autumn reports back.
 */

type BillingCaller = Pick<
  EnsuredUserContext,
  "organizationId" | "role" | "userId"
>;
// Autumn waiting out one of its own windows (two attempts per ten minutes,
// one failed attempt per hour). Not a failure of its own: whatever failed
// before is already recorded.
const WAIT_REASONS = new Set([
  "attempt_limit_reached",
  "failed_attempt_limit_reached",
]);

// The SDK's own errors for a request that did not get an answer: the charge
// may still have gone through on Autumn's side. Matched by class name, as
// the SDK does not set `name` on them.
const NO_ANSWER_ERROR_NAMES = new Set([
  "RequestTimeoutError",
  "ConnectionError",
  "RequestAbortedError",
  "UnexpectedClientError",
]);
const isNoAnswerError = (error: unknown): error is Error =>
  error instanceof Error &&
  (NO_ANSWER_ERROR_NAMES.has(error.name) ||
    NO_ANSWER_ERROR_NAMES.has(error.constructor.name));

const usdToCredits = (usd: number) => usd * AUTUMN_SEO_DATA_CREDITS_PER_USD;

export async function setOrganizationAutoReload(
  caller: BillingCaller,
  input: { enabled: false } | ({ enabled: true } & AutoReloadSettings),
) {
  requireOrgPermission(caller, { billing: ["manage"] });
  const customerId = caller.organizationId;

  if (!input.enabled) {
    // Autumn keeps an amount on a disabled entry too; keeping the saved one
    // means turning it back on restores it. Turning off is never gated: an
    // organization that left the paid plan must still be able to.
    const current = readAutoReload(await autumn.customers.get({ customerId }));
    await writeAutoReloadControl(customerId, {
      ...(current ?? AUTO_RELOAD_DEFAULTS),
      enabled: false,
    });
    await captureSaved(caller, { enabled: false });
    return;
  }

  const customer = await autumn.customers.get({
    customerId,
    expand: ["payment_method"],
  });
  // Top-ups are for paid plans (the page offers them to no one else), and a
  // reload is a card charge without a checkout, so there has to be a card.
  // The organization that pays the subscription has one; a plan granted by
  // hand may not.
  if (!customer.flags[AUTUMN_PAID_PLAN_FEATURE_ID]) {
    throw new AppError("PAYMENT_REQUIRED", "Auto-reload needs a paid plan");
  }
  if (!customer.paymentMethod) {
    throw new AppError(
      "PAYMENT_METHOD_REQUIRED",
      `No payment method on file for ${customerId}`,
    );
  }
  // Autumn keeps the cycle's top-up spend while auto-reload is off, so a
  // budget the spend already reaches would pause the credits at once, and
  // the first reload below would buy credits that cannot be used. The page
  // says so before the click; this is the backstop.
  const current = readAutoReload(customer);
  if (
    current &&
    current.spentUsd > 0 &&
    isAutoReloadBudgetSpent(current.spentUsd, input.monthlyLimitUsd)
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      `This cycle's top-up spend is $${current.spentUsd}; the budget must leave room above it`,
    );
  }

  // Buying the first reload here (see primesAutoReloadOnEnable for when)
  // gives Autumn a purchase to price from, leaves the balance above the
  // threshold so Autumn's own enable-time purchase is skipped, and gives the
  // customer credits at once instead of after a failed call. The purchase
  // lands before the control is written.
  const primed = primesAutoReloadOnEnable(customer);
  if (primed) {
    await buyFirstReload(customerId, input.amountUsd);
  }

  await writeAutoReloadControl(customerId, { ...input, enabled: true });
  await captureSaved(caller, { ...input, primed });
}

async function buyFirstReload(customerId: string, amountUsd: number) {
  let requiredAction;
  try {
    ({ requiredAction } = await autumn.billing.attach(
      {
        customerId,
        planId: AUTUMN_SEO_DATA_TOP_UP_PLAN_ID,
        featureQuantities: [
          {
            featureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
            quantity: usdToCredits(amountUsd),
          },
        ],
        // Charge the saved card now; a checkout link is of no use here.
        redirectMode: "never",
      },
      // A charge has no idempotency key, so the SDK's default retry on a 5xx
      // or dropped connection after Autumn charged the card would charge it
      // again.
      AUTUMN_TRACK_RETRY_OPTIONS,
    ));
  } catch (error) {
    // No answer is not no charge: the generic "please try again" would invite
    // a second one, so the message sends them to the balance first. Logged
    // because the code it maps to is not reported on its own.
    if (isNoAnswerError(error)) {
      console.error("[billing] first auto-reload purchase got no answer", {
        customerId,
        error,
      });
      throw new AppError("PAYMENT_ACTION_REQUIRED", error.message);
    }
    throw error;
  }
  if (!requiredAction) return;
  // The bank wants a confirmation or more time: the card itself may be fine,
  // and the charge may still land, so the message must not ask for a retry.
  const bankNeedsTime =
    requiredAction.code === "3ds_required" ||
    requiredAction.code === "payment_processing";
  throw new AppError(
    bankNeedsTime ? "PAYMENT_ACTION_REQUIRED" : "PAYMENT_METHOD_REQUIRED",
    `First auto-reload purchase needs ${requiredAction.code}: ${requiredAction.reason}`,
  );
}

/** Turns auto-reload off for a customer who no longer holds a paid plan, so
 *  a canceled subscription stops the card charges with it. Called from the
 *  billing.updated sync. */
export async function disableAutoReloadIfUnpaid(customerId: string) {
  const customer = await autumn.customers.get({ customerId });
  const current = readAutoReload(customer);
  if (!current?.enabled || customer.flags[AUTUMN_PAID_PLAN_FEATURE_ID]) return;
  await writeAutoReloadControl(customerId, { ...current, enabled: false });
  await captureServerEvent({
    distinctId: customerId,
    event: "billing:auto_reload_disabled_on_downgrade",
    organizationId: customerId,
  });
}

async function writeAutoReloadControl(
  customerId: string,
  settings: AutoReloadSettings & { enabled: boolean },
) {
  await autumn.customers.update({
    customerId,
    billingControls: {
      autoTopups: [
        {
          featureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
          enabled: settings.enabled,
          threshold: usdToCredits(AUTO_RELOAD_THRESHOLD_USD),
          quantity: usdToCredits(settings.amountUsd),
          // A backstop on the card only; the budget below is what bounds
          // reloads. Autumn's purchase window is a rolling month that can
          // span two billing cycles, so this is twice the reloads a cycle's
          // budget can need, plus the one that can land as it is reached.
          purchaseLimit: {
            interval: "month",
            limit:
              2 * Math.ceil(settings.monthlyLimitUsd / settings.amountUsd) + 1,
          },
        },
      ],
      // The budget: Autumn's hard cap on top-up credits spent per billing
      // cycle. It refuses the hold that would exceed it, counts open holds,
      // keeps the cycle's count when the limit changes, and starts counting
      // when created. Off with auto-reload: credits bought by hand alone are
      // not budgeted.
      usageLimits: [
        {
          featureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
          enabled: settings.enabled,
          limit: usdToCredits(settings.monthlyLimitUsd),
          interval: "month",
          anchor: "billing_cycle",
        },
      ],
    },
    // Turning on either found no failure or just charged the card again
    // successfully, so the notice is over. Turning off keeps it: the reason
    // reloads stopped is still worth knowing.
    ...(settings.enabled
      ? { metadata: { [AUTO_RELOAD_FAILURE_METADATA_KEY]: null } }
      : {}),
  });
}

function captureSaved(
  caller: BillingCaller,
  properties: Record<string, unknown>,
) {
  return captureServerEvent({
    distinctId: caller.userId,
    event: "billing:auto_reload_saved",
    organizationId: caller.organizationId,
    properties,
  });
}

// Autumn reports every reload it buys or fails to buy. Only what is read is
// required; the shape is the dashboard's, and only one feature has a control.
const autoReloadWebhookSchema = z
  .object({
    type: z.enum(["billing.auto_topup_succeeded", "billing.auto_topup_failed"]),
    occurred_at: z.number().optional(),
    data: z
      .object({
        customer_id: z.string(),
        reason: z.string().optional(),
        quantity_granted: z.number().optional(),
        error: z
          .object({
            code: z.string().nullish(),
            message: z.string().nullish(),
            decline_code: z.string().nullish(),
          })
          .passthrough()
          .nullish(),
      })
      .passthrough(),
  })
  .passthrough();

export const AUTO_RELOAD_WEBHOOK_TYPES = new Set<string>(
  autoReloadWebhookSchema.shape.type.options,
);

/** Records what Autumn's auto top-up webhooks say about an organization's
 *  reloads: the notice the billing page shows, an email to the people who
 *  can fix the card, and analytics. The Autumn customer id is the
 *  organization id. */
export async function handleAutoReloadWebhook(payload: unknown) {
  const parsed = autoReloadWebhookSchema.safeParse(payload);
  if (!parsed.success) {
    // Reportable: a shape change here would hide every reload failure.
    console.error("[billing] unrecognized auto top-up webhook", {
      payload,
      issues: parsed.error.issues,
    });
    return;
  }
  const { type, data } = parsed.data;
  const organizationId = data.customer_id;
  const at = parsed.data.occurred_at ?? Date.now();

  if (type === "billing.auto_topup_succeeded") {
    // The card works again: a notice from before this reload is stale.
    await autumn.customers.update({
      customerId: organizationId,
      metadata: { [AUTO_RELOAD_FAILURE_METADATA_KEY]: null },
    });
    await captureServerEvent({
      distinctId: organizationId,
      event: "billing:auto_reload_succeeded",
      organizationId,
      properties: { credits: data.quantity_granted },
    });
    return;
  }

  const reason = data.reason ?? "unknown";
  await captureServerEvent({
    distinctId: organizationId,
    event: "billing:auto_reload_failed",
    organizationId,
    properties: { reason, decline_code: data.error?.decline_code },
  });
  if (WAIT_REASONS.has(reason)) return;
  if (reason === "purchase_limit_reached") {
    // The backstop on reload count, which the budget keeps out of reach.
    // Reportable, but nothing the customer can fix.
    console.error("[billing] auto-reload hit its purchase backstop", {
      organizationId,
    });
    return;
  }

  // Every other reason stops the credits, so every other reason is shown;
  // only card problems are the customer's to fix.
  await autumn.customers.update({
    customerId: organizationId,
    metadata: { [AUTO_RELOAD_FAILURE_METADATA_KEY]: { reason, at } },
  });
  if (!AUTO_RELOAD_CARD_FAILURE_REASONS.has(reason)) {
    console.error("[billing] auto-reload failed", {
      organizationId,
      reason,
      error: data.error,
    });
    return;
  }
  // Best effort after the notice is written: a retried webhook must not
  // write a stale notice over a success that landed in between.
  try {
    await emailAutoReloadFailed(organizationId, reason);
  } catch (error) {
    console.error("[billing] auto-reload failure email failed", {
      organizationId,
      error,
    });
  }
}

/** Loops event to the members who can change the card. One email per person
 *  per day: Autumn retries a declining card until it pauses reloads, and
 *  each attempt sends a webhook. */
async function emailAutoReloadFailed(organizationId: string, reason: string) {
  const apiKey = await getOptionalEnvValue("LOOPS_API_KEY");
  if (!apiKey) return;
  const day = new Date().toISOString().slice(0, 10);
  for (const contact of await getOrganizationContacts(organizationId)) {
    if (!hasOrgPermission(contact.role, { billing: ["manage"] })) continue;
    await sendLoopsEvent({
      apiKey,
      idempotencyKey: `auto_reload_failed:${await sha256Hex(
        `${organizationId}:${contact.userId}:${day}`,
      )}`,
      payload: {
        email: contact.email,
        userId: contact.userId,
        eventName: "auto_reload_failed",
        eventProperties: { reason },
      },
      logContext: { action: "auto-reload-failed", organizationId },
    });
  }
}

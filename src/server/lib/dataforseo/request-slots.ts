import { AsyncLocalStorage } from "node:async_hooks";
import { waitUntil } from "cloudflare:workers";

// A Worker invocation can have only six outbound connections waiting for
// response headers; a seventh queues, and its own timeout keeps running while
// it waits. Live DataForSEO calls wait for headers for as long as the task
// takes (30-60s at peak), so a request running six of them at once left the
// Autumn call settling an earlier one queued until the SDK timed it out
// before sending it, and the charge was lost. Capping DataForSEO below six
// keeps a connection free for Autumn, R2, and PostHog, and a request's credit
// settles run one at a time so they don't take more than that.
const MAX_PENDING_DATAFORSEO_CALLS = 4;

interface Slots {
  active: number;
  waiting: Array<() => void>;
  /** The end of this request's queue of credit settles. */
  settles: Promise<void>;
}

const requestSlots = new AsyncLocalStorage<Slots>();

/** Gives `fn` (one request's work) its own DataForSEO call cap. */
export function withDataforseoSlots<T>(fn: () => T): T {
  return requestSlots.run(
    { active: 0, waiting: [], settles: Promise.resolve() },
    fn,
  );
}

/**
 * Runs one DataForSEO call once fewer than the cap are in flight for this
 * request. Outside a request (Workflows, cron, tests) it runs at once.
 */
export async function inDataforseoSlot<T>(fn: () => Promise<T>): Promise<T> {
  const slots = requestSlots.getStore();
  if (!slots) return fn();
  if (slots.active < MAX_PENDING_DATAFORSEO_CALLS) {
    slots.active++;
  } else {
    // A finished call hands its slot straight to the next waiter.
    await new Promise<void>((resolve) => slots.waiting.push(resolve));
  }
  try {
    return await fn();
  } finally {
    const next = slots.waiting.shift();
    if (next) next();
    else slots.active--;
  }
}

/**
 * Resolves with `calls`' result and runs `settle` (the credit settle for
 * them) once they finish. In a request it returns without waiting for the
 * settle, which queues behind the request's earlier settles; the calls and
 * the settle are registered with waitUntil, since workerd cancels pending I/O
 * once the client goes away and a hold that never settles would let a
 * disconnect skip the deduction. Outside a request (Workflows, cron, Durable
 * Objects, tests) it awaits the settle before returning.
 */
export async function settleAfterCalls<T>(
  calls: Promise<T>,
  settle: () => Promise<void>,
): Promise<T> {
  const slots = requestSlots.getStore();
  if (!slots) {
    try {
      return await calls;
    } finally {
      await settle();
    }
  }
  // Queued when the calls finish, not when they start, so a slow call does
  // not hold back the settles of calls that finished before it.
  const settled = calls
    .catch(() => undefined)
    .then(() => {
      slots.settles = slots.settles.then(settle).catch((error: unknown) => {
        console.error("[billing] credit settle failed", error);
      });
      return slots.settles;
    });
  waitUntil(settled);
  return calls;
}

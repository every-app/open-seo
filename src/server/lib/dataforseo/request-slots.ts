import { AsyncLocalStorage } from "node:async_hooks";

// A Worker invocation can have only six outbound connections waiting for
// response headers; a seventh queues, and its own timeout keeps running while
// it waits. Live DataForSEO calls wait for headers for as long as the task
// takes (30-60s at peak), so a request running six of them at once left the
// Autumn call settling an earlier one queued until the SDK timed it out
// before sending it, and the charge was lost. Capping DataForSEO below six
// keeps a connection free for Autumn, R2, and PostHog.
const MAX_PENDING_DATAFORSEO_CALLS = 4;

interface Slots {
  active: number;
  waiting: Array<() => void>;
}

const requestSlots = new AsyncLocalStorage<Slots>();

/** Gives `fn` (one request's work) its own DataForSEO call cap. */
export function withDataforseoSlots<T>(fn: () => T): T {
  return requestSlots.run({ active: 0, waiting: [] }, fn);
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

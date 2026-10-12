const LOOPS_CONTACT_UPDATE_URL = "https://app.loops.so/api/v1/contacts/update";
const LOOPS_EVENT_SEND_URL = "https://app.loops.so/api/v1/events/send";

type LoopsContactProperty =
  | string
  | number
  | boolean
  | null
  | undefined
  | Record<string, boolean>;

type LoopsContactUpdatePayload = {
  email?: string;
  userId?: string;
  firstName?: string;
  lastName?: string;
  source?: string;
  subscribed?: boolean;
  userGroup?: string;
  mailingLists?: Record<string, boolean>;
} & Record<string, LoopsContactProperty>;

export async function updateLoopsContact({
  apiKey,
  payload,
  logContext,
}: {
  apiKey: string;
  payload: LoopsContactUpdatePayload;
  logContext?: Record<string, unknown>;
}) {
  await loopsRequest({
    apiKey,
    method: "PUT",
    url: LOOPS_CONTACT_UPDATE_URL,
    payload,
    label: "update Loops contact",
    logContext,
  });
}

type LoopsEventPayload = {
  email: string;
  userId: string;
  eventName: string;
  eventProperties?: Record<string, string | number | boolean>;
};

/** Sends a Loops event, which triggers any workflow listening for it. Loops
 *  honours the idempotency key for 24 hours and answers a replay with 409,
 *  which is a success here: the email was already queued. Returns whether
 *  this call was such a replay. */
export async function sendLoopsEvent({
  apiKey,
  payload,
  idempotencyKey,
  logContext,
}: {
  apiKey: string;
  payload: LoopsEventPayload;
  idempotencyKey: string;
  logContext?: Record<string, unknown>;
}) {
  const status = await loopsRequest({
    apiKey,
    method: "POST",
    url: LOOPS_EVENT_SEND_URL,
    payload,
    headers: { "Idempotency-Key": idempotencyKey },
    okStatuses: [409],
    label: "send Loops event",
    logContext: { ...logContext, eventName: payload.eventName },
  });
  return { duplicate: status === 409 };
}

async function loopsRequest({
  apiKey,
  method,
  url,
  payload,
  headers,
  okStatuses = [],
  label,
  logContext,
}: {
  apiKey: string;
  method: "PUT" | "POST";
  url: string;
  payload: { email?: string; userId?: string };
  headers?: Record<string, string>;
  okStatuses?: number[];
  label: string;
  logContext?: Record<string, unknown>;
}) {
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...headers,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });

  if (response.ok || okStatuses.includes(response.status)) {
    return response.status;
  }

  const errorPayload = await response.json().catch(() => null);
  console.warn(`Loops error (${label}):`, {
    status: response.status,
    email: payload.email,
    userId: payload.userId,
    ...logContext,
    errorPayload,
  });

  throw new Error(`Failed to ${label} (${response.status})`);
}

export function getContactNameParts(name: string | null | undefined) {
  const trimmedName = name?.trim();

  if (!trimmedName) {
    return {};
  }

  const [firstName, ...lastNameParts] = trimmedName.split(/\s+/);
  const lastName = lastNameParts.join(" ");

  return {
    firstName,
    ...(lastName ? { lastName } : {}),
  };
}

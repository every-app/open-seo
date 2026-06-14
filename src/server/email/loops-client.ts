const LOOPS_CONTACT_UPDATE_URL = "https://app.loops.so/api/v1/contacts/update";

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
  const response = await fetch(LOOPS_CONTACT_UPDATE_URL, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (response.ok) {
    return;
  }

  const errorPayload = await response.json().catch(() => null);
  console.error("Loops contact update error:", {
    status: response.status,
    email: payload.email,
    userId: payload.userId,
    ...logContext,
    errorPayload,
  });

  throw new Error(`Failed to update Loops contact (${response.status})`);
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

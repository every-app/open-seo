import { z } from "zod";
import { autumn } from "@/server/billing/autumn";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";

// Erasure of the person's records at the hosted services. Each call is safe
// to repeat: a record that is already gone counts as deleted.

function isNotFound(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("404") || message.includes("not found");
}

async function deleteLoopsContactBy(
  apiKey: string,
  selector: { userId: string } | { email: string },
) {
  const response = await fetch("https://app.loops.so/api/v1/contacts/delete", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(selector),
    signal: AbortSignal.timeout(10_000),
  });
  if (response.ok || response.status === 404) return;
  throw new Error(`Loops contact deletion failed (${response.status})`);
}

export async function deleteLoopsContact(userId: string, email: string) {
  const apiKey = await getRequiredEnvValue("LOOPS_API_KEY");
  // Website newsletter signups create contacts by email alone, and the
  // userId backfill is best-effort, so delete by each. Loops rejects a
  // request that carries both.
  await deleteLoopsContactBy(apiKey, { userId });
  await deleteLoopsContactBy(apiKey, { email });
}

const personListSchema = z.object({
  results: z.array(z.object({ id: z.union([z.string(), z.number()]) })),
});

/** Deletes the person and queues deletion of their events and session
 *  recordings. PostHog's private
 *  API lives on the app host (us.posthog.com), not the ingestion host
 *  (us.i.posthog.com) the capture key uses. */
export async function deletePostHogPerson(userId: string) {
  const ingestionHost = await getRequiredEnvValue("POSTHOG_HOST");
  const host = new URL(ingestionHost).origin.replace(
    ".i.posthog.com",
    ".posthog.com",
  );
  const projectId = encodeURIComponent(
    await getRequiredEnvValue("POSTHOG_PROJECT_ID"),
  );
  const authorization = `Bearer ${await getRequiredEnvValue("POSTHOG_ACCOUNT_DELETION_API_KEY")}`;

  // A distinct_id filter matches at most one person.
  const listUrl = new URL(`${host}/api/projects/${projectId}/persons/`);
  listUrl.searchParams.set("distinct_id", userId);
  const listResponse = await fetch(listUrl, {
    headers: { Authorization: authorization },
    signal: AbortSignal.timeout(10_000),
  });
  if (!listResponse.ok) {
    throw new Error(`PostHog person lookup failed (${listResponse.status})`);
  }
  const { results } = personListSchema.parse(await listResponse.json());
  for (const person of results) {
    const response = await fetch(
      `${host}/api/projects/${projectId}/persons/${encodeURIComponent(String(person.id))}/?delete_events=true&delete_recordings=true`,
      {
        method: "DELETE",
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok && response.status !== 404) {
      throw new Error(`PostHog person deletion failed (${response.status})`);
    }
  }
}

/** Deletes each organization's Autumn customer and the Stripe customer behind
 *  it, which also ends any subscription still on it. */
export async function deleteAutumnCustomers(organizationIds: string[]) {
  for (const customerId of organizationIds) {
    try {
      await autumn.customers.delete({ customerId, deleteInStripe: true });
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }
}

import { z } from "zod";
import { clearChatTerminal } from "agents/chat";
import type { UIMessage } from "ai";

// POST .../rewind handling for SamChatAgent, extracted to keep the DO file
// within lint budgets. The rewind deletes a message and everything after it
// on the active branch; the DO delegates here from onRequest.

export type RewindHost = {
  messages: UIMessage[];
  cancelAllChats(): void;
  waitUntilStable(input: { timeout: number }): Promise<unknown>;
  session: { deleteMessages(ids: string[]): Promise<unknown> };
  ctx: { storage: Pick<DurableObjectStorage, "delete"> };
};

/**
 * Handle one /rewind request: parse + validate, abort any in-flight turn,
 * delete the message and everything after it, and drop the stale terminal
 * record. Returns null when the request isn't a rewind (caller delegates).
 */
export async function handleRewindRequest(
  host: RewindHost,
  request: Request,
): Promise<Response | null> {
  if (
    request.method !== "POST" ||
    !new URL(request.url).pathname.endsWith("/rewind")
  ) {
    return null;
  }
  const body = z
    .object({ messageId: z.string().min(1) })
    .safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "messageId required" }, { status: 400 });
  }
  const { messageId } = body.data;
  // A rewind can race an in-flight turn (the user undoes while the agent is
  // still working, e.g. after the stream stalled client-side). Abort the
  // turn and wait for it to settle BEFORE deleting, or its still-running
  // loop keeps streaming chunks and persists a fresh assistant message right
  // after the delete — an orphaned reply to nothing.
  host.cancelAllChats();
  await host.waitUntilStable({ timeout: 5000 });
  const index = host.messages.findIndex((message) => message.id === messageId);
  if (index === -1) {
    return Response.json({ error: "message not found" }, { status: 404 });
  }
  const ids = host.messages.slice(index).map((message) => message.id);
  await host.session.deleteMessages(ids);
  // Drop the stored how-the-last-turn-ended record too: it exists so a
  // reconnecting client can learn the last turn errored — but that turn was
  // just undone, and leaving it replays "Something went wrong" forever.
  await clearChatTerminal(host.ctx.storage);
  return Response.json({ ok: true });
}

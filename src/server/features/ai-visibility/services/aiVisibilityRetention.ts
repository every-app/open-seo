import { env } from "cloudflare:workers";
import { pruneAiHistory } from "../repositories/aiVisibilityRetentionRepository";
import { aiObjectHasExpired } from "./aiVisibilityStorage";

const CURSOR_KEY = "ai-visibility:retention-cursor";

/** One bounded sweep page of expired exports per scheduler tick. */
export async function pruneAiVisibility() {
  const now = new Date();
  await pruneAiHistory(now);
  const cursor = await env.KV.get(CURSOR_KEY);
  const page = await env.R2.list({
    prefix: "ai-visibility/",
    cursor: cursor ?? undefined,
    limit: 500,
    include: ["customMetadata"],
  });
  const expired = page.objects
    .filter((object) => aiObjectHasExpired(object, now.getTime()))
    .map((object) => object.key);
  if (expired.length) await env.R2.delete(expired);
  if (page.truncated) await env.KV.put(CURSOR_KEY, page.cursor);
  else await env.KV.delete(CURSOR_KEY);
}

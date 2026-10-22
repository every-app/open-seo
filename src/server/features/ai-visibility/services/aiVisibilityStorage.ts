import { deleteR2Prefix } from "@/server/lib/r2";

/** Generated exports are private project data. */
export async function deleteProjectAiObjects(
  bucket: R2Bucket,
  projectId: string,
) {
  return deleteR2Prefix(bucket, `ai-visibility/${projectId}/`);
}

/** Exports carry their expiry; anything without one is stale. */
export function aiObjectHasExpired(
  object: Pick<R2Object, "customMetadata">,
  now: number,
) {
  const expiry = Date.parse(object.customMetadata?.expiresAt ?? "");
  return !Number.isFinite(expiry) || now >= expiry;
}

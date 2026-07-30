import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { StructuredDataService } from "@/server/features/structured-data/services/StructuredDataService";
import { requireProjectContext } from "@/serverFunctions/middleware";

/** Generous for a pasted snippet or a page's worth of HTML, and still bounded:
 *  the request body is user-supplied. */
const MAX_MARKUP_CHARS = 500_000;

/** `projectId` scopes authorization only — validation reads no project data.
 *  It is required because project membership is the app's auth boundary. */
const validateSchema = z.object({
  projectId: z.string().min(1),
  markup: z.string().min(1).max(MAX_MARKUP_CHARS).optional(),
  url: z.string().url().max(2048).optional(),
});

/**
 * Validate JSON-LD — a pasted snippet, a whole HTML document, or a live URL.
 *
 * Failure modes come back as `{ ok: false, reason }` rather than thrown errors:
 * "you pasted nothing" and "that page would not load" are messages the page
 * renders, not faults. See specs/0012.
 */
export const validateStructuredData = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(validateSchema)
  .handler(async ({ data }) =>
    StructuredDataService.validate({ markup: data.markup, url: data.url }),
  );

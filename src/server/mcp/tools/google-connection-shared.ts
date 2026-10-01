import { z } from "zod";
import { projectIdSchema } from "@/server/mcp/schemas";

export const OPTIONAL_PROJECT_ID = projectIdSchema
  .optional()
  .describe(
    "Optional. When given, the entry currently bound to this project is flagged isSelected. Get one from list_projects.",
  );

export const ACCOUNT_ID_DESCRIPTION =
  "Google account id (the `accountId` returned by the matching list tool). Optional when the property is only reachable through one connected Google account; required when several connected accounts can see it.";

export const optionalAccountIdSchema = z
  .string()
  .trim()
  .min(1)
  .optional()
  .describe(ACCOUNT_ID_DESCRIPTION);

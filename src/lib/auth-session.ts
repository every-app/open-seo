import { z } from "zod";

const sessionWithOrg = z.object({
  session: z.object({
    activeOrganizationId: z.string(),
  }),
});

export function getActiveOrganizationId(session: unknown): string | null {
  const result = sessionWithOrg.safeParse(session);
  return result.success ? result.data.session.activeOrganizationId : null;
}

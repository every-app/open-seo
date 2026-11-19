import { z } from "zod";

const answerSchema = z.object({ Status: z.number() });
const NAME_NOT_FOUND = 3;

/**
 * Whether DNS knows the name. Asking Cloudflare's resolver costs nothing, so
 * a name nobody can read never becomes a report. The site itself isn't
 * requested here; that happens only while its report is written
 * (read-page.ts). A resolver that can't answer counts as yes.
 */
export async function siteExists(site: string): Promise<boolean> {
  try {
    const result = await fetch(
      `https://cloudflare-dns.com/dns-query?${new URLSearchParams({ name: site, type: "A" })}`,
      {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(5_000),
      },
    );
    return (
      !result.ok ||
      answerSchema.parse(await result.json()).Status !== NAME_NOT_FOUND
    );
  } catch {
    return true;
  }
}

import { desk, type SeoReportEnv } from "./config";
import type { StoredReport } from "./desk";
import { isRemoved } from "./removed";

/**
 * A written report by its link, or null: a link nobody was sent, an old
 * report, a removed site.
 */
export async function readReport(
  env: SeoReportEnv,
  token: string,
): Promise<StoredReport | null> {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  // Typed here because an RPC answer also carries a disposer, which a server
  // function can't send to the page.
  const report: StoredReport | null = await desk(env).report(token);
  return report && !isRemoved(report.site) ? report : null;
}

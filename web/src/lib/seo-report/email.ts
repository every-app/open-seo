import { SITE_URL } from "@/lib/seo";
import { secret, StandIn, usesStandIn, type SeoReportEnv } from "./config";
import { FAILURE_SENTENCES, type ReportFailure } from "./failure";
import { reportPath, signupUrl } from "./links";
import { sha256Hex } from "./site";

// The two emails the tool sends, through Loops as transactional sends.
// addToAudience stays false: the recipient never becomes a contact, so they
// stay off every list and campaign. An address goes to Loops and is logged
// nowhere.

const TRANSACTIONAL_URL = "https://app.loops.so/api/v1/transactional";

export enum EmailSend {
  Sent = "sent",
  /** Loops won't take it, now or later. */
  Refused = "refused",
  Retry = "retry",
}

enum ReportEmail {
  Ready = "ready",
  Failed = "failed",
}

const TEMPLATES = {
  [ReportEmail.Ready]: "LOOPS_SEO_REPORT_READY_ID",
  [ReportEmail.Failed]: "LOOPS_SEO_REPORT_FAILED_ID",
} as const;

/** How a run ended, for its email: the report's token, or why there is none. */
export type Ending = { token: string } | { failure: ReportFailure };

/**
 * What each template is given. The failure email names no site: whoever
 * asked chose the name, and this email goes to an address they typed.
 * `source` is one of ours (request.ts) and `reason` one of our sentences
 * (failure.ts), never the requester's words or the model's.
 */
function emailVariables(message: {
  site: string;
  ending: Ending;
  source: string;
}): Record<string, string> {
  const { ending } = message;
  if ("failure" in ending)
    return {
      source: message.source,
      reason: FAILURE_SENTENCES[ending.failure],
    };
  return {
    domain: message.site,
    reportUrl: new URL(reportPath(ending.token), SITE_URL).href,
    signupUrl: signupUrl(message.site, message.source),
    source: message.source,
  };
}

export async function sendReportEmail(
  env: SeoReportEnv,
  message: {
    email: string;
    site: string;
    ending: Ending;
    source: string;
    /** What makes this send the same send if it is tried twice. */
    sendId: string;
  },
): Promise<EmailSend> {
  const kind =
    "token" in message.ending ? ReportEmail.Ready : ReportEmail.Failed;
  const dataVariables = emailVariables(message);
  if (usesStandIn(env, StandIn.Email)) {
    console.log(
      JSON.stringify({
        event: "seo_report_email_stand_in",
        kind,
        dataVariables,
      }),
    );
    return EmailSend.Sent;
  }
  let result: Response;
  try {
    result = await fetch(TRANSACTIONAL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret(env, "LOOPS_API_KEY")}`,
        // Stable for this send, so trying it twice can't email twice.
        "Idempotency-Key": await sha256Hex(`${message.sendId}:${kind}`),
      },
      body: JSON.stringify({
        transactionalId: secret(env, TEMPLATES[kind]),
        email: message.email,
        addToAudience: false,
        dataVariables,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "seo_report_email_unreachable",
        kind,
        name: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    return EmailSend.Retry;
  }
  // 409 means this idempotency key was already used, so the email already went out.
  if (result.ok || result.status === 409) return EmailSend.Sent;
  console.error(
    JSON.stringify({
      event: "seo_report_email_refused",
      kind,
      status: result.status,
    }),
  );
  return result.status === 429 || result.status >= 500
    ? EmailSend.Retry
    : EmailSend.Refused;
}

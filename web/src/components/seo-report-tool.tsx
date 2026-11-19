import { useEffect, useState } from "react";
import { trackTool } from "@/lib/free-tools/analytics";
import {
  FIELD_CLASS,
  FieldLabel,
  SubmitButton,
  ToolForm,
  type ToolStatus,
} from "@/lib/free-tools/form";
import { UpsellCard } from "@/lib/free-tools/upsell-card";
import {
  isAccepted,
  SEO_REPORT_API_PATH,
  SEO_REPORT_MESSAGES,
  SeoReportRefusal,
  type SeoReportResponse,
  type SeoReportStatus,
} from "@/lib/seo-report/contract";

const TOOL = "seo-report";
const PANEL =
  "rounded-xl border border-[var(--color-border-subtle)] bg-white p-4 md:p-5";

async function sendRequest(body: Record<string, unknown>) {
  const response = await fetch(SEO_REPORT_API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const answer: Partial<SeoReportResponse> = await response.json();
  return answer.status && answer.status in SEO_REPORT_MESSAGES
    ? answer.status
    : SeoReportRefusal.InvalidRequest;
}

export function SeoReportTool({ initialSite }: { initialSite?: string }) {
  const [site, setSite] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<ToolStatus>("idle");
  const [answer, setAnswer] = useState<SeoReportStatus | null>(null);

  // Applied after hydration so the prerendered HTML and the first client
  // render agree, whatever ?site= the visitor arrived with.
  useEffect(() => {
    if (initialSite) setSite(initialSite);
  }, [initialSite]);

  const send = async (
    input: Record<string, unknown>,
    turnstileToken: string,
  ) => {
    setStatus("loading");
    trackTool("tool_run", TOOL);
    const result = await sendRequest({ ...input, turnstileToken }).catch(
      () => SeoReportRefusal.InvalidRequest,
    );
    setAnswer(result);
    if (isAccepted(result)) trackTool("tool_result", TOOL);
    setStatus(isAccepted(result) ? "done" : "error");
  };

  if (answer && isAccepted(answer))
    return (
      <div>
        <p role="status" className={`${PANEL} font-medium text-neutral-950`}>
          {SEO_REPORT_MESSAGES[answer]}
        </p>
        <UpsellCard tool={TOOL} cta="Try OpenSEO">
          The report names the keywords worth going after. OpenSEO tracks where
          you rank for them.
        </UpsellCard>
      </div>
    );

  return (
    <ToolForm
      onSubmit={send}
      input={{ site, email }}
      status={status}
      errorMessage={answer ? SEO_REPORT_MESSAGES[answer] : ""}
      notes={false}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <FieldLabel htmlFor="seo-report-site">Website</FieldLabel>
          <input
            id="seo-report-site"
            name="site"
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoComplete="url"
            spellCheck={false}
            required
            maxLength={300}
            value={site}
            onChange={(event) => setSite(event.target.value)}
            placeholder="yourcompany.com"
            disabled={status === "loading"}
            className={`${FIELD_CLASS} mt-1.5`}
          />
        </div>
        <div>
          <FieldLabel htmlFor="seo-report-email">Email</FieldLabel>
          <input
            id="seo-report-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@yourcompany.com"
            disabled={status === "loading"}
            className={`${FIELD_CLASS} mt-1.5`}
          />
        </div>
        <SubmitButton
          status={status}
          idleLabel="Email me the report"
          loadingLabel="Sending…"
        />
      </div>
      <p className="mt-2.5 text-xs text-[var(--color-brand-muted)]">
        Free. We email the report and nothing else. Reports use United States
        search data, in English.
      </p>
    </ToolForm>
  );
}

import { useIsMutating, useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import {
  CrawlerAccessForm,
  CrawlerAccessSetupHint,
  useCrawlerAccessNeedsSetup,
  crawlerCredentialsQueryKey,
  saveCrawlerCredentialMutationKey,
} from "@/client/features/crawler-access/CrawlerAccessForm";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { ShopifyRateLimitAlert } from "@/client/features/audit/results/ShopifyRateLimitAlert";
import type { AuditResultsData } from "@/client/features/audit/results/types";
import { extractHostname } from "@/client/features/audit/shared";
import {
  diagnoseAuditDirectFetch,
  diagnoseAuditSequence,
  startAudit,
} from "@/serverFunctions/audit";
import { listCrawlerCredentials } from "@/serverFunctions/crawlerAccess";
import {
  SHOPIFY_CRAWLER_ACCESS_DOC_URL,
  isCrawlerAccessExpired,
} from "@/shared/crawler-access";

function requestSummary(
  request: {
    timestamp: string;
    status: number | null;
    durationMs: number;
    signatureAttached: boolean;
    headerPresence: Record<string, boolean>;
    redirectLocation: string | null;
    retryAfter: string | null;
    cfCacheStatus: string | null;
    requestIds: { cfRay: string | null; requestId: string | null };
  } | null,
) {
  if (!request) return "not attempted";
  const headers = Object.values(request.headerPresence).every(Boolean)
    ? "all signature headers present"
    : "signature header missing";
  return `UTC ${request.timestamp}; HTTP ${request.status ?? "network error"}; ${request.durationMs} ms; ${request.signatureAttached ? "signature attached" : "signature not attached"}; ${headers}; redirect ${request.redirectLocation ?? "none"}; Retry-After ${request.retryAfter ?? "absent"}; cache ${request.cfCacheStatus ?? "unknown"}; cf-ray ${request.requestIds.cfRay ?? "absent"}; request ID ${request.requestIds.requestId ?? "absent"}.`;
}

/**
 * Shown instead of the generic crawl warnings when a Shopify storefront
 * throttled or refused the crawl. Shopify's own fix is a crawler-access
 * signature the merchant creates in admin, so the report asks for it first.
 *
 * The setup steps only show while the domain has no usable signature. Once
 * one is saved they collapse to a single line with the re-run button. An
 * unrendered crawl Shopify still rate limited with the signature asks for
 * rendering instead. Where CRAWLER_ACCESS_SECRET is optional (Every App and
 * self-hosts), the warning says to set it first when it isn't: a signature
 * created too early only runs down its expiry.
 */
export function ShopifyCrawlWarning({
  projectId,
  audit,
  throttled,
}: {
  projectId: string;
  audit: AuditResultsData["audit"];
  /** Shopify answered with 429s, not only refusals. */
  throttled: boolean;
}) {
  const navigate = useNavigate();
  const host = extractHostname(audit.startUrl);
  const usedCredentialId = audit.config.crawlerCredentialId;

  const credentialsQuery = useQuery({
    queryKey: crawlerCredentialsQueryKey,
    queryFn: () => listCrawlerCredentials(),
  });
  const canStoreCrawlerAccess = !useCrawlerAccessNeedsSetup(projectId);
  const setupHint = canStoreCrawlerAccess ? null : (
    <p className="text-muted-foreground">
      A signature can't be saved here until crawler access is set up.{" "}
      <CrawlerAccessSetupHint />
    </p>
  );
  // A recorded credential id names the signature this crawl used, whatever
  // else is stored for the host on another project. If that one has expired
  // since (possibly mid-crawl), expiry is the explanation. Without a recorded
  // id, an expired row for the host is why the crawl went out unsigned.
  const expiredCredential = credentialsQuery.data?.find(
    (credential) =>
      (usedCredentialId
        ? credential.id === usedCredentialId
        : credential.host === host) &&
      isCrawlerAccessExpired(credential.expiresAt),
  );
  // Several projects can hold a live signature for this host; the one this
  // crawl used decides whether the crawl was signed.
  const liveCredentials = (credentialsQuery.data ?? []).filter(
    (credential) =>
      credential.host === host && !isCrawlerAccessExpired(credential.expiresAt),
  );
  const liveCredential =
    liveCredentials.find((credential) => credential.id === usedCredentialId) ??
    liveCredentials[0];
  // A re-run started mid-save would resolve the old signature, or none.
  const isSaving =
    useIsMutating({ mutationKey: saveCrawlerCredentialMutationKey }) > 0;

  const rerunMutation = useMutation({
    mutationFn: () =>
      startAudit({
        data: {
          projectId,
          startUrl: audit.startUrl,
          maxPages: audit.config.maxPages,
          lighthouseStrategy: audit.config.lighthouseStrategy,
          renderJavaScript: audit.config.renderJavaScript,
        },
      }),
    onSuccess: (result) => {
      void navigate({
        to: "/p/$projectId/audit",
        params: { projectId },
        search: { auditId: result.auditId, tab: "issues" },
      });
    },
  });
  const diagnosticMutation = useMutation({
    mutationFn: () =>
      diagnoseAuditDirectFetch({ data: { projectId, auditId: audit.id } }),
  });
  const sequenceMutation = useMutation({
    mutationFn: () =>
      diagnoseAuditSequence({ data: { projectId, auditId: audit.id } }),
  });

  const rerunButton = (
    <Button
      variant="outline"
      size="sm"
      pending={rerunMutation.isPending}
      disabled={isSaving}
      onClick={() => rerunMutation.mutate()}
    >
      {rerunMutation.isPending ? "Starting…" : "Re-run audit"}
    </Button>
  );

  // Until the list loads we can't tell which state applies; don't flash the
  // setup steps at someone who already has a signature.
  if (credentialsQuery.isPending) return null;

  if (liveCredential) {
    const signedAndStillLimited = liveCredential.id === usedCredentialId;
    if (signedAndStillLimited && throttled && !audit.config.renderJavaScript) {
      return (
        <ShopifyRateLimitAlert
          projectId={projectId}
          startUrl={audit.startUrl}
        />
      );
    }
    return (
      <Alert variant={signedAndStillLimited ? "warning" : "success"}>
        {signedAndStillLimited ? <ShieldAlert /> : <ShieldCheck />}
        <AlertDescription className="text-foreground">
          {signedAndStillLimited ? (
            <>
              Shopify limited this crawl despite your signature. To check that
              it was created for <span className="font-mono">{host}</span>,
              paste it again in{" "}
              <Link
                to="/p/$projectId/settings/integrations"
                params={{ projectId }}
              >
                Project settings
              </Link>
              . If it was, Shopify is still throttling this store: re-run the
              audit later or with fewer pages.
            </>
          ) : (
            <>
              Crawler access is saved for{" "}
              <span className="font-mono">{host}</span>. Re-run the audit to
              crawl with it.
            </>
          )}
        </AlertDescription>
        <div className="col-start-2 mt-2 flex flex-wrap items-center gap-2">
          {rerunButton}
          {signedAndStillLimited && (
            <>
              <Button
                variant="outline"
                size="sm"
                pending={diagnosticMutation.isPending}
                onClick={() => diagnosticMutation.mutate()}
              >
                Check signed request
              </Button>
              <Button
                variant="outline"
                size="sm"
                pending={sequenceMutation.isPending}
                onClick={() => sequenceMutation.mutate()}
              >
                Check audit sequence
              </Button>
            </>
          )}
          {diagnosticMutation.data && (
            <span className="text-sm">
              {diagnosticMutation.data.result.access === "opened"
                ? `${requestSummary(diagnosticMutation.data.result.request)} Validation ${diagnosticMutation.data.result.validation.outcome}; credential fingerprint ${diagnosticMutation.data.result.credentialFingerprint}.`
                : "Credential decryption failed."}
            </span>
          )}
          {sequenceMutation.data?.result.access === "opened" && (
            <span className="text-sm">
              Credential fingerprint{" "}
              {sequenceMutation.data.result.credentialFingerprint}; validation{" "}
              {sequenceMutation.data.result.validation.outcome}. Probe:{" "}
              {requestSummary(sequenceMutation.data.result.appProbe)} Robots:{" "}
              {requestSummary(
                sequenceMutation.data.result.requests?.robots ?? null,
              )}{" "}
              Sitemap:{" "}
              {requestSummary(
                sequenceMutation.data.result.requests?.sitemap ?? null,
              )}{" "}
              Homepage:{" "}
              {requestSummary(
                sequenceMutation.data.result.requests?.homepage ?? null,
              )}
              {sequenceMutation.data.result.stoppedAfter
                ? ` Stopped after ${sequenceMutation.data.result.stoppedAfter} received HTTP 429.`
                : null}
            </span>
          )}
          {sequenceMutation.data?.result.access === "decryption_failed" && (
            <span className="text-sm">Credential decryption failed.</span>
          )}
        </div>
      </Alert>
    );
  }

  return (
    <Alert variant="warning">
      <ShieldAlert />
      <div className="min-w-0 space-y-3">
        {expiredCredential?.expiresAt ? (
          <>
            <AlertTitle>
              Your Shopify signature for this store has expired.
            </AlertTitle>
            {setupHint}
            <p className="text-muted-foreground">
              It ran out on{" "}
              {new Date(expiredCredential.expiresAt).toLocaleDateString()}, so
              requests after that went out unsigned and Shopify limited them.
              {canStoreCrawlerAccess
                ? " Signatures can't be renewed: create a fresh one in Shopify admin and paste it below to replace the stored values."
                : null}
            </p>
          </>
        ) : (
          <>
            <AlertTitle>Shopify limited this crawl.</AlertTitle>
            {setupHint}
            <p className="text-muted-foreground">
              Shopify rate-limits crawlers it hasn't authorized, so parts of
              this report are missing.
              {canStoreCrawlerAccess
                ? " If you own this store, authorizing OpenSEO takes about a minute."
                : null}
            </p>
          </>
        )}

        {canStoreCrawlerAccess ? (
          <>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>
                In Shopify admin, go to Online Store &rarr; Preferences &rarr;
                Crawler access and click Create signature.
              </li>
              <li>
                Pick the domain <span className="font-mono">{host}</span> and an
                expiry (up to 3 months).
              </li>
              <li>Paste the two values below.</li>
            </ol>

            {/* Keyed by host: the report stays mounted when the audit changes. */}
            <CrawlerAccessForm
              key={host}
              projectId={projectId}
              initialHost={host}
              lockHost
            />
          </>
        ) : null}

        <div className="flex flex-wrap items-center gap-4">
          {rerunButton}
          <a
            className="text-primary underline underline-offset-3"
            href={SHOPIFY_CRAWLER_ACCESS_DOC_URL}
            target="_blank"
            rel="noreferrer"
          >
            Shopify's crawler access guide
          </a>
        </div>
      </div>
    </Alert>
  );
}

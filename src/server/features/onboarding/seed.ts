import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { DomainService } from "@/server/features/domain/services/DomainService";
import { isLabsLocationCode } from "@/shared/keyword-locations";
import { readSite } from "@/server/features/onboarding/scrape";
import {
  synthesizeStrategy,
  type RankedKeyword,
} from "@/server/features/onboarding/synthesis";

type OnboardingSeedResult =
  | { status: "complete"; markdown: string }
  | { status: "skipped" };

type OnboardingSeedInput = {
  projectId: string;
  billingCustomer: BillingCustomerContext;
  emailVerified: boolean;
  domain: string;
  countryName: string;
  locationCode: number;
  languageCode: string;
};

// Atomic claim: one free strategy run per project. Claims only when no run has
// succeeded yet (status null) or a prior run failed (retry). A 'complete' run is
// NOT re-claimable — this is a free, balance-gate-bypassed run, so we don't let
// it be looped to amplify spend; regenerating later is a separate paid action.
// A concurrent 'running' run is also blocked.
async function claimRun(projectId: string): Promise<boolean> {
  const updated = await db
    .update(projects)
    .set({
      onboardingRunStatus: "running",
      onboardingRunAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(projects.id, projectId),
        or(
          isNull(projects.onboardingRunStatus),
          eq(projects.onboardingRunStatus, "failed"),
        ),
      ),
    )
    .returning({ id: projects.id });
  return updated.length > 0;
}

async function setRunStatus(projectId: string, status: "complete" | "failed") {
  await db
    .update(projects)
    .set({ onboardingRunStatus: status })
    .where(eq(projects.id, projectId));
}

/**
 * Runs the onboarding strategy generation for a project: read the site, pull
 * (paid) ranking signal, and synthesize a strategy, returned to the chat (not
 * persisted — persistence is deferred to a later PR). Paid DataForSEO calls are
 * attributed to the 'onboarding' feature and skip the balance gate so a
 * zero-balance new signup still completes; the underlying services are
 * cache-first, so a re-run rarely re-spends.
 */
export async function runOnboardingSeed(
  input: OnboardingSeedInput,
): Promise<OnboardingSeedResult> {
  const claimed = await claimRun(input.projectId);
  if (!claimed) {
    return { status: "skipped" };
  }

  try {
    const site = await readSite(input.domain);

    let organicTraffic: number | null = null;
    let organicKeywords: number | null = null;
    let rankedKeywords: RankedKeyword[] = [];

    // Free stages (read) run for everyone; paid DataForSEO signal is gated on a
    // verified email (abuse surface) and a Labs-supported location — the domain
    // endpoints used here are Labs-only, so a Google-Ads-only country gets a
    // content-only strategy rather than a failed run.
    if (input.emailVerified && isLabsLocationCode(input.locationCode)) {
      const metering = {
        creditFeature: "onboarding" as const,
        skipBalanceAssert: true,
      };
      const overview = await DomainService.getOverview(
        {
          projectId: input.projectId,
          domain: input.domain,
          includeSubdomains: false,
          locationCode: input.locationCode,
          languageCode: input.languageCode,
        },
        input.billingCustomer,
        metering,
      );
      organicTraffic = overview.organicTraffic;
      organicKeywords = overview.organicKeywords;

      if (overview.hasData) {
        const ranked = await DomainService.getSuggestedKeywords(
          {
            domain: input.domain,
            locationCode: input.locationCode,
            languageCode: input.languageCode,
            organizationId: input.billingCustomer.organizationId,
            projectId: input.projectId,
          },
          input.billingCustomer,
          metering,
        );
        rankedKeywords = ranked.map((kw) => ({
          keyword: kw.keyword,
          position: kw.position,
          searchVolume: kw.searchVolume,
          keywordDifficulty: kw.keywordDifficulty,
        }));
      }
    }

    const markdown = await synthesizeStrategy({
      domain: input.domain,
      countryName: input.countryName,
      pages: site.pages,
      scrapeBlocked: site.blocked,
      organicTraffic,
      organicKeywords,
      rankedKeywords,
    });

    await setRunStatus(input.projectId, "complete");

    return { status: "complete", markdown };
  } catch (error) {
    // Reset to a re-runnable state so the user can retry (cache-backed, cheap).
    await setRunStatus(input.projectId, "failed");
    throw error;
  }
}

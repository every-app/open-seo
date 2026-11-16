import { classifyPlatforms } from "./platformClassifier";
import { normalizeSerpKeyword } from "./serpRecorder";
import {
  isBareUmbrella,
  KNOWN_PARASITE_PLATFORMS,
  platformDomain,
} from "../platforms/platformDomain";
import { PlatformDiscoveryRepository as repo } from "../repositories/PlatformDiscoveryRepository";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { readMergedSerps } from "@/server/features/keywords/services/research/serpReads";
import { AppError } from "@/server/lib/errors";
import { getOpenRouterAccess } from "@/server/lib/openrouter";
import { buildCacheKey } from "@/server/lib/r2-cache";
import { hasDataforseoAccess } from "@/server/lib/provider-access";
import { getWorkersEnv } from "@/server/lib/runtime-env";
import { PS_SERP_DEPTH, type PsPlatformStatus } from "@/shared/platform-seo";

const MANUAL_CLASSIFY_MAX = 200;

// ---------------------------------------------------------------------------
// The platform list
// ---------------------------------------------------------------------------

/** The first visit lists the well-known platforms so the list isn't empty. */
async function seedKnownPlatforms(organizationId: string) {
  if (await repo.hasSeededPlatforms(organizationId)) return;
  await repo.insertPlatforms(
    [...KNOWN_PARASITE_PLATFORMS].map((domain) => ({
      organizationId,
      domain,
      status: "parasite",
      source: "seed",
      exampleKeyword: null,
      exampleUrl: null,
      exampleTitle: null,
      bestPosition: null,
      seenCount: 0,
      lastSeenAt: null,
    })),
  );
}

async function listPlatforms(organizationId: string) {
  await seedKnownPlatforms(organizationId);
  const [platforms, setup] = await Promise.all([
    repo.listPlatforms(organizationId),
    getSetup(),
  ]);
  return { platforms, setup };
}

async function setPlatformStatus(
  organizationId: string,
  platformId: string,
  status: PsPlatformStatus,
) {
  const updated = await repo.setStatus(organizationId, platformId, status);
  if (!updated) throw new AppError("NOT_FOUND");
}

/**
 * Adds a pasted list of sites (URLs or bare domains) with the status the user
 * chose. Sites already listed keep their status unless still waiting for
 * review; entries that aren't a site are returned so the user can see them.
 */
async function importPlatforms(
  organizationId: string,
  params: {
    sites: string[];
    status: PsPlatformStatus;
    affiliateProgram: boolean;
  },
) {
  const domains = new Set<string>();
  const invalid: string[] = [];
  // amazon.com alone would never match a result: they're filed by section.
  const needsSection: string[] = [];
  for (const site of params.sites) {
    const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(site)
      ? site
      : `https://${site}`;
    const domain = platformDomain({ url });
    if (!domain) invalid.push(site);
    else if (isBareUmbrella(domain)) needsSection.push(site);
    else domains.add(domain);
  }
  const listed = await repo.listDomainStatuses(organizationId, [...domains]);
  const newDomains = [...domains].filter((domain) => !listed.has(domain));
  const pendingDomains =
    params.status === "pending"
      ? []
      : [...listed]
          .filter(([, status]) => status === "pending")
          .map(([domain]) => domain);
  await repo.importPlatformRows(organizationId, {
    newRows: newDomains.map((domain) => ({
      organizationId,
      domain,
      status: params.status,
      source: "import",
      exampleKeyword: null,
      exampleUrl: null,
      exampleTitle: null,
      bestPosition: null,
      seenCount: 0,
      lastSeenAt: null,
      affiliateProgram: params.affiliateProgram,
    })),
    pendingDomains,
    status: params.status,
    affiliateDomains: params.affiliateProgram ? [...listed.keys()] : [],
  });
  return {
    added: newDomains.length,
    reviewed: pendingDomains.length,
    alreadyListed: listed.size - pendingDomains.length,
    invalid,
    needsSection,
  };
}

async function setAffiliateProgram(
  organizationId: string,
  platformId: string,
  affiliateProgram: boolean,
) {
  const updated = await repo.setAffiliateProgram(
    organizationId,
    platformId,
    affiliateProgram,
  );
  if (!updated) throw new AppError("NOT_FOUND");
}

async function getSetup() {
  const env = (await getWorkersEnv()) ?? {};
  return {
    openRouter: getOpenRouterAccess(env) !== null,
    // Gateway-aware: behind Every App the gateway holds the key.
    dataForSeo: await hasDataforseoAccess(),
  };
}

/** The "AI pass" button: classifies platforms still waiting for one. */
async function runAiPass(customer: BillingCustomerContext) {
  const setup = await getSetup();
  if (!setup.openRouter) {
    throw new AppError("VALIDATION_ERROR", "Add OPENROUTER_API_KEY first.");
  }
  return {
    classified: await classifyPlatforms(customer, {
      limit: MANUAL_CLASSIFY_MAX,
    }),
  };
}

// ---------------------------------------------------------------------------
// "Find platforms": read Google's first two pages for chosen keywords
// ---------------------------------------------------------------------------

async function findPlatforms(params: {
  customer: BillingCustomerContext;
  keywords: string[];
  locationCode: number;
  languageCode: string;
}) {
  const setup = await getSetup();
  if (!setup.dataForSeo) {
    throw new AppError(
      "VALIDATION_ERROR",
      "DataForSEO isn't set up for this deployment yet.",
    );
  }
  const keywords = [
    ...new Set(params.keywords.map(normalizeSerpKeyword)),
  ].filter(Boolean);
  const requests = await Promise.all(
    keywords.map(async (keyword) => ({
      query: {
        keyword,
        locationCode: params.locationCode,
        languageCode: params.languageCode,
        depth: PS_SERP_DEPTH,
      },
      receiptKey: await buildCacheKey("ps:find-platforms", {
        organizationId: params.customer.organizationId,
        keyword,
        locationCode: params.locationCode,
        languageCode: params.languageCode,
        depth: PS_SERP_DEPTH,
      }),
    })),
  );
  const outcomes = await readMergedSerps(params.customer, requests, {
    awaitObservations: true,
  });
  const results = keywords.map((keyword, index) => ({
    keyword,
    status: outcomes[index]?.status ?? "failed",
  }));
  // Every query failing is an error; some failing is a partial result.
  if (results.every((result) => result.status === "failed")) {
    const first = outcomes.find((outcome) => outcome.status === "failed");
    if (first?.status === "failed") throw first.error;
  }
  return { results };
}

// ---------------------------------------------------------------------------
// Parasite opportunity per keyword
// ---------------------------------------------------------------------------

type ParasiteOpportunity = {
  keyword: string;
  /** Parasite results on page 1 and page 2 of the latest SERP we have. */
  page1: number;
  page2: number;
  /** Whether the latest SERP reached page 2 (the panel only reads page 1). */
  sawPage2: boolean;
  label: "easy" | "possible" | "hard";
  checkedAt: string;
};

function opportunityLabel(page1: number, page2: number) {
  if (page1 >= 2 || (page1 >= 1 && page2 >= 2)) return "easy" as const;
  if (page1 + page2 >= 1) return "possible" as const;
  return "hard" as const;
}

/**
 * For each keyword, counts results on parasite platforms in the latest SERP
 * we recorded: platforms the user confirmed, plus ones the AI calls parasites
 * that are still waiting for review.
 */
async function getOpportunities(params: {
  organizationId: string;
  keywords: string[];
  locationCode: number;
  languageCode: string;
}): Promise<ParasiteOpportunity[]> {
  const keywords = [...new Set(params.keywords.map(normalizeSerpKeyword))];
  if (keywords.length === 0) return [];
  const rows = await repo.listObservationsWithPlatforms({
    organizationId: params.organizationId,
    keywords,
    locationCode: params.locationCode,
    languageCode: params.languageCode,
    maxPosition: PS_SERP_DEPTH,
  });

  const latest = new Map<string, { runKey: string; observedAt: string }>();
  for (const row of rows) {
    const current = latest.get(row.keyword);
    if (!current || row.observedAt > current.observedAt) {
      latest.set(row.keyword, {
        runKey: row.runKey,
        observedAt: row.observedAt,
      });
    }
  }

  return [...latest.entries()].map(([keyword, run]) => {
    let page1 = 0;
    let page2 = 0;
    let sawPage2 = false;
    for (const row of rows) {
      if (row.keyword !== keyword || row.runKey !== run.runKey) continue;
      if (row.position > 10) sawPage2 = true;
      const parasite =
        row.status === "parasite" ||
        (row.status === "pending" && row.aiVerdict === "parasite");
      if (!parasite) continue;
      if (row.position <= 10) page1 += 1;
      else page2 += 1;
    }
    return {
      keyword,
      page1,
      page2,
      sawPage2,
      label: opportunityLabel(page1, page2),
      checkedAt: run.observedAt,
    };
  });
}

export const PlatformDiscoveryService = {
  listPlatforms,
  setPlatformStatus,
  importPlatforms,
  setAffiliateProgram,
  runAiPass,
  findPlatforms,
  getOpportunities,
};

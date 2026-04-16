/**
 * Seed the local D1 database with rank tracking data from DataForSEO.
 *
 * Usage:
 *   pnpm seed:rank-tracking --domain=example.com [--projectId=xxx]
 *
 * Requires:
 *   - DATAFORSEO_API_KEY in .env.local or .env
 *   - Local D1 database (run `pnpm db:migrate:local` first)
 *   - At least one project in the database (start the dev server once)
 */

import process from "node:process";
import { getPlatformProxy } from "wrangler";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import {
  DataforseoLabsApi,
  DataforseoLabsGoogleRankedKeywordsLiveRequestInfo,
} from "dataforseo-client";
import * as schema from "../src/db/schema";
import {
  domainRankedKeywordItemSchema,
  type DomainRankedKeywordItem,
} from "../src/server/lib/dataforseoSchemas";
import { z } from "zod";
import { loadLocalEnv, parseArgs } from "./cli-utils";

loadLocalEnv();

const args = parseArgs(process.argv.slice(2));

await main();

async function main() {
  const domain = normalizeDomain(args.domain);
  if (!domain) {
    exitWithUsage("Missing --domain argument.");
  }

  const apiKey = process.env.DATAFORSEO_API_KEY;
  if (!apiKey) {
    exitWithUsage("Missing DATAFORSEO_API_KEY. Set it in .env.local or .env.");
  }

  console.log(`Setting up local D1 connection...`);
  const { env, dispose } = await getPlatformProxy<{ DB: D1Database }>();
  const db = drizzle(env.DB, { schema });

  try {
    // Resolve project
    const projectId = args.projectId ?? (await findFirstProject(db));
    if (!projectId) {
      exitWithUsage(
        "No projects found in local DB. Start the dev server and create a project first.",
      );
    }

    const existingProject = await db.query.projects.findFirst({
      where: eq(schema.projects.id, projectId),
    });
    if (!existingProject) {
      exitWithUsage(`Project ${projectId} not found in local DB.`);
    }
    console.log(`Using project: ${existingProject.name} (${projectId})`);

    // Check for existing config
    const existingConfig = await db.query.rankTrackingConfigs.findFirst({
      where: eq(schema.rankTrackingConfigs.domain, domain),
    });
    if (existingConfig) {
      console.log(
        `Rank tracking config already exists for ${domain} — skipping. Delete it manually to re-seed.`,
      );
      return;
    }

    // Fetch top 50 keywords from DataForSEO
    console.log(`Fetching top 50 keywords for ${domain} from DataForSEO...`);
    const rankedItems = await fetchRankedKeywords(apiKey, domain, 50);
    console.log(`Got ${rankedItems.length} ranked keywords.`);

    if (rankedItems.length === 0) {
      console.log("No keywords found for this domain. Nothing to seed.");
      return;
    }

    // Map to keyword/position/url
    const keywords = rankedItems
      .map(mapKeywordItem)
      .filter((k): k is NonNullable<typeof k> => k !== null);
    console.log(`Mapped ${keywords.length} valid keywords.`);

    // Generate IDs
    const configId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Insert config
    await db.insert(schema.rankTrackingConfigs).values({
      id: configId,
      projectId,
      domain,
      locationCode: 2840,
      languageCode: "en",
      devices: "mobile",
      serpDepth: 20,
      scheduleInterval: "weekly",
      isActive: true,
      lastCheckedAt: now,
    });
    console.log(`Created config for ${domain} (mobile, weekly).`);

    // Insert keywords (batch individual statements to respect D1 bind limits)
    const keywordRows = keywords.map((k) => ({
      id: crypto.randomUUID(),
      configId,
      keyword: k.keyword,
    }));
    const keywordStmts = keywordRows.map((row) =>
      db.insert(schema.rankTrackingKeywords).values(row).onConflictDoNothing(),
    );
    if (keywordStmts.length > 0) {
      const [first, ...rest] = keywordStmts;
      await db.batch([first, ...rest]);
    }
    console.log(`Inserted ${keywordRows.length} keywords.`);

    // Insert completed run
    await db.insert(schema.rankCheckRuns).values({
      id: runId,
      configId,
      projectId,
      status: "completed",
      keywordsTotal: keywordRows.length,
      keywordsChecked: keywordRows.length,
      completedAt: now,
    });
    console.log(`Created completed run.`);

    // Insert snapshots (mobile device)
    const snapshotStmts = keywordRows.map((kw, i) =>
      db
        .insert(schema.rankSnapshots)
        .values({
          runId,
          trackingKeywordId: kw.id,
          keyword: kw.keyword,
          device: "mobile" as const,
          position: keywords[i].position,
          url: keywords[i].url,
          serpFeatures: null,
        })
        .onConflictDoNothing(),
    );
    if (snapshotStmts.length > 0) {
      const [first, ...rest] = snapshotStmts;
      await db.batch([first, ...rest]);
    }
    console.log(`Inserted ${keywordRows.length} snapshots.`);

    console.log(
      `\nDone! Seeded rank tracking for ${domain} with ${keywords.length} keywords.`,
    );
  } finally {
    await dispose();
  }
}

// ---------------------------------------------------------------------------
// DataForSEO
// ---------------------------------------------------------------------------

async function fetchRankedKeywords(
  apiKey: string,
  domain: string,
  limit: number,
): Promise<DomainRankedKeywordItem[]> {
  const api = new DataforseoLabsApi("https://api.dataforseo.com", {
    fetch: (url: RequestInfo, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Basic ${apiKey}`);
      return fetch(url, { ...init, headers });
    },
  });

  const req = new DataforseoLabsGoogleRankedKeywordsLiveRequestInfo({
    target: domain,
    location_code: 2840,
    language_code: "en",
    limit,
    order_by: ["keyword_data.keyword_info.search_volume,desc"],
  });

  const response = await api.googleRankedKeywordsLive([req]);

  if (!response || response.status_code !== 20000) {
    throw new Error(
      `DataForSEO error: ${response?.status_message ?? "unknown"}`,
    );
  }

  const task = response.tasks?.[0];
  if (!task || task.status_code !== 20000) {
    throw new Error(
      `DataForSEO task error: ${task?.status_message ?? "no task returned"}`,
    );
  }

  const rawItems = task.result?.[0]?.items ?? [];
  const parsed = z.array(domainRankedKeywordItemSchema).safeParse(rawItems);
  if (!parsed.success) {
    console.error("Schema validation issues:", parsed.error.issues.slice(0, 3));
    throw new Error("DataForSEO response failed schema validation");
  }

  return parsed.data;
}

// ---------------------------------------------------------------------------
// Mapping (mirrors DomainService.mapKeywordItem)
// ---------------------------------------------------------------------------

function mapKeywordItem(item: DomainRankedKeywordItem) {
  const keywordData = item.keyword_data;
  const rankedSerpElement = item.ranked_serp_element;
  const serpItem = rankedSerpElement?.serp_item;

  const keyword = keywordData?.keyword ?? item.keyword;
  if (!keyword) return null;

  const position =
    serpItem?.rank_absolute ?? rankedSerpElement?.rank_absolute ?? null;
  const url = serpItem?.url ?? rankedSerpElement?.url ?? null;

  return {
    keyword: keyword.toLowerCase().trim(),
    position: position != null ? Math.round(position) : null,
    url,
  };
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

type SeedDb = ReturnType<typeof drizzle<typeof schema>>;

async function findFirstProject(db: SeedDb): Promise<string | null> {
  const row = await db.query.projects.findFirst();
  return row?.id ?? null;
}

// ---------------------------------------------------------------------------
// CLI helpers
// ---------------------------------------------------------------------------

function normalizeDomain(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//u, "")
    .replace(/\/.*$/u, "")
    .replace(/^www\./u, "");
}

function exitWithUsage(message: string): never {
  console.error(message);
  console.error(
    "Usage: pnpm seed:rank-tracking --domain=example.com [--projectId=xxx]",
  );
  process.exit(1);
}

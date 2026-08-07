/**
 * Seed real rank trackers for the 3 client projects that have none:
 *   - Communication Station SLT (commstationslt.com)
 *   - Alfonso Dental (alfonsodental305.com)
 *   - Maitel Optical (maiteloptical.com)
 *
 * Creates a weekly, depth-40, both-devices config + 10 money keywords each.
 * NO synthetic snapshots — real position data comes from the scheduled
 * DataForSEO check (kicked by the daily pulse via /cdn-cgi/handler/scheduled).
 *
 * Usage:
 *   pnpm tsx scripts/seed-client-rank-trackers.ts
 *
 * Safe write path: uses getPlatformProxy (workerd D1 binding), same as
 * scripts/seed-rank-tracking.ts — never raw sqlite while the dev server runs.
 */

import { getPlatformProxy } from "wrangler";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";

const LOCATION_CODE = 2840; // United States
const SERP_DEPTH = 40;

type SeedDb = ReturnType<typeof drizzle<typeof schema>>;

// projectId -> { domain, keywords: [{keyword, volume, kd, cpc}] }
const CLIENT_TRACKERS: Record<
  string,
  { domain: string; keywords: { keyword: string; volume: number; kd: number; cpc: number | null }[] }
> = {
  // Communication Station SLT — speech-language therapy, Miami
  "ad3950c0-f176-4b30-810a-50f04680c8d2": {
    domain: "commstationslt.com",
    keywords: [
      { keyword: "speech therapy miami", volume: 1000, kd: 30, cpc: 4.5 },
      { keyword: "speech therapist miami", volume: 880, kd: 28, cpc: 4.2 },
      { keyword: "speech therapy near me", volume: 7400, kd: 35, cpc: 5.1 },
      { keyword: "pediatric speech therapy miami", volume: 480, kd: 24, cpc: 3.8 },
      { keyword: "adult speech therapy miami", volume: 210, kd: 18, cpc: 3.2 },
      { keyword: "communication station slt", volume: 10, kd: 0, cpc: null },
      { keyword: "speech language pathologist miami", volume: 390, kd: 26, cpc: 4.0 },
      { keyword: "stuttering therapy miami", volume: 170, kd: 15, cpc: 2.9 },
      { keyword: "voice therapy miami", volume: 140, kd: 14, cpc: 2.7 },
      { keyword: "accent reduction miami", volume: 90, kd: 10, cpc: 2.4 },
    ],
  },
  // Alfonso Dental — dental, Miami
  "928cb0f7-d359-40ef-8d5d-9428de277143": {
    domain: "alfonsodental305.com",
    keywords: [
      { keyword: "dentist miami", volume: 12100, kd: 45, cpc: 6.8 },
      { keyword: "dentist near me", volume: 33100, kd: 50, cpc: 7.2 },
      { keyword: "alfonso dental", volume: 10, kd: 0, cpc: null },
      { keyword: "cosmetic dentist miami", volume: 1900, kd: 38, cpc: 6.1 },
      { keyword: "dental implants miami", volume: 2400, kd: 42, cpc: 7.5 },
      { keyword: "emergency dentist miami", volume: 2900, kd: 40, cpc: 6.9 },
      { keyword: "teeth whitening miami", volume: 1600, kd: 33, cpc: 5.4 },
      { keyword: "family dentist miami", volume: 720, kd: 30, cpc: 5.0 },
      { keyword: "dental cleaning miami", volume: 880, kd: 28, cpc: 4.6 },
      { keyword: "invisalign miami", volume: 1300, kd: 36, cpc: 6.3 },
    ],
  },
  // Maitel Optical — optical, Miami
  "5bc43a10-a169-48c6-a64c-169acdd3dc40": {
    domain: "maiteloptical.com",
    keywords: [
      { keyword: "optical store miami", volume: 480, kd: 22, cpc: 3.5 },
      { keyword: "eyeglasses miami", volume: 880, kd: 25, cpc: 3.8 },
      { keyword: "eye exam miami", volume: 1900, kd: 30, cpc: 4.4 },
      { keyword: "optometrist miami", volume: 1600, kd: 32, cpc: 4.6 },
      { keyword: "maitel optical", volume: 10, kd: 0, cpc: null },
      { keyword: "eyeglasses store miami", volume: 390, kd: 20, cpc: 3.2 },
      { keyword: "contact lenses miami", volume: 720, kd: 24, cpc: 3.6 },
      { keyword: "prescription glasses miami", volume: 480, kd: 22, cpc: 3.4 },
      { keyword: "designer eyeglasses miami", volume: 210, kd: 18, cpc: 3.0 },
      { keyword: "children eye exam miami", volume: 90, kd: 12, cpc: 2.6 },
    ],
  },
};

async function main() {
  const { env, dispose } = await getPlatformProxy<{ DB: D1Database }>();
  const db = drizzle(env.DB, { schema });

  try {
    for (const [projectId, cfg] of Object.entries(CLIENT_TRACKERS)) {
      const project = await db.query.projects.findFirst({
        where: eq(schema.projects.id, projectId),
      });
      if (!project) {
        console.error(`SKIP: project ${projectId} not found`);
        continue;
      }

      // Reset any existing config for this domain (cascades keywords/runs).
      const existing = await db.query.rankTrackingConfigs.findFirst({
        where: eq(schema.rankTrackingConfigs.domain, cfg.domain),
      });
      if (existing) {
        await db
          .delete(schema.rankTrackingConfigs)
          .where(eq(schema.rankTrackingConfigs.id, existing.id));
        console.log(`Reset existing config for ${cfg.domain}`);
      }

      const configId = crypto.randomUUID();
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");
      await db.insert(schema.rankTrackingConfigs).values({
        id: configId,
        projectId,
        domain: cfg.domain,
        locationCode: LOCATION_CODE,
        languageCode: "en",
        devices: "both",
        serpDepth: SERP_DEPTH,
        scheduleInterval: "weekly",
        isActive: true,
        lastCheckedAt: now,
        createdAt: now,
      });

      const keywordRows = cfg.keywords.map((k) => ({
        id: crypto.randomUUID(),
        configId,
        keyword: k.keyword,
        searchVolume: k.volume,
        keywordDifficulty: k.kd,
        cpc: k.cpc,
        metricsFetchedAt: now,
      }));
      await db.insert(schema.rankTrackingKeywords).values(keywordRows);

      console.log(
        `✅ ${project.name} (${cfg.domain}) — config ${configId}, ${keywordRows.length} keywords`,
      );
    }
  } finally {
    await dispose();
  }
  console.log("\nDone. Next: kick the scheduled check to populate real ranks.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

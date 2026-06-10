/**
 * Seed the local D1 database with synthetic rank-tracking history so the new
 * trends / data-exploration UI has something to show. Fully offline — no
 * DataForSEO key or network needed.
 *
 * What it creates:
 *   - A both-devices config with ~20 keywords (volume / KD / CPC populated).
 *   - ~16 weekly backdated check runs, each with desktop + mobile snapshots.
 *   - Positions follow per-keyword trends (climbers, fallers, volatile, new,
 *     lost) so the line charts, scorecards, and "Not in top N" band all have
 *     realistic data — including keywords that drop out of the tracked depth.
 *
 * Usage:
 *   pnpm db:migrate:local                 # once — creates the local D1
 *   pnpm seed:rank-tracking               # seed demo data
 *   pnpm seed:rank-tracking --domain=acme.com --runs=20 --keywords=30
 *   pnpm seed:rank-tracking --projectId=<existing-project-uuid>
 *
 * Then view it:
 *   env AUTH_MODE=local_noauth pnpm dev   # then open Rank Tracking
 *
 * With no --projectId, it bootstraps the local_noauth user/org/Default project
 * (the same identity `AUTH_MODE=local_noauth` uses) so the data is immediately
 * viewable. Re-running resets the demo config for the domain.
 */

import process from "node:process";
import { getPlatformProxy } from "wrangler";
import { drizzle } from "drizzle-orm/d1";
import { and, eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { parseArgs } from "./cli-utils";

const LOCAL_ADMIN_USER_ID = "local-admin";
const LOCAL_ADMIN_EMAIL = "admin@localhost";
const LOCAL_ORG_ID = `delegated-${LOCAL_ADMIN_USER_ID}`;
const LOCATION_CODE = 2840; // United States
const SERP_DEPTH = 20; // positions beyond this are stored null ("not in top 20")

type SeedDb = ReturnType<typeof drizzle<typeof schema>>;
type BatchStatement = Parameters<SeedDb["batch"]>[0][number];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const domain = normalizeDomain(args.domain) ?? "acme-demo.com";
  const runs = clampInt(args.runs, 16, 2, 52);
  const keywordCount = clampInt(args.keywords, 20, 1, KEYWORDS.length);

  console.log("Setting up local D1 connection...");
  const { env, dispose } = await getPlatformProxy<{ DB: D1Database }>();
  const db = drizzle(env.DB, { schema });

  try {
    const projectId = await resolveProject(db, args.projectId);
    console.log(`Using project ${projectId}`);

    // Reset any previous demo config for this domain (cascades runs/snapshots/
    // keywords) so re-running is clean.
    const removed = await db
      .delete(schema.rankTrackingConfigs)
      .where(
        and(
          eq(schema.rankTrackingConfigs.projectId, projectId),
          eq(schema.rankTrackingConfigs.domain, domain),
        ),
      )
      .returning({ id: schema.rankTrackingConfigs.id });
    if (removed.length > 0) {
      console.log(`Reset existing config for ${domain}.`);
    }

    const keywords = KEYWORDS.slice(0, keywordCount);
    const runDates = buildRunDates(runs);
    const configId = crypto.randomUUID();
    const newest = runDates[runDates.length - 1];

    await db.insert(schema.rankTrackingConfigs).values({
      id: configId,
      projectId,
      domain,
      locationCode: LOCATION_CODE,
      languageCode: "en",
      devices: "both",
      serpDepth: SERP_DEPTH,
      scheduleInterval: "weekly",
      isActive: true,
      lastCheckedAt: dbTimestamp(newest),
      createdAt: dbTimestamp(runDates[0]),
    });

    const keywordRows = keywords.map((k) => ({
      id: crypto.randomUUID(),
      configId,
      keyword: k.keyword,
      searchVolume: k.volume,
      keywordDifficulty: k.kd,
      cpc: k.cpc,
      metricsFetchedAt: dbTimestamp(newest),
    }));
    await batched(db, keywordRows, (row) =>
      db.insert(schema.rankTrackingKeywords).values(row),
    );
    console.log(`Inserted ${keywordRows.length} keywords.`);

    // One completed run per date; each run snapshots every keyword on both
    // devices.
    const runRows = runDates.map((date) => ({
      id: crypto.randomUUID(),
      date,
    }));
    await batched(db, runRows, (run) =>
      db.insert(schema.rankCheckRuns).values({
        id: run.id,
        configId,
        projectId,
        status: "completed" as const,
        keywordsTotal: keywordRows.length,
        keywordsChecked: keywordRows.length,
        startedAt: dbTimestamp(run.date),
        completedAt: dbTimestamp(run.date),
      }),
    );

    const snapshotValues: (typeof schema.rankSnapshots.$inferInsert)[] = [];
    runRows.forEach((run, runIndex) => {
      keywordRows.forEach((kw, kwIndex) => {
        const profile = KEYWORDS[kwIndex].profile;
        const rng = makeRng(kwIndex * 1000 + runIndex);
        const desktopRank = rankFor(profile, runIndex, runs, rng);
        const mobileRank =
          desktopRank === null ? null : desktopRank + 1 + (rng() - 0.5) * 1.2;
        const checkedAt = dbTimestamp(run.date);
        const path = `/${slugify(kw.keyword)}`;
        snapshotValues.push(
          snapshot(run.id, kw, "desktop", desktopRank, domain, path, checkedAt),
          snapshot(run.id, kw, "mobile", mobileRank, domain, path, checkedAt),
        );
      });
    });
    await batched(db, snapshotValues, (row) =>
      db.insert(schema.rankSnapshots).values(row),
    );
    console.log(
      `Inserted ${runRows.length} runs and ${snapshotValues.length} snapshots.`,
    );

    const start = runDates[0].toISOString().slice(0, 10);
    const end = newest.toISOString().slice(0, 10);
    console.log(
      `\nDone. Seeded "${domain}" — ${keywordRows.length} keywords, ${runs} weekly checks (${start} → ${end}), desktop + mobile.`,
    );
    if (!args.projectId) {
      console.log(
        "\nView it:\n  env AUTH_MODE=local_noauth pnpm dev\n  → open Rank Tracking (the demo lives in the Default project).",
      );
    }
  } finally {
    await dispose();
  }
}

// ---------------------------------------------------------------------------
// Project / local_noauth bootstrap
// ---------------------------------------------------------------------------

async function resolveProject(
  db: SeedDb,
  projectIdArg: string | undefined,
): Promise<string> {
  if (projectIdArg) {
    const existing = await db.query.projects.findFirst({
      where: eq(schema.projects.id, projectIdArg),
    });
    if (!existing) {
      exit(`Project ${projectIdArg} not found in local DB.`);
    }
    return projectIdArg;
  }

  // Bootstrap the same user/org/Default project that AUTH_MODE=local_noauth
  // resolves, so the seeded data is viewable without signing up.
  await db
    .insert(schema.user)
    .values({
      id: LOCAL_ADMIN_USER_ID,
      name: "admin",
      email: LOCAL_ADMIN_EMAIL,
      emailVerified: true,
    })
    .onConflictDoNothing({ target: schema.user.id });

  await db
    .insert(schema.organization)
    .values({
      id: LOCAL_ORG_ID,
      name: "admin workspace",
      slug: `delegated-admin-${toHex(LOCAL_ADMIN_USER_ID)}`,
      createdAt: new Date(),
    })
    .onConflictDoNothing({ target: schema.organization.id });

  const existingDefault = await db.query.projects.findFirst({
    where: and(
      eq(schema.projects.organizationId, LOCAL_ORG_ID),
      eq(schema.projects.name, "Default"),
    ),
  });
  if (existingDefault) return existingDefault.id;

  const projectId = crypto.randomUUID();
  await db.insert(schema.projects).values({
    id: projectId,
    organizationId: LOCAL_ORG_ID,
    name: "Default",
    domain: null,
  });
  console.log("Bootstrapped local_noauth Default project.");
  return projectId;
}

// ---------------------------------------------------------------------------
// Synthetic positions
// ---------------------------------------------------------------------------

type Profile =
  | "climber"
  | "faller"
  | "leader"
  | "volatile"
  | "steady_mid"
  | "newcomer"
  | "lost";

/** Continuous "true" desktop rank for a keyword at run `i` (0 = oldest). null =
 * not present (either not in the tracked depth yet, or dropped out). */
function rankFor(
  profile: Profile,
  i: number,
  runs: number,
  rng: () => number,
): number | null {
  const t = runs <= 1 ? 1 : i / (runs - 1); // 0..1 over the window
  const noise = rng() - 0.5;
  switch (profile) {
    case "climber":
      return 18 - 16 * t + noise * 1.5; // 18 → 2
    case "faller":
      return 3 + 22 * t + noise * 1.5; // 3 → 25 (drops out late)
    case "leader":
      return 2 + noise * 0.8; // hovers 1–3
    case "volatile":
      return 9 + Math.sin(i * 1.25) * 5 + noise * 3;
    case "steady_mid":
      return 12 + noise * 1.2; // ~11–13
    case "newcomer":
      return t < 0.4 ? null : 16 - 26 * (t - 0.4) + noise * 1.5; // appears, climbs
    case "lost":
      return t > 0.75 ? null : 7 + noise * 1.5; // ranks, then disappears
  }
}

/** Round a continuous rank and drop it to null when it falls past the depth. */
function toStored(rank: number | null): number | null {
  if (rank === null) return null;
  const r = Math.max(1, Math.round(rank));
  return r > SERP_DEPTH ? null : r;
}

function snapshot(
  runId: string,
  kw: { id: string; keyword: string },
  device: "desktop" | "mobile",
  rank: number | null,
  domain: string,
  path: string,
  checkedAt: string,
): typeof schema.rankSnapshots.$inferInsert {
  const position = toStored(rank);
  return {
    runId,
    trackingKeywordId: kw.id,
    keyword: kw.keyword,
    device,
    position,
    url: position === null ? null : `https://${domain}${path}`,
    serpFeatures: null,
    checkedAt,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Weekly dates, oldest first, all at noon UTC (so local-time rendering can't
 * shift a point across a day boundary). */
function buildRunDates(runs: number): Date[] {
  const dates: Date[] = [];
  const base = new Date();
  base.setUTCHours(12, 0, 0, 0);
  for (let weeksAgo = runs - 1; weeksAgo >= 0; weeksAgo -= 1) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - weeksAgo * 7);
    dates.push(d);
  }
  return dates;
}

/** SQLite current_timestamp format (UTC): "YYYY-MM-DD HH:MM:SS". */
function dbTimestamp(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/** Small seeded PRNG (mulberry32) so re-runs produce the same data. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function batched<T>(
  db: SeedDb,
  items: T[],
  buildStatement: (item: T) => BatchStatement,
): Promise<void> {
  const SIZE = 80; // statements per D1 batch transaction
  for (let i = 0; i < items.length; i += SIZE) {
    const chunk = items.slice(i, i + SIZE).map(buildStatement);
    const [first, ...rest] = chunk;
    if (!first) continue;
    await db.batch([first, ...rest]);
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function toHex(value: string): string {
  return Array.from(new TextEncoder().encode(value), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

function normalizeDomain(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//u, "")
    .replace(/\/.*$/u, "")
    .replace(/^www\./u, "");
}

function clampInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function exit(message: string): never {
  console.error(message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Demo keyword set (keyword + metrics + trend profile)
// ---------------------------------------------------------------------------

const KEYWORDS: {
  keyword: string;
  volume: number;
  kd: number;
  cpc: number;
  profile: Profile;
}[] = [
  {
    keyword: "seo audit tool",
    volume: 18100,
    kd: 64,
    cpc: 9.4,
    profile: "climber",
  },
  {
    keyword: "best rank tracker",
    volume: 8100,
    kd: 58,
    cpc: 7.2,
    profile: "leader",
  },
  {
    keyword: "keyword research software",
    volume: 12100,
    kd: 71,
    cpc: 11.8,
    profile: "faller",
  },
  {
    keyword: "free backlink checker",
    volume: 27100,
    kd: 49,
    cpc: 4.1,
    profile: "volatile",
  },
  {
    keyword: "local seo services",
    volume: 6600,
    kd: 53,
    cpc: 14.2,
    profile: "newcomer",
  },
  {
    keyword: "google rank checker",
    volume: 9900,
    kd: 45,
    cpc: 5.6,
    profile: "steady_mid",
  },
  { keyword: "serp api", volume: 3600, kd: 41, cpc: 6.9, profile: "climber" },
  {
    keyword: "ai content optimization",
    volume: 2400,
    kd: 38,
    cpc: 8.3,
    profile: "newcomer",
  },
  {
    keyword: "technical seo checklist",
    volume: 4400,
    kd: 36,
    cpc: 3.2,
    profile: "leader",
  },
  {
    keyword: "competitor keyword analysis",
    volume: 2900,
    kd: 55,
    cpc: 10.1,
    profile: "lost",
  },
  {
    keyword: "domain authority checker",
    volume: 33100,
    kd: 62,
    cpc: 4.8,
    profile: "volatile",
  },
  {
    keyword: "on page seo tool",
    volume: 5400,
    kd: 47,
    cpc: 7.7,
    profile: "climber",
  },
  {
    keyword: "seo for startups",
    volume: 1900,
    kd: 29,
    cpc: 6.4,
    profile: "steady_mid",
  },
  {
    keyword: "rank tracking api",
    volume: 1300,
    kd: 34,
    cpc: 8.9,
    profile: "newcomer",
  },
  {
    keyword: "content gap analysis",
    volume: 2100,
    kd: 44,
    cpc: 9.1,
    profile: "faller",
  },
  {
    keyword: "mobile seo audit",
    volume: 1600,
    kd: 31,
    cpc: 5.0,
    profile: "leader",
  },
  {
    keyword: "schema markup generator",
    volume: 8800,
    kd: 39,
    cpc: 3.6,
    profile: "volatile",
  },
  {
    keyword: "search intent tool",
    volume: 1100,
    kd: 27,
    cpc: 7.0,
    profile: "climber",
  },
  {
    keyword: "seo reporting dashboard",
    volume: 2700,
    kd: 50,
    cpc: 12.5,
    profile: "lost",
  },
  {
    keyword: "indie hacker seo",
    volume: 720,
    kd: 22,
    cpc: 4.3,
    profile: "newcomer",
  },
];

await main();

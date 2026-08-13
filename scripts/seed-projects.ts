/**
 * Seed the local D1 database with demo projects so the project switcher and
 * /projects page can be exercised with a long list (agency-style account).
 * Fully offline — no DataForSEO key or network needed.
 *
 * Usage:
 *   pnpm db:migrate:local        # once — creates the local D1
 *   pnpm seed:projects           # seed 18 demo projects
 *   pnpm seed:projects --count=30
 *   pnpm seed:projects --clean   # remove previously seeded demo projects
 *
 * Then view them:
 *   env AUTH_MODE=local_noauth pnpm dev
 *
 * Bootstraps the same local_noauth user/org that `AUTH_MODE=local_noauth`
 * resolves, so the projects are immediately visible without signing up.
 * Re-running skips projects that already exist (matched by name), so it is
 * safe to run repeatedly.
 */

import process from "node:process";
import { getPlatformProxy } from "wrangler";
import { drizzle } from "drizzle-orm/d1";
import { and, eq, inArray, isNull, like } from "drizzle-orm";
// Import the sqlite schema files directly: the "../src/db/schema" barrel pulls
// in provider.ts, whose `cloudflare:workers` import Node's loader can't
// resolve outside the Workers runtime.
import * as appSchema from "../src/db/app.schema";
import { organization, user } from "../src/db/better-auth-schema";
import { parseArgs } from "./cli-utils";

const schema = { ...appSchema, organization, user };

const LOCAL_ADMIN_USER_ID = "local-admin";
const LOCAL_ADMIN_EMAIL = "admin@localhost";
const LOCAL_ORG_ID = `delegated-${LOCAL_ADMIN_USER_ID}`;

// Suffix marks rows as seeded demo data so --clean can find them without
// touching projects the user created by hand.
const DEMO_DOMAIN_SUFFIX = ".demo-seed.test";

const DEMO_PROJECTS = [
  "Flytedesk",
  "Steadfast Paving",
  "Greenhow",
  "Oliver Realty",
  "Intl. Designers",
  "Zabella",
  "Collis Roofing",
  "We Lend",
  "EarlyBird Electricians",
  "Paul Bunyan Plumbing",
  "Blue Ox HVAC",
  "Yearli",
  "Spakinect",
  "MVP Logistics",
  "Northside Dental",
  "Harbor & Vine",
  "Summit Physio",
  "Lakeview Storage",
  "Copperline Coffee",
  "Trailhead Outfitters",
  "Bellamy Law",
  "Quartz Analytics",
  "Fernwood Nursery",
  "Ironclad Fencing",
  "Beacon Tutoring",
  "Riverbend Vet",
  "Solstice Yoga",
  "Granite Countertops Co",
  "Pinewood Cabinets",
  "Atlas Moving",
] as const;

type SeedDb = ReturnType<typeof drizzle<typeof schema>>;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const count = clampInt(args.count, 18, 1, DEMO_PROJECTS.length);

  console.log("Setting up local D1 connection...");
  const { env, dispose } = await getPlatformProxy<{ DB: D1Database }>();
  const db = drizzle(env.DB, { schema });

  try {
    if (args.clean === "true") {
      await clean(db);
      return;
    }

    await bootstrapLocalIdentity(db);

    const existing = await db.query.projects.findMany({
      where: and(
        eq(schema.projects.organizationId, LOCAL_ORG_ID),
        isNull(schema.projects.archivedAt),
      ),
      columns: { name: true },
    });
    const existingNames = new Set(existing.map((project) => project.name));

    let created = 0;
    for (const name of DEMO_PROJECTS.slice(0, count)) {
      if (existingNames.has(name)) continue;
      await db.insert(schema.projects).values({
        id: crypto.randomUUID(),
        organizationId: LOCAL_ORG_ID,
        name,
        domain: toDomain(name),
      });
      created += 1;
    }

    console.log(
      `Done. Created ${created} project(s); ${count - created} already existed.`,
    );
    console.log("View them with: env AUTH_MODE=local_noauth pnpm dev");
  } finally {
    await dispose();
  }
}

async function clean(db: SeedDb) {
  const seeded = await db.query.projects.findMany({
    where: and(
      eq(schema.projects.organizationId, LOCAL_ORG_ID),
      like(schema.projects.domain, `%${DEMO_DOMAIN_SUFFIX}`),
    ),
    columns: { id: true },
  });
  if (seeded.length === 0) {
    console.log("No seeded demo projects found.");
    return;
  }
  await db.delete(schema.projects).where(
    inArray(
      schema.projects.id,
      seeded.map((project) => project.id),
    ),
  );
  console.log(`Removed ${seeded.length} seeded demo project(s).`);
}

async function bootstrapLocalIdentity(db: SeedDb) {
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
}

function toDomain(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 40);
  return `${slug}${DEMO_DOMAIN_SUFFIX}`;
}

function toHex(value: string) {
  return Array.from(new TextEncoder().encode(value))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function clampInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

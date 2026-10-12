import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * What an upstream merge must not break in this fork's own deployment.
 *
 * The fork runs from source as one volume-backed container. On boot it applies
 * `drizzle/sqlite` with `wrangler d1 migrations apply`, which tracks applied
 * migrations by FILE NAME, and a boot that fails is hard downtime. So a merge
 * must never rename or drop a shipped migration, and never bring one in under
 * a number that sorts before the fork's last one. Upstream reuses numbers the
 * fork has already taken: give its new migrations the next free numbers (file,
 * journal `tag`/`idx`, and any test that reads the file) and append them here.
 */
const SHIPPED_SQLITE_MIGRATIONS = [
  "0000_fantastic_vanisher",
  "0001_round_unus",
  "0002_fair_toad_men",
  "0003_light_sage",
  "0004_faithful_sunset_bain",
  "0005_low_red_hulk",
  "0006_magical_alex_wilder",
  "0007_sour_risque",
  "0008_luxuriant_colossus",
  "0009_smart_kitty_pryde",
  "0010_high_liz_osborn",
  "0011_colorful_dark_beast",
  "0012_closed_impossible_man",
  "0013_fat_network",
  "0014_tag_color",
  "0015_huge_celestials",
  "0016_magical_the_fallen",
  "0017_omniscient_dagger",
  "0018_minor_mad_thinker",
  "0019_true_absorbing_man",
  "0020_drop_delegated_users",
  "0021_autumn_billing",
  "0022_purple_hitman",
  "0023_sad_cobalt_man",
  "0024_clumsy_barracuda",
  "0025_loving_mojo",
  "0026_wide_red_skull",
  "0027_reflective_molten_man",
  "0028_empty_beyonder",
  "0029_location_name",
  "0030_legal_reaper",
  "0031_furry_monster_badoon",
  "0032_public_shinko_yamashiro",
  "0033_first_rick_jones",
  "0034_wonderful_skrulls",
  "0035_dashboard",
  "0036_curvy_silk_fever",
  "0037_small_caretaker",
  "0038_happy_steel_serpent",
  "0039_ga4_connections",
  "0040_drop_reddit_attributions",
  "0041_free_marvex",
  "0042_project_memory",
  "0043_user_last_active_organization",
  "0044_outstanding_sage",
  "0045_google_ads_connections",
  "0045_slimy_master_chief",
  "0046_charming_overlord",
  "0046_plain_the_watchers",
  "0049_loving_jackpot",
  "0050_google_integration_health",
  "0051_reports",
  "0052_graceful_white_queen",
  "0053_keyword_step",
  "0054_famous_crystal",
  "0055_rank_keyword_pins",
  "0056_ai_visibility",
  "0057_chubby_tyger_tiger",
  "0058_crazy_blindfold",
];

type Journal = { entries: { idx: number; when: number; tag: string }[] };

function readJournal(dir: string): Journal["entries"] {
  const journal: Journal = JSON.parse(
    readFileSync(`${dir}/meta/_journal.json`, "utf8"),
  );
  return journal.entries;
}

function migrationFiles(dir: string) {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .map((file) => file.replace(/\.sql$/, ""))
    .sort();
}

describe("shipped migrations", () => {
  it("keeps every shipped SQLite migration under its name, with nothing unlisted beside them", () => {
    expect(migrationFiles("drizzle/sqlite")).toEqual(
      [...SHIPPED_SQLITE_MIGRATIONS].sort(),
    );
  });

  it("only ever appends: numbers never go backwards", () => {
    const numbers = SHIPPED_SQLITE_MIGRATIONS.map((name) =>
      Number(name.slice(0, 4)),
    );
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
  });

  it("lists the SQLite journal in shipped order", () => {
    expect(readJournal("drizzle/sqlite").map((entry) => entry.tag)).toEqual(
      SHIPPED_SQLITE_MIGRATIONS,
    );
  });

  // drizzle's own migrator (the Postgres path) applies only entries newer than
  // the last one it ran, so an entry dated before its predecessor is skipped
  // on an existing database while a fresh one still passes. Entries before
  // each `from` predate this rule and are already applied everywhere.
  it.each([
    { dir: "drizzle/sqlite", from: 49 },
    { dir: "drizzle/pg", from: 27 },
  ])("$dir: journal matches its files and stays in date order", (flavor) => {
    const entries = readJournal(flavor.dir);
    expect(entries.map((entry) => entry.idx)).toEqual(
      entries.map((_, index) => index),
    );
    expect(entries.map((entry) => entry.tag).sort()).toEqual(
      migrationFiles(flavor.dir),
    );
    for (const entry of entries.slice(flavor.from)) {
      const earlier = entries.slice(0, entry.idx).map((prev) => prev.when);
      expect(entry.when, entry.tag).toBeGreaterThan(Math.max(...earlier));
    }
  });
});

// Railway builds the service from `Dockerfile.selfhost` at the repo root, the
// path upstream used before it moved the file. Changing that path means a
// config change riding along with a code deploy, so the root copy stays and
// must match the Dockerfile upstream maintains and CI builds.
describe("Railway build files", () => {
  it.each([
    ["Dockerfile.selfhost", "deploy/docker/Dockerfile"],
    [
      "Dockerfile.selfhost.dockerignore",
      "deploy/docker/Dockerfile.dockerignore",
    ],
  ])("%s is an exact copy of %s", (copy, source) => {
    expect(readFileSync(copy, "utf8")).toBe(readFileSync(source, "utf8"));
  });
});

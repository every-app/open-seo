/**
 * Rewrite free-form rank-tracker locations ("Catonsville, MD") to the canonical
 * DataForSEO `location_name` the SERP endpoints accept. Anything else is
 * rejected at check time with "Invalid Field: 'location_name'", so the tracker
 * "completes" every run with zero results (EVE-110 / EVE-138).
 *
 * Dry run (the default) prints every active tracker with a location name,
 * grouped by outcome, and writes a CSV next to the report:
 *   pnpm repair:rank-locations
 *
 * Prove the rewrites are accepted before applying: --verify posts each
 * current and proposed name to the DataForSEO sandbox, which validates
 * request fields exactly like production at zero cost.
 *   pnpm repair:rank-locations --verify
 *
 * Rows the matcher cannot settle (AMBIGUOUS / UNRESOLVED) take a human pick via
 * a JSON file of { "<trackerId>": "<exact registry locationName>" }, read from
 * .cache/rank-location-overrides.json when present (or --overrides <path>).
 * Overrides are sandbox-verified like every other rewrite and must exist in
 * the country's registry.
 *
 * Apply the RESOLVED rows after reviewing them, naming the host the dry run
 * printed so a stray .env can't point the write at the wrong database:
 *   pnpm repair:rank-locations --apply <host>
 *
 * Needs POSTGRES_DATABASE_URL and DATAFORSEO_API_KEY (the locations endpoint
 * is free). Registries are cached under --cache-dir (default .cache/) so the
 * apply run does not refetch ~10MB per country.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { and, eq, isNotNull, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";
import { rankTrackingConfigs } from "../src/db/pg/app.schema";
import {
  getIsoCountryCode,
  LOCATION_OPTIONS,
} from "../src/shared/keyword-locations";
import {
  foldSegment,
  matchSerpLocation,
  type SerpLocationMatch,
  type SerpRegistryLocation,
} from "./serp-location-match";
import { loadLocalEnv, parseArgs, requiredEnv } from "./cli-utils";
import { fetchRegistry, sandboxAccepts } from "./rank-location-repair-support";

loadLocalEnv();

const args = parseArgs(process.argv.slice(2));
const apply = args.apply !== undefined;
// Writes are always verified first: a name the sandbox already accepts is a
// working target and must not be replaced by the matcher's guess.
const verify = apply || args.verify === "true";
const cacheDir = args["cache-dir"] ?? ".cache";
const overridesPath =
  args.overrides ??
  (existsSync(join(cacheDir, "rank-location-overrides.json"))
    ? join(cacheDir, "rank-location-overrides.json")
    : null);
const overrides: Record<string, string> = overridesPath
  ? z
      .record(z.string().uuid(), z.string().min(1))
      .parse(JSON.parse(readFileSync(overridesPath, "utf8")))
  : {};
const reportPath = args.report ?? join(cacheDir, "rank-location-repair.csv");

/** Country location_codes we know; anything else can't pick a registry. */
const KNOWN_COUNTRY_CODES = new Set(
  LOCATION_OPTIONS.map((option) => option.code),
);

/**
 * A few trackers carry a city code (1027744 Seattle) or a bare ISO numeric
 * (36) in `location_code`, which the app treats as a country everywhere. Read
 * the country off the name's last segment so the row can be repaired fully.
 */
function countryFromName(
  locationName: string,
): (typeof LOCATION_OPTIONS)[number] | null {
  const last = foldSegment(locationName.split(",").at(-1) ?? "");
  return (
    LOCATION_OPTIONS.find((option) => foldSegment(option.label) === last) ??
    null
  );
}

type ConfigRow = {
  id: string;
  projectId: string;
  domain: string;
  locationCode: number;
  languageCode: string;
  locationName: string;
};

/** A human pick for one tracker; must name a real registry row. */
function applyOverride(
  configId: string,
  registry: SerpRegistryLocation[],
): SerpLocationMatch | null {
  const locationName = overrides[configId];
  if (!locationName) return null;
  const location = registry.find((row) => row.locationName === locationName);
  if (!location) {
    throw new Error(
      `--overrides: "${locationName}" is not in the registry for ${configId}`,
    );
  }
  return { kind: "resolved", location, via: "override" };
}

type Outcome = {
  config: ConfigRow;
  iso: string | null;
  match: SerpLocationMatch | null;
  /** Set when `location_code` is not a country code and the name says which. */
  countryCodeFix: number | null;
};

function describe(outcome: Outcome): string {
  const { match } = outcome;
  if (!match) return `unknown country code ${outcome.config.locationCode}`;
  const codeFix =
    outcome.countryCodeFix !== null
      ? ` + location_code ${outcome.config.locationCode} -> ${outcome.countryCodeFix}`
      : "";
  switch (match.kind) {
    case "exact":
      return `already canonical${codeFix}`;
    case "resolved":
      return `${match.location.locationName} (${match.location.locationType}, via ${match.via})${codeFix}`;
    case "ambiguous":
      return `ambiguous: ${match.candidates.map((c) => c.locationName).join(" | ")}`;
    case "unresolved":
      return match.suggestions.length > 0
        ? `no match; nearest: ${match.suggestions.map((c) => c.locationName).join(" | ")}`
        : "no match";
  }
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function main() {
  const connectionString = requiredEnv("POSTGRES_DATABASE_URL");
  const host = new URL(connectionString).host;
  if (apply && args.apply !== host) {
    throw new Error(`--apply must name the database host: --apply ${host}`);
  }
  console.log(`${apply ? "APPLY" : "DRY RUN"} against ${host}`);
  if (overridesPath) console.log(`Using overrides from ${overridesPath}`);

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);
  try {
    const rows = await db
      .select({
        id: rankTrackingConfigs.id,
        projectId: rankTrackingConfigs.projectId,
        domain: rankTrackingConfigs.domain,
        locationCode: rankTrackingConfigs.locationCode,
        languageCode: rankTrackingConfigs.languageCode,
        locationName: rankTrackingConfigs.locationName,
      })
      .from(rankTrackingConfigs)
      .where(
        and(
          eq(rankTrackingConfigs.isActive, true),
          isNotNull(rankTrackingConfigs.locationName),
          ne(rankTrackingConfigs.locationName, ""),
        ),
      );
    const configs = rows.filter(
      (row): row is ConfigRow => row.locationName !== null,
    );
    console.log(`${configs.length} active trackers carry a location name`);

    const registries = new Map<string, SerpRegistryLocation[]>();
    const outcomes: Outcome[] = [];
    for (const config of configs) {
      let countryCodeFix: number | null = null;
      let iso: string;
      if (KNOWN_COUNTRY_CODES.has(config.locationCode)) {
        iso = getIsoCountryCode(config.locationCode);
      } else {
        const country = countryFromName(config.locationName);
        if (!country) {
          outcomes.push({
            config,
            iso: null,
            match: null,
            countryCodeFix: null,
          });
          continue;
        }
        countryCodeFix = country.code;
        iso = getIsoCountryCode(country.code);
      }
      let registry = registries.get(iso);
      if (!registry) {
        registry = await fetchRegistry(iso, cacheDir);
        registries.set(iso, registry);
        console.log(`  registry ${iso}: ${registry.length} locations`);
      }
      outcomes.push({
        config,
        iso,
        match:
          applyOverride(config.id, registry) ??
          matchSerpLocation(config.locationName, registry, iso),
        countryCodeFix,
      });
    }
    for (const id of Object.keys(overrides)) {
      if (!configs.some((config) => config.id === id)) {
        throw new Error(
          `--overrides: ${id} is not an active tracker with a location name`,
        );
      }
    }

    const byKind = (kind: SerpLocationMatch["kind"] | null) =>
      outcomes.filter((o) => (o.match?.kind ?? null) === kind);
    const rewrites = outcomes.filter(
      (o) =>
        o.match?.kind === "resolved" ||
        (o.match?.kind === "exact" && o.countryCodeFix !== null),
    );
    const groups: Array<[string, Outcome[]]> = [
      ["RESOLVED (will be rewritten)", rewrites],
      ["AMBIGUOUS (needs a human)", byKind("ambiguous")],
      ["UNRESOLVED (needs a human)", byKind("unresolved")],
      ["UNKNOWN COUNTRY CODE", byKind(null)],
    ];
    for (const [title, group] of groups) {
      console.log(`\n== ${title}: ${group.length}`);
      for (const outcome of group) {
        console.log(
          `  ${outcome.config.id}  ${outcome.config.domain}  [${outcome.iso ?? "?"}]  "${outcome.config.locationName}"  ->  ${describe(outcome)}`,
        );
      }
    }
    console.log(
      `\n== EXACT (untouched): ${outcomes.filter((o) => o.match?.kind === "exact" && o.countryCodeFix === null).length}`,
    );

    const header = [
      "config_id",
      "project_id",
      "domain",
      "iso",
      "current",
      "outcome",
      "proposed",
    ];
    const lines = outcomes.map((o) =>
      [
        o.config.id,
        o.config.projectId,
        o.config.domain,
        o.iso ?? "",
        o.config.locationName,
        o.match?.kind ?? "unknown_country",
        o.match?.kind === "resolved"
          ? o.match.location.locationName
          : describe(o),
      ]
        .map(csvCell)
        .join(","),
    );
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(reportPath, [header.join(","), ...lines].join("\n") + "\n");
    console.log(`\nReport: ${reportPath}`);

    const verdicts = new Map<string, { ok: boolean; message: string }>();
    const verdictKey = (name: string, language: string) =>
      `${name}\u0000${language}`;
    if (verify) {
      // One sandbox call per distinct (name, language) pair, current and
      // proposed, so the report shows both the rejection and the fix.
      const pairs = new Map<string, { name: string; language: string }>();
      for (const outcome of rewrites) {
        if (!outcome.match || !("location" in outcome.match)) continue;
        for (const name of [
          outcome.config.locationName,
          outcome.match.location.locationName,
        ]) {
          pairs.set(verdictKey(name, outcome.config.languageCode), {
            name,
            language: outcome.config.languageCode,
          });
        }
      }
      const entries = [...pairs.entries()];
      for (let i = 0; i < entries.length; i += 5) {
        await Promise.all(
          entries.slice(i, i + 5).map(async ([key, pair]) => {
            verdicts.set(key, await sandboxAccepts(pair.name, pair.language));
          }),
        );
      }
      let currentAccepted = 0;
      let proposedRejected = 0;
      console.log(`\n== SANDBOX VERIFY (${entries.length} distinct names)`);
      for (const outcome of rewrites) {
        if (!outcome.match || !("location" in outcome.match)) continue;
        const language = outcome.config.languageCode;
        const before = verdicts.get(
          verdictKey(outcome.config.locationName, language),
        );
        const after = verdicts.get(
          verdictKey(outcome.match.location.locationName, language),
        );
        if (before?.ok) {
          currentAccepted += 1;
          console.log(
            `  KEEP NAME ${outcome.config.id} "${outcome.config.locationName}" (${language}) is already accepted; only a location_code fix (if any) will be applied`,
          );
        }
        if (!after?.ok) {
          proposedRejected += 1;
          console.log(
            `  REJECTED ${outcome.config.id} "${outcome.match.location.locationName}" (${language}): ${after?.message ?? "no verdict"}`,
          );
        }
      }
      console.log(
        `  proposed names accepted: ${rewrites.length - proposedRejected}/${rewrites.length}; current names already accepted: ${currentAccepted}/${rewrites.length}`,
      );
    }

    if (!apply) {
      console.log(
        `Dry run only. Re-run with --apply ${host} to rewrite the RESOLVED rows.`,
      );
      return;
    }

    let written = 0;
    for (const outcome of rewrites) {
      if (!outcome.match || !("location" in outcome.match)) continue;
      const current = verdicts.get(
        verdictKey(outcome.config.locationName, outcome.config.languageCode),
      );
      const proposed = verdicts.get(
        verdictKey(
          outcome.match.location.locationName,
          outcome.config.languageCode,
        ),
      );
      const keepName = current?.ok === true;
      if (keepName && outcome.countryCodeFix === null) continue;
      if (!keepName && proposed?.ok !== true) continue;
      await db
        .update(rankTrackingConfigs)
        .set({
          ...(keepName
            ? {}
            : { locationName: outcome.match.location.locationName }),
          ...(outcome.countryCodeFix !== null
            ? { locationCode: outcome.countryCodeFix }
            : {}),
        })
        .where(eq(rankTrackingConfigs.id, outcome.config.id));
      written += 1;
    }
    console.log(`Rewrote ${written} tracker location(s).`);
  } finally {
    await client.end();
  }
}

await main();

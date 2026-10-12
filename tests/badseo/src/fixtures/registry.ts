import type { Fixture } from "./types";
import { headTagFixtures } from "./head-tags";
import { contentFixtures } from "./content";
import { indexabilityFixtures } from "./indexability";
import { httpStatusFixtures } from "./http-status";
import { redirectFixtures } from "./redirects";
import { performanceFixtures } from "./performance";
import { structureFixtures } from "./structure";
import { kitchenSinkFixtures } from "./kitchen-sink";

/** Every fixture on the site, in catalog order. */
export const allFixtures: Fixture[] = [
  ...headTagFixtures,
  ...contentFixtures,
  ...indexabilityFixtures,
  ...httpStatusFixtures,
  ...redirectFixtures,
  ...performanceFixtures,
  ...structureFixtures,
  ...kitchenSinkFixtures,
];

/** All URL paths a fixture answers on (canonical + any duplicates). */
export function fixturePaths(fixture: Fixture): string[] {
  return [fixture.path, ...(fixture.extraPaths ?? [])];
}

/**
 * Fixtures the catalog links to (so the crawler can reach them and they aren't
 * orphaned). Each gets a card. Includes the deep-chain entrance even though
 * it's technically plumbing.
 */
export const catalogLinkedFixtures = allFixtures.filter(
  (f) => f.linkedFromCatalog !== false,
);

/** Fixtures whose paths belong in sitemap.xml. */
export const sitemapFixtures = allFixtures.filter((f) => f.inSitemap !== false);

/**
 * Duplicate/alternate URLs (a fixture's extraPaths). The catalog links these so
 * the duplicate pages are crawled — and, crucially, aren't mistaken for orphans.
 */
export const duplicateUrlLinks = allFixtures.flatMap((f) =>
  (f.extraPaths ?? []).map((path) => ({ path, name: f.name })),
);

/** Distinct categories, in first-seen order. */
export const categories: string[] = [
  ...new Set(catalogLinkedFixtures.map((f) => f.category)),
];

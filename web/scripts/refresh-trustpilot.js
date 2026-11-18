#!/usr/bin/env node

/**
 * Refreshes src/data/trustpilot.json, the copy of our Trustpilot rating and
 * selected reviews that the site renders as plain HTML. Runs before a deploy
 * build, so no visitor's browser ever talks to Trustpilot.
 *
 * Reads Trustpilot's official API with the key of the API application the app
 * already uses for review invitations (TRUSTPILOT_API_KEY, with
 * TRUSTPILOT_BUSINESS_UNIT_ID). Trustpilot requires copies of its content to
 * be refreshed at least every 24 hours.
 *
 * Missing settings or a failed fetch never fail the build: the file stays as
 * it is, and with no reviews in it the site shows no Trustpilot content.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { toTrustpilotSnapshot } from "../src/lib/trustpilot-snapshot.js";

const SNAPSHOT_FILE = fileURLToPath(
  new URL("../src/data/trustpilot.json", import.meta.url),
);
const API = "https://api.trustpilot.com/v1";
const apiKey = process.env.TRUSTPILOT_API_KEY?.trim();
const businessUnitId = process.env.TRUSTPILOT_BUSINESS_UNIT_ID?.trim();
const BUSINESS_UNIT = `${API}/business-units/${businessUnitId}`;
// Reviews tagged "SelectedReview" in Trustpilot Business are the ones shown.
const REVIEWS = `${BUSINESS_UNIT}/reviews?tagValue=SelectedReview&language=en&perPage=15&orderBy=createdat.desc`;

async function get(url) {
  const response = await fetch(url, {
    headers: { apikey: apiKey },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Trustpilot answered ${response.status}`);
  return response.json();
}

async function refresh() {
  const [businessUnit, reviews] = await Promise.all([
    get(BUSINESS_UNIT),
    get(REVIEWS),
  ]);
  // The review object carries no public URL; web-links is where it lives.
  const reviewUrls = {};
  for (const { id } of reviews.reviews ?? []) {
    const links = await get(`${API}/reviews/${id}/web-links?locale=en-US`);
    reviewUrls[id] = links.reviewUrl;
  }
  return toTrustpilotSnapshot(
    { businessUnit, reviews, reviewUrls },
    new Date().toISOString(),
  );
}

if (!apiKey || !businessUnitId) {
  console.warn(
    "Trustpilot refresh skipped: TRUSTPILOT_API_KEY or TRUSTPILOT_BUSINESS_UNIT_ID is not set.",
  );
} else {
  try {
    const snapshot = await refresh();
    writeFileSync(SNAPSHOT_FILE, `${JSON.stringify(snapshot, null, 2)}\n`);
    console.log(
      `Trustpilot: ${snapshot.trustScore} from ${snapshot.totalReviews} reviews, ${snapshot.reviews.length} selected.`,
    );
  } catch (error) {
    console.warn(
      `Trustpilot refresh failed, keeping the last copy: ${error instanceof Error ? error.message : error}`,
    );
  }
}

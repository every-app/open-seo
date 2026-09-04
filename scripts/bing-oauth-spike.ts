import { existsSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { loadLocalEnv, parseArgs } from "./cli-utils";

loadLocalEnv();

/**
 * Probe for the Bing Webmaster API questions that shaped specs/0009. Retained
 * (not throwaway) because the spec calls for the refresh-token behaviour to be
 * re-checked periodically — see its Consequences section.
 *
 * The two questions that originally blocked the design, both since answered:
 *
 *  1. Does the refresh flow work the way better-auth assumes? better-auth
 *     overwrites the stored refresh token with whatever the provider returns
 *     on refresh (dist/api/routes/account.mjs), and public reports claimed
 *     Bing issues rotated tokens that immediately fail with `invalid_grant`.
 *     ANSWERED 2026-07-25 on two independent grants: Bing returns no
 *     refresh_token on refresh at all, so the original is preserved and
 *     genericOAuth is safe. Re-run --step=refresh-rotation to re-check.
 *
 *  2. Is there a stable per-account identifier? Bing has no userinfo endpoint
 *     and returns no id_token. ANSWERED: the access token is base64url JSON
 *     carrying `webmasteruid` and `webmasteremail`; webmasteruid survived a
 *     client-secret regeneration, so it keys the Bing account rather than the
 *     grant. Now decoded by src/shared/bing.ts.
 *
 * Nothing here touches app code or the database — it only talks to Bing.
 *
 * Setup: register an OAuth client under Bing Webmaster Tools →  Settings →
 * API Access, then set in .env.local:
 *   BING_CLIENT_ID, BING_CLIENT_SECRET, BING_REDIRECT_URI
 *   BING_API_KEY (optional — exercises the fallback auth mode)
 *
 * Usage:
 *   pnpm tsx scripts/bing-oauth-spike.ts --step=authorize
 *   pnpm tsx scripts/bing-oauth-spike.ts --step=exchange --code=<code>
 *   pnpm tsx scripts/bing-oauth-spike.ts --step=refresh-rotation
 *   pnpm tsx scripts/bing-oauth-spike.ts --step=sites
 *   pnpm tsx scripts/bing-oauth-spike.ts --step=call --method=<Method> [--site=<url>]
 */

const AUTHORIZE_URL = "https://www.bing.com/webmasters/oauth/authorize";
const TOKEN_URL = "https://www.bing.com/webmasters/oauth/token";
// The docs show two different API hosts. Which one actually answers is itself
// an open question, so the sites step tries both and reports.
const API_HOSTS = ["https://ssl.bing.com", "https://www.bing.com"];
const SCOPES = "Webmaster.read";
const STATE_FILE = ".bing-spike.json";

type TokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
};

type SpikeState = {
  /** The refresh token from the initial code exchange. Never overwritten —
   *  the whole point is to test whether it outlives its rotated successors. */
  originalRefreshToken: string;
  /** Most recent rotated refresh token, if Bing issued one. */
  latestRefreshToken: string | null;
  accessToken: string;
};

const args = parseArgs(process.argv.slice(2));

await main();

async function main() {
  switch (args.step) {
    case "authorize":
      return stepAuthorize();
    case "exchange":
      return stepExchange();
    case "refresh-rotation":
      return stepRefreshRotation();
    case "sites":
      return stepSites();
    case "call":
      return stepCall();
    default:
      return fail(
        "Unknown --step. Expected: authorize | exchange | refresh-rotation | sites | call",
      );
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) fail(`Missing ${name}. Set it in .env.local.`);
  return value as string;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function readState(): SpikeState {
  if (!existsSync(STATE_FILE)) {
    fail(`No ${STATE_FILE}. Run --step=exchange first.`);
  }
  return JSON.parse(readFileSync(STATE_FILE, "utf8")) as SpikeState;
}

function writeState(state: SpikeState) {
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

/** Step 1 — print the consent URL. Paste it into a browser, approve, then copy
 *  the `code` query param off the redirect. */
function stepAuthorize() {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", requireEnv("BING_CLIENT_ID"));
  url.searchParams.set("redirect_uri", requireEnv("BING_REDIRECT_URI"));
  url.searchParams.set("scope", SCOPES);
  console.log("Open this, approve, then copy the ?code= value:\n");
  console.log(url.toString());
}

async function postToken(
  body: Record<string, string>,
): Promise<
  | { ok: true; tokens: TokenResponse }
  | { ok: false; status: number; body: string }
> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const text = await response.text();
  if (!response.ok) {
    return { ok: false, status: response.status, body: text };
  }
  return { ok: true, tokens: JSON.parse(text) as TokenResponse };
}

/** Step 2 — trade the code for tokens, and answer unknown #2 by decoding the
 *  access token. */
async function stepExchange() {
  const code = args.code;
  if (!code) fail("Missing --code=<authorization code from the redirect>.");

  const result = await postToken({
    code,
    client_id: requireEnv("BING_CLIENT_ID"),
    client_secret: requireEnv("BING_CLIENT_SECRET"),
    redirect_uri: requireEnv("BING_REDIRECT_URI"),
    grant_type: "authorization_code",
  });

  if (!result.ok) {
    fail(`Code exchange failed (${result.status}): ${result.body}`);
  }

  const { tokens } = result;
  console.log("Token response keys:", Object.keys(tokens).join(", "));
  console.log("expires_in:", tokens.expires_in);
  console.log("refresh_token present:", Boolean(tokens.refresh_token));

  if (!tokens.refresh_token) {
    fail("No refresh_token returned — the rotation probe cannot run.");
  }

  console.log("\n--- Unknown #2: stable account identifier ---");
  const claims = decodeAccessToken(tokens.access_token);
  if (claims) {
    console.log("Access token decoded to JSON. Claims:");
    console.log(JSON.stringify(claims, null, 2));
    const uid = findUidClaim(claims);
    console.log(
      uid
        ? `\nCandidate accountId claim: ${uid.key} = ${uid.value}`
        : "\nNo uid-like claim found — accountId needs another source.",
    );
  } else {
    console.log(
      "Access token is NOT decodable base64url JSON — it is opaque, so " +
        "accountId must come from elsewhere (e.g. GetUserSites).",
    );
  }

  writeState({
    originalRefreshToken: tokens.refresh_token,
    latestRefreshToken: null,
    accessToken: tokens.access_token,
  });
  console.log(`\nSaved tokens to ${STATE_FILE}.`);
}

/** Bing's access token is reported to be base64url-encoded JSON (not a signed
 *  JWT). Try both readings: whole-string, and JWT-style middle segment. */
function decodeAccessToken(token: string): Record<string, unknown> | null {
  const candidates = [token, token.split(".")[1] ?? ""];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const padded = candidate.padEnd(
        candidate.length + ((4 - (candidate.length % 4)) % 4),
        "=",
      );
      const json = Buffer.from(padded, "base64url").toString("utf8");
      const parsed: unknown = JSON.parse(json);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function findUidClaim(claims: Record<string, unknown>) {
  for (const [key, value] of Object.entries(claims)) {
    if (/uid|userid|webmaster/iu.test(key) && typeof value === "string") {
      return { key, value };
    }
  }
  return null;
}

async function refresh(refreshToken: string) {
  return postToken({
    client_id: requireEnv("BING_CLIENT_ID"),
    client_secret: requireEnv("BING_CLIENT_SECRET"),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
}

/**
 * Step 3 — the decisive experiment for unknown #1.
 *
 * R0 = original refresh token. Refresh with it to get R1, then refresh with R1
 * (what better-auth would do), then go back and refresh with R0 again.
 *
 *   R1 works              → standard rotation; genericOAuth is fine.
 *   R1 fails, R0 works    → the reported bug reproduces; better-auth's
 *                           overwrite kills the grant. Pin R0 or use API keys.
 *   both fail             → grant is dead; reconnect is the only path.
 */
async function stepRefreshRotation() {
  const state = readState();

  console.log("--- Refresh #1, using the ORIGINAL refresh token (R0) ---");
  const first = await refresh(state.originalRefreshToken);
  if (!first.ok) {
    console.log(`FAILED (${first.status}): ${first.body}`);
    return fail(
      "R0 did not survive its first use. Re-run --step=exchange and retry.",
    );
  }
  const rotated = first.tokens.refresh_token ?? null;
  console.log("OK. Rotated refresh token issued:", Boolean(rotated));
  console.log(
    "Rotated token differs from original:",
    rotated !== null && rotated !== state.originalRefreshToken,
  );

  if (!rotated || rotated === state.originalRefreshToken) {
    console.log(
      "\nVERDICT: no rotation. better-auth's genericOAuth should work as-is.",
    );
    writeState({ ...state, latestRefreshToken: rotated });
    return;
  }

  console.log(
    "\n--- Refresh #2, using the ROTATED token R1 (better-auth's path) ---",
  );
  const second = await refresh(rotated);
  console.log(second.ok ? "OK" : `FAILED (${second.status}): ${second.body}`);

  console.log("\n--- Refresh #3, reusing the ORIGINAL token R0 again ---");
  const third = await refresh(state.originalRefreshToken);
  console.log(third.ok ? "OK" : `FAILED (${third.status}): ${third.body}`);

  console.log("\n=============== VERDICT ===============");
  if (second.ok) {
    console.log(
      "Rotation behaves normally. genericOAuth is safe; store the rotated token.",
    );
  } else if (third.ok) {
    console.log(
      "BUG REPRODUCED: rotated tokens are rejected, the original still works.\n" +
        "better-auth overwrites the stored refresh token on every refresh, so a\n" +
        "Bing grant would die within one token lifetime. Do NOT use genericOAuth\n" +
        "unmodified — pin the original refresh token, or use the API-key mode.",
    );
  } else {
    console.log(
      "Both the rotated and the original token are now rejected. The grant is\n" +
        "single-refresh-only; OAuth is not viable without reconnect prompts.",
    );
  }

  writeState({ ...state, latestRefreshToken: rotated });
}

/** Step 4 — confirm which API host answers, and that the token actually reads
 *  data. Also exercises the API-key mode when BING_API_KEY is set. */
async function stepSites() {
  // Each auth mode is probed independently: the API-key path is usable with no
  // OAuth client at all, which is the whole point of preferring it.
  const state = existsSync(STATE_FILE) ? readState() : null;
  const apiKey = process.env.BING_API_KEY?.trim();

  if (!state && !apiKey) {
    fail(
      `Nothing to probe: no ${STATE_FILE} (run --step=exchange) and no BING_API_KEY.`,
    );
  }

  if (state) {
    for (const host of API_HOSTS) {
      const url = `${host}/webmaster/api.svc/json/GetUserSites`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${state.accessToken}` },
      });
      const text = await response.text();
      console.log(`\n[OAuth] ${url} → ${response.status}`);
      console.log(text.slice(0, 600));
    }
  } else {
    console.log("(No OAuth tokens stored — skipping the OAuth probe.)");
  }

  if (!apiKey) {
    console.log("\n(No BING_API_KEY set — skipping the API-key probe.)");
    return;
  }

  for (const host of API_HOSTS) {
    const url = `${host}/webmaster/api.svc/json/GetUserSites?apikey=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url);
    const text = await response.text();
    console.log(`\n[API key] ${host} → ${response.status}`);
    console.log(text.slice(0, 600));
  }
}

/**
 * Step 5 — call an arbitrary read endpoint and REPORT ITS FIELD NAMES.
 *
 * This is how the response shape the app codes against gets pinned. Bing
 * publishes no schema for these rows, so the only way to know a field set is
 * to call the endpoint against a real verified site and read what comes back.
 * GetRankAndTrafficStats was pinned this way on 2026-07-25; use this step
 * before coding against any further Bing endpoint.
 *
 * Uses the API key (no OAuth needed for a read).
 *
 * Usage:
 *   pnpm tsx scripts/bing-oauth-spike.ts --step=call \
 *     --method=GetRankAndTrafficStats --site=https://example.com/
 */
async function stepCall() {
  const apiKey = requireEnv("BING_API_KEY");
  const method = args.method;
  if (!method) {
    fail("Missing --method=<GetRankAndTrafficStats|GetCrawlStats|...>.");
  }

  const url = new URL(`${API_HOSTS[0]}/webmaster/api.svc/json/${method}`);
  url.searchParams.set("apikey", apiKey);
  if (args.site) url.searchParams.set("siteUrl", args.site);

  const response = await fetch(url);
  const text = await response.text();
  console.log(`${method} → ${response.status}`);
  if (!response.ok) {
    console.log(text.slice(0, 800));
    return;
  }

  const parsed: unknown = JSON.parse(text);
  const payload =
    parsed && typeof parsed === "object" && "d" in parsed
      ? (parsed as { d: unknown }).d
      : fail(
          "Response has no `d` envelope — the client's assumption is wrong.",
        );

  const rows = Array.isArray(payload) ? payload : [payload];
  console.log(`rows: ${rows.length}`);
  if (rows.length === 0) return;

  console.log("\n--- field names, types, and sample values ---");
  const keys = new Set<string>();
  for (const row of rows) {
    if (row && typeof row === "object") {
      for (const key of Object.keys(row)) keys.add(key);
    }
  }
  const first = rows[0] as Record<string, unknown>;
  for (const key of [...keys].sort()) {
    const value = first[key];
    const isWcfDate =
      typeof value === "string" && /^\/Date\(-?\d+/u.test(value);
    console.log(
      `  ${key.padEnd(28)} ${typeof value}${isWcfDate ? "  << WCF date" : ""}  e.g. ${JSON.stringify(value)?.slice(0, 60)}`,
    );
  }

  console.log("\n--- first row verbatim ---");
  console.log(JSON.stringify(rows[0], null, 2).slice(0, 1200));
}

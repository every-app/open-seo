// IndexNow (https://www.indexnow.org/) — push-based (re)indexing that notifies
// Bing, Yandex, and other participating engines within seconds, for free.
//
// IndexNow keys are not secrets: control of a host is proven by serving
// `<key>.txt` (containing the key) at the host root. A key derived
// deterministically from the project id is therefore safe, stable across
// restarts, and needs no storage — the only per-project state IndexNow needs.

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

// Bare host from a stored project domain (tolerates a scheme/path/trailing
// slash if one slipped in). Returns null when there's nothing usable.
export function indexNowHostFromDomain(
  domain: string | null | undefined,
): string | null {
  if (!domain) return null;
  const trimmed = domain.trim().replace(/^https?:\/\//i, "");
  const host = trimmed.split("/")[0]?.trim().toLowerCase();
  return host ? host : null;
}

// 32 hex chars derived from the project id. Deterministic (SHA-256), so the
// same project always yields the same key and hosted `<key>.txt` stays valid.
export async function deriveIndexNowKey(projectId: string): Promise<string> {
  const bytes = new TextEncoder().encode(`indexnow:${projectId}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export function indexNowKeyLocation(host: string, key: string): string {
  return `https://${host}/${key}.txt`;
}

// URLs must all belong to the host (IndexNow rejects cross-host lists).
export function partitionUrlsByHost(
  urls: string[],
  host: string,
): { matching: string[]; mismatched: string[] } {
  const matching: string[] = [];
  const mismatched: string[] = [];
  for (const url of urls) {
    let urlHost: string | null = null;
    try {
      urlHost = new URL(url).host.toLowerCase();
    } catch {
      urlHost = null;
    }
    if (urlHost && urlHost === host) {
      matching.push(url);
    } else {
      mismatched.push(url);
    }
  }
  return { matching, mismatched };
}

export type IndexNowSubmitResult = {
  submitted: number;
  status: number;
  ok: boolean;
  endpoint: string;
};

export async function submitToIndexNow(input: {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}): Promise<IndexNowSubmitResult> {
  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: input.host,
      key: input.key,
      keyLocation: input.keyLocation,
      urlList: input.urlList,
    }),
  });
  return {
    submitted: input.urlList.length,
    status: response.status,
    // 200 = accepted; 202 = accepted, key validation pending.
    ok: response.status === 200 || response.status === 202,
    endpoint: INDEXNOW_ENDPOINT,
  };
}

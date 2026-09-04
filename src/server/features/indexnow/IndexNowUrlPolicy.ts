import { z } from "zod";
import { isCrawlableUrl } from "@/server/lib/audit/url-policy";
import { AppError } from "@/server/lib/errors";

const DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";
const PRIVATE_PATH_PREFIXES = [
  "/admin",
  "/api",
  "/auth",
  "/account",
  "/checkout",
  "/login",
];
const dnsResponseSchema = z.object({
  Status: z.literal(0),
  Answer: z
    .array(
      z.object({
        type: z.number().int(),
        data: z.string(),
      }),
    )
    .optional(),
});

export type IndexNowFetcher = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export function projectOrigin(domain: string): string {
  let url: URL;
  try {
    url = new URL(domain.includes("://") ? domain : `https://${domain}`);
  } catch {
    throw new AppError("VALIDATION_ERROR", "Set a valid project domain first.");
  }
  if (!url.hostname || url.port || url.username || url.password) {
    throw new AppError("VALIDATION_ERROR", "Set a valid project domain first.");
  }
  return `https://${url.host.toLowerCase()}`;
}

export function validateKeyLocation(value: string, origin: string): string {
  let candidate: URL;
  try {
    candidate = new URL(value, origin);
  } catch {
    throw new AppError("VALIDATION_ERROR", "Enter a valid IndexNow key URL.");
  }
  if (
    candidate.protocol !== "https:" ||
    candidate.origin !== origin ||
    candidate.username ||
    candidate.password ||
    candidate.search ||
    candidate.hash
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "The IndexNow key URL must use HTTPS on the exact project host, without credentials, query, or fragment.",
    );
  }
  return candidate.toString();
}

export async function readTextCapped(response: Response, maxBytes: number) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new AppError(
          "VALIDATION_ERROR",
          "The IndexNow key file is unexpectedly large.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(joined);
  } catch {
    throw new AppError(
      "VALIDATION_ERROR",
      "The IndexNow key file must be UTF-8 plain text.",
    );
  }
}

async function resolveAddresses(
  hostname: string,
  type: "A" | "AAAA",
  fetcher: IndexNowFetcher,
): Promise<string[]> {
  const response = await fetcher(
    `${DOH_ENDPOINT}?name=${encodeURIComponent(hostname)}&type=${type}`,
    {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(2_500),
    },
  );
  if (!response.ok) throw new Error(`doh_http_${response.status}`);
  const raw: unknown = JSON.parse(await readTextCapped(response, 32 * 1024));
  const body = dnsResponseSchema.parse(raw);
  const expectedType = type === "A" ? 1 : 28;
  return (body.Answer ?? [])
    .filter((answer) => answer.type === expectedType)
    .map((answer) => answer.data.trim());
}

function addressUrl(address: string): string {
  return address.includes(":")
    ? `https://[${address}]/`
    : `https://${address}/`;
}

export async function assertPublicDns(
  hostname: string,
  fetcher: IndexNowFetcher,
) {
  try {
    const [ipv4, ipv6] = await Promise.all([
      resolveAddresses(hostname, "A", fetcher),
      resolveAddresses(hostname, "AAAA", fetcher),
    ]);
    const addresses = [...ipv4, ...ipv6];
    if (
      addresses.length === 0 ||
      addresses.some((address) => !isCrawlableUrl(addressUrl(address)))
    ) {
      throw new Error("dns_not_public");
    }
  } catch {
    throw new AppError(
      "VALIDATION_ERROR",
      "IndexNow key host DNS could not be verified as publicly routable.",
    );
  }
}

export function normalizeIndexNowUrls(
  values: string[],
  origin: string,
  keyLocation: string,
): string[] {
  const keyPathname = new URL(keyLocation).pathname;
  const keyDirectory = keyPathname.slice(0, keyPathname.lastIndexOf("/") + 1);
  const urls = values.map((value) => {
    let url: URL;
    try {
      url = new URL(value, origin);
    } catch {
      throw new AppError("VALIDATION_ERROR", `Invalid URL: ${value}`);
    }
    if (
      url.protocol !== "https:" ||
      url.origin !== origin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !url.pathname.startsWith(keyDirectory) ||
      PRIVATE_PATH_PREFIXES.some(
        (prefix) =>
          url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
      )
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Every IndexNow URL must be a public HTTPS page on the exact project host and within the key file directory, without query or fragment.",
      );
    }
    return url.toString();
  });
  return [...new Set(urls)];
}

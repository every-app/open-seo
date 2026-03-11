import { AppError } from "@/server/lib/errors";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
  "169.254.169.254",
  "100.100.100.200",
]);

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".localdomain",
  ".internal",
  ".home.arpa",
];

const DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";

function normalizeHost(hostname: string): string {
  let host = hostname.toLowerCase().trim();
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  }
  if (host.includes("%")) {
    host = host.split("%", 1)[0];
  }
  if (host.endsWith(".")) {
    host = host.slice(0, -1);
  }
  return host;
}

function isPrivateIpv4(host: string): boolean {
  const parts = normalizeHost(host)
    .split(".")
    .map((x) => Number(x));
  if (
    parts.length !== 4 ||
    parts.some((x) => !Number.isInteger(x) || x < 0 || x > 255)
  ) {
    return false;
  }

  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function parseMappedIpv4FromIpv6(host: string): string | null {
  const normalized = normalizeHost(host);
  if (!normalized.startsWith("::ffff:")) return null;

  const mapped = normalized.slice("::ffff:".length);
  if (/^\d+\.\d+\.\d+\.\d+$/.test(mapped)) {
    return mapped;
  }

  const segments = mapped.split(":").filter(Boolean);
  if (segments.length !== 2) return null;

  const high = Number.parseInt(segments[0], 16);
  const low = Number.parseInt(segments[1], 16);
  if (
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    high < 0 ||
    high > 0xffff ||
    low < 0 ||
    low > 0xffff
  ) {
    return null;
  }

  const a = (high >> 8) & 0xff;
  const b = high & 0xff;
  const c = (low >> 8) & 0xff;
  const d = low & 0xff;
  return `${a}.${b}.${c}.${d}`;
}

function isPrivateIpv6(host: string): boolean {
  const value = normalizeHost(host);
  if (value === "::1" || value === "::") return true;
  if (value.startsWith("fc") || value.startsWith("fd")) return true;
  if (
    value.startsWith("fe8") ||
    value.startsWith("fe9") ||
    value.startsWith("fea") ||
    value.startsWith("feb")
  ) {
    return true;
  }

  const mappedIpv4 = parseMappedIpv4FromIpv6(value);
  if (mappedIpv4 && isPrivateIpv4(mappedIpv4)) {
    return true;
  }

  return false;
}

function isIpLiteral(host: string): boolean {
  const normalized = normalizeHost(host);
  return /^\d+\.\d+\.\d+\.\d+$/.test(normalized) || normalized.includes(":");
}

function isBlockedHost(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (!host) return true;
  if (BLOCKED_HOSTS.has(host)) return true;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return true;
  }

  if (isIpLiteral(host)) {
    return isPrivateIpv4(host) || isPrivateIpv6(host);
  }

  return false;
}

type DnsJsonAnswer = {
  type?: number;
  data?: string;
};

type DnsJsonResponse = {
  Status?: number;
  Answer?: DnsJsonAnswer[];
};

async function resolveAddressRecords(
  hostname: string,
  type: "A" | "AAAA",
): Promise<string[]> {
  const response = await fetch(
    `${DOH_ENDPOINT}?name=${encodeURIComponent(hostname)}&type=${type}`,
    {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(2_500),
    },
  );

  if (!response.ok) return [];

  const body: DnsJsonResponse = await response.json();
  if (body.Status !== 0 || !Array.isArray(body.Answer)) return [];

  const expectedType = type === "A" ? 1 : 28;
  return body.Answer.filter(
    (answer): answer is Required<Pick<DnsJsonAnswer, "data" | "type">> =>
      answer.type === expectedType && typeof answer.data === "string",
  ).map((answer) => normalizeHost(answer.data));
}

async function hostnameResolvesToBlockedAddress(
  hostname: string,
): Promise<boolean> {
  const host = normalizeHost(hostname);
  if (!host || isIpLiteral(host)) return false;

  try {
    const [v4, v6] = await Promise.all([
      resolveAddressRecords(host, "A"),
      resolveAddressRecords(host, "AAAA"),
    ]);

    const addresses = [...v4, ...v6];
    if (addresses.length === 0) return false;

    return addresses.some(
      (address) => isPrivateIpv4(address) || isPrivateIpv6(address),
    );
  } catch {
    return false;
  }
}

export async function normalizeAndValidateStartUrl(
  input: string,
): Promise<string> {
  let raw = input.trim();
  if (!raw) throw new AppError("VALIDATION_ERROR");

  if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
    raw = `https://${raw}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new AppError("VALIDATION_ERROR");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new AppError("VALIDATION_ERROR");
  }

  if (isBlockedHost(parsed.hostname)) {
    throw new AppError("CRAWL_TARGET_BLOCKED");
  }

  if (await hostnameResolvesToBlockedAddress(parsed.hostname)) {
    throw new AppError("CRAWL_TARGET_BLOCKED");
  }

  parsed.hash = "";
  return parsed.toString();
}

// A DNS-pinned, public-Internet-only transport for user-supplied crawl URLs.
// Resolving then using ordinary fetch would re-resolve and permit DNS rebinding.
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
])
  blocked.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
  ["::", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
])
  blocked.addSubnet(address, prefix, "ipv6");
export function isPublicAddress(address) {
  const family = isIP(address);
  return (
    family !== 0 && !blocked.check(address, family === 4 ? "ipv4" : "ipv6")
  );
}
export async function resolveTarget(value, resolver = lookup) {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    throw new Error("Only public HTTP and HTTPS targets are allowed");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await resolver(hostname, { all: true, verbatim: true });
  if (
    !addresses.length ||
    addresses.some(({ address }) => !isPublicAddress(address))
  )
    throw new Error("Target resolves to a non-public address");
  return { url, address: addresses[0] };
}
// Forward only crawler headers. Never leak gateway credentials, cookies, or
// authorization headers to the target. Caller matches signatures to each host.
export function upstreamHeaders(incoming, url) {
  const headers = {
    "user-agent": incoming["user-agent"] ?? "OpenSEO-Audit/1.0",
    accept: incoming.accept ?? "*/*",
    "accept-encoding": "identity",
  };
  if (url.protocol === "https:") {
    for (const name of ["signature", "signature-input", "signature-agent"])
      if (incoming[name]) headers[name] = incoming[name];
  }
  return headers;
}

export function createGateway(secret) {
  if (typeof secret !== "string" || secret.length < 32)
    throw new Error("Missing gateway secret");
  let active = 0;
  return createServer(async (incoming, response) => {
    const supplied = Buffer.from(
      String(incoming.headers["x-crawl-secret"] ?? ""),
    );
    const expected = Buffer.from(secret);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      response.writeHead(404).end();
      return;
    }
    if (!["GET", "HEAD"].includes(incoming.method)) {
      response.writeHead(405).end();
      return;
    }
    if (active >= 64) {
      response.writeHead(503, { "retry-after": "1" }).end();
      return;
    }
    active++;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        active--;
      }
    };
    response.once("close", release);
    try {
      const { url, address } = await resolveTarget(
        incoming.headers["x-crawl-url"],
      );
      const upstream = (url.protocol === "https:" ? httpsRequest : httpRequest)(
        url,
        {
          method: incoming.method,
          agent: false,
          autoSelectFamily: false,
          lookup: (_hostname, _options, callback) =>
            callback(null, address.address, address.family),
          headers: upstreamHeaders(incoming.headers, url),
          signal: AbortSignal.timeout(30_000),
        },
        (result) => {
          const headers = {};
          for (const key of [
            "content-type",
            "content-length",
            "content-encoding",
            "location",
            "last-modified",
            "etag",
            "retry-after",
            "link",
            "x-robots-tag",
            "cf-mitigated",
            "powered-by",
          ])
            if (result.headers[key]) headers[key] = result.headers[key];
          response.writeHead(result.statusCode ?? 502, headers);
          let bytes = 0;
          result.on("data", (chunk) => {
            bytes += chunk.length;
            if (bytes > 20 * 1024 * 1024) {
              result.destroy();
              response.destroy();
            }
          });
          result.on("error", () => response.destroy());
          result.pipe(response);
        },
      );
      response.once("close", () => upstream.destroy());
      upstream.on("error", () => {
        if (!response.headersSent)
          response.writeHead(502).end("Crawl fetch failed");
        else response.destroy();
      });
      upstream.end();
    } catch {
      response.writeHead(403).end("Crawl target is not allowed");
    }
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { CRAWL_GATEWAY_SECRET } = JSON.parse(
    await readFile("/config/secrets.json", "utf8"),
  );
  createGateway(CRAWL_GATEWAY_SECRET).listen(8090, "0.0.0.0");
}

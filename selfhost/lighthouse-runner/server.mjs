import { createServer } from "node:http";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";

const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
])
  blocked.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
])
  blocked.addSubnet(address, prefix, "ipv6");

async function assertPublicUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs can be audited");
  }
  if (url.username || url.password) {
    throw new Error("URLs with credentials cannot be audited");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  )
    throw new Error("Private hosts cannot be audited");
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await lookup(host, { all: true });
  if (
    addresses.length === 0 ||
    addresses.some(({ address, family }) =>
      blocked.check(address, family === 4 ? "ipv4" : "ipv6"),
    )
  )
    throw new Error("Private addresses cannot be audited");
  return url.toString();
}

function compactReport(lhr) {
  const categories = Object.fromEntries(
    ["performance", "accessibility", "best-practices", "seo"].map((name) => [
      name,
      {
        score: lhr.categories[name]?.score ?? null,
        auditRefs: (lhr.categories[name]?.auditRefs ?? []).map(({ id }) => ({
          id,
        })),
      },
    ]),
  );
  const audits = Object.fromEntries(
    Object.entries(lhr.audits).map(([key, audit]) => [
      key,
      {
        title: audit.title,
        description: audit.description,
        score: audit.score,
        scoreDisplayMode: audit.scoreDisplayMode,
        displayValue: audit.displayValue,
        numericValue: audit.numericValue,
        details: {
          overallSavingsMs: audit.details?.overallSavingsMs,
          overallSavingsBytes: audit.details?.overallSavingsBytes,
          items: Array.isArray(audit.details?.items)
            ? audit.details.items
                .slice(0, 10)
                .map((item) =>
                  Object.fromEntries(
                    [
                      "url",
                      "source",
                      "nodeLabel",
                      "snippet",
                      "totalBytes",
                      "wastedBytes",
                      "wastedMs",
                      "label",
                      "value",
                    ]
                      .filter((name) => item[name] != null)
                      .map((name) => [name, item[name]]),
                  ),
                )
            : undefined,
        },
      },
    ]),
  );
  return {
    lighthouseResult: {
      requestedUrl: lhr.requestedUrl,
      finalUrl: lhr.finalUrl,
      lighthouseVersion: lhr.lighthouseVersion,
      categories,
      audits,
    },
  };
}

let queued = Promise.resolve();
let pending = 0;
const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200).end("ok");
    return;
  }
  if (request.method !== "POST" || request.url !== "/run") {
    response.writeHead(404).end();
    return;
  }
  if (pending >= 10) {
    response.writeHead(429).end("Lighthouse runner is busy");
    return;
  }
  pending++;
  const previous = queued;
  let release;
  queued = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  let chrome;
  let timeout;
  try {
    let body = "";
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 4096) throw new Error("Request is too large");
    }
    const input = JSON.parse(body);
    if (!["mobile", "desktop"].includes(input.strategy)) {
      throw new Error("Invalid Lighthouse strategy");
    }
    const url = await assertPublicUrl(input.url);
    chrome = await chromeLauncher.launch({
      chromePath: process.env.CHROME_PATH,
      chromeFlags: ["--headless", "--no-sandbox", "--disable-dev-shm-usage"],
    });
    timeout = setTimeout(() => chrome.kill(), 150_000);
    const result = await lighthouse(url, {
      port: chrome.port,
      output: "json",
      logLevel: "error",
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
      ...(input.strategy === "desktop" ? { preset: "desktop" } : {}),
    });
    if (!result?.lhr) throw new Error("Lighthouse produced no report");
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(compactReport(result.lhr)));
  } catch (error) {
    console.error("Lighthouse run failed:", error);
    response
      .writeHead(422)
      .end(error instanceof Error ? error.message : "Lighthouse run failed");
  } finally {
    clearTimeout(timeout);
    if (chrome) {
      try {
        await chrome.kill();
      } catch {
        // Preserve the audit result even if Chromium already exited.
      }
    }
    pending--;
    release();
  }
});

server.listen(4181, "0.0.0.0");

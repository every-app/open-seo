#!/usr/bin/env node

import { existsSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DIST_DIR = join(__dirname, "../dist/client");

const DEFAULT_SITE_URL = "https://openseo.so";
const SITE_URL = (process.env.SITE_URL ?? DEFAULT_SITE_URL).replace(/\/+$/, "");

const STATIC_PATHS = new Set(["/", "/pricing", "/privacy", "/terms-and-conditions"]);

function toCanonicalUrl(path) {
  if (path === "/") {
    return `${SITE_URL}/`;
  }

  return `${SITE_URL}${path.replace(/\/+$/, "")}`;
}

function main() {
  if (!existsSync(DIST_DIR) || !statSync(DIST_DIR).isDirectory()) {
    throw new Error(`Build output directory does not exist: ${DIST_DIR}`);
  }

  const urlPaths = new Set(STATIC_PATHS);

  const urls = Array.from(urlPaths)
    .map((path) => toCanonicalUrl(path))
    .sort((a, b) => a.localeCompare(b));

  const lastmod = new Date().toISOString();
  const sitemapBody = urls
    .map(
      (url) =>
        `  <url>\n    <loc>${url}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`,
    )
    .join("\n");

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapBody}\n</urlset>\n`;

  const sitemapPath = join(DIST_DIR, "sitemap.xml");
  writeFileSync(sitemapPath, sitemapXml);

  console.log(`Generated sitemap with ${urls.length} URLs at ${sitemapPath}`);
}

main();

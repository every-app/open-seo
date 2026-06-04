#!/usr/bin/env node

import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FEATURE_PAGE_SLUGS } from "../src/lib/feature-page-slugs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DIST_DIR = join(__dirname, "../dist/client");
const GUIDE_CONTENT_DIR = join(__dirname, "../content/guides");
const DOCS_CONTENT_DIR = join(__dirname, "../content/docs");

const DEFAULT_SITE_URL = "https://openseo.so";
const SITE_URL = (process.env.SITE_URL ?? DEFAULT_SITE_URL).replace(/\/+$/, "");

const STATIC_PATHS = [
  "/",
  "/pricing",
  "/privacy",
  "/terms-and-conditions",
  "/guides",
  "/docs",
  "/features",
  "/features/mcp",
  "/open-source-seo",
  "/google-search-console-mcp",
  ...Object.values(FEATURE_PAGE_SLUGS).map((slug) => `/features/${slug}`),
];

function getContentEntries(
  contentDir,
  basePath,
  dir = contentDir,
  segments = [],
) {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".")) {
      return [];
    }

    const entryPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      return getContentEntries(contentDir, basePath, entryPath, [
        ...segments,
        entry.name,
      ]);
    }

    if (!entry.isFile() || !/\.(md|mdx)$/i.test(entry.name)) {
      return [];
    }

    const slug = entry.name.replace(/\.(md|mdx)$/i, "");
    const pathSegments = slug === "index" ? segments : [...segments, slug];

    return [
      {
        path:
          pathSegments.length > 0
            ? `${basePath}/${pathSegments.join("/")}`
            : basePath,
        lastmod: statSync(entryPath).mtime.toISOString(),
      },
    ];
  });
}

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

  const entries = new Map();
  for (const path of STATIC_PATHS) {
    entries.set(path, { path, lastmod: null });
  }
  for (const entry of [
    ...getContentEntries(GUIDE_CONTENT_DIR, "/guides"),
    ...getContentEntries(DOCS_CONTENT_DIR, "/docs"),
  ]) {
    entries.set(entry.path, entry);
  }

  const sorted = Array.from(entries.values()).sort((a, b) =>
    toCanonicalUrl(a.path).localeCompare(toCanonicalUrl(b.path)),
  );

  const sitemapBody = sorted
    .map(({ path, lastmod }) => {
      const loc = toCanonicalUrl(path);
      const lastmodTag = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : "";
      return `  <url>\n    <loc>${loc}</loc>${lastmodTag}\n  </url>`;
    })
    .join("\n");

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapBody}\n</urlset>\n`;

  const sitemapPath = join(DIST_DIR, "sitemap.xml");
  writeFileSync(sitemapPath, sitemapXml);

  console.log(`Generated sitemap with ${sorted.length} URLs at ${sitemapPath}`);
}

main();

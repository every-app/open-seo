#!/usr/bin/env node

// Renders the title share cards that buildPageSeo (src/lib/seo.ts) points
// opted-in pages at. Runs after the prerender, so the built HTML is the single
// source of truth: every page whose og:image is under /og/ gets a PNG with its
// og:image:alt text as the title.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { render } from "takumi-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, "../dist/client");
const LOGO = `data:image/png;base64,${readFileSync(
  join(__dirname, "../public/android-chrome-192x192.png"),
).toString("base64")}`;

function readMeta(html, property) {
  const match = html.match(
    new RegExp(`<meta property="${property}" content="([^"]*)"`),
  );
  return match ? decodeEntities(match[1]) : null;
}

// React escapes attribute values with exactly these entities.
function decodeEntities(value) {
  return value
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// Matches the report share card (src/server/features/reports/reportSocialImage.tsx).
function card(title) {
  return h(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        padding: 64,
        backgroundColor: "#f5f4ef",
        color: "#1d2925",
      },
    },
    h(
      "div",
      { style: { display: "flex", alignItems: "center", gap: 20 } },
      h("img", {
        src: LOGO,
        width: 64,
        height: 64,
        style: { borderRadius: 14 },
      }),
      h(
        "div",
        { style: { fontSize: 34, fontWeight: 600, letterSpacing: -1 } },
        "OpenSEO",
      ),
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          flex: 1,
          alignItems: "center",
          paddingTop: 24,
        },
      },
      h(
        "div",
        {
          style: {
            fontSize: title.length > 85 ? 54 : title.length > 48 ? 64 : 80,
            fontWeight: 700,
            letterSpacing: -2,
            lineHeight: 1.12,
            overflowWrap: "anywhere",
          },
        },
        title,
      ),
    ),
    h(
      "div",
      {
        style: {
          position: "absolute",
          right: 64,
          bottom: 28,
          fontSize: 24,
          color: "#65716b",
        },
      },
      "openseo.so",
    ),
  );
}

const cards = new Map();
const htmlFiles = readdirSync(DIST_DIR, { recursive: true }).filter((file) =>
  file.endsWith(".html"),
);
for (const file of htmlFiles) {
  const html = readFileSync(join(DIST_DIR, file), "utf8");
  const image = readMeta(html, "og:image");
  const title = readMeta(html, "og:image:alt");
  if (!image || !title) continue;
  const { pathname } = new URL(image);
  if (pathname.startsWith("/og/")) cards.set(pathname, title);
}

for (const [pathname, title] of cards) {
  const png = await render(card(title), {
    width: 1200,
    height: 630,
    format: "png",
    emoji: "from-font",
  });
  const outFile = join(DIST_DIR, pathname);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, png);
}

console.log(`Generated ${cards.size} social cards`);

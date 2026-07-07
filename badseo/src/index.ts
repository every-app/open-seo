// badseo.dev — Cloudflare Worker entry point.
//
// A dependency-free Worker that serves a catalog of deliberately-broken SEO
// pages. Each fixture declares the audit issues it should trigger; this file
// wires the fixtures up to URLs, plus robots.txt and a sitemap.xml that lists
// the pages a crawler is meant to discover (including a few dead ones).
import { STYLESHEET } from "./styles";
import { OPENSEO_LOGO_PNG_BASE64 } from "./logo";
import { renderHome, renderCatalog } from "./pages";
import { renderShell, redirect } from "./lib";
import { TRAILING_SLASH_CANONICAL } from "./fixtures/redirects";
import {
  allFixtures,
  fixturePaths,
  sitemapFixtures,
} from "./fixtures/registry";
import type { Fixture, FixtureContext } from "./fixtures/types";

// Build the path -> fixture table once at module load.
const routeTable = new Map<string, Fixture>();
for (const fixture of allFixtures) {
  for (const path of fixturePaths(fixture)) {
    routeTable.set(path, fixture);
  }
}

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="360" viewBox="0 0 720 360" role="img" aria-label="placeholder">
  <rect width="720" height="360" fill="#ebe7e1"/>
  <path d="M1 359 L719 1 M1 1 L719 359" stroke="#d8d1c8" stroke-width="1"/>
  <rect x="0.5" y="0.5" width="719" height="359" fill="none" stroke="#d8d1c8"/>
  <text x="360" y="188" text-anchor="middle" font-family="ui-monospace, monospace" font-size="24" fill="#7b7b78">placeholder image</text>
</svg>`;

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function robotsTxt(origin: string): Response {
  const body = `# badseo.dev is broken on purpose, but it lets crawlers in.
User-agent: *
Allow: /

Sitemap: ${origin}/sitemap.xml
`;
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function sitemapXml(origin: string): Response {
  // Note: /catalog is deliberately NOT in the sitemap. It's the hub the deep
  // click-chain hangs off, and a sitemap-listed page is crawled at "null"
  // click-depth — which would propagate down the chain and stop the deep-page
  // fixture from ever reaching depth >= 5. Keeping the catalog link-only means
  // the chain gets real, incrementing depths.
  const paths = new Set<string>(["/"]);
  for (const fixture of sitemapFixtures) {
    for (const path of fixturePaths(fixture)) paths.add(path);
  }
  const urls = [...paths]
    .map((path) => `  <url><loc>${origin}${path}</loc></url>`)
    .join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
  return new Response(body, {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function notFoundPage(): Response {
  return html(
    renderShell({
      title: "404, not found | badseo.dev",
      metaDescription: "That URL is not one of the pages on this site.",
      bodyHtml: `<h1>404, not found</h1>
<p class="lede">This URL is not one of the broken pages on the site. It is just missing.</p>
<p>Go back to the <a href="/catalog">catalog</a> to see the pages that break on purpose.</p>`,
    }),
    404,
  );
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // Derive the origin from the Host header, not url.origin: under `wrangler
    // dev` with custom-domain routes configured, url.origin resolves to the
    // production host (badseo.dev) even on localhost, which would make every
    // sitemap/canonical URL cross-origin to a local crawler.
    const host = request.headers.get("host") ?? url.host;
    const origin = `${url.protocol}//${host}`;
    const path = normalizePath(url.pathname);

    // Trailing-slash canonical: the non-slash form 301-redirects to the slash
    // form, which is served as the canonical 200 (via the fixture below, since
    // normalizePath maps the slash form to the same route). Checked on the RAW
    // pathname, before normalization, so the two forms behave differently. This
    // reproduces the CMS redirect cycle from every-app/open-seo#61.
    if (url.pathname === TRAILING_SLASH_CANONICAL) {
      return redirect(`${TRAILING_SLASH_CANONICAL}/`, 301);
    }

    switch (path) {
      case "/styles.css":
        return new Response(STYLESHEET, {
          headers: {
            "content-type": "text/css; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      case "/img/placeholder.svg":
        return new Response(PLACEHOLDER_SVG, {
          headers: {
            "content-type": "image/svg+xml; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      case "/openseo-logo.png":
        return new Response(
          Uint8Array.from(atob(OPENSEO_LOGO_PNG_BASE64), (c) =>
            c.charCodeAt(0),
          ),
          {
            headers: {
              "content-type": "image/png",
              "cache-control": "public, max-age=86400",
            },
          },
        );
      case "/robots.txt":
        return robotsTxt(origin);
      case "/sitemap.xml":
        return sitemapXml(origin);
      case "/":
        return html(renderHome());
      case "/catalog":
        return html(renderCatalog());
    }

    const fixture = routeTable.get(path);
    if (fixture) {
      const ctx: FixtureContext = { origin, request, path };
      return fixture.handler(ctx);
    }

    return notFoundPage();
  },
};

import {
  fixturePaths,
  sitemapFixtures,
  allFixtures,
} from "../fixtures/registry";
import { TRAILING_SLASH_CANONICAL } from "../fixtures/redirects";
import type { Fixture, FixtureContext } from "../fixtures/types";
import { redirect, renderShell } from "../lib";

const routeTable = new Map<string, Fixture>();
for (const fixture of allFixtures) {
  for (const path of fixturePaths(fixture)) routeTable.set(path, fixture);
}

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function requestOrigin(request: Request, url: URL): string {
  const host = request.headers.get("host") ?? url.host;
  return `${url.protocol}//${host}`;
}

export async function handleFixtureRequest(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);

  if (url.pathname === TRAILING_SLASH_CANONICAL) {
    return redirect(`${TRAILING_SLASH_CANONICAL}/`, 301);
  }

  const fixture = routeTable.get(path);
  if (fixture) {
    const context: FixtureContext = {
      origin: requestOrigin(request, url),
      request,
      path,
    };
    return fixture.handler(context);
  }

  return new Response(
    renderShell({
      title: "404, not found | badseo.dev",
      metaDescription: "That URL is not one of the pages on this site.",
      bodyHtml: `<h1>404, not found</h1>
<p class="lede">This URL is not one of the broken pages on the site. It is just missing.</p>
<p>Go back to the <a href="/#issues">examples</a> to see the pages that break on purpose.</p>`,
    }),
    {
      status: 404,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

export function robotsResponse(request: Request): Response {
  const url = new URL(request.url);
  const origin = requestOrigin(request, url);
  return new Response(
    `# badseo.dev is broken on purpose, but it lets crawlers in.
User-agent: *
Allow: /

Sitemap: ${origin}/sitemap.xml
`,
    { headers: { "content-type": "text/plain; charset=utf-8" } },
  );
}

export function sitemapResponse(request: Request): Response {
  const url = new URL(request.url);
  const origin = requestOrigin(request, url);
  const paths = new Set<string>(["/", "/privacy"]);
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

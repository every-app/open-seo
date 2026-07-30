/**
 * Pull JSON-LD out of HTML.
 *
 * The site-audit crawler already has a loaded cheerio document, so the primary
 * entry point takes the API object and the string overload is the convenience
 * wrapper — loading the same HTML twice for one page would double the parse
 * cost of the crawl.
 *
 * cheerio is imported for its types only and pulled in dynamically where a
 * string has to be parsed. It is on the worker bundle's eager denylist (see
 * vite-plugin-lean-worker-bundle.ts): the crawler reaches it behind a dynamic
 * import, and this module must not drag it into the startup graph.
 */
import type * as cheerio from "cheerio";

export type JsonLdScript = {
  /** Position among the `ld+json` scripts, in document order. */
  index: number;
  text: string;
};

/** Prefix match, not equality: real pages ship
 *  `type="application/ld+json;charset=utf-8"`. */
const JSON_LD_SELECTOR = 'script[type^="application/ld+json"]';

export function collectJsonLdScripts($: cheerio.CheerioAPI): JsonLdScript[] {
  const scripts: JsonLdScript[] = [];
  $(JSON_LD_SELECTOR).each((index, element) => {
    scripts.push({ index, text: $(element).text() });
  });
  return scripts;
}

export async function collectJsonLdScriptsFromHtml(
  html: string,
): Promise<JsonLdScript[]> {
  const { load } = await import("cheerio");
  return collectJsonLdScripts(load(html));
}

/**
 * Strip the wrappers CMS templates add around embedded JSON — HTML comments
 * and CDATA sections — so the payload reaches `JSON.parse` intact.
 */
export function unwrapScriptText(text: string): string {
  return text
    .trim()
    .replace(/^<!--/, "")
    .replace(/-->$/, "")
    .replace(/^\/\/\s*<!\[CDATA\[/, "")
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\/\/\s*\]\]>$/, "")
    .replace(/\]\]>$/, "")
    .trim();
}

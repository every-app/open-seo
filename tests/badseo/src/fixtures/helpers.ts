import { escapeHtml, lorem } from "../lib";

/**
 * A healthy article body: exactly one <h1>, headings that descend one level at
 * a time, comfortably more than 150 words, and an image WITH alt text. Head-tag
 * fixtures reuse this unchanged and break only the <head>, so the audit sees a
 * single injected defect and nothing else.
 */
export function article(opts: {
  h1: string;
  lede: string;
  sections: Array<{
    h2: string;
    body: string;
    h3?: { h3: string; body: string };
  }>;
  /** Include a properly-described image. Default true. */
  withImage?: boolean;
}): string {
  const parts: string[] = [];
  parts.push(`<h1>${escapeHtml(opts.h1)}</h1>`);
  parts.push(`<p class="lede">${escapeHtml(opts.lede)}</p>`);
  if (opts.withImage !== false) {
    parts.push(
      `<img src="/img/placeholder.svg" alt="${escapeHtml(
        opts.h1,
      )}, an illustrative diagram" width="720" height="360">`,
    );
  }
  for (const s of opts.sections) {
    parts.push(`<h2>${escapeHtml(s.h2)}</h2>`);
    parts.push(`<p>${escapeHtml(s.body)}</p>`);
    if (s.h3) {
      parts.push(`<h3>${escapeHtml(s.h3.h3)}</h3>`);
      parts.push(`<p>${escapeHtml(s.h3.body)}</p>`);
    }
  }
  return parts.join("\n");
}

/** Generate ~n words of on-topic-ish filler to hit word thresholds. */
export { lorem };

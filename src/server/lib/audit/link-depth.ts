/**
 * Whether a link found at `depth` should replace what a persist batch holds
 * for its target (`known`; undefined when the batch hasn't seen the target).
 * The smallest click depth wins, and a null depth (the linking page was
 * reached only through the sitemap) never replaces a number. With "first
 * link wins", a sitemap seed persisted before the start page hid the start
 * page's depth-1 links, because the frontier ignores null depths.
 */
export function isShallowerLink(
  known: number | null | undefined,
  depth: number | null,
): boolean {
  if (known === undefined) return true;
  return depth !== null && (known === null || depth < known);
}

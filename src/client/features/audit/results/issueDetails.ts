/**
 * Presentation of an audit issue's `details` payload.
 *
 * Kept as a pure function so it can be tested without a DOM (the repo has no
 * component-test setup), and so the rules below are readable in one place.
 *
 * Everything used to collapse into a single truncated line, which is right for
 * `{ statusCode: 404 }` and wrong for a list of validation messages — the part
 * the reader actually needs got clipped. Three shapes now render differently:
 *
 *   - scalars and short arrays  → the compact inline summary, as before
 *   - sentence lists            → one item per line, wrapped
 *   - URLs                      → a link
 */

/** Ordered paths read best with arrows: `a → b → c`. */
const PATH_KEYS = new Set(["hops"]);

/** Values that are sentences rather than labels: one per line, never joined. */
const SENTENCE_KEYS = new Set(["messages"]);

type IssueDetailParts = {
  /** Compact `key: value · key: value` summary, or null when there is none. */
  inline: string | null;
  /** Sentence lists, rendered under the summary. */
  lists: Array<{ label: string; items: string[] }>;
  /** Links, rendered under the lists. */
  links: Array<{ label: string; href: string }>;
};

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//.test(value);
}

function renderScalar(value: unknown): string {
  return typeof value === "string" ? value : String(value);
}

/**
 * Splits a details payload into the three renderable groups. Returns null when
 * there is nothing worth showing, so the caller can render nothing at all.
 */
export function formatIssueDetails(
  detailsJson: string | null,
): IssueDetailParts | null {
  if (!detailsJson) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(detailsJson) as unknown;
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const inlineParts: string[] = [];
  const lists: IssueDetailParts["lists"] = [];
  const links: IssueDetailParts["links"] = [];

  for (const [key, value] of Object.entries(parsed)) {
    if (value === null || value === undefined) continue;

    if (Array.isArray(value)) {
      const items = value
        .filter((item) => item !== null && item !== undefined)
        .map(renderScalar)
        .filter((item) => item !== "");
      if (items.length === 0) continue;

      if (SENTENCE_KEYS.has(key)) {
        lists.push({ label: key, items });
      } else {
        inlineParts.push(
          `${key}: ${items.join(PATH_KEYS.has(key) ? " → " : ", ")}`,
        );
      }
      continue;
    }

    if (typeof value === "string" && isHttpUrl(value)) {
      links.push({ label: key, href: value });
      continue;
    }

    const rendered = renderScalar(value);
    if (rendered === "") continue;
    inlineParts.push(`${key}: ${rendered}`);
  }

  if (inlineParts.length === 0 && lists.length === 0 && links.length === 0) {
    return null;
  }
  return {
    inline: inlineParts.length > 0 ? inlineParts.join(" · ") : null,
    lists,
    links,
  };
}

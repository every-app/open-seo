import type { PsChannelType } from "@/shared/platform-seo";

// Turns the canonical article into one platform's version. Preparing copies
// it into an editable syndication; sending applies the last tweaks (the link
// back to the original) so they always use the article's current URL.

const SUMMARY_MAX = 150;
// Dev.to: letters and digits only, 30 characters, 4 tags. Hashnode allows 15;
// a handful reads better.
const TAG_RULES: Record<PsChannelType, { max: number; length: number }> = {
  devto: { max: 4, length: 30 },
  hashnode: { max: 5, length: 50 },
};
const STOP_WORDS = new Set(
  "a an and are for from how in is of on or the to what why with your".split(
    " ",
  ),
);

export function normalizeTags(type: PsChannelType, raw: string[]) {
  const rule = TAG_RULES[type];
  const tags = raw.map((tag) => {
    const lower = tag.toLowerCase().trim();
    return type === "devto"
      ? lower.normalize("NFKD").replace(/[^a-z0-9]/g, "")
      : lower.replace(/\s+/g, " ");
  });
  // Hashnode tags are found by slug, so a tag with no slug (no Latin
  // letters or digits) can't be sent, and two with the same slug are one.
  const seen = new Set<string>();
  return tags
    .map((t) => t.slice(0, rule.length))
    .filter((t) => {
      const key = type === "hashnode" ? hashnodeTag(t).slug : t;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, rule.max);
}

// Hashnode finds or creates a tag by slug.
export function hashnodeTag(name: string) {
  const slug = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return { slug, name };
}

// The target keyword as one tag, then its main words.
function suggestTags(type: PsChannelType, primaryKeyword: string | null) {
  if (!primaryKeyword) return [];
  const words = primaryKeyword
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  return normalizeTags(type, [primaryKeyword, ...words]);
}

// The first paragraph as plain text, cut at a word.
function summarize(markdown: string) {
  const paragraph =
    markdown
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .find(
        (block) => block && !/^(#|>|[-*+] |\d+\. |```|\||!\[|---)/.test(block),
      ) ?? "";
  const text = paragraph
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= SUMMARY_MAX) return text || null;
  const cut = text.slice(0, SUMMARY_MAX - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 80 ? cut.lastIndexOf(" ") : cut.length)}…`;
}

export function preparePlatformVersion(params: {
  type: PsChannelType;
  title: string;
  body: string;
  primaryKeyword: string | null;
}) {
  // The headline is sent separately; a leading H1 would show it twice.
  const body = params.body.replace(/^\s*#\s+[^\n]*\n+/, "").trim();
  return {
    title: params.title.trim(),
    summary: summarize(body),
    body,
    tags: suggestTags(params.type, params.primaryKeyword),
  };
}

// The body as sent: Dev.to reads a leading --- as front matter, and readers
// get a link back to the original when there is one.
export function bodyToSend(body: string, canonicalUrl: string | null) {
  const text = body.replace(/^\s*---\s*\n/, "").trim();
  if (!canonicalUrl) return text;
  const host = new URL(canonicalUrl).hostname.replace(/^www\./, "");
  return `${text}\n\n---\n\n*Originally published at [${host}](${canonicalUrl}).*`;
}

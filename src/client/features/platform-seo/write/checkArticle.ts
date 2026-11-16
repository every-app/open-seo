// What the editor checks a draft against: its length and how well it covers
// the brief. Runs on every keystroke, so it stays plain string work.

export const TARGET_WORDS = { min: 1200, max: 2000 };
const SUPPORTING_LIMIT = 15;
const INTRO_WORDS = 100;

const STOP_WORDS = new Set(
  "a an and are as at be by can do does for from has have how i in is it its my of on or should the to was what when where which who why will with you your".split(
    " ",
  ),
);

// Markdown to the words a reader sees.
function plainText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, " ")
    .replace(/[*_~|]/g, " ");
}

// Lowercase words only, so "Parasite-SEO's" matches "parasite seo s".
function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function hasPhrase(normalizedText: string, phrase: string) {
  const target = normalize(phrase);
  return target !== "" && ` ${normalizedText} `.includes(` ${target} `);
}

// Counts word by word, so back-to-back uses ("... parasite seo. Parasite seo
// ...") both count.
function countPhrase(normalizedText: string, phrase: string) {
  const target = normalize(phrase).split(" ");
  if (!target[0]) return 0;
  const words = normalizedText.split(" ");
  let count = 0;
  for (let i = 0; i + target.length <= words.length; i++) {
    if (target.every((word, j) => words[i + j] === word)) count++;
  }
  return count;
}

// Crude stemming so "works" matches "work", "sites" matches "site" and
// "pricing" matches "price". A suffix comes off only if 3 letters remain.
const SUFFIXES = ["ing", "ed", "es", "e", "s"];
function stem(word: string) {
  const suffix = SUFFIXES.find(
    (end) => word.endsWith(end) && word.length - end.length >= 3,
  );
  return suffix ? word.slice(0, -suffix.length) : word;
}

function contentWords(text: string) {
  return normalize(text)
    .split(" ")
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
    .map(stem);
}

function stems(normalizedText: string) {
  return new Set(normalizedText.split(" ").map(stem));
}

// The body split at each ## or ### heading, so a question counts as answered
// only when one section covers all of it.
function sections(markdown: string) {
  const out: { heading: string; text: string }[] = [];
  let current = { heading: "", lines: [] as string[] };
  for (const line of markdown.split("\n")) {
    const match = /^\s{0,3}#{2,3}\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) {
      out.push({ heading: current.heading, text: current.lines.join("\n") });
      current = { heading: match[1], lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  out.push({ heading: current.heading, text: current.lines.join("\n") });
  return out.map((s) => ({
    heading: normalize(plainText(s.heading)),
    text: normalize(plainText(`${s.heading}\n${s.text}`)),
  }));
}

export type Check = { label: string; done: boolean; detail?: string };

export function checkArticle(params: {
  title: string;
  body: string;
  primaryKeyword: string | null;
  keywords: string[];
  questions: string[];
  outline: string[];
}) {
  const body = normalize(plainText(params.body));
  const words = body ? body.split(" ") : [];
  const parts = sections(params.body);
  const primary = params.primaryKeyword;

  const keywordChecks: Check[] = primary
    ? [
        {
          label: "Target keyword in the title",
          done: hasPhrase(normalize(params.title), primary),
        },
        {
          label: `Target keyword in the first ${INTRO_WORDS} words`,
          done: hasPhrase(words.slice(0, INTRO_WORDS).join(" "), primary),
        },
        {
          label: "Target keyword in a heading",
          done: parts.some((part) => hasPhrase(part.heading, primary)),
        },
        {
          label: "Target keyword used at least twice",
          done: countPhrase(body, primary) >= 2,
          detail: `${countPhrase(body, primary)} times`,
        },
      ]
    : [];

  const questionChecks: Check[] = params.questions.map((question) => {
    const needed = contentWords(question);
    return {
      label: question,
      done:
        needed.length > 0 &&
        parts.some((part) => {
          const have = stems(part.text);
          return needed.every((word) => have.has(word));
        }),
    };
  });

  // A heading matches an outline section when it shares most of its words.
  const outlineChecks: Check[] = params.outline.map((heading) => {
    const needed = contentWords(heading);
    return {
      label: heading,
      done: parts.some((part) => {
        if (!part.heading) return false;
        const have = stems(part.heading);
        const shared = needed.filter((word) => have.has(word)).length;
        return needed.length > 0 && shared / needed.length >= 0.6;
      }),
    };
  });

  const supporting = params.keywords
    .filter((keyword) => keyword !== primary)
    .slice(0, SUPPORTING_LIMIT);
  const supportingChecks: Check[] = supporting.map((keyword) => ({
    label: keyword,
    done: hasPhrase(body, keyword),
  }));

  return {
    wordCount: words.length,
    keywordChecks,
    questionChecks,
    outlineChecks,
    supportingChecks,
  };
}
